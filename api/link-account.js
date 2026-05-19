const { getAuth, getFirestore } = require('./_lib/firebase-admin');
const admin = require('firebase-admin');
const crypto = require('crypto');

const PLAYER_DIAGNOSTIC_TYPES = new Set([
  'screen_online',
  'screen_offline',
  'player_boot',
  'player_capabilities',
  'player_online',
  'player_offline',
  'player_heartbeat_error',
  'player_watchdog_restart',
  'player_slideshow_error',
  'playlist_slide_skipped',
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
const CAP_STATE_CODES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN',
  'MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','PR','RI','SC','SD','TN','TX','UT','VT','VA',
  'WA','WV','WI','WY',
]);
const CAP_SEVERITIES = new Set(['Minor', 'Moderate', 'Severe', 'Extreme']);
const CAP_LANGUAGES = new Set(['en', 'es', 'en-es']);
const BROADCAST_COLORS = new Set(['#dc2626', '#d97706', '#1e40af', '#111827', '#ffffff']);

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

function shouldProbeUnmarkedSubcollections(data = {}) {
  return data &&
    !Array.isArray(data.slides) &&
    !Array.isArray(data.draftSlides) &&
    data.slideStorageVersion === undefined &&
    data.publishedStorage === undefined &&
    data.draftStorage === undefined;
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

function validateUid(value, label = 'uid') {
  const uid = String(value || '').trim();
  if (!uid || uid.length > 128 || uid.includes('/')) {
    const error = new Error(`${label} required`);
    error.statusCode = 400;
    throw error;
  }
  return uid;
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

function mutateTagList(tags, oldTag, newTag = null) {
  return normalizeTags(tags)
    .map(tag => tag === oldTag ? newTag : tag)
    .filter(Boolean)
    .filter((tag, index, arr) => arr.indexOf(tag) === index);
}

function mutateSlideTagLists(slides, oldTag, newTag = null) {
  if (!Array.isArray(slides)) return slides;
  return slides.map(slide => {
    if (!slide || typeof slide !== 'object') return slide;
    const next = { ...slide, tags: mutateTagList(slide.tags || [], oldTag, newTag) };
    if (Array.isArray(next.slides)) next.slides = mutateSlideTagLists(next.slides, oldTag, newTag);
    return next;
  });
}

function hasTag(tags, tag) {
  return normalizeTags(tags).includes(tag);
}

function tagListChanged(before, after) {
  return JSON.stringify(normalizeTags(before)) !== JSON.stringify(normalizeTags(after));
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

function sanitizeSlideshowMetadataPatch(patch = {}, role = 'viewer') {
  const clean = {};
  if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
    clean.name = sanitizeSlideshowName(patch.name);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'tags')) {
    clean.tags = normalizeTags(patch.tags);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'autoIncludeTags')) {
    clean.autoIncludeTags = normalizeTags(patch.autoIncludeTags);
  }
  if (role === 'admin' && Object.prototype.hasOwnProperty.call(patch, 'emergencyPlaylist')) {
    clean.emergencyPlaylist = patch.emergencyPlaylist === true;
  }
  return clean;
}

function sanitizeScreenIds(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(id => String(id || '').trim()).filter(Boolean))).slice(0, 200);
}

function sanitizeCapSeverity(value, fallback = 'Severe') {
  const severity = String(value || fallback).trim();
  return CAP_SEVERITIES.has(severity) ? severity : fallback;
}

function sanitizeCapState(value) {
  const state = String(value || '').trim().toUpperCase().slice(0, 2);
  return CAP_STATE_CODES.has(state) ? state : '';
}

function sanitizeCapLanguage(value) {
  const lang = String(value || 'en').trim().toLowerCase();
  return CAP_LANGUAGES.has(lang) ? lang : 'en';
}

function normalizeCapFipsToken(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length <= 3) return digits.padStart(3, '0');
  if (digits.length <= 5) return digits.padStart(5, '0');
  return digits.slice(-5);
}

