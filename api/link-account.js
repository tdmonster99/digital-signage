const { getAuth, getFirestore } = require('./_lib/firebase-admin');

const PLAYER_DIAGNOSTIC_TYPES = new Set([
  'player_boot',
  'player_capabilities',
  'player_online',
  'player_offline',
  'player_watchdog_restart',
  'player_slideshow_error',
]);

function normalizeSlideDoc(doc) {
  const data = doc.data() || {};
  const { order, updatedAt, ...slide } = data;
  return { id: slide.id || doc.id, ...slide };
}

async function loadSlideCollection(showRef, collectionName) {
  const snap = await showRef.collection(collectionName).orderBy('order', 'asc').get();
  return snap.docs.map(normalizeSlideDoc);
}

async function loadUserContext(db, uid) {
  const userSnap = await db.doc(`users/${uid}`).get();
  if (!userSnap.exists) {
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }
  const userData = userSnap.data() || {};
  if (!userData.orgId) {
    const error = new Error('User has no organization');
    error.statusCode = 403;
    throw error;
  }
  return { userSnap, userData, orgId: userData.orgId, role: userData.role || 'viewer' };
}

function requireRole(role, allowed) {
  if (!allowed.includes(role)) {
    const error = new Error('Insufficient role');
    error.statusCode = 403;
    throw error;
  }
}

