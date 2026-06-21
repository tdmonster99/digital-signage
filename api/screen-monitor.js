// Screen status monitor — designed to be hit every ~5 min by an external cron
// (e.g. cron-job.org) or a Vercel Pro cron.
// Detects screens that have gone offline (lastSeen > 10 min ago) or come back online,
// then emails the org's members who have notifications enabled via Resend.
// Also enforces per-org screen limits on every run, suspending overflow screens
// so that plan downgrades and trial expirations take effect without an admin login.
//
// Required env vars: FIREBASE_SERVICE_ACCOUNT_JSON, RESEND_API_KEY, CRON_SECRET
// The caller must send `Authorization: Bearer <CRON_SECRET>`.

const { getFirestore } = require('./_lib/firebase-admin');

const OFFLINE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

function registeredAtMs(screen) {
  const ms = screen.registeredAt ? new Date(screen.registeredAt).getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
}

function compareScreensForLimit(a, b) {
  const byDate = registeredAtMs(a) - registeredAtMs(b);
  if (byDate !== 0) return byDate;
  return String(a.id || '').localeCompare(String(b.id || ''));
}

function screenTimeMs(value) {
  const ms = value ? new Date(value).getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
}

function cleanText(value, maxLen = 240) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLen);
}

function yesNo(value) {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return 'Unknown';
}

function diagnosticTimeline(screen) {
  const fromScreen = Array.isArray(screen.diagnosticTimeline) ? screen.diagnosticTimeline : [];
  const fromHeartbeat = Array.isArray(screen.lastHeartbeat?.diagnosticTimeline)
    ? screen.lastHeartbeat.diagnosticTimeline
    : [];
  return (fromScreen.length ? fromScreen : fromHeartbeat)
    .filter(event => event && typeof event === 'object')
    .slice(-12)
    .map(event => ({
      at: cleanText(event.at || event.eventAt, 40),
      eventType: cleanText(event.eventType || event.type || 'event', 60),
      source: cleanText(event.source, 80),
      reason: cleanText(event.reason, 120),
      message: cleanText(event.message, 240),
      browserOnline: event.browserOnline !== false,
      visibilityState: cleanText(event.visibilityState, 24),
      documentHidden: event.documentHidden === true,
      focused: event.focused === true ? true : (event.focused === false ? false : null),
      fullscreen: event.fullscreen === true,
      offlineCacheMode: event.offlineCacheMode === true,
      slideshowId: cleanText(event.slideshowId, 160),
      slideIndex: Number.isFinite(Number(event.slideIndex)) ? Number(event.slideIndex) : null,
      slideCount: Number.isFinite(Number(event.slideCount)) ? Number(event.slideCount) : null,
      lastLiveUpdateAt: cleanText(event.lastLiveUpdateAt, 40),
      uptimeSec: Number.isFinite(Number(event.uptimeSec)) ? Number(event.uptimeSec) : null,
    }));
}

function lastKnownState(screen) {
  const hb = screen.lastHeartbeat || {};
  return {
    playerVersion: cleanText(hb.playerVersion, 40),
    playerUrl: cleanText(`${hb.path || ''}${hb.search || ''}`, 240),
    screenSlot: cleanText(hb.screenSlot || 'default', 40),
    browserOnline: hb.browserOnline !== false,
    visibilityState: cleanText(hb.visibilityState || (hb.documentHidden ? 'hidden' : ''), 24),
    documentHidden: hb.documentHidden === true,
    focused: hb.focused === true ? true : (hb.focused === false ? false : null),
    fullscreen: hb.fullscreen === true,
    playbackMode: hb.offlineCacheMode === true ? 'Cached playback' : 'Live listener',
    offlineCacheMode: hb.offlineCacheMode === true,
    cachePresent: hb.cachePresent === true,
    localScreenIdMatches: hb.localScreenIdMatches === true,
    slideshowId: cleanText(hb.slideshowId || screen.slideshowId || '', 160),
    slideIndex: Number.isFinite(Number(hb.slideIndex)) ? Number(hb.slideIndex) : null,
    slideCount: Number.isFinite(Number(hb.slideCount)) ? Number(hb.slideCount) : null,
    lastLiveUpdateAt: cleanText(hb.lastLiveUpdateAt, 40),
    reconnectBackoffMs: Number.isFinite(Number(hb.reconnectBackoffMs)) ? Number(hb.reconnectBackoffMs) : null,
    uptimeSec: Number.isFinite(Number(hb.uptimeSec)) ? Number(hb.uptimeSec) : null,
    clockSkewMs: Number.isFinite(Number(hb.clockSkewMs)) ? Number(hb.clockSkewMs) : null,
    platformFamily: cleanText(hb.platform?.family, 40),
    shellType: cleanText(hb.platform?.shellType, 40),
    shellVersion: cleanText(hb.platform?.shellVersion, 40),
    viewport: {
      width: Number.isFinite(Number(hb.viewport?.width)) ? Number(hb.viewport.width) : null,
      height: Number.isFinite(Number(hb.viewport?.height)) ? Number(hb.viewport.height) : null,
      dpr: Number.isFinite(Number(hb.viewport?.dpr)) ? Number(hb.viewport.dpr) : null,
    },
  };
}

