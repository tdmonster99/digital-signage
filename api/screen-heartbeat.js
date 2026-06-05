// Server-stamped heartbeat for paired display screens.
// Verifies the browser-held screen secret, then records safe diagnostic state
// with server time so bad device clocks do not make screens appear stale.

const crypto = require('crypto');
const { getFirestore } = require('./_lib/firebase-admin');

const SECRET_RE = /^[A-Za-z0-9_-]{32,128}$/;
const SCREEN_ID_RE = /^[A-Za-z0-9_-]{1,160}$/;
const DIAGNOSTIC_EVENT_REASONS = new Set([
  'boot',
  'browser_offline',
  'browser_online',
  'cache_mode',
  'heartbeat_auth_failed',
  'live_mode',
  'pagehide',
  'visibility_hidden',
  'visibility_visible',
]);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = parseBody(req.body);
  const screenId = typeof body.screenId === 'string' ? body.screenId.trim() : '';
  const secret = typeof body.secret === 'string' ? body.secret : '';
  if (!SCREEN_ID_RE.test(screenId)) return res.status(400).json({ error: 'valid screenId is required' });
  if (!SECRET_RE.test(secret)) return res.status(400).json({ error: 'valid screen secret is required' });

  try {
    const db = getFirestore();
    const screenRef = db.collection('screens').doc(screenId);
    const screenSnap = await screenRef.get();
    if (!screenSnap.exists) return res.status(404).json({ error: 'screen not found' });

    const screen = screenSnap.data() || {};
    const expectedHash = typeof screen.credentialHash === 'string'
      ? screen.credentialHash
      : '';
    if (!expectedHash) return res.status(409).json({ error: 'screen must be re-paired' });
    if (!timingSafeEqualHex(hashSecret(secret), expectedHash)) {
      return res.status(401).json({ error: 'invalid screen credential' });
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const heartbeat = sanitizeHeartbeat(body.diagnostics || {}, body.reason, nowMs);
    const patch = {
      lastSeen: nowIso,
      lastHeartbeat: {
        ...heartbeat,
        at: nowIso,
        serverTime: nowIso,
      },
    };
    await screenRef.set(patch, { merge: true });

    if (screen.orgId && DIAGNOSTIC_EVENT_REASONS.has(heartbeat.reason)) {
      await db.collection('organizations').doc(String(screen.orgId)).collection('analytics').add({
        type: 'player_heartbeat',
        screenId,
        timestamp: nowIso,
        reason: heartbeat.reason,
        source: heartbeat.reason,
        playerVersion: heartbeat.playerVersion || '',
        slideshowId: heartbeat.slideshowId || null,
        uptimeSec: heartbeat.uptimeSec || null,
        online: heartbeat.browserOnline,
        offlineCacheMode: heartbeat.offlineCacheMode,
        visibilityState: heartbeat.visibilityState || '',
        clockSkewMs: heartbeat.clockSkewMs,
        screenSlot: heartbeat.screenSlot || null,
        path: heartbeat.path || '',
        search: heartbeat.search || '',
        navigationType: heartbeat.navigationType || '',
      });
    }

    return res.status(200).json({ ok: true, serverTime: nowIso, clockSkewMs: heartbeat.clockSkewMs });
  } catch (err) {
    console.error('[screen-heartbeat]', err.message);
    return res.status(500).json({ error: err.message });
  }
};

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try { return JSON.parse(body); } catch (_) { return {}; }
  }
  return body;
}

function sanitizeHeartbeat(input, reason, nowMs) {
  const clientTime = cleanIso(input.clientTime);
  const clientMs = clientTime ? new Date(clientTime).getTime() : NaN;
  const clockSkewMs = Number.isFinite(clientMs) ? clampInt(clientMs - nowMs, -31536000000, 31536000000) : null;
  const platform = input.platform && typeof input.platform === 'object' ? input.platform : {};
  const viewport = input.viewport && typeof input.viewport === 'object' ? input.viewport : {};
  const screen = input.screen && typeof input.screen === 'object' ? input.screen : {};

  return {
    reason: cleanToken(reason || input.reason || 'heartbeat', 60) || 'heartbeat',
    clientTime,
    clockSkewMs,
    playerVersion: cleanText(input.playerVersion, 40),
    screenSlot: cleanText(input.screenSlot, 40),
    path: cleanText(input.path, 120),
    search: cleanText(input.search, 240),
    screenParam: cleanText(input.screenParam, 160),
    previewSlideshow: cleanText(input.previewSlideshow, 160),
    queryKeys: Array.isArray(input.queryKeys)
      ? input.queryKeys.map(key => cleanText(key, 40)).filter(Boolean).slice(0, 12)
      : [],
    hasLocalSecret: input.hasLocalSecret === true,
    localScreenIdMatches: input.localScreenIdMatches === true,
    browserOnline: input.browserOnline !== false,
    visibilityState: cleanText(input.visibilityState, 24),
    documentHidden: input.documentHidden === true,
    offlineCacheMode: input.offlineCacheMode === true,
    cachePresent: input.cachePresent === true,
    slideshowId: cleanText(input.slideshowId, 160),
    slideIndex: clampInt(input.slideIndex, 0, 10000),
    slideCount: clampInt(input.slideCount, 0, 10000),
    lastLiveUpdateAt: cleanIso(input.lastLiveUpdateAt),
    reconnectBackoffMs: clampInt(input.reconnectBackoffMs, 0, 3600000),
    uptimeSec: clampInt(input.uptimeSec, 0, 31536000),
    navigationType: cleanText(input.navigationType, 40),
    platform: {
      family: cleanText(platform.family, 40),
      shellType: cleanText(platform.shellType, 40),
      shellVersion: cleanText(platform.shellVersion, 40),
    },
    viewport: {
      width: clampInt(viewport.width, 0, 10000),
      height: clampInt(viewport.height, 0, 10000),
      dpr: clampNumber(viewport.dpr, 0, 10),
    },
    screen: {
      width: clampInt(screen.width, 0, 20000),
      height: clampInt(screen.height, 0, 20000),
      availWidth: clampInt(screen.availWidth, 0, 20000),
      availHeight: clampInt(screen.availHeight, 0, 20000),
    },
  };
}

function cleanText(value, maxLen) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLen);
}

function cleanToken(value, maxLen) {
  return cleanText(value, maxLen).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

function cleanIso(value) {
  const text = typeof value === 'string' ? value : '';
  if (!text) return '';
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function clampInt(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function clampNumber(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.max(min, Math.min(max, Number(num.toFixed(2))));
}

function hashSecret(secret) {
  return crypto.createHash('sha256').update(secret, 'utf8').digest('hex');
}

function timingSafeEqualHex(a, b) {
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
