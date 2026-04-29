// Vercel Cron target for daily analytics rollups.
// Aggregates raw organizations/{orgId}/analytics events into
// organizations/{orgId}/analyticsDaily/{YYYY-MM-DD}.
//
// Required env vars: FIREBASE_SERVICE_ACCOUNT_JSON, CRON_SECRET
// The caller must send `Authorization: Bearer <CRON_SECRET>`.

const { getFirestore } = require('./_lib/firebase-admin');

const LOCK_COLLECTION = 'cronLocks';
const LOCK_ID = 'analytics-rollup';
const LOCK_TTL_MS = 10 * 60 * 1000;
const PAGE_SIZE = 1000;
const TOP_SLIDE_LIMIT = 100;
const SCREEN_BREAKDOWN_LIMIT = 500;
const ALERT_BREAKDOWN_LIMIT = 100;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return res.status(500).json({ error: 'CRON_SECRET not configured' });
  if (req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let db;
  let lock;
  try {
    db = getFirestore();
    const date = parseRollupDate(req.query?.date);
    lock = await acquireLock(db, date);
    if (!lock.acquired) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: 'analytics-rollup already running',
        date,
        lockExpiresAt: lock.lockExpiresAt || null,
      });
    }

    const summary = await rollupDate(db, date);
    await releaseLock(db, lock.lockId, { ok: true, summary });
    return res.status(200).json({ ok: true, date, ...summary });
  } catch (err) {
    console.error('[analytics-rollup]', err.message);
    if (db && lock && lock.acquired) {
      try {
        await releaseLock(db, lock.lockId, { ok: false, error: err.message });
      } catch (releaseErr) {
        console.warn('[analytics-rollup] lock release failed:', releaseErr.message);
      }
    }
    return res.status(500).json({ error: err.message });
  }
};

async function rollupDate(db, date) {
  const { startIso, endIso } = utcDayWindow(date);
  const orgSnap = await db.collection('organizations').get();

  let orgsProcessed = 0;
  let orgsWithEvents = 0;
  let eventsProcessed = 0;
  const failures = [];

  for (const orgDoc of orgSnap.docs) {
    orgsProcessed++;
    try {
      const result = await rollupOrg(db, orgDoc.id, date, startIso, endIso);
      eventsProcessed += result.eventCount;
      if (result.eventCount > 0) orgsWithEvents++;
    } catch (e) {
      failures.push({ orgId: orgDoc.id, error: e.message });
      console.warn('[analytics-rollup] org failed:', orgDoc.id, e.message);
    }
  }

  if (orgsProcessed > 0 && failures.length === orgsProcessed) {
    throw new Error(`all org rollups failed for ${date}`);
  }

  return {
    orgsProcessed,
    orgsWithEvents,
    eventsProcessed,
    failures,
  };
}

async function rollupOrg(db, orgId, date, startIso, endIso) {
  const aggregate = createAggregate(date, startIso, endIso);
  let lastDoc = null;

  while (true) {
    let q = db.collection('organizations').doc(orgId).collection('analytics')
      .where('timestamp', '>=', startIso)
      .where('timestamp', '<', endIso)
      .orderBy('timestamp')
      .limit(PAGE_SIZE);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      addEventToAggregate(aggregate, doc.data());
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }

  if (aggregate.eventCount > 0) {
    await db.collection('organizations').doc(orgId).collection('analyticsDaily').doc(date).set(
      buildRollupDoc(aggregate),
      { merge: true }
    );
  }

  return { eventCount: aggregate.eventCount };
}

function createAggregate(date, startIso, endIso) {
  return {
    date,
    startIso,
    endIso,
    eventCount: 0,
    totals: {
      slideViews: 0,
      playbackSeconds: 0,
      screenOnlineEvents: 0,
      screenOfflineEvents: 0,
      capAlertsRendered: 0,
      watchdogRestarts: 0,
      uniqueScreens: 0,
      uniqueSlides: 0,
    },
    screenIds: new Set(),
    slideKeys: new Set(),
    screenMap: new Map(),
    slideMap: new Map(),
    alertMap: new Map(),
    hourlySlideViews: new Array(24).fill(0),
    eventTypes: {},
  };
}

function addEventToAggregate(aggregate, event) {
  aggregate.eventCount++;
  const type = event.type || 'unknown';
  aggregate.eventTypes[type] = (aggregate.eventTypes[type] || 0) + 1;

  const screenId = event.screenId || 'unknown';
  if (screenId) aggregate.screenIds.add(screenId);
  const screen = getOrCreateScreen(aggregate, screenId);

  if (type === 'slide_view') {
    const duration = Math.max(0, Number(event.duration) || 0);
    aggregate.totals.slideViews++;
    aggregate.totals.playbackSeconds += duration;
    aggregate.hourlySlideViews[getUtcHour(event.timestamp)]++;
    screen.slideViews++;
    screen.playbackSeconds += duration;

    const slideKey = `${event.slideshowId || ''}|${event.slideId || event.slideName || 'unknown'}`;
    aggregate.slideKeys.add(slideKey);
    const slide = getOrCreateSlide(aggregate, slideKey, event);
    slide.views++;
    slide.playbackSeconds += duration;
  } else if (type === 'screen_online') {
    aggregate.totals.screenOnlineEvents++;
    screen.screenOnlineEvents++;
  } else if (type === 'screen_offline') {
    aggregate.totals.screenOfflineEvents++;
    screen.screenOfflineEvents++;
  } else if (type === 'cap_alert_rendered') {
    aggregate.totals.capAlertsRendered++;
    screen.capAlertsRendered++;
    const alertKey = event.alertId || `${event.event || 'Emergency Alert'}|${event.severity || 'Unknown'}`;
    const alert = getOrCreateAlert(aggregate, alertKey, event);
    alert.renders++;
    if (screenId) alert.screenIds.add(screenId);
  } else if (type === 'watchdog_restart') {
    aggregate.totals.watchdogRestarts++;
    screen.watchdogRestarts++;
  }
}

