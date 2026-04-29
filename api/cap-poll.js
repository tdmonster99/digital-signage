// Vercel Cron target for NWS CAP alert polling.
// Polls screens with CAP enabled, mirrors active alerts to capAlerts/{orgId},
// and uses a short Firestore lease so duplicate cron invocations do not overlap.
//
// Required env vars: FIREBASE_SERVICE_ACCOUNT_JSON, CRON_SECRET
// The caller must send `Authorization: Bearer <CRON_SECRET>`.

const { getFirestore } = require('./_lib/firebase-admin');

const CAP_SEVERITY_RANK = { Minor: 1, Moderate: 2, Severe: 3, Extreme: 4 };
const LOCK_COLLECTION = 'cronLocks';
const LOCK_ID = 'cap-poll';
const LOCK_TTL_MS = 90 * 1000;
const NWS_TIMEOUT_MS = 12 * 1000;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return res.status(500).json({ error: 'CRON_SECRET not configured' });
  const headerOk = req.headers.authorization === `Bearer ${cronSecret}`;
  if (!headerOk) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let db;
  let lock;
  try {
    db = getFirestore();
    lock = await acquireLock(db);
    if (!lock.acquired) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: 'cap-poll already running',
        lockExpiresAt: lock.lockExpiresAt || null,
      });
    }

    const summary = await pollCapAlerts(db);
    await releaseLock(db, lock.lockId, { ok: true, summary });
    return res.status(200).json({ ok: true, ...summary });
  } catch (err) {
    console.error('[cap-poll]', err.message);
    if (db && lock && lock.acquired) {
      try {
        await releaseLock(db, lock.lockId, { ok: false, error: err.message });
      } catch (releaseErr) {
        console.warn('[cap-poll] lock release failed:', releaseErr.message);
      }
    }
    return res.status(500).json({ error: err.message });
  }
};

async function pollCapAlerts(db) {
  const screensSnap = await db.collection('screens').where('cap.enabled', '==', true).get();
  const capEnabledScreens = screensSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }));
  const enabledScreens = capEnabledScreens.filter(s => {
    const state = String(s.cap?.state || '').trim().toUpperCase();
    return s.orgId && /^[A-Z]{2}$/.test(state);
  });

  if (!enabledScreens.length) {
    return {
      checkedScreens: 0,
      ignoredScreens: capEnabledScreens.length,
      statesChecked: 0,
      statesFailed: 0,
      orgsUpdated: 0,
      orgsCleared: 0,
      alertsWritten: 0,
      orgsSkippedAllStatesFailed: 0,
    };
  }

  const byState = {};
  for (const screen of enabledScreens) {
    const state = String(screen.cap.state || '').trim().toUpperCase();
    if (!byState[state]) byState[state] = [];
    byState[state].push(screen);
  }

  const stateResults = await Promise.all(
    Object.entries(byState).map(async ([state, screens]) => {
      try {
        const features = await fetchNwsAlerts(state);
        return { state, screens, features, error: null };
      } catch (e) {
        console.warn('[cap-poll] CAP fetch failed:', state, e.message);
        return { state, screens, features: [], error: e.message };
      }
    })
  );

  const alertsByOrg = {};
  const orgsWithAnySuccess = new Set();
  const failedScreenIdsByOrg = {};

  for (const result of stateResults) {
    if (result.error) {
      for (const screen of result.screens) {
        if (!failedScreenIdsByOrg[screen.orgId]) failedScreenIdsByOrg[screen.orgId] = new Set();
        failedScreenIdsByOrg[screen.orgId].add(screen.id);
      }
      continue;
    }

    for (const screen of result.screens) {
      orgsWithAnySuccess.add(screen.orgId);
      const matches = result.features
        .map(f => normalizeNwsAlert(f, screen))
        .filter(Boolean);
      if (!matches.length) continue;
      if (!alertsByOrg[screen.orgId]) alertsByOrg[screen.orgId] = [];
      alertsByOrg[screen.orgId].push(...matches);
    }
  }

  const nowIso = new Date().toISOString();
  const writeResults = await Promise.all(
    [...orgsWithAnySuccess].map(async orgId => {
      let alerts = alertsByOrg[orgId] || [];
      const failedScreenIds = failedScreenIdsByOrg[orgId];
      if (failedScreenIds && failedScreenIds.size) {
        const existing = await db.collection('capAlerts').doc(orgId).get();
        const existingAlerts = existing.exists && Array.isArray(existing.data().alerts)
          ? existing.data().alerts
          : [];
        alerts = alerts.concat(existingAlerts.filter(alert =>
          !isExpiredAlert(alert) &&
          (alert.targetScreenIds || []).some(screenId => failedScreenIds.has(screenId))
        ));
      }

      const deduped = dedupeCapAlerts(alerts).slice(0, 10);
      await db.collection('capAlerts').doc(orgId).set({
        active: deduped.length > 0,
        alerts: deduped,
        updatedAt: nowIso,
      }, { merge: true });
      return { orgId, alertCount: deduped.length };
    })
  );

  const enabledOrgIds = new Set(enabledScreens.map(s => s.orgId));
  const failedOrgIds = new Set(Object.keys(failedScreenIdsByOrg));
  const orgsSkippedAllStatesFailed = [...enabledOrgIds].filter(orgId =>
    failedOrgIds.has(orgId) && !orgsWithAnySuccess.has(orgId)
  ).length;

  return {
    checkedScreens: enabledScreens.length,
    ignoredScreens: capEnabledScreens.length - enabledScreens.length,
    statesChecked: stateResults.length,
    statesFailed: stateResults.filter(r => r.error).length,
    orgsUpdated: writeResults.filter(r => r.alertCount > 0).length,
    orgsCleared: writeResults.filter(r => r.alertCount === 0).length,
    alertsWritten: writeResults.reduce((sum, r) => sum + r.alertCount, 0),
    orgsSkippedAllStatesFailed,
  };
}