function classifyOfflineIncident(screen, timeline) {
  const hb = screen.lastHeartbeat || {};
  const heartbeatReason = String(hb.reason || '').toLowerCase();
  const latestEvent = timeline[timeline.length - 1] || null;
  const latestType = String(latestEvent?.eventType || '').toLowerCase();

  if (['visibility_hidden', 'pagehide'].includes(heartbeatReason) || ['visibility_hidden', 'pagehide'].includes(latestType)) {
    return {
      title: 'Tab hidden or closed',
      probableCause: 'browser_page_hidden_or_unloaded',
      summary: 'The player reported that the display page was hidden or unloaded near the time heartbeats stopped.',
      finalEventReceived: true,
    };
  }
  if (heartbeatReason === 'browser_offline' || hb.browserOnline === false || latestType === 'browser_offline') {
    return {
      title: 'Browser went offline',
      probableCause: 'browser_network_offline',
      summary: 'The browser reported a network offline event near the time heartbeats stopped.',
      finalEventReceived: true,
    };
  }
  if (hb.offlineCacheMode === true || latestEvent?.offlineCacheMode === true || latestType === 'cache_mode') {
    return {
      title: 'Cached playback only',
      probableCause: 'firestore_listener_cache_mode',
      summary: 'The player was showing cached content instead of receiving live Firestore updates near the time heartbeats stopped.',
      finalEventReceived: true,
    };
  }
  if (latestType === 'page_frozen') {
    return {
      title: 'Page frozen',
      probableCause: 'browser_page_frozen',
      summary: 'The browser reported the page was frozen before heartbeats stopped. ChromeOS may have suspended or discarded the page.',
      finalEventReceived: true,
    };
  }
  if (latestType === 'js_error') {
    return {
      title: 'Player JavaScript error',
      probableCause: 'player_javascript_error',
      summary: `The player reported a JavaScript error before heartbeats stopped${latestEvent.message ? `: ${latestEvent.message}` : '.'}`,
      finalEventReceived: true,
    };
  }
  if (latestType === 'asset_error') {
    return {
      title: 'Asset load error',
      probableCause: 'asset_load_error',
      summary: `The player reported an asset load error before heartbeats stopped${latestEvent.message ? `: ${latestEvent.message}` : '.'}`,
      finalEventReceived: true,
    };
  }
  return {
    title: 'Heartbeat stopped',
    probableCause: 'abrupt_session_or_network_interruption',
    summary: 'No final browser event was received. The device, Chrome session, network, or page may have stopped before the player could report a reason.',
    finalEventReceived: false,
  };
}

