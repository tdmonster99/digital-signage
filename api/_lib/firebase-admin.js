// api/_lib/firebase-admin.js
let _admin;

function getAdmin() {
  if (!_admin) {
    _admin = require('firebase-admin');
  }
  if (!_admin.apps.length) {
    const sa = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    _admin.initializeApp({ credential: _admin.credential.cert(sa) });
  }
  return _admin;
}

function parseServiceAccount(raw) {
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set');
  const text = String(raw).trim();
  try {
    return JSON.parse(text);
  } catch (err) {
    const repaired = repairPrivateKeyNewlines(text);
    if (repaired !== text) {
      try {
        return JSON.parse(repaired);
      } catch (_) {
        // Surface the original parse error below; it points closest to the
        // env var shape that needs attention.
      }
    }
    throw new Error(`FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON: ${err.message}`);
  }
}

function repairPrivateKeyNewlines(text) {
  return text.replace(
    /"private_key"\s*:\s*"([\s\S]*?)"\s*,\s*"client_email"/,
    (_match, key) => {
      const escapedKey = key
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\n/g, '\\n');
      return `"private_key":"${escapedKey}","client_email"`;
    }
  );
}

module.exports = {
  getFirestore: () => getAdmin().firestore(),
  getAuth:      () => getAdmin().auth(),
};
