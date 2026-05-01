// Issues a Firebase custom token to a paired display screen.
// The browser stores the raw screen secret locally; Firestore stores only its
// SHA-256 hash on screens/{screenId} after pairing.

const crypto = require('crypto');
const { getAuth, getFirestore } = require('./_lib/firebase-admin');

const SECRET_RE = /^[A-Za-z0-9_-]{32,128}$/;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { screenId, secret } = req.body || {};
  if (!screenId || typeof screenId !== 'string') {
    return res.status(400).json({ error: 'screenId is required' });
  }
  if (!secret || typeof secret !== 'string' || !SECRET_RE.test(secret)) {
    return res.status(400).json({ error: 'valid screen secret is required' });
  }

  try {
    const db = getFirestore();
    const snap = await db.collection('screens').doc(screenId).get();
    if (!snap.exists) return res.status(404).json({ error: 'screen not found' });

    const screen = snap.data() || {};
    const expectedHash = typeof screen.credentialHash === 'string'
      ? screen.credentialHash
      : '';

    // Transitional mode: old screens can still run on legacy Firestore writes
    // until they are re-paired and receive a credential hash.
    if (!expectedHash) {
      return res.status(409).json({ error: 'screen has no credential hash', legacy: true });
    }

    const actualHash = hashSecret(secret);
    if (!timingSafeEqualHex(actualHash, expectedHash)) {
      return res.status(401).json({ error: 'invalid screen credential' });
    }

    const claims = {
      screen: true,
      screenId,
    };
    if (screen.orgId) claims.orgId = String(screen.orgId);

    const token = await getAuth().createCustomToken(`screen:${screenId}`, claims);
    return res.status(200).json({ token, orgId: claims.orgId || null });
  } catch (err) {
    console.error('[screen-token]', err.message);
    return res.status(500).json({ error: err.message });
  }
};

function hashSecret(secret) {
  return crypto.createHash('sha256').update(secret, 'utf8').digest('hex');
}

function timingSafeEqualHex(a, b) {
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