function buildOfflineIncident(screen, screenId, detectedAtIso) {
  const timeline = diagnosticTimeline(screen);
  const classification = classifyOfflineIncident(screen, timeline);
  return {
    screenId,
    createdAt: detectedAtIso,
    offlineDetectedAt: detectedAtIso,
    lastSeenAt: cleanText(screen.lastSeen, 40),
    lastHeartbeatAt: cleanText(screen.lastHeartbeat?.at || screen.lastHeartbeat?.serverTime || screen.lastSeen, 40),
    title: classification.title,
    summary: classification.summary,
    probableCause: classification.probableCause,
    finalEventReceived: classification.finalEventReceived,
    lastKnownState: lastKnownState(screen),
    timeline,
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return res.status(500).json({ error: 'CRON_SECRET not configured' });
  const headerOk = req.headers.authorization === `Bearer ${cronSecret}`;
  if (!headerOk) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'RESEND_API_KEY not configured' });

  const db  = getFirestore();
  const now = Date.now();

  try {
    const screensSnap = await db.collection('screens').get();

    // ── Collect all unique orgIds and fetch their docs in one parallel batch ──
    const orgIds = [...new Set(
      screensSnap.docs.map(d => d.data().orgId).filter(Boolean)
    )];
    const orgDocs = await Promise.all(
      orgIds.map(id => db.collection('organizations').doc(id).get())
    );
    const orgMap = {};
    for (const doc of orgDocs) {
      if (doc.exists) orgMap[doc.id] = doc.data();
    }

    // ── Offline / online detection ────────────────────────────────────────────
    const results = [];
    const notifyPromises = [];

    for (const screenDoc of screensSnap.docs) {
      const screen   = screenDoc.data();
      const screenId = screenDoc.id;
      if (!screen.orgId || !screen.lastSeen) continue;

      const lastSeenMs = new Date(screen.lastSeen).getTime();
      const nowOffline = (now - lastSeenMs) > OFFLINE_THRESHOLD_MS;
      const wasOffline = screen.onlineStatus === 'offline';

      if (nowOffline && !wasOffline) {
        const detectedAtIso = new Date().toISOString();
        const offlineIncident = buildOfflineIncident(screen, screenId, detectedAtIso);
        notifyPromises.push(
          notifyOrg(db, apiKey, screen.orgId, screenId, screen.name || screenId, 'offline', orgMap, offlineIncident)
            .then(notified => {
              results.push({ screenId, event: 'offline', notified });
              return screenDoc.ref.update({
                onlineStatus: 'offline',
                lastNotifiedAt: detectedAtIso,
                offlineIncident,
              });
            })
        );
      } else if (!nowOffline && wasOffline) {
        const recoveredAtIso = new Date().toISOString();
        notifyPromises.push(
          notifyOrg(db, apiKey, screen.orgId, screenId, screen.name || screenId, 'online', orgMap)
            .then(notified => {
              results.push({ screenId, event: 'online', notified });
              return screenDoc.ref.update({ onlineStatus: 'online', lastNotifiedAt: recoveredAtIso, lastRecoveredAt: recoveredAtIso });
            })
        );
      }
    }

    await Promise.all(notifyPromises);

    const limitResults = await enforceAllScreenLimits(screensSnap.docs, orgMap);

    return res.status(200).json({ ok: true, checked: screensSnap.size, results, limitEnforcement: limitResults });
  } catch (err) {
    console.error('[screen-monitor]', err.message);
    return res.status(500).json({ error: err.message });
  }
};

// Suspend screens that exceed the org's current screensAllowed limit.
// Oldest-first wins: screens are kept by registeredAt order; newest overflow gets suspended.
// Uses pre-fetched orgMap to avoid re-reading org docs.
async function enforceAllScreenLimits(allScreenDocs, orgMap) {
  const byOrg = {};
  for (const screenDoc of allScreenDocs) {
    const screen = screenDoc.data();
    if (!screen.orgId) continue;
    if (!byOrg[screen.orgId]) byOrg[screen.orgId] = [];
    byOrg[screen.orgId].push({ id: screenDoc.id, ref: screenDoc.ref, ...screen });
  }

  const results = [];

  const orgPromises = Object.entries(byOrg).map(async ([orgId, screens]) => {
    const orgData = orgMap[orgId];
    if (!orgData) return;

    const sub = orgData.subscription || {};
    const screensAllowed = Number(sub.screensAllowed) || 1;

    screens.sort(compareScreensForLimit);

    const writePromises = [];
    for (let i = 0; i < screens.length; i++) {
      const screen        = screens[i];
      const shouldSuspend = i >= screensAllowed;
      const isSuspended   = screen.suspended === true;
      if (shouldSuspend === isSuspended) continue;

      writePromises.push(
        setScreenSuspendedStateIfNeeded(screen.ref, orgId, shouldSuspend)
          .then(changed => {
            if (changed) results.push({ orgId, screenId: screen.id, suspended: shouldSuspend });
          })
          .catch(e => console.warn('[screen-monitor] enforceLimit write failed:', screen.id, e.message))
      );
    }
    await Promise.all(writePromises);
  });

  await Promise.all(orgPromises);
  return results;
}

async function setScreenSuspendedStateIfNeeded(screenRef, orgId, shouldSuspend) {
  const db = screenRef.firestore;

  return db.runTransaction(async tx => {
    const snap = await tx.get(screenRef);
    if (!snap.exists) return false;

    const data = snap.data() || {};
    if (data.orgId !== orgId) return false;
    if ((data.suspended === true) === shouldSuspend) return false;

    tx.update(screenRef, { suspended: shouldSuspend });
    return true;
  });
}

