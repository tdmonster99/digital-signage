#!/usr/bin/env node

const { getAuth, getFirestore } = require('../api/_lib/firebase-admin');

const PILOT_LIMITS = {
  screensAllowed: 9999,
  usersAllowed: 9999,
  storageGb: 100,
};

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`Invalid email: ${value}`);
  }
  return email;
}

function pilotSubscription(now) {
  return {
    plan: 'pilot',
    status: 'active',
    ...PILOT_LIMITS,
    pilot: true,
    source: 'manual-pilot',
    grantedAt: now,
    updatedAt: now,
  };
}

async function findUserDocsByEmail(db, uid, email) {
  const docs = new Map();
  if (uid) {
    const snap = await db.collection('users').doc(uid).get();
    if (snap.exists) docs.set(snap.id, snap);
  }

  const querySnap = await db.collection('users').where('email', '==', email).get();
  querySnap.docs.forEach(docSnap => docs.set(docSnap.id, docSnap));
  return Array.from(docs.values());
}

async function grantPilot(email) {
  const db = getFirestore();
  const auth = getAuth();
  const now = new Date().toISOString();
  const subscription = pilotSubscription(now);

  let authUser = null;
  try {
    authUser = await auth.getUserByEmail(email);
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
  }

  const userDocs = await findUserDocsByEmail(db, authUser?.uid, email);
  const orgIds = Array.from(new Set(
    userDocs
      .map(docSnap => (docSnap.data() || {}).orgId)
      .filter(Boolean)
  ));

  if (orgIds.length) {
    await Promise.all(orgIds.map(orgId =>
      db.collection('organizations').doc(orgId).set({ subscription }, { merge: true })
    ));
    return { email, mode: 'updated-existing-org', orgCount: orgIds.length };
  }

  await db.collection('pending_subscriptions').doc(email).set({
    ...subscription,
    email,
  }, { merge: true });

  return { email, mode: 'pending-signup', orgCount: 0 };
}

async function main() {
  const emails = process.argv.slice(2).map(normalizeEmail);
  if (!emails.length) {
    console.error('Usage: FIREBASE_SERVICE_ACCOUNT_JSON=... node scripts/grant-pilot-users.js email@example.com [...]');
    process.exit(1);
  }

  for (const email of emails) {
    const result = await grantPilot(email);
    console.log(`${result.email}: ${result.mode}${result.orgCount ? ` (${result.orgCount} org)` : ''}`);
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
