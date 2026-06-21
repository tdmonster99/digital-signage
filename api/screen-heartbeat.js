// Server-stamped heartbeat for paired display screens.
// Verifies the browser-held screen secret, then records safe diagnostic state
// with server time so bad device clocks do not make screens appear stale.

const crypto = require('crypto');
const { getFirestore } = require('./_lib/firebase-admin');

const SECRET_RE = /^[A-Za-z0-9_-]{32,128}$/;
const SCREEN_ID_RE = /^[A-Za-z0-9_-]{1,160}$/;
const DIAGNOSTIC_EVENT_REASONS = new Set([
  'asset_error',
  'boot',
  'browser_offline',
  'browser_online',
  'cache_mode',
  'focus_lost',
  'focus_returned',
  'fullscreen_change',
  'heartbeat_auth_failed',
  'heartbeat_failed',
  'js_error',
  'live_mode',
  'pagehide',
  'page_frozen',
  'page_loaded',
  'page_resumed',
  'playlist_slide_skipped',
  'slideshow_error',
  'visibility_hidden',
  'visibility_visible',
  'watchdog_restart',
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
    if (heartbeat.diagnosticTimeline.length) {
      patch.diagnosticTimeline = heartbeat.diagnosticTimeline;
      patch.lastDiagnosticEvent = heartbeat.lastDiagnosticEvent || heartbeat.diagnosticTimeline[heartbeat.diagnosticTimeline.length - 1];
    }
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

    const timelineEvent = latestTimelineEventForReason(heartbeat);
    if (screen.orgId && timelineEvent) {
      await db.collection('organizations').doc(String(screen.orgId)).collection('analytics').add({
        type: 'player_timeline',
        screenId,
        timestamp: nowIso,
        eventAt: timelineEvent.at || '',
        eventType: timelineEvent.eventType || heartbeat.reason,
        source: timelineEvent.source || '',
        reason: timelineEvent.reason || heartbeat.reason,
        message: timelineEvent.message || '',
        code: timelineEvent.code || '',
        target: timelineEvent.target || '',
        url: timelineEvent.url || '',
        playerVersion: heartbeat.playerVersion || '',
        slideshowId: timelineEvent.slideshowId || heartbeat.slideshowId || null,
        uptimeSec: timelineEvent.uptimeSec || heartbeat.uptimeSec || null,
        browserOnline: timelineEvent.browserOnline,
        online: timelineEvent.browserOnline,
        offlineCacheMode: timelineEvent.offlineCacheMode,
        visibilityState: timelineEvent.visibilityState || '',
        documentHidden: timelineEvent.documentHidden,
        focused: timelineEvent.focused,
        fullscreen: timelineEvent.fullscreen,
        slideIndex: timelineEvent.slideIndex,
        slideCount: timelineEvent.slideCount,
        lastLiveUpdateAt: timelineEvent.lastLiveUpdateAt || '',
        reconnectBackoffMs: timelineEvent.reconnectBackoffMs,
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
  const diagnosticTimeline = sanitizeDiagnosticTimeline(input.diagnosticTimeline, nowMs);
  const lastDiagnosticEvent = sanitizeDiagnosticEvent(input.lastDiagnosticEvent, nowMs)
    || diagnosticTimeline[diagnosticTimeline.length - 1]
    || null;

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
    focused: input.focused === true ? true : (input.focused === false ? false : null),
    fullscreen: input.fullscreen === true,
    lastDiagnosticEvent,
    diagnosticTimeline,
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

function sanitizeDiagnosticTimeline(input, nowMs) {
  if (!Array.isArray(input)) return [];
  return input
    .map(item => sanitizeDiagnosticEvent(item, nowMs))
    .filter(Boolean)
    .slice(-20);
}

function sanitizeDiagnosticEvent(input, nowMs) {
  if (!input || typeof input !== 'object') return null;
  const at = cleanIso(input.at) || cleanIso(input.eventAt) || new Date(nowMs).toISOString();
  const eventType = cleanToken(input.eventType || input.type || 'event', 60) || 'event';
  const browserOnline = input.browserOnline === false || input.online === false ? false : true;
  return {
    at,
    eventType,
    source: cleanText(input.source, 80),
    reason: cleanText(input.reason, 120),
    message: cleanText(input.message, 300),
    code: cleanText(input.code, 80),
    target: cleanText(input.target, 80),
    url: cleanText(input.url, 240),
    browserOnline,
    visibilityState: cleanText(input.visibilityState, 24),
    documentHidden: input.documentHidden === true,
    focused: input.focused === true ? true : (input.focused === false ? false : null),
    fullscreen: input.fullscreen === true,
    offlineCacheMode: input.offlineCacheMode === true,
    slideshowId: cleanText(input.slideshowId, 160),
    slideIndex: clampInt(input.slideIndex, 0, 10000),
    slideCount: clampInt(input.slideCount, 0, 10000),
    lastLiveUpdateAt: cleanIso(input.lastLiveUpdateAt),
    reconnectBackoffMs: clampInt(input.reconnectBackoffMs, 0, 3600000),
    uptimeSec: clampInt(input.uptimeSec, 0, 31536000),
  };
}

function latestTimelineEventForReason(heartbeat) {
  const reason = cleanToken(heartbeat.reason, 60);
  if (!reason || reason === 'heartbeat') return null;
  const timeline = Array.isArray(heartbeat.diagnosticTimeline) ? heartbeat.diagnosticTimeline : [];
  const latest = timeline[timeline.length - 1] || null;
  if (!latest) return null;
  if (latest.eventType !== reason) return null;
  return latest;
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
