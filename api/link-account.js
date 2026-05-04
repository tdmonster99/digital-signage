const { getAuth, getFirestore } = require('./_lib/firebase-admin');
const admin = require('firebase-admin');

const PLAYER_DIAGNOSTIC_TYPES = new Set([
  'player_boot',
  'player_capabilities',
  'player_online',
  'player_offline',
  'player_watchdog_restart',
  'player_slideshow_error',
]);

const SLIDE_STORAGE_VERSION = 2;
const PUBLISHED_SLIDES_COLLECTION = 'slides';
const DRAFT_SLIDES_COLLECTION = 'draftSlides';

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

function slideDocId(slide, index) {
  const raw = String(slide && slide.id ? slide.id : `slide-${index + 1}`);
  const safe = raw.replace(/[\/?#\[\]*]/g, '-').slice(0, 120);
  return safe || `slide-${index + 1}`;
}

function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (!value || typeof value !== 'object') return value;
  const clean = {};
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined || key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    clean[key] = stripUndefined(child);
  }
  return clean;
}

function sanitizeSlides(value) {
  if (!Array.isArray(value)) {
    const error = new Error('slides must be an array');
    error.statusCode = 400;
    throw error;
  }
  if (value.length > 500) {
    const error = new Error('Too many slides in one save');
    error.statusCode = 413;
    throw error;
  }
  return stripUndefined(value);
}

function sanitizeDraftPatch(patch = {}) {
  const clean = {};
  if (Number.isFinite(Number(patch.draftDwell))) {
    clean.draftDwell = Math.min(3600, Math.max(1, Number(patch.draftDwell)));
  }
  if (typeof patch.draftFitMode === 'string') {
    clean.draftFitMode = patch.draftFitMode.slice(0, 40);
  }
  if (typeof patch.draftTransition === 'string') {
    clean.draftTransition = patch.draftTransition.slice(0, 40);
  }
  return clean;
}

function normalizeTag(tag) {
  return String(tag || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '').slice(0, 32);
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(normalizeTag).filter(Boolean)));
}

function sanitizePublishPatch(patch = {}) {
  const clean = {};
  if (Number.isFinite(Number(patch.defaultDwell))) {
    clean.defaultDwell = Math.min(3600, Math.max(1, Number(patch.defaultDwell)));
  }
  if (typeof patch.fitMode === 'string') {
    clean.fitMode = patch.fitMode.slice(0, 40);
  }
  if (typeof patch.transition === 'string') {
    clean.transition = patch.transition.slice(0, 40);
  }
  clean.tags = normalizeTags(patch.tags);
  clean.autoIncludeTags = normalizeTags(patch.autoIncludeTags);
  clean.emergencyPlaylist = patch.emergencyPlaylist === true;
  return clean;
}

function sanitizeScreenIds(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(id => String(id || '').trim()).filter(Boolean))).slice(0, 200);
}

async function commitOpsInChunks(db, ops) {
  for (let i = 0; i < ops.length; i += 450) {
    const batch = db.batch();
    ops.slice(i, i + 450).forEach(op => op(batch));
    await batch.commit();
  }
}

async function replaceSlideCollection(db, showRef, collectionName, nextSlides) {
  const now = new Date().toISOString();
  const cleanSlides = Array.isArray(nextSlides) ? nextSlides : [];
  const snap = await showRef.collection(collectionName).get();
  const deleteOps = snap.docs.map(d => batch => batch.delete(d.ref));
  const setOps = cleanSlides.map((slide, index) => batch => {
    const id = slideDocId(slide, index);
    const ref = showRef.collection(collectionName).doc(id);
    batch.set(ref, {
      ...slide,
      id: slide.id || id,
      order: index,
      updatedAt: now,
    });
  });
  await commitOpsInChunks(db, [...deleteOps, ...setOps]);
}

async function assertScreensInOrg(db, screenIds, orgId) {
  await Promise.all(screenIds.map(async screenId => {
    const screenSnap = await db.doc(`screens/${screenId}`).get();
    if (!screenSnap.exists) {
      const error = new Error(`Screen ${screenId} not found`);
      error.statusCode = 404;
      throw error;
    }
    const screenData = screenSnap.data() || {};
    if (screenData.orgId !== orgId) {
      const error = new Error(`Screen ${screenId} is not in your organization`);
      error.statusCode = 403;
      throw error;
    }
  }));
}