function buildRollupDoc(aggregate) {
  const screenBreakdown = [...aggregate.screenMap.values()]
    .sort((a, b) => b.slideViews - a.slideViews || b.playbackSeconds - a.playbackSeconds)
    .slice(0, SCREEN_BREAKDOWN_LIMIT);

  const slideBreakdown = [...aggregate.slideMap.values()]
    .sort((a, b) => b.views - a.views || b.playbackSeconds - a.playbackSeconds)
    .slice(0, TOP_SLIDE_LIMIT);

  const alertBreakdown = [...aggregate.alertMap.values()]
    .map(alert => ({ ...alert, screenIds: [...alert.screenIds].sort() }))
    .sort((a, b) => b.renders - a.renders)
    .slice(0, ALERT_BREAKDOWN_LIMIT);

  aggregate.totals.uniqueScreens = aggregate.screenIds.size;
  aggregate.totals.uniqueSlides = aggregate.slideKeys.size;

  return {
    rollupVersion: 1,
    date: aggregate.date,
    timezone: 'UTC',
    windowStart: aggregate.startIso,
    windowEnd: aggregate.endIso,
    updatedAt: new Date().toISOString(),
    eventCount: aggregate.eventCount,
    eventTypes: aggregate.eventTypes,
    totals: aggregate.totals,
    hourlySlideViews: aggregate.hourlySlideViews,
    screenBreakdown,
    slideBreakdown,
    alertBreakdown,
    truncated: {
      screens: aggregate.screenMap.size > SCREEN_BREAKDOWN_LIMIT,
      slides: aggregate.slideMap.size > TOP_SLIDE_LIMIT,
      alerts: aggregate.alertMap.size > ALERT_BREAKDOWN_LIMIT,
    },
  };
}

function getOrCreateScreen(aggregate, screenId) {
  if (!aggregate.screenMap.has(screenId)) {
    aggregate.screenMap.set(screenId, {
      screenId,
      slideViews: 0,
      playbackSeconds: 0,
      screenOnlineEvents: 0,
      screenOfflineEvents: 0,
      capAlertsRendered: 0,
      watchdogRestarts: 0,
    });
  }
  return aggregate.screenMap.get(screenId);
}

function getOrCreateSlide(aggregate, slideKey, event) {
  if (!aggregate.slideMap.has(slideKey)) {
    aggregate.slideMap.set(slideKey, {
      slideId: event.slideId || '',
      slideName: event.slideName || event.slideId || 'Unknown',
      slideshowId: event.slideshowId || '',
      views: 0,
      playbackSeconds: 0,
    });
  }
  return aggregate.slideMap.get(slideKey);
}

function getOrCreateAlert(aggregate, alertKey, event) {
  if (!aggregate.alertMap.has(alertKey)) {
    aggregate.alertMap.set(alertKey, {
      alertId: event.alertId || '',
      event: event.event || 'Emergency Alert',
      severity: event.severity || 'Unknown',
      renders: 0,
      screenIds: new Set(),
    });
  }
  return aggregate.alertMap.get(alertKey);
}

async function acquireLock(db, date) {
  const ref = db.collection(LOCK_COLLECTION).doc(LOCK_ID);
  const lockId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const lockExpiresAt = new Date(nowMs + LOCK_TTL_MS).toISOString();

  const acquired = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const expiresMs = dateValueToMillis(data.lockExpiresAt);
    if (data.lockId && expiresMs > nowMs) {
      return { acquired: false, lockExpiresAt: data.lockExpiresAt };
    }

    tx.set(ref, {
      lockId,
      lockExpiresAt,
      startedAt: nowIso,
      updatedAt: nowIso,
      date,
    }, { merge: true });
    return { acquired: true, lockExpiresAt };
  });

  return acquired.acquired
    ? { acquired: true, lockId, lockExpiresAt }
    : acquired;
}

async function releaseLock(db, lockId, result) {
  const ref = db.collection(LOCK_COLLECTION).doc(LOCK_ID);
  const nowIso = new Date().toISOString();
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    if (data.lockId !== lockId) return;

    tx.set(ref, {
      lockId: null,
      lockExpiresAt: null,
      updatedAt: nowIso,
      lastFinishedAt: nowIso,
      lastStatus: result.ok ? 'ok' : 'error',
      lastError: result.error || null,
      lastSummary: result.summary || null,
    }, { merge: true });
  });
}

function parseRollupDate(value) {
  if (value) {
    const date = String(value).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('date must be YYYY-MM-DD');
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      throw new Error('date must be a valid UTC date');
    }
    return date;
  }

  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function utcDayWindow(date) {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function getUtcHour(timestamp) {
  const ms = new Date(timestamp).getTime();
  if (!Number.isFinite(ms)) return 0;
  return new Date(ms).getUTCHours();
}

function dateValueToMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}