function normalizePairingCode(code) {
  return String(code || '').trim().toUpperCase();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { idToken } = req.body || {};
  if (!idToken) return res.status(400).json({ error: 'idToken required' });

  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    const db = getFirestore();
    const { uid, email } = decoded;
    if (!email) return res.json({ merged: false });

    if (req.body.action === 'pairScreen') {
      const code = normalizePairingCode(req.body.code);
      if (!/^[A-Z0-9]{6}$/.test(code)) {
        return res.status(400).json({ error: 'Invalid pairing code' });
      }

      const { userData, orgId, role } = await loadUserContext(db, uid);
      requireRole(role, ['admin', 'editor']);

      const orgSnap = await db.doc(`organizations/${orgId}`).get();
      const orgData = orgSnap.exists ? (orgSnap.data() || {}) : {};
      const defaultShowId = Array.isArray(orgData.slideshows) && orgData.slideshows[0]?.id
        ? orgData.slideshows[0].id
        : 'main';

      const result = await db.runTransaction(async tx => {
        const codeRef = db.doc(`pairingCodes/${code}`);
        const codeSnap = await tx.get(codeRef);
        if (!codeSnap.exists) {
          const error = new Error('Code not found. Make sure the display is showing a pairing screen.');
          error.statusCode = 404;
          throw error;
        }

        const data = codeSnap.data() || {};
        if (data.status !== 'pending') {
          const error = new Error(data.status === 'paired' ? 'This code has already been used.' : 'This code is no longer valid.');
          error.statusCode = 409;
          throw error;
        }
        if (data.expiresAt && new Date() > new Date(data.expiresAt)) {
          const error = new Error('This code has expired. The display will generate a new one shortly.');
          error.statusCode = 410;
          throw error;
        }
        const credentialHash = typeof data.screenCredentialHash === 'string' && /^[a-f0-9]{64}$/i.test(data.screenCredentialHash)
          ? data.screenCredentialHash.toLowerCase()
          : '';
        if (!credentialHash) {
          const error = new Error('This display needs to refresh before pairing. Reload the display and use the new code.');
          error.statusCode = 400;
          throw error;
        }

        const screenRef = db.collection('screens').doc();
        const shortId = screenRef.id.slice(0, 6).toUpperCase();
        const screenName = 'Screen ' + shortId;
        const now = new Date().toISOString();
        tx.create(screenRef, {
          name: screenName,
          slideshowId: defaultShowId,
          registeredAt: now,
          lastSeen: now,
          credentialHash,
          credentialVersion: 1,
          orgId,
          pairedBy: uid,
          pairedByEmail: userData.email || email,
        });
        tx.update(codeRef, {
          status: 'paired',
          screenId: screenRef.id,
          screenName,
          pairedAt: now,
        });
        return { screenId: screenRef.id, screenName };
      });

      return res.json({ ok: true, ...result });
    }

    if (req.body.action === 'deleteScreen') {
      const screenId = String(req.body.screenId || '').trim();
      if (!screenId) return res.status(400).json({ error: 'screenId required' });

      const { orgId, role } = await loadUserContext(db, uid);
      requireRole(role, ['admin']);

      const screenRef = db.doc(`screens/${screenId}`);
      const screenSnap = await screenRef.get();
      if (!screenSnap.exists) return res.status(404).json({ error: 'Screen not found' });
      const screenData = screenSnap.data() || {};
      if (screenData.orgId !== orgId) {
        return res.status(403).json({ error: 'Screen is not in your organization' });
      }

      await screenRef.delete();
      return res.json({ ok: true });
    }

    if (req.body.action === 'screenDiagnostics') {
      const screenId = String(req.body.screenId || '').trim();
      if (!screenId) return res.status(400).json({ error: 'screenId required' });

      const { orgId } = await loadUserContext(db, uid);
      const screenSnap = await db.doc(`screens/${screenId}`).get();
      if (!screenSnap.exists) return res.status(404).json({ error: 'Screen not found' });
      const screenData = screenSnap.data() || {};
      if (screenData.orgId !== orgId) {
        return res.status(403).json({ error: 'Screen is not in your organization' });
      }

      const snap = await db.collection('organizations').doc(orgId).collection('analytics')
        .orderBy('timestamp', 'desc')
        .limit(500)
        .get();
      const events = snap.docs
        .map(doc => doc.data() || {})
        .filter(event => event.screenId === screenId && PLAYER_DIAGNOSTIC_TYPES.has(event.type));
      return res.json({ ok: true, events });
    }

    if (req.body.action === 'showSnapshot') {
      const { showId } = req.body || {};
      if (!showId || typeof showId !== 'string') {
        return res.status(400).json({ error: 'showId required' });
      }

      const userSnap = await db.doc(`users/${uid}`).get();
      if (!userSnap.exists) return res.status(404).json({ error: 'User not found' });

      const userData = userSnap.data() || {};
      if (!userData.orgId) return res.status(403).json({ error: 'User has no organization' });

      const showRef = db.doc(`slideshows/${showId}`);
      const showSnap = await showRef.get();
      if (!showSnap.exists) return res.status(404).json({ error: 'Slideshow not found' });

      const showData = showSnap.data() || {};
      if (showData.orgId !== userData.orgId) {
        return res.status(403).json({ error: 'Slideshow is not in your organization' });
      }

      const loadPublished =
        showData.slideStorageVersion >= 2 ||
        showData.publishedStorage === 'subcollection';
      const loadDraft =
        showData.draftStorage === 'subcollection' &&
        ['admin', 'editor'].includes(userData.role);

      const [publishedSlides, draftSlides] = await Promise.all([
        loadPublished
          ? loadSlideCollection(showRef, 'slides')
          : Promise.resolve(Array.isArray(showData.slides) ? showData.slides : []),
        loadDraft
          ? loadSlideCollection(showRef, 'draftSlides')
          : Promise.resolve(Array.isArray(showData.draftSlides) ? showData.draftSlides : undefined),
      ]);

      return res.json({
        ok: true,
        data: { id: showSnap.id, ...showData },
        slides: publishedSlides,
        ...(draftSlides !== undefined && { draftSlides }),
      });
    }

    if (req.body.action === 'bootstrap') {
      const userSnap = await db.doc(`users/${uid}`).get();
      if (!userSnap.exists) return res.json({ ok: true, user: null, org: null });

      const userData = userSnap.data() || {};
      let org = null;
      let slideshows = [];
      if (userData.orgId) {
        const orgSnap = await db.doc(`organizations/${userData.orgId}`).get();
        if (orgSnap.exists) org = { id: orgSnap.id, ...orgSnap.data() };

        const showSnap = await db.collection('slideshows').where('orgId', '==', userData.orgId).get();
        const orgShows = Array.isArray(org?.slideshows) ? org.slideshows : [];
        const byId = new Map();
        orgShows.forEach(show => {
          if (show?.id) byId.set(show.id, show);
        });
        showSnap.docs.forEach(doc => {
          const data = doc.data() || {};
          byId.set(doc.id, {
            ...(byId.get(doc.id) || {}),
            id: doc.id,
            ...(data.name && { name: data.name }),
            ...(Array.isArray(data.tags) && { tags: data.tags }),
            ...(Array.isArray(data.autoIncludeTags) && { autoIncludeTags: data.autoIncludeTags }),
            ...(data.emergencyPlaylist === true && { emergencyPlaylist: true }),
          });
        });
        slideshows = Array.from(byId.values()).map(show => ({
          ...show,
          name: show.name || show.id,
        }));
        if (org && slideshows.length) org.slideshows = slideshows;
      }

      return res.json({
        ok: true,
        user: { id: uid, ...userData },
        org,
        slideshows,
      });
    }

    // Nothing to do if this UID already has a users doc
    const mySnap = await db.doc(`users/${uid}`).get();
    if (mySnap.exists) return res.json({ merged: false });

    // Find an existing users doc with the same email but a different UID
    const q = await db.collection('users').where('email', '==', email).limit(1).get();
    if (q.empty) return res.json({ merged: false });

    const existingDoc = q.docs[0];
    if (existingDoc.id === uid) return res.json({ merged: false });

    const existingData = existingDoc.data();
    if (!existingData.orgId) return res.json({ merged: false });

    // Adopt the existing org: write the existing user doc under the new UID
    await db.doc(`users/${uid}`).set(existingData);

    return res.json({ merged: true, orgId: existingData.orgId });
  } catch (e) {
    console.error('link-account error:', e.message);
    return res.status(e.statusCode || 500).json({ error: e.message });
  }
};
