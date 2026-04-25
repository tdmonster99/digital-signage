// api/_lib/firebase-admin.js
let _admin;

function getAdmin() {
  if (!_admin) {
    _admin = require('firebase-admin');
    if (!_admin.apps.length) {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      _admin.initializeApp({ credential: _admin.credential.cert(sa) });
    }
  }
  return _admin;
}

module.exports = {
  getFirestore: () => getAdmin().firestore(),
  getAuth:      () => getAdmin().auth(),
};
