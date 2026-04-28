# Screen Monitor Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate sequential Firestore awaits in `screen-monitor.js` so the cron doesn't time out as the screen count grows, and de-duplicate org doc fetches so each org is read only once per run.

**Architecture:** Collect all unique orgIds from the screen collection in one pass, fetch all org docs in parallel with `Promise.all`, pass the pre-fetched org data into both `enforceAllScreenLimits` and `notifyOrg` so neither function re-reads what the handler already loaded. Parallelize user doc fetches within `notifyOrg` the same way.

**Tech Stack:** Firebase Admin SDK, Vercel serverless (CommonJS), Node.js `Promise.all`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `api/screen-monitor.js` | Parallel org + user fetches; de-duplicate org reads |

---

### Task 1: Parallelize org doc fetches and eliminate duplicate reads

**Files:**
- Modify: `api/screen-monitor.js`

**Current problem:**
- `enforceAllScreenLimits` fetches each unique org doc sequentially in a `for` loop (line 95).
- `notifyOrg` fetches the same org doc again for every offline/online transition (line 126).
- At 100 orgs with 5 status transitions, that's up to 600 sequential Firestore reads.

**Fix:** Collect all unique orgIds from the screen list, fetch them all at once with `Promise.all`, pass the map into both functions.

- [ ] **Step 1: Verify current behavior with a timing check**

```bash
curl -s -w "\nTime: %{time_total}s\n" \
  "https://app.zigns.io/api/screen-monitor?secret=$CRON_SECRET"
```
Note the response time. After the fix, re-run to confirm it's the same or faster (with few screens today, the difference is small — but the structure will be correct for scale).

- [ ] **Step 2: Replace `api/screen-monitor.js` with the optimized version below**

Replace the entire file:

```js
// Screen status monitor — designed to be hit every ~5 min by an external cron
// (e.g. cron-job.org) since Vercel Hobby plan only allows daily crons.
// Detects screens that have gone offline (lastSeen > 10 min ago) or come back online,
// then emails the org's members who have notifications enabled via Resend.
// Also enforces per-org screen limits on every run, suspending overflow screens
// so that plan downgrades and trial expirations take effect without an admin login.
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
  const headerOk = req.headers.authorization === `Bearer ${cronSecret}`;
  const queryOk  = (req.query && req.query.secret) === cronSecret;
  if (!headerOk && !queryOk) {
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
        notifyPromises.push(
          notifyOrg(db, apiKey, screen.orgId, screenId, screen.name || screenId, 'offline', orgMap)
            .then(notified => {
              results.push({ screenId, event: 'offline', notified });
              return screenDoc.ref.update({ onlineStatus: 'offline', lastNotifiedAt: new Date().toISOString() });
            })
        );
      } else if (!nowOffline && wasOffline) {
        notifyPromises.push(
          notifyOrg(db, apiKey, screen.orgId, screenId, screen.name || screenId, 'online', orgMap)
            .then(notified => {
              results.push({ screenId, event: 'online', notified });
              return screenDoc.ref.update({ onlineStatus: 'online', lastNotifiedAt: new Date().toISOString() });
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

    screens.sort((a, b) => {
      const aT = a.registeredAt ? new Date(a.registeredAt).getTime() : 0;
      const bT = b.registeredAt ? new Date(b.registeredAt).getTime() : 0;
      return aT - bT;
    });

    const writePromises = [];
    for (let i = 0; i < screens.length; i++) {
      const screen        = screens[i];
      const shouldSuspend = i >= screensAllowed;
      const isSuspended   = screen.suspended === true;
      if (shouldSuspend === isSuspended) continue;

      writePromises.push(
        screen.ref.update({ suspended: shouldSuspend })
          .then(() => results.push({ orgId, screenId: screen.id, suspended: shouldSuspend }))
          .catch(e => console.warn('[screen-monitor] enforceLimit write failed:', screen.id, e.message))
      );
    }
    await Promise.all(writePromises);
  });

  await Promise.all(orgPromises);
  return results;
}

async function notifyOrg(db, apiKey, orgId, screenId, screenName, event, orgMap) {
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
        sendEmail(apiKey, member.email, subject, buildHtml(screenName, event))
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

function buildHtml(screenName, event) {
  const isOffline = event === 'offline';
  const headline  = isOffline ? 'Screen Offline' : 'Screen Back Online';
  const msg       = isOffline
    ? `Your screen <strong>${esc(screenName)}</strong> hasn't checked in for over 10 minutes and may be offline.`
    : `Your screen <strong>${esc(screenName)}</strong> is back online and running normally.`;
  const accent = isOffline ? '#e05252' : '#16a34a';
  const notificationsUrl = 'https://app.zigns.io/admin.html?profile=notifications';

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
```

- [ ] **Step 3: Commit**

```bash
git -C app add api/screen-monitor.js
git -C app commit -m "perf: parallelize Firestore reads in screen-monitor, eliminate duplicate org fetches"
```

---

### Task 2: Deploy and verify

- [ ] **Step 1: Push to production**

```bash
git -C app push origin main
```

- [ ] **Step 2: Call the cron endpoint manually and confirm it still works**

```bash
curl -s "https://app.zigns.io/api/screen-monitor?secret=YOUR_CRON_SECRET" | python -m json.tool
```
Expected: `{ "ok": true, "checked": N, "results": [...], "limitEnforcement": [...] }`

If `CRON_SECRET` is not set in your shell, get it from Vercel Dashboard → digital-signage → Settings → Environment Variables.

- [ ] **Step 3: Prepend a DEVLOG.md entry**

Add to the top of `app/DEVLOG.md`:
```
## Session [N] — 2026-04-25
- screen-monitor.js: replaced sequential org/user doc fetches with Promise.all
- Org docs now fetched once per run and passed into both enforceAllScreenLimits and notifyOrg
- User docs within notifyOrg now fetched in parallel
- Status-change Firestore writes and emails also parallelized
```

---

## Notes

- The full-collection `screens` scan (line `db.collection('screens').get()`) is still there — this is the right fix for sequential fetches, but the scan itself is a separate concern. At ~500+ total screens across all customers, consider adding a Firestore index on `lastSeen` or partitioning by orgId. That optimization is deferred.
- The `orgMap` parameter added to `enforceAllScreenLimits` and `notifyOrg` is the key change — it removes the inner `db.collection('organizations').doc(orgId).get()` calls that caused N sequential reads.
