const { getAuth, getFirestore } = require('./_lib/firebase-admin');

function normalizeSlideDoc(doc) {
  const data = doc.data() || {};
  const { order, updatedAt, ...slide } = data;
  return { id: slide.id || doc.id, ...slide };
}

async function loadSlideCollection(showRef, collectionName) {
  const snap = await showRef.collection(collectionName).orderBy('order', 'asc').get();
  return snap.docs.map(normalizeSlideDoc);
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
      if (userData.orgId) {
        const orgSnap = await db.doc(`organizations/${userData.orgId}`).get();
        if (orgSnap.exists) org = { id: orgSnap.id, ...orgSnap.data() };
      }

      return res.json({
        ok: true,
        user: { id: uid, ...userData },
        org,
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
    return res.status(500).json({ error: e.message });
  }
};