async function fetchNwsAlerts(state) {
  const r = await fetch(`https://api.weather.gov/alerts/active?area=${encodeURIComponent(state)}`, {
    headers: {
      'User-Agent': 'Zigns CAP Poller (https://zigns.io, support@zigns.io)',
      'Accept': 'application/geo+json, application/json',
    },
    signal: AbortSignal.timeout(NWS_TIMEOUT_MS),
  });
  if (!r.ok) throw new Error(`NWS ${r.status}`);
  const data = await r.json();
  return Array.isArray(data.features) ? data.features : [];
}

function normalizeNwsAlert(feature, screen) {
  const p = feature && feature.properties;
  if (!p) return null;
  const severity = p.severity || 'Unknown';
  const floor = screen.cap?.severityFloor || 'Severe';
  if ((CAP_SEVERITY_RANK[severity] || 0) < (CAP_SEVERITY_RANK[floor] || 3)) return null;
  if (!matchesCountyFips(p, screen.cap?.countyFips || [])) return null;
  if (p.expires && new Date(p.expires).getTime() <= Date.now()) return null;

  return {
    id: p.id || feature.id || '',
    active: true,
    event: p.event || 'Emergency Alert',
    severity,
    headline: p.headline || p.event || 'Emergency Alert',
    description: p.description || '',
    instruction: p.instruction || '',
    areaDesc: p.areaDesc || '',
    effectiveAt: p.effective || null,
    expiresAt: p.expires || null,
    sentAt: p.sent || null,
    targetScreenIds: [screen.id],
    source: 'NWS',
  };
}

function matchesCountyFips(properties, configuredFips) {
  const fips = (configuredFips || []).map(v => String(v).replace(/\D/g, '')).filter(Boolean);
  if (!fips.length) return true;
  const same = properties.geocode && Array.isArray(properties.geocode.SAME) ? properties.geocode.SAME : [];
  return same.some(code => {
    const clean = String(code).replace(/\D/g, '');
    return fips.some(f => clean.endsWith(f.padStart(3, '0')) || clean.endsWith(f.padStart(5, '0')));
  });
}

function dedupeCapAlerts(alerts) {
  const seen = new Map();
  for (const alert of alerts) {
    const key = alert.id || `${alert.event}:${alert.areaDesc}:${alert.expiresAt}`;
    if (!seen.has(key)) {
      seen.set(key, { ...alert, targetScreenIds: [...new Set(alert.targetScreenIds || [])] });
    } else {
      const existing = seen.get(key);
      existing.targetScreenIds = Array.from(new Set([...(existing.targetScreenIds || []), ...(alert.targetScreenIds || [])]));
    }
  }
  return [...seen.values()].sort((a, b) =>
    (CAP_SEVERITY_RANK[b.severity] || 0) - (CAP_SEVERITY_RANK[a.severity] || 0)
  );
}

function isExpiredAlert(alert) {
  if (!alert || !alert.expiresAt) return false;
  const ms = new Date(alert.expiresAt).getTime();
  return Number.isFinite(ms) && ms <= Date.now();
}

async function acquireLock(db) {
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

function dateValueToMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}