async function loadEditableShow(db, showId, orgId) {
  const id = String(showId || '').trim();
  if (!id) {
    const error = new Error('showId required');
    error.statusCode = 400;
    throw error;
  }

  const showRef = db.doc(`slideshows/${id}`);
  const showSnap = await showRef.get();
  if (!showSnap.exists) {
    const error = new Error('Slideshow not found');
    error.statusCode = 404;
    throw error;
  }

  const showData = showSnap.data() || {};
  if (showData.orgId !== orgId) {
    const error = new Error('Slideshow is not in your organization');
    error.statusCode = 403;
    throw error;
  }
  return { showRef, showData };
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

    if (req.body.action === 'saveDraftSlides') {
      const { showId, slides: rawSlides, patch: rawPatch } = req.body || {};
      const { userData, orgId, role } = await loadUserContext(db, uid);
      requireRole(role, ['admin', 'editor']);

      const { showRef } = await loadEditableShow(db, showId, orgId);
      const cleanSlides = sanitizeSlides(rawSlides);
      const cleanPatch = sanitizeDraftPatch(rawPatch);
      const now = new Date().toISOString();
      const deleteField = admin.firestore.FieldValue.delete();

      await replaceSlideCollection(db, showRef, DRAFT_SLIDES_COLLECTION, cleanSlides);
      await showRef.set({
        ...cleanPatch,
        slideStorageVersion: SLIDE_STORAGE_VERSION,
        draftStorage: 'subcollection',
        draftSlidesCount: cleanSlides.length,
        draftRevision: now,
        draftUpdatedAt: now,
        draftSlides: deleteField,
        draftBy: { uid, email: userData.email || email || '' },
        orgId,
      }, { merge: true });

      return res.json({ ok: true, draftSlidesCount: cleanSlides.length, draftRevision: now });
    }

    if (req.body.action === 'publishSlideshow') {
      const { showId, slides: rawSlides, patch: rawPatch, screenIds: rawScreenIds } = req.body || {};
      const { userData, orgId, role } = await loadUserContext(db, uid);
      requireRole(role, ['admin', 'editor']);

      const orgSnap = await db.doc(`organizations/${orgId}`).get();
      const orgData = orgSnap.exists ? (orgSnap.data() || {}) : {};
      if (role === 'editor' && orgData.approvalRequired === true) {
        const error = new Error('This slideshow must be submitted for admin review.');
        error.statusCode = 403;
        throw error;
      }

      const { showRef } = await loadEditableShow(db, showId, orgId);
      const cleanSlides = sanitizeSlides(rawSlides);
      const cleanPatch = sanitizePublishPatch(rawPatch);
      const screenIds = sanitizeScreenIds(rawScreenIds);
      await assertScreensInOrg(db, screenIds, orgId);

      const now = new Date().toISOString();
      const deleteField = admin.firestore.FieldValue.delete();

      await replaceSlideCollection(db, showRef, PUBLISHED_SLIDES_COLLECTION, cleanSlides);
      await replaceSlideCollection(db, showRef, DRAFT_SLIDES_COLLECTION, []);
      await showRef.set({
        ...cleanPatch,
        slideStorageVersion: SLIDE_STORAGE_VERSION,
        publishedStorage: 'subcollection',
        publishedSlidesCount: cleanSlides.length,
        publishedRevision: now,
        status: 'published',
        publishedAt: now,
        publishedBy: { uid, email: userData.email || email || '' },
        draftStorage: deleteField,
        draftSlidesCount: deleteField,
        draftRevision: deleteField,
        slides: deleteField,
        draftSlides: deleteField,
        draftDwell: deleteField,
        draftFitMode: deleteField,
        draftTransition: deleteField,
        draftUpdatedAt: deleteField,
        draftBy: deleteField,
        reviewSubmittedAt: deleteField,
        reviewSubmittedBy: deleteField,
        reviewApprovedAt: deleteField,
        reviewApprovedBy: deleteField,
        reviewRejectedAt: deleteField,
        reviewRejectedBy: deleteField,
        reviewRejectionNote: deleteField,
        orgId,
      }, { merge: true });

      await commitOpsInChunks(db, screenIds.map(screenId => batch => {
        batch.set(db.doc(`screens/${screenId}`), { slideshowId: showId }, { merge: true });
      }));

      return res.json({
        ok: true,
        publishedSlidesCount: cleanSlides.length,
        assignedScreensCount: screenIds.length,
        publishedRevision: now,
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
