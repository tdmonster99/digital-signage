// Screen status monitor — designed to be hit every ~5 min by an external cron
// (e.g. cron-job.org) since Vercel Hobby plan only allows daily crons.
// Detects screens that have gone offline (lastSeen > 10 min ago) or come back online,
// then emails the org's members who have notifications enabled via Resend.
//
// Required env vars: FIREBASE_SERVICE_ACCOUNT_JSON, RESEND_API_KEY, CRON_SECRET
// The caller must send `Authorization: Bearer <CRON_SECRET>`.

let _admin;
function getFirestore() {
  if (!_admin) {
    _admin = require('firebase-admin');
    if (!_admin.apps.length) {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      _admin.initializeApp({ credential: _admin.credential.cert(sa) });
    }
  }
  return _admin.firestore();
}

const OFFLINE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return res.status(500).json({ error: 'CRON_SECRET not configured' });
  if (req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'RESEND_API_KEY not configured' });

  const db  = getFirestore();
  const now = Date.now();

  try {
    const screensSnap = await db.collection('screens').get();
    const results     = [];

    for (const screenDoc of screensSnap.docs) {
      const screen   = screenDoc.data();
      const screenId = screenDoc.id;

      if (!screen.orgId || !screen.lastSeen) continue;

      const lastSeenMs  = new Date(screen.lastSeen).getTime();
      const nowOffline  = (now - lastSeenMs) > OFFLINE_THRESHOLD_MS;
      const wasOffline  = screen.onlineStatus === 'offline';

      if (nowOffline && !wasOffline) {
        // Transition → offline
        const notified = await notifyOrg(db, apiKey, screen.orgId, screenId, screen.name || screenId, 'offline');
        await screenDoc.ref.update({ onlineStatus: 'offline', lastNotifiedAt: new Date().toISOString() });
        results.push({ screenId, event: 'offline', notified });

      } else if (!nowOffline && wasOffline) {
        // Transition → online
        const notified = await notifyOrg(db, apiKey, screen.orgId, screenId, screen.name || screenId, 'online');
        await screenDoc.ref.update({ onlineStatus: 'online', lastNotifiedAt: new Date().toISOString() });
        results.push({ screenId, event: 'online', notified });
      }
    }

    return res.status(200).json({ ok: true, checked: screensSnap.size, results });
  } catch (err) {
    console.error('[screen-monitor]', err.message);
    return res.status(500).json({ error: err.message });
  }
};

async function notifyOrg(db, apiKey, orgId, screenId, screenName, event) {
  try {
    const orgDoc = await db.collection('organizations').doc(orgId).get();
    if (!orgDoc.exists) return 0;

    const members = orgDoc.data().members || [];
    let notified  = 0;

    for (const member of members) {
      if (!member.uid || !member.email) continue;

      const userDoc = await db.collection('users').doc(member.uid).get();
      const prefs   = userDoc.exists ? userDoc.data() : {};

      // notifOffline defaults true; notifOnline defaults false
      const shouldNotify = event === 'offline'
        ? prefs.notifOffline !== false
        : prefs.notifOnline === true;
      if (!shouldNotify) continue;

      const subject = event === 'offline'
        ? `Screen offline: ${screenName}`
        : `Screen back online: ${screenName}`;

      await sendEmail(apiKey, member.email, subject, buildHtml(screenName, event));
      notified++;
    }
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

function buildHtml(screenName, event) {
  const isOffline = event === 'offline';
  const headline  = isOffline ? 'Screen Offline' : 'Screen Back Online';
  const msg       = isOffline
    ? `Your screen <strong>${esc(screenName)}</strong> hasn't checked in for over 10 minutes and may be offline.`
    : `Your screen <strong>${esc(screenName)}</strong> is back online and running normally.`;
  const accent = isOffline ? '#e05252' : '#16a34a';

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
  <p style="margin:0;font-size:13px;color:#888">Manage your screens at
    <a href="https://app.zigns.io" style="color:#0043ce;text-decoration:none">app.zigns.io</a>
  </p>
</td></tr>
<tr><td style="padding:20px 40px;border-top:1px solid #eee">
  <p style="margin:0;font-size:12px;color:#aaa">You received this because you have screen status notifications enabled in your Zigns account settings.</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
