const { getAuth, getFirestore } = require('./_lib/firebase-admin');
const admin = require('firebase-admin');
const crypto = require('crypto');

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
const PILOT_EMAILS = new Set(
  (process.env.PILOT_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)
);
const PILOT_LIMITS = {
  screensAllowed: 9999,
  usersAllowed: 9999,
  storageGb: 100,
};
const PLAN_LIMITS = {
  free: { usersAllowed: 1 },
  standard: { usersAllowed: 3 },
  premium: { usersAllowed: 10 },
  'early-adopter': { usersAllowed: 9999 },
  pilot: { usersAllowed: 9999 },
  enterprise: { usersAllowed: 9999 },
  starter: { usersAllowed: 3 },
  pro: { usersAllowed: 10 },
};
const INVITE_ROLES = new Set(['admin', 'editor', 'viewer']);

function pilotSubscription(now) {
  return {
    plan: 'pilot',
    status: 'active',
    ...PILOT_LIMITS,
    pilot: true,
    source: 'email-allowlist',
    grantedAt: now,
    updatedAt: now,
  };
}

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

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validateEmail(value) {
  const email = normalizeEmail(value);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error('Valid email address required');
    error.statusCode = 400;
    throw error;
  }
  return email;
}

function sanitizeInviteRole(value) {
  const role = String(value || 'editor').trim().toLowerCase();
  if (!INVITE_ROLES.has(role)) {
    const error = new Error('Invalid invite role');
    error.statusCode = 400;
    throw error;
  }
  return role;
}

function escHtmlEmail(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inviteUrl(inviteId) {
  return `https://app.zigns.io/admin.html?invite=${encodeURIComponent(inviteId)}`;
}

function planUserLimit(subscription = {}) {
  const plan = subscription.plan === 'ea' ? 'early-adopter' : (subscription.plan || 'free');
  const base = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  const limit = Number(subscription.usersAllowed ?? base.usersAllowed ?? 1);
  return Number.isFinite(limit) && limit > 0 ? limit : 1;
}

async function sendTeamInvitationEmail({ email, inviteId, inviterEmail, orgName, role }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, error: 'Email service not configured.' };

  const roleLabels = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' };
  const roleLabel = roleLabels[role] || 'Editor';
  const url = inviteUrl(inviteId);
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
        <tr><td style="background:#111111;padding:28px 40px">
          <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px">Zigns</div>
        </td></tr>
        <tr><td style="padding:36px 40px">
          <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111111">You're invited!</p>
          <p style="margin:0 0 24px;font-size:15px;color:#555555;line-height:1.6">
            <strong style="color:#111111">${escHtmlEmail(inviterEmail)}</strong> has invited you to join
            <strong style="color:#111111">${escHtmlEmail(orgName)}</strong> on Zigns
            as <strong style="color:#111111">${roleLabel}</strong>.
          </p>
          <table cellpadding="0" cellspacing="0" style="margin:0 0 28px">
            <tr><td style="background:#111111;border-radius:8px;padding:14px 28px">
              <a href="${url}" style="color:#ffffff;font-size:15px;font-weight:600;text-decoration:none">Accept Invitation</a>
            </td></tr>
          </table>
          <p style="margin:0 0 8px;font-size:13px;color:#888888">Or copy this link into your browser:</p>
          <p style="margin:0;font-size:12px;color:#888888;word-break:break-all;font-family:'Courier New',monospace">${url}</p>
        </td></tr>
        <tr><td style="padding:20px 40px;border-top:1px solid #eeeeee">
          <p style="margin:0;font-size:12px;color:#aaaaaa">
            If you weren't expecting this invitation, you can ignore this email.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    const upstream = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Zigns <hello@zigns.io>',
        to: [email],
        subject: `${inviterEmail} invited you to ${orgName}`,
        html,
      }),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return { sent: false, error: data?.message || `Email error ${upstream.status}` };
    }
    return { sent: true, id: data?.id || null };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