async function notifyOrg(db, apiKey, orgId, screenId, screenName, event, orgMap, offlineIncident = null) {
  try {
    const orgData = orgMap[orgId];
    if (!orgData) return 0;

    const members = orgData.members || [];

    // Fetch all member user docs in parallel
    const userDocs = await Promise.all(
      members
        .filter(m => m.uid && m.email)
        .map(m => db.collection('users').doc(m.uid).get())
    );

    let notified = 0;
    const emailPromises = [];

    for (let i = 0; i < members.length; i++) {
      const member = members[i];
      if (!member.uid || !member.email) continue;

      const userDoc = userDocs.find(d => d.id === member.uid);
      const prefs   = userDoc?.exists ? userDoc.data() : {};

      const shouldNotify = event === 'offline'
        ? prefs.notifOffline !== false
        : prefs.notifOnline === true;
      if (!shouldNotify) continue;

      const subject = event === 'offline'
        ? `Screen offline: ${screenName}`
        : `Screen back online: ${screenName}`;

      emailPromises.push(
        sendEmail(apiKey, member.email, subject, buildHtml(screenName, event, offlineIncident))
          .then(() => { notified++; })
          .catch(e => console.warn('[screen-monitor] email failed:', member.email, e.message))
      );
    }

    await Promise.all(emailPromises);
    return notified;
  } catch (e) {
    console.warn('[screen-monitor] notifyOrg error:', e.message);
    return 0;
  }
}

async function sendEmail(apiKey, to, subject, html) {
  const r = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ from: 'Zigns <notifications@zigns.io>', to: [to], subject, html }),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`Resend ${r.status}: ${body}`);
  }
}

function buildHtml(screenName, event, offlineIncident = null) {
  const isOffline = event === 'offline';
  const headline  = isOffline ? 'Screen Offline' : 'Screen Back Online';
  const msg       = isOffline
    ? `Your screen <strong>${esc(screenName)}</strong> hasn't checked in for over 10 minutes and may be offline.`
    : `Your screen <strong>${esc(screenName)}</strong> is back online and running normally.`;
  const accent = isOffline ? '#e05252' : '#16a34a';
  const notificationsUrl = 'https://app.zigns.io/admin.html?profile=notifications';
  const state = offlineIncident?.lastKnownState || {};
  const incidentHtml = isOffline && offlineIncident ? `
  <div style="margin:0 0 22px;padding:14px 16px;border:1px solid #e5e7eb;border-radius:10px;background:#f8fafc">
    <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#111">${esc(offlineIncident.title || 'Diagnostic snapshot')}</p>
    <p style="margin:0 0 12px;font-size:13px;color:#555;line-height:1.5">${esc(offlineIncident.summary || '')}</p>
    <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em">Last known state</p>
    <table cellpadding="0" cellspacing="0" width="100%" style="font-size:12px;color:#555">
      <tr><td style="padding:3px 0;color:#777">Last heartbeat</td><td align="right" style="padding:3px 0;color:#111;font-weight:600">${esc(offlineIncident.lastHeartbeatAt || offlineIncident.lastSeenAt || 'Unknown')}</td></tr>
      <tr><td style="padding:3px 0;color:#777">Browser online</td><td align="right" style="padding:3px 0;color:#111;font-weight:600">${esc(yesNo(state.browserOnline))}</td></tr>
      <tr><td style="padding:3px 0;color:#777">Visibility</td><td align="right" style="padding:3px 0;color:#111;font-weight:600">${esc(state.visibilityState || 'Unknown')}</td></tr>
      <tr><td style="padding:3px 0;color:#777">Playback</td><td align="right" style="padding:3px 0;color:#111;font-weight:600">${esc(state.playbackMode || 'Unknown')}</td></tr>
      <tr><td style="padding:3px 0;color:#777">Slide</td><td align="right" style="padding:3px 0;color:#111;font-weight:600">${esc(state.slideCount ? `${state.slideIndex || 0} of ${state.slideCount}` : 'Unknown')}</td></tr>
    </table>
  </div>` : '';

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f5f5;font-family:'Segoe UI',Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
<tr><td style="background:#111;padding:28px 40px">
  <span style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.3px">Zigns</span>
</td></tr>
<tr><td style="padding:36px 40px;border-left:4px solid ${accent}">
  <p style="margin:0 0 12px;font-size:20px;font-weight:700;color:#111">${headline}</p>
  <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.6">${msg}</p>
  ${incidentHtml}
  <p style="margin:0 0 18px;font-size:13px;color:#888">Manage your screens at
    <a href="https://app.zigns.io" style="color:#0043ce;text-decoration:none">app.zigns.io</a>
  </p>
  <p style="margin:0">
    <a href="${notificationsUrl}" style="display:inline-block;background:#0043ce;color:#fff;text-decoration:none;font-size:13px;font-weight:700;padding:10px 14px;border-radius:8px">Manage notification settings</a>
  </p>
</td></tr>
<tr><td style="padding:20px 40px;border-top:1px solid #eee">
  <p style="margin:0;font-size:12px;color:#aaa">You received this because you have screen status notifications enabled in your Zigns account settings. <a href="${notificationsUrl}" style="color:#777;text-decoration:underline">Turn these emails off</a>.</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