function normalizeCapFipsList(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(normalizeCapFipsToken).filter(Boolean))).slice(0, 20);
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

function sanitizeDocId(value, label = 'id') {
  const id = String(value || '').trim();
  if (!id) {
    const error = new Error(`${label} required`);
    error.statusCode = 400;
    throw error;
  }
  if (id.length > 180 || /[\/?#\[\]*]/.test(id)) {
    const error = new Error(`Invalid ${label}`);
    error.statusCode = 400;
    throw error;
  }
  return id;
}

function sanitizeScreenSettingsPatch(patch = {}) {
  const clean = {};
  if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
    const name = String(patch.name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    if (name) clean.name = name;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'location')) {
    clean.location = String(patch.location || '').trim().slice(0, 120);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'slideshowId')) {
    clean.slideshowId = String(patch.slideshowId || '').trim().slice(0, 180);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'scheduleId')) {
    clean.scheduleId = String(patch.scheduleId || '').trim().slice(0, 180);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'orientation')) {
    const orientation = String(patch.orientation || 'landscape').trim().toLowerCase();
    clean.orientation = ['landscape', 'portrait'].includes(orientation) ? orientation : 'landscape';
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'tags')) {
    clean.tags = normalizeTags(patch.tags);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'timezone')) {
    clean.timezone = String(patch.timezone || '').trim().slice(0, 80);
  }
  if (patch.cap && typeof patch.cap === 'object') {
    clean.cap = {
      enabled: patch.cap.enabled === true,
      state: sanitizeCapState(patch.cap.state),
      countyFips: normalizeCapFipsList(patch.cap.countyFips),
      severityFloor: String(patch.cap.severityFloor || 'Severe').trim().slice(0, 20),
      language: sanitizeCapLanguage(patch.cap.language),
      spanishNote: String(patch.cap.spanishNote || '').trim().slice(0, 240),
    };
    clean.cap.severityFloor = sanitizeCapSeverity(clean.cap.severityFloor);
  }
  if (patch.workingHours && typeof patch.workingHours === 'object') {
    const wh = patch.workingHours;
    clean.workingHours = {
      enabled: wh.enabled === true,
      startHour: Math.min(23, Math.max(0, Number(wh.startHour) || 0)),
      startMin: Math.min(59, Math.max(0, Number(wh.startMin) || 0)),
      endHour: Math.min(23, Math.max(0, Number(wh.endHour) || 0)),
      endMin: Math.min(59, Math.max(0, Number(wh.endMin) || 0)),
      days: Array.isArray(wh.days)
        ? wh.days.map(day => Number(day)).filter(day => Number.isInteger(day) && day >= 0 && day <= 6)
        : [],
    };
  }
  return clean;
}

function sanitizeMediaPatch(patch = {}) {
  const clean = {};
  if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
    clean.name = String(patch.name || '').trim().replace(/\s+/g, ' ').slice(0, 160) || 'Media item';
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'type')) {
    const type = String(patch.type || 'image').trim().toLowerCase();
    clean.type = ['image', 'video', 'audio', 'document', 'pdf'].includes(type) ? type : 'image';
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'url')) {
    clean.url = String(patch.url || '').trim().slice(0, 2000);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'tags')) {
    clean.tags = normalizeTags(patch.tags);
  }
  return clean;
}

function sanitizeBroadcastMode(value) {
  const mode = String(value || 'message').trim().toLowerCase();
  return mode === 'playlist' ? 'playlist' : 'message';
}

function sanitizeBroadcastColor(value) {
  const color = String(value || '').trim().toLowerCase();
  return BROADCAST_COLORS.has(color) ? color : '#dc2626';
}

function sanitizeBroadcastAutoDismiss(value) {
  const seconds = Number(value) || 0;
  return Number.isFinite(seconds) ? Math.min(86400, Math.max(0, Math.round(seconds))) : 0;
}

function sanitizeBroadcastMessage(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 500);
}