async function claimPendingSubscription(db, email, orgId) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail || !orgId) return null;

  const pendingRef = db.collection('pending_subscriptions').doc(cleanEmail);
  const orgRef = db.collection('organizations').doc(orgId);
  const now = new Date().toISOString();

  return db.runTransaction(async tx => {
    const pendingSnap = await tx.get(pendingRef);
    if (!pendingSnap.exists) {
      if (!PILOT_EMAILS.has(cleanEmail)) return null;
      const orgSnap = await tx.get(orgRef);
      const existingSub = orgSnap.exists ? (orgSnap.data() || {}).subscription : null;
      if (existingSub?.plan === 'pilot' && existingSub.pilot === true) return null;
      const claimedPilot = pilotSubscription(now);
      tx.set(orgRef, { subscription: claimedPilot }, { merge: true });
      return claimedPilot;
    }

    const pending = pendingSnap.data() || {};
    const { email: _email, updatedAt: _updatedAt, ...subscriptionData } = pending;
    const claimedSubscription = {
      ...subscriptionData,
      updatedAt: now,
    };

    tx.set(orgRef, { subscription: claimedSubscription }, { merge: true });
    tx.delete(pendingRef);
    return claimedSubscription;
  });
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
  if (typeof patch.draftTransitionSpeed === 'string') {
    clean.draftTransitionSpeed = patch.draftTransitionSpeed.slice(0, 40);
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
  if (typeof patch.transitionSpeed === 'string') {
    clean.transitionSpeed = patch.transitionSpeed.slice(0, 40);
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

function normalizeShowId(showId) {
  const id = String(showId || '').trim();
  if (!id) {
    const error = new Error('showId required');
    error.statusCode = 400;
    throw error;
  }
  if (id.length > 180 || /[\/?#\[\]*]/.test(id)) {
    const error = new Error('Invalid slideshow id');
    error.statusCode = 400;
    throw error;
  }
  return id;
}

function sanitizeSlideshowName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  return name || 'Untitled Slideshow';
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

async function deleteSlideshowStorage(db, showRef) {
  const ops = [];
  for (const collectionName of [PUBLISHED_SLIDES_COLLECTION, DRAFT_SLIDES_COLLECTION]) {
    const snap = await showRef.collection(collectionName).get();
    snap.docs.forEach(docSnap => ops.push(batch => batch.delete(docSnap.ref)));
  }

  const versionRoots = await showRef.collection('slideVersions').get();
  for (const rootDoc of versionRoots.docs) {
    const versions = await rootDoc.ref.collection('versions').get();
    versions.docs.forEach(docSnap => ops.push(batch => batch.delete(docSnap.ref)));
    ops.push(batch => batch.delete(rootDoc.ref));
  }

  ops.push(batch => batch.delete(showRef));
  await commitOpsInChunks(db, ops);
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
  const id = normalizeShowId(showId);

  const showRef = db.doc(`slideshows/${id}`);
  const showSnap = await showRef.get();
  let showData = showSnap.exists ? (showSnap.data() || {}) : null;
  if (!showSnap.exists) {
    const orgSnap = await db.doc(`organizations/${orgId}`).get();
    const orgData = orgSnap.exists ? (orgSnap.data() || {}) : {};
    const orgShows = Array.isArray(orgData.slideshows) ? orgData.slideshows : [];
    const showMeta = orgShows.find(show => show && show.id === id);
    const legacyMain = id === 'main' && orgShows.length === 0;

    if (!showMeta && !legacyMain) {
      const error = new Error('Slideshow not found');
      error.statusCode = 404;
      throw error;
    }

    const now = new Date().toISOString();
    showData = {
      orgId,
      name: showMeta?.name || 'Main Slideshow',
      createdAt: now,
      slideStorageVersion: SLIDE_STORAGE_VERSION,
      publishedStorage: 'subcollection',
      defaultDwell: 6,
      fitMode: 'contain',
      transition: 'crossfade',
      transitionSpeed: 'medium',
      status: 'published',
      publishedSlidesCount: 0,
    };
    await showRef.set(showData, { merge: true });
  }

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

    if (req.body.action === 'claimPendingSubscription') {
      const { userData, orgId } = await loadUserContext(db, uid);
      const subscription = await claimPendingSubscription(db, userData.email || email, orgId);
      return res.json({ ok: true, claimed: !!subscription, subscription });
    }

    if (req.body.action === 'findPendingInvite') {
      const cleanEmail = validateEmail(email);
      const snap = await db.collection('invitations')
        .where('email', '==', cleanEmail)
        .where('status', '==', 'pending')
        .limit(10)
        .get();
      const invites = snap.docs
        .map(doc => ({ id: doc.id, ...(doc.data() || {}) }))
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      return res.json({ ok: true, inviteId: invites[0]?.id || null });
    }

    if (req.body.action === 'acceptInvitation') {
      const inviteId = String(req.body.inviteId || '').trim();
      if (!inviteId) return res.status(400).json({ error: 'inviteId required' });
      const cleanEmail = validateEmail(email);
      const now = new Date().toISOString();

      const result = await db.runTransaction(async tx => {
        const invRef = db.doc(`invitations/${inviteId}`);
        const invSnap = await tx.get(invRef);
        if (!invSnap.exists) {
          const error = new Error('Invitation not found.');
          error.statusCode = 404;
          throw error;
        }

        const inv = invSnap.data() || {};
        if (inv.status !== 'pending') {
          const error = new Error('This invitation has already been used.');
          error.statusCode = 409;
          throw error;
        }
        if (normalizeEmail(inv.email) !== cleanEmail) {
          const error = new Error(`This invitation was sent to ${inv.email || 'a different address'}. Please sign in with that account.`);
          error.statusCode = 403;
          throw error;
        }
        if (!inv.orgId) {
          const error = new Error('Invitation is missing an organization.');
          error.statusCode = 400;
          throw error;
        }

        const orgRef = db.doc(`organizations/${inv.orgId}`);
        const userRef = db.doc(`users/${uid}`);
        const [orgSnap, userSnap] = await Promise.all([tx.get(orgRef), tx.get(userRef)]);
        if (!orgSnap.exists) {
          const error = new Error('Invitation organization not found.');
          error.statusCode = 404;
          throw error;
        }

        const userData = userSnap.exists ? (userSnap.data() || {}) : {};
        if (userData.orgId && userData.orgId !== inv.orgId) {
          const error = new Error('This account already belongs to another organization.');
          error.statusCode = 409;
          throw error;
        }

        const orgData = orgSnap.data() || {};
        const role = sanitizeInviteRole(inv.role);
        const member = {
          uid,
          email: cleanEmail,
          displayName: req.body.displayName || '',
          role,
          addedAt: now,
        };
        const members = Array.isArray(orgData.members) ? orgData.members : [];
        const nextMembers = members.some(m => m && m.uid === uid)
          ? members.map(m => m && m.uid === uid ? { ...m, ...member, addedAt: m.addedAt || now } : m)
          : [...members, member];

        tx.set(orgRef, { members: nextMembers }, { merge: true });
        tx.set(userRef, {
          orgId: inv.orgId,
          role,
          email: cleanEmail,
          displayName: req.body.displayName || '',
        }, { merge: true });
        tx.set(invRef, {
          status: 'accepted',
          acceptedAt: now,
          acceptedBy: uid,
        }, { merge: true });

        return {
          user: { id: uid, orgId: inv.orgId, role, email: cleanEmail, displayName: req.body.displayName || '' },
          org: { id: inv.orgId, ...orgData, members: nextMembers },
        };
      });

      return res.json({ ok: true, ...result });
    }

    if (req.body.action === 'createInvitation') {
      const { userData, orgId, role: actorRole } = await loadUserContext(db, uid);
      requireRole(actorRole, ['admin']);

      const cleanEmail = validateEmail(req.body.email);
      const inviteRole = sanitizeInviteRole(req.body.role);
      const now = new Date().toISOString();
      const orgRef = db.doc(`organizations/${orgId}`);

      const result = await db.runTransaction(async tx => {
        const orgSnap = await tx.get(orgRef);
        if (!orgSnap.exists) {
          const error = new Error('Organization not found');
          error.statusCode = 404;
          throw error;
        }

        const orgData = orgSnap.data() || {};
        const members = Array.isArray(orgData.members) ? orgData.members : [];
        if (members.some(m => normalizeEmail(m?.email) === cleanEmail)) {
          const error = new Error('This person is already a team member.');
          error.statusCode = 409;
          throw error;
        }

        const pendingSnap = await tx.get(db.collection('invitations')
          .where('orgId', '==', orgId)
          .where('status', '==', 'pending'));
        const existing = pendingSnap.docs.find(doc => normalizeEmail(doc.data()?.email) === cleanEmail);
        if (existing) {
          tx.set(existing.ref, {
            role: inviteRole,
            invitedBy: uid,
            invitedByEmail: userData.email || email,
            updatedAt: now,
          }, { merge: true });
          return {
            inviteId: existing.id,
            orgName: orgData.name || 'our organization',
            reused: true,
            pendingCount: pendingSnap.size,
          };
        }

        const userLimit = planUserLimit(orgData.subscription || {});
        if (members.length + pendingSnap.size >= userLimit) {
          const error = new Error(`Your plan allows ${userLimit} team member${userLimit === 1 ? '' : 's'}. Upgrade to invite more team members.`);
          error.statusCode = 402;
          throw error;
        }

        const inviteId = crypto.randomUUID();
        const inviteRef = db.collection('invitations').doc(inviteId);
        tx.create(inviteRef, {
          email: cleanEmail,
          role: inviteRole,
          orgId,
          orgName: orgData.name || '',
          invitedBy: uid,
          invitedByEmail: userData.email || email,
          createdAt: now,
          status: 'pending',
        });

        return {
          inviteId,
          orgName: orgData.name || 'our organization',
          reused: false,
          pendingCount: pendingSnap.size + 1,
        };
      });

      const emailResult = await sendTeamInvitationEmail({
        email: cleanEmail,
        inviteId: result.inviteId,
        inviterEmail: userData.email || email,
        orgName: result.orgName,
        role: inviteRole,
      });
      return res.json({
        ok: true,
        ...result,
        inviteUrl: inviteUrl(result.inviteId),
        emailSent: emailResult.sent,
        emailError: emailResult.error || null,
        emailId: emailResult.id || null,
      });
    }

    if (req.body.action === 'listPendingInvites') {
      const { orgId, role } = await loadUserContext(db, uid);
      requireRole(role, ['admin']);

      const snap = await db.collection('invitations')
        .where('orgId', '==', orgId)
        .where('status', '==', 'pending')
        .get();
      const invites = snap.docs
        .map(doc => {
          const data = doc.data() || {};
          return {
            id: doc.id,
            email: normalizeEmail(data.email),
            role: sanitizeInviteRole(data.role),
            createdAt: data.createdAt || '',
            invitedByEmail: data.invitedByEmail || '',
          };
        })
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      return res.json({ ok: true, invites });
    }

    if (req.body.action === 'cancelInvitation') {
      const { orgId, role } = await loadUserContext(db, uid);
      requireRole(role, ['admin']);
      const inviteId = String(req.body.inviteId || '').trim();
      if (!inviteId) return res.status(400).json({ error: 'inviteId required' });

      const invRef = db.doc(`invitations/${inviteId}`);
      const invSnap = await invRef.get();
      if (!invSnap.exists) return res.status(404).json({ error: 'Invitation not found.' });
      const inv = invSnap.data() || {};
      if (inv.orgId !== orgId) return res.status(403).json({ error: 'Invitation is not in your organization.' });

      await invRef.set({
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancelledBy: uid,
      }, { merge: true });
      return res.json({ ok: true });
    }

    if (req.body.action === 'resendInvitation') {
      const { userData, orgId, role } = await loadUserContext(db, uid);
      requireRole(role, ['admin']);
      const inviteId = String(req.body.inviteId || '').trim();
      if (!inviteId) return res.status(400).json({ error: 'inviteId required' });

      const invSnap = await db.doc(`invitations/${inviteId}`).get();
      if (!invSnap.exists) return res.status(404).json({ error: 'Invitation not found.' });
      const inv = invSnap.data() || {};
      if (inv.orgId !== orgId) return res.status(403).json({ error: 'Invitation is not in your organization.' });
      if (inv.status !== 'pending') return res.status(409).json({ error: 'This invitation is no longer pending.' });

      const emailResult = await sendTeamInvitationEmail({
        email: validateEmail(inv.email),
        inviteId,
        inviterEmail: userData.email || email,
        orgName: inv.orgName || 'our organization',
        role: sanitizeInviteRole(inv.role),
      });
      return res.json({
        ok: true,
        inviteUrl: inviteUrl(inviteId),
        emailSent: emailResult.sent,
        emailError: emailResult.error || null,
        emailId: emailResult.id || null,
      });
    }

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

    if (req.body.action === 'renameScreen') {
      const screenId = String(req.body.screenId || '').trim();
      const name = String(req.body.name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
      if (!screenId) return res.status(400).json({ error: 'screenId required' });
      if (!name) return res.status(400).json({ error: 'Screen name required' });

      const { orgId, role } = await loadUserContext(db, uid);
      requireRole(role, ['admin', 'editor']);

      const screenRef = db.doc(`screens/${screenId}`);
      const screenSnap = await screenRef.get();
      if (!screenSnap.exists) return res.status(404).json({ error: 'Screen not found' });
      const screenData = screenSnap.data() || {};
      if (screenData.orgId !== orgId) {
        return res.status(403).json({ error: 'Screen is not in your organization' });
      }

      await screenRef.set({
        name,
        renamedAt: new Date().toISOString(),
        renamedBy: uid,
      }, { merge: true });
      return res.json({ ok: true, screenId, screenName: name });
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
      const cleanShowId = normalizeShowId(showId);

      const userSnap = await db.doc(`users/${uid}`).get();
      if (!userSnap.exists) return res.status(404).json({ error: 'User not found' });

      const userData = userSnap.data() || {};
      if (!userData.orgId) return res.status(403).json({ error: 'User has no organization' });

      const showRef = db.doc(`slideshows/${cleanShowId}`);
      let showSnap = await showRef.get();
      let showData = showSnap.exists ? (showSnap.data() || {}) : null;
      if (!showSnap.exists) {
        if (!['admin', 'editor'].includes(userData.role)) {
          return res.status(404).json({ error: 'Slideshow not found' });
        }
        const loaded = await loadEditableShow(db, cleanShowId, userData.orgId);
        showSnap = await loaded.showRef.get();
        showData = loaded.showData;
      }
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

    if (req.body.action === 'createSlideshow') {
      const { orgId, role } = await loadUserContext(db, uid);
      requireRole(role, ['admin', 'editor']);

      const showId = normalizeShowId(req.body.showId);
      const name = sanitizeSlideshowName(req.body.name);
      const orgRef = db.doc(`organizations/${orgId}`);
      const showRef = db.doc(`slideshows/${showId}`);
      const now = new Date().toISOString();

      const result = await db.runTransaction(async tx => {
        const [orgSnap, showSnap] = await Promise.all([tx.get(orgRef), tx.get(showRef)]);
        if (!orgSnap.exists) {
          const error = new Error('Organization not found');
          error.statusCode = 404;
          throw error;
        }

        const orgData = orgSnap.data() || {};
        const existingShows = Array.isArray(orgData.slideshows) ? orgData.slideshows : [];
        const existingShowData = showSnap.exists ? (showSnap.data() || {}) : null;
        if (existingShowData && existingShowData.orgId !== orgId) {
          const error = new Error('Slideshow id is already in use');
          error.statusCode = 409;
          throw error;
        }

        const nextShows = existingShows.some(show => show && show.id === showId)
          ? existingShows.map(show => show && show.id === showId ? { ...show, name } : show)
          : [...existingShows, { id: showId, name }];
        tx.set(orgRef, { slideshows: nextShows }, { merge: true });

        const showData = {
          orgId,
          name,
          createdAt: existingShowData?.createdAt || now,
          slideStorageVersion: SLIDE_STORAGE_VERSION,
          publishedStorage: 'subcollection',
          publishedSlidesCount: existingShowData?.publishedSlidesCount || 0,
          defaultDwell: existingShowData?.defaultDwell || 6,
          fitMode: existingShowData?.fitMode || 'contain',
          transition: existingShowData?.transition || 'crossfade',
          transitionSpeed: existingShowData?.transitionSpeed || 'medium',
          status: existingShowData?.status || 'published',
          updatedAt: now,
        };
        tx.set(showRef, showData, { merge: true });
        return { show: { id: showId, name }, slideshows: nextShows };
      });

      return res.json({ ok: true, ...result });
    }

    if (req.body.action === 'deleteSlideshow') {
      const { orgId, role } = await loadUserContext(db, uid);
      requireRole(role, ['admin']);

      const showId = normalizeShowId(req.body.showId);
      const orgRef = db.doc(`organizations/${orgId}`);
      const showRef = db.doc(`slideshows/${showId}`);

      const txResult = await db.runTransaction(async tx => {
        const [orgSnap, showSnap] = await Promise.all([tx.get(orgRef), tx.get(showRef)]);
        if (!orgSnap.exists) {
          const error = new Error('Organization not found');
          error.statusCode = 404;
          throw error;
        }

        const orgData = orgSnap.data() || {};
        const shows = Array.isArray(orgData.slideshows) ? orgData.slideshows : [];
        const remainingShows = shows.filter(show => show && show.id !== showId);
        if (shows.length <= 1 || remainingShows.length === 0) {
          const error = new Error('Cannot delete the only slideshow in an organization.');
          error.statusCode = 400;
          throw error;
        }
        if (!shows.some(show => show && show.id === showId)) {
          const error = new Error('Slideshow is not in your organization list.');
          error.statusCode = 404;
          throw error;
        }

        const showData = showSnap.exists ? (showSnap.data() || {}) : null;
        if (showData && showData.orgId !== orgId) {
          const error = new Error('Slideshow is not in your organization');
          error.statusCode = 403;
          throw error;
        }

        tx.set(orgRef, { slideshows: remainingShows }, { merge: true });
        return {
          fallbackShowId: remainingShows[0]?.id || '',
          slideshows: remainingShows,
        };
      });

      const fallbackShowId = txResult.fallbackShowId;
      const screenSnap = await db.collection('screens').where('orgId', '==', orgId).get();
      const screenOps = screenSnap.docs
        .filter(docSnap => (docSnap.data() || {}).slideshowId === showId)
        .map(docSnap => batch => batch.set(docSnap.ref, { slideshowId: fallbackShowId }, { merge: true }));

      const scheduleSnap = await orgRef.collection('schedules').get();
      const scheduleOps = scheduleSnap.docs.map(docSnap => {
        const schedule = docSnap.data() || {};
        let changed = false;
        const nextSchedule = { ...schedule };
        if (nextSchedule.fillerSlideshowId === showId) {
          nextSchedule.fillerSlideshowId = fallbackShowId;
          changed = true;
        }
        if (Array.isArray(nextSchedule.events)) {
          nextSchedule.events = nextSchedule.events.map(event => {
            if (event?.slideshowId !== showId) return event;
            changed = true;
            return { ...event, slideshowId: fallbackShowId };
          });
        }
        if (!changed) return null;
        nextSchedule.updatedAt = new Date().toISOString();
        return batch => batch.set(docSnap.ref, nextSchedule, { merge: true });
      }).filter(Boolean);

      await commitOpsInChunks(db, [...screenOps, ...scheduleOps]);
      await deleteSlideshowStorage(db, showRef);

      return res.json({
        ok: true,
        slideshows: txResult.slideshows,
        fallbackShowId,
        reassignedScreensCount: screenOps.length,
        updatedSchedulesCount: scheduleOps.length,
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

    if (req.body.action === 'saveDesignerDraft') {
      const { showId, clear } = req.body || {};
      const { orgId, role } = await loadUserContext(db, uid);
      requireRole(role, ['admin', 'editor']);

      const { showRef } = await loadEditableShow(db, showId, orgId);
      const now = new Date().toISOString();

      if (clear === true) {
        await showRef.set({
          draftCanvasJson: null,
          draftSlideId: null,
          draftAt: null,
        }, { merge: true });
        return res.json({ ok: true, cleared: true });
      }

      const canvasJson = typeof req.body.canvasJson === 'string' ? req.body.canvasJson : '';
      const slideId = String(req.body.slideId || '').trim();
      if (!canvasJson || !slideId) {
        return res.status(400).json({ error: 'canvasJson and slideId required' });
      }
      if (canvasJson.length > 900000) {
        return res.status(413).json({ error: 'Designer draft is too large to autosave' });
      }

      await showRef.set({
        draftCanvasJson: canvasJson,
        draftSlideId: slideId.slice(0, 120),
        draftAt: now,
      }, { merge: true });

      return res.json({ ok: true, draftAt: now });
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
        draftTransitionSpeed: deleteField,
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
