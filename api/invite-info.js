const { getFirestore } = require('./_lib/firebase-admin');

function cleanInviteId(value) {
  const inviteId = String(value || '').trim();
  if (!inviteId || inviteId.length > 128 || !/^[A-Za-z0-9_-]+$/.test(inviteId)) {
    const error = new Error('Invalid invitation link.');
    error.statusCode = 400;
    throw error;
  }
  return inviteId;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function sanitizeRole(value) {
  const role = String(value || 'editor').trim().toLowerCase();
  return ['admin', 'editor', 'viewer'].includes(role) ? role : 'editor';
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const inviteId = cleanInviteId(req.query.invite || req.query.inviteId);
    const snap = await getFirestore().doc(`invitations/${inviteId}`).get();
    if (!snap.exists) return res.status(404).json({ ok: false, error: 'Invitation not found.' });

    const data = snap.data() || {};
    return res.json({
      ok: true,
      invite: {
        id: snap.id,
        email: normalizeEmail(data.email),
        role: sanitizeRole(data.role),
        status: data.status || 'pending',
        orgName: data.orgName || 'this organization',
        invitedByEmail: normalizeEmail(data.invitedByEmail),
      },
    });
  } catch (e) {
    return res.status(e.statusCode || 500).json({ ok: false, error: e.message || 'Could not load invitation.' });
  }
};