function sanitizeEmergencyAuditLimit(value) {
  const limit = Number(value) || 12;
  return Math.min(50, Math.max(1, Math.round(limit)));
}

async function loadEmergencyPlaylistMeta(db, orgId, showId) {
  const id = normalizeShowId(showId);
  const [orgSnap, showSnap] = await Promise.all([
    db.doc(`organizations/${orgId}`).get(),
    db.doc(`slideshows/${id}`).get(),
  ]);
  const orgData = orgSnap.exists ? (orgSnap.data() || {}) : {};
  const orgShows = Array.isArray(orgData.slideshows) ? orgData.slideshows : [];
  const orgMeta = orgShows.find(show => show && show.id === id) || null;
  const showData = showSnap.exists ? (showSnap.data() || {}) : null;

  if (!orgMeta && (!showData || showData.orgId !== orgId)) {
    const error = new Error('Emergency playlist not found');
    error.statusCode = 404;
    throw error;
  }
  if (showData && showData.orgId !== orgId) {
    const error = new Error('Emergency playlist is not in your organization');
    error.statusCode = 403;
    throw error;
  }

  const emergencyPlaylist = showData?.emergencyPlaylist === true || orgMeta?.emergencyPlaylist === true;
  if (!emergencyPlaylist) {
    const error = new Error('Choose a slideshow marked as an emergency playlist');
    error.statusCode = 400;
    throw error;
  }

  return {
    id,
    name: showData?.name || orgMeta?.name || id,
  };
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

async function mutateSlideCollectionTags(db, showRef, collectionName, oldTag, newTag = null) {
  const snap = await showRef.collection(collectionName).get();
  const now = new Date().toISOString();
  const ops = [];
  snap.docs.forEach(docSnap => {
    const data = docSnap.data() || {};
    if (!hasTag(data.tags, oldTag) && !Array.isArray(data.slides)) return;
    const current = normalizeSlideDoc(docSnap);
    const [next] = mutateSlideTagLists([current], oldTag, newTag);
    if (JSON.stringify(current.tags || []) === JSON.stringify(next.tags || [])
      && JSON.stringify(current.slides || []) === JSON.stringify(next.slides || [])) {
      return;
    }
    ops.push(batch => batch.set(docSnap.ref, {
      ...next,
      id: next.id || docSnap.id,
      order: data.order ?? 0,
      updatedAt: now,
    }));
  });
  await commitOpsInChunks(db, ops);
  return ops.length;
}

async function mutateOrgTagEverywhere(db, orgId, oldTag, newTag = null) {
  const cleanOld = normalizeTag(oldTag);
  const cleanNew = newTag === null ? null : normalizeTag(newTag);
  if (!cleanOld) {
    const error = new Error('oldTag required');
    error.statusCode = 400;
    throw error;
  }
  if (cleanNew === cleanOld) {
    const error = new Error('Choose a different tag name');
    error.statusCode = 400;
    throw error;
  }

  const orgRef = db.doc(`organizations/${orgId}`);
  const orgSnap = await orgRef.get();
  if (!orgSnap.exists) {
    const error = new Error('Organization not found');
    error.statusCode = 404;
    throw error;
  }
  const orgData = orgSnap.data() || {};
  const shows = Array.isArray(orgData.slideshows) ? orgData.slideshows : [];
  const nextOrgTags = mutateTagList(orgData.tags || [], cleanOld, cleanNew).sort();
  const nextShows = shows.map(show => {
    if (!show || typeof show !== 'object') return show;
    return {
      ...show,
      tags: mutateTagList(show.tags || [], cleanOld, cleanNew),
      autoIncludeTags: mutateTagList(show.autoIncludeTags || [], cleanOld, cleanNew),
    };
  });

  await orgRef.set({ tags: nextOrgTags, slideshows: nextShows }, { merge: true });

  const stats = {
    screensUpdated: 0,
    slideshowsUpdated: 0,
    publishedSlidesUpdated: 0,
    draftSlidesUpdated: 0,
    mediaUpdated: 0,
  };

  const screenSnap = await db.collection('screens').where('orgId', '==', orgId).get();
  const screenOps = [];
  screenSnap.docs.forEach(docSnap => {
    const data = docSnap.data() || {};
    if (!hasTag(data.tags, cleanOld)) return;
    screenOps.push(batch => batch.set(docSnap.ref, { tags: mutateTagList(data.tags, cleanOld, cleanNew) }, { merge: true }));
  });
  await commitOpsInChunks(db, screenOps);
  stats.screensUpdated = screenOps.length;

  for (const show of nextShows) {
    if (!show?.id) continue;
    const showRef = db.doc(`slideshows/${show.id}`);
    const showSnap = await showRef.get();
    if (!showSnap.exists) continue;
    const showData = showSnap.data() || {};
    if (showData.orgId !== orgId) continue;

    const showPatch = {
      tags: mutateTagList(showData.tags || show.tags || [], cleanOld, cleanNew),
      autoIncludeTags: mutateTagList(showData.autoIncludeTags || show.autoIncludeTags || [], cleanOld, cleanNew),
    };
    if (Array.isArray(showData.slides)) {
      showPatch.slides = mutateSlideTagLists(showData.slides, cleanOld, cleanNew);
    }
    if (Array.isArray(showData.draftSlides)) {
      showPatch.draftSlides = mutateSlideTagLists(showData.draftSlides, cleanOld, cleanNew);
    }
    if (
      tagListChanged(showData.tags || [], showPatch.tags)
      || tagListChanged(showData.autoIncludeTags || [], showPatch.autoIncludeTags)
      || JSON.stringify(showData.slides || []) !== JSON.stringify(showPatch.slides || showData.slides || [])
      || JSON.stringify(showData.draftSlides || []) !== JSON.stringify(showPatch.draftSlides || showData.draftSlides || [])
    ) {
      showPatch.updatedAt = new Date().toISOString();
      await showRef.set(showPatch, { merge: true });
      stats.slideshowsUpdated += 1;
    }

    stats.publishedSlidesUpdated += await mutateSlideCollectionTags(db, showRef, PUBLISHED_SLIDES_COLLECTION, cleanOld, cleanNew);
    stats.draftSlidesUpdated += await mutateSlideCollectionTags(db, showRef, DRAFT_SLIDES_COLLECTION, cleanOld, cleanNew);
  }

  const mediaSnap = await orgRef.collection('media').get();
  const mediaOps = [];
  mediaSnap.docs.forEach(docSnap => {
    const data = docSnap.data() || {};
    if (!hasTag(data.tags, cleanOld)) return;
    mediaOps.push(batch => batch.set(docSnap.ref, { tags: mutateTagList(data.tags, cleanOld, cleanNew) }, { merge: true }));
  });
  await commitOpsInChunks(db, mediaOps);
  stats.mediaUpdated = mediaOps.length;

  return {
    oldTag: cleanOld,
    newTag: cleanNew,
    tags: nextOrgTags,
    slideshows: nextShows,
    stats,
  };
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
          onboardingComplete: true,
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

    if (req.body.action === 'removeMember') {
      const { orgId, role } = await loadUserContext(db, uid);
      requireRole(role, ['admin']);
      const memberUid = validateUid(req.body.memberUid, 'memberUid');
      if (memberUid === uid) return res.status(400).json({ error: 'You cannot remove yourself from the team.' });

      const orgRef = db.doc(`organizations/${orgId}`);
      const memberRef = db.doc(`users/${memberUid}`);
      const now = new Date().toISOString();

      const result = await db.runTransaction(async tx => {
        const [orgSnap, memberSnap] = await Promise.all([tx.get(orgRef), tx.get(memberRef)]);
        if (!orgSnap.exists) {
          const error = new Error('Organization not found');
          error.statusCode = 404;
          throw error;
        }

        const orgData = orgSnap.data() || {};
        const members = Array.isArray(orgData.members) ? orgData.members : [];
        const member = members.find(item => item && item.uid === memberUid);
        if (!member) {
          const error = new Error('Member not found.');
          error.statusCode = 404;
          throw error;
        }

        if (orgData.ownerId && memberUid === orgData.ownerId) {
          const error = new Error('Cannot remove the organization owner.');
          error.statusCode = 409;
          throw error;
        }

        if (member.role === 'admin') {
          const remainingAdmins = members.filter(item => item && item.uid !== memberUid && item.role === 'admin').length;
          if (remainingAdmins === 0) {
            const error = new Error('Cannot remove the last admin. Promote another member to admin first.');
            error.statusCode = 409;
            throw error;
          }
        }

        const nextMembers = members.filter(item => item && item.uid !== memberUid);
        const removedRecord = {
          uid: member.uid,
          email: member.email || '',
          displayName: member.displayName || '',
          role: member.role || 'viewer',
          addedAt: member.addedAt || null,
          removedAt: now,
          removedBy: uid,
          removedByEmail: email || '',
        };
        const existingRemoved = Array.isArray(orgData.removedMembers) ? orgData.removedMembers : [];
        const nextRemoved = [...existingRemoved, removedRecord].slice(-50);
        const nextOrg = { id: orgId, ...orgData, members: nextMembers, removedMembers: nextRemoved };

        tx.set(orgRef, { members: nextMembers, removedMembers: nextRemoved }, { merge: true });
        if (memberSnap.exists) {
          const memberData = memberSnap.data() || {};
          if (!memberData.orgId || memberData.orgId === orgId) {
            tx.set(memberRef, {
              orgId: null,
              removedFromOrgId: orgId,
              removedFromOrgAt: now,
              removedFromOrgBy: uid,
            }, { merge: true });
          }
        }

        return { org: nextOrg, removedMember: removedRecord };
      });

      return res.json({ ok: true, ...result });
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

    if (req.body.action === 'saveScreenSettings') {
      const screenId = sanitizeDocId(req.body.screenId, 'screenId');
      const { orgId, role } = await loadUserContext(db, uid);
      requireRole(role, ['admin', 'editor']);

      const screenRef = db.doc(`screens/${screenId}`);
      const screenSnap = await screenRef.get();
      if (!screenSnap.exists) return res.status(404).json({ error: 'Screen not found' });
      const screenData = screenSnap.data() || {};
      if (screenData.orgId !== orgId) {
        return res.status(403).json({ error: 'Screen is not in your organization' });
      }

      const patch = sanitizeScreenSettingsPatch(req.body.patch || {});
      await screenRef.set({ ...patch, orgId, updatedAt: new Date().toISOString() }, { merge: true });

      let tags = null;
      if (Array.isArray(patch.tags) && patch.tags.length) {
        const orgRef = db.doc(`organizations/${orgId}`);
        await db.runTransaction(async tx => {
          const orgSnap = await tx.get(orgRef);
          const orgData = orgSnap.exists ? (orgSnap.data() || {}) : {};
          tags = Array.from(new Set([...normalizeTags(orgData.tags || []), ...patch.tags])).sort();
          tx.set(orgRef, { tags }, { merge: true });
        });
      }

      return res.json({ ok: true, screenId, tags });
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

    if (req.body.action === 'upsertMediaRecord') {
      const mediaId = sanitizeDocId(req.body.mediaId, 'mediaId');
      const { orgId, role } = await loadUserContext(db, uid);
      requireRole(role, ['admin', 'editor']);

      const patch = sanitizeMediaPatch(req.body.patch || {});
      const now = new Date().toISOString();
      const mediaRef = db.doc(`organizations/${orgId}/media/${mediaId}`);
      await mediaRef.set({
        ...patch,
        updatedAt: now,
        ...(!req.body.patch?.createdAt && { createdAt: now }),
      }, { merge: true });

      let tags = null;
      if (Array.isArray(patch.tags) && patch.tags.length) {
        const orgRef = db.doc(`organizations/${orgId}`);
        await db.runTransaction(async tx => {
          const orgSnap = await tx.get(orgRef);
          const orgData = orgSnap.exists ? (orgSnap.data() || {}) : {};
          tags = Array.from(new Set([...normalizeTags(orgData.tags || []), ...patch.tags])).sort();
          tx.set(orgRef, { tags }, { merge: true });
        });
      }

      return res.json({ ok: true, mediaId, tags });
    }

    if (req.body.action === 'deleteMediaRecord') {
      const mediaId = sanitizeDocId(req.body.mediaId, 'mediaId');
      const { orgId, role } = await loadUserContext(db, uid);
      requireRole(role, ['admin', 'editor']);
      await db.doc(`organizations/${orgId}/media/${mediaId}`).delete();
      return res.json({ ok: true, mediaId });
    }

    if (req.body.action === 'setEmergencyBroadcast') {
      const { userData, orgId, role } = await loadUserContext(db, uid);
      requireRole(role, ['admin']);

      const now = new Date().toISOString();
      const mode = sanitizeBroadcastMode(req.body.mode);
      const targetTags = normalizeTags(req.body.targetTags || []).slice(0, 20);
      const payload = {
        active: true,
        mode,
        color: sanitizeBroadcastColor(req.body.color),
        autoDismiss: sanitizeBroadcastAutoDismiss(req.body.autoDismiss),
        createdAt: now,
        createdBy: userData.email || email || '',
        createdByUid: uid,
      };

      if (mode === 'playlist') {
        const show = await loadEmergencyPlaylistMeta(db, orgId, req.body.slideshowId);
        payload.slideshowId = show.id;
        payload.message = 'Emergency playlist: ' + show.name;
        if (targetTags.length) payload.targetTags = targetTags;
      } else {
        const message = sanitizeBroadcastMessage(req.body.message);
        if (!message) return res.status(400).json({ error: 'Broadcast message required' });
        payload.message = message;
      }

      const auditRef = db.collection(`organizations/${orgId}/emergencyAudit`).doc();
      const batch = db.batch();
      batch.set(db.doc(`broadcasts/${orgId}`), payload, { merge: false });
      batch.set(auditRef, {
        action: 'trigger',
        mode: payload.mode,
        message: payload.message,
        color: payload.color,
        autoDismiss: payload.autoDismiss,
        slideshowId: payload.slideshowId || '',
        targetTags: payload.targetTags || [],
        createdAt: now,
        createdBy: payload.createdBy,
        createdByUid: uid,
        source: 'admin',
      });
      await batch.commit();

      return res.json({ ok: true, broadcast: payload, auditId: auditRef.id });
    }

    if (req.body.action === 'clearEmergencyBroadcast') {
      const { userData, orgId, role } = await loadUserContext(db, uid);
      requireRole(role, ['admin']);

      const now = new Date().toISOString();
      const actorEmail = userData.email || email || '';
      const auditRef = db.collection(`organizations/${orgId}/emergencyAudit`).doc();
      const batch = db.batch();
      batch.set(db.doc(`broadcasts/${orgId}`), {
        active: false,
        clearedAt: now,
        clearedBy: actorEmail,
        clearedByUid: uid,
      }, { merge: true });
      batch.set(auditRef, {
        action: 'clear',
        mode: 'clear',
        message: 'Emergency broadcast cleared',
        targetTags: [],
        createdAt: now,
        createdBy: actorEmail,
        createdByUid: uid,
        source: 'admin',
      });
      await batch.commit();

      return res.json({ ok: true, auditId: auditRef.id, clearedAt: now });
    }

    if (req.body.action === 'listEmergencyAudit') {
      const { orgId, role } = await loadUserContext(db, uid);
      requireRole(role, ['admin']);
      const auditLimit = sanitizeEmergencyAuditLimit(req.body.limit);
      const snap = await db.collection(`organizations/${orgId}/emergencyAudit`)
        .orderBy('createdAt', 'desc')
        .limit(auditLimit)
        .get();
      const entries = snap.docs.map(doc => ({ id: doc.id, ...(doc.data() || {}) }));
      return res.json({ ok: true, entries });
    }

    if (req.body.action === 'sendCapTestAlert') {
      const screenId = sanitizeDocId(req.body.screenId, 'screenId');
      const { orgId, role } = await loadUserContext(db, uid);
      requireRole(role, ['admin']);

      const screenRef = db.doc(`screens/${screenId}`);
      const screenSnap = await screenRef.get();
      if (!screenSnap.exists) return res.status(404).json({ error: 'Screen not found' });
      const screenData = screenSnap.data() || {};
      if (screenData.orgId !== orgId) {
        return res.status(403).json({ error: 'Screen is not in your organization' });
      }

      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const durationSeconds = Math.min(1800, Math.max(60, Number(req.body.durationSeconds) || 600));
      const expiresAt = new Date(nowMs + durationSeconds * 1000).toISOString();
      const severity = sanitizeCapSeverity(req.body.severity || screenData.cap?.severityFloor || 'Severe');
      const screenName = String(screenData.name || screenId).trim();
      const areaDesc = String(req.body.areaDesc || screenData.location || screenName || 'Test screen').trim().slice(0, 160);
      const alert = {
        id: `zigns-test-${screenId}-${nowMs}`,
        active: true,
        test: true,
        event: 'Zigns CAP Test',
        severity,
        headline: `TEST ${severity} Alert - ${screenName || 'Screen'}`,
        description: 'This is a Zigns CAP overlay test.',
        instruction: 'This is only a test. No action is required.',
        areaDesc,
        effectiveAt: nowIso,
        expiresAt,
        sentAt: nowIso,
        targetScreenIds: [screenId],
        source: 'Zigns Test',
        createdBy: decoded.email || uid,
      };

      const capRef = db.doc(`capAlerts/${orgId}`);
      const result = await db.runTransaction(async tx => {
        const capSnap = await tx.get(capRef);
        const existingAlerts = capSnap.exists && Array.isArray(capSnap.data().alerts)
          ? capSnap.data().alerts
          : [];
        const keptAlerts = existingAlerts.filter(existing =>
          !(existing && existing.test === true && Array.isArray(existing.targetScreenIds) && existing.targetScreenIds.includes(screenId))
        );
        const alerts = [...keptAlerts, alert];
        tx.set(capRef, {
          active: alerts.length > 0,
          alerts,
          updatedAt: nowIso,
          testUpdatedAt: nowIso,
        }, { merge: true });
        return { replaced: existingAlerts.length - keptAlerts.length, alertsCount: alerts.length };
      });

      return res.json({ ok: true, screenId, alert, expiresAt, ...result });
    }

    if (req.body.action === 'clearCapTestAlert') {
      const screenId = sanitizeDocId(req.body.screenId, 'screenId');
      const { orgId, role } = await loadUserContext(db, uid);
      requireRole(role, ['admin']);

      const screenSnap = await db.doc(`screens/${screenId}`).get();
      if (!screenSnap.exists) return res.status(404).json({ error: 'Screen not found' });
      const screenData = screenSnap.data() || {};
      if (screenData.orgId !== orgId) {
        return res.status(403).json({ error: 'Screen is not in your organization' });
      }

      const nowIso = new Date().toISOString();
      const capRef = db.doc(`capAlerts/${orgId}`);
      const result = await db.runTransaction(async tx => {
        const capSnap = await tx.get(capRef);
        const existingAlerts = capSnap.exists && Array.isArray(capSnap.data().alerts)
          ? capSnap.data().alerts
          : [];
        const alerts = existingAlerts.filter(existing =>
          !(existing && existing.test === true && Array.isArray(existing.targetScreenIds) && existing.targetScreenIds.includes(screenId))
        );
        tx.set(capRef, {
          active: alerts.length > 0,
          alerts,
          updatedAt: nowIso,
          testClearedAt: nowIso,
        }, { merge: true });
        return { removed: existingAlerts.length - alerts.length, alertsCount: alerts.length };
      });

      return res.json({ ok: true, screenId, ...result });
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

      const probeUnmarked = shouldProbeUnmarkedSubcollections(showData);
      const loadPublished =
        showData.slideStorageVersion >= SLIDE_STORAGE_VERSION ||
        showData.publishedStorage === 'subcollection' ||
        probeUnmarked;
      const loadDraft =
        (showData.draftStorage === 'subcollection' || probeUnmarked) &&
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

    if (req.body.action === 'saveSlideshowMetadata') {
      const { orgId, role } = await loadUserContext(db, uid);
      requireRole(role, ['admin', 'editor']);

      const showId = normalizeShowId(req.body.showId);
      const cleanPatch = sanitizeSlideshowMetadataPatch(req.body.patch || {}, role);
      const nonNameMetadataKeys = Object.keys(cleanPatch).filter(key => key !== 'name');
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
        const showData = showSnap.exists ? (showSnap.data() || {}) : null;
        if (showData && showData.orgId !== orgId) {
          const error = new Error('Slideshow is not in your organization');
          error.statusCode = 403;
          throw error;
        }

        const existingMeta = existingShows.find(show => show && show.id === showId) || {};
        const name = cleanPatch.name || existingMeta.name || showData?.name || 'Untitled Slideshow';
        const nextShow = { id: showId, ...existingMeta, ...cleanPatch, name };
        const nextShows = existingShows.some(show => show && show.id === showId)
          ? existingShows.map(show => show && show.id === showId ? { ...show, ...cleanPatch } : show)
          : [...existingShows, nextShow];

        const incomingTags = normalizeTags([
          ...(cleanPatch.tags || []),
          ...(cleanPatch.autoIncludeTags || []),
        ]);
        const existingTags = normalizeTags(orgData.tags || []);
        const nextTags = incomingTags.length
          ? Array.from(new Set([...existingTags, ...incomingTags])).sort()
          : existingTags;
        const orgPatch = { slideshows: nextShows };
        if (incomingTags.length) orgPatch.tags = nextTags;

        tx.set(orgRef, orgPatch, { merge: true });
        if (showSnap.exists || nonNameMetadataKeys.length) {
          const showPatch = { ...cleanPatch, orgId, updatedAt: now };
          if (!showSnap.exists) {
            Object.assign(showPatch, {
              name,
              createdAt: now,
              slideStorageVersion: SLIDE_STORAGE_VERSION,
              publishedStorage: 'subcollection',
              defaultDwell: 6,
              fitMode: 'contain',
              transition: 'crossfade',
              transitionSpeed: 'medium',
              status: 'published',
            });
          }
          tx.set(showRef, showPatch, { merge: true });
        }

        return {
          show: nextShows.find(show => show && show.id === showId) || nextShow,
          slideshows: nextShows,
          tags: nextTags,
        };
      });

      return res.json({ ok: true, ...result });
    }

    if (req.body.action === 'syncOrgTags') {
      const { orgId, role } = await loadUserContext(db, uid);
      requireRole(role, ['admin', 'editor']);

      const incomingTags = normalizeTags(req.body.tags || []);
      const orgRef = db.doc(`organizations/${orgId}`);
      const result = await db.runTransaction(async tx => {
        const orgSnap = await tx.get(orgRef);
        if (!orgSnap.exists) {
          const error = new Error('Organization not found');
          error.statusCode = 404;
          throw error;
        }
        const orgData = orgSnap.data() || {};
        const tags = Array.from(new Set([...normalizeTags(orgData.tags || []), ...incomingTags])).sort();
        tx.set(orgRef, { tags }, { merge: true });
        return { tags };
      });

      return res.json({ ok: true, ...result });
    }

    if (req.body.action === 'mutateOrgTag') {
      const { orgId, role } = await loadUserContext(db, uid);
      requireRole(role, ['admin', 'editor']);
      const result = await mutateOrgTagEverywhere(db, orgId, req.body.oldTag, req.body.newTag ?? null);
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
