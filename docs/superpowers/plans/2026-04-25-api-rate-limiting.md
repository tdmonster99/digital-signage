# API Rate Limiting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Protect `api/ai-generate.js` from unauthenticated abuse and cost overrun by requiring a valid Firebase ID token and enforcing a daily per-user generation limit.

**Architecture:** Add a shared Firebase Admin helper module (`api/_lib/firebase-admin.js`) to DRY up initialization across API files. In `ai-generate.js`, verify the caller's Firebase ID token and check/increment a daily counter stored in Firestore under `rateLimits/{uid}`. Update `admin.html` to attach the token to the request header.

**Tech Stack:** Firebase Admin SDK (already in package.json), Firestore, Vercel serverless (CommonJS)

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `api/_lib/firebase-admin.js` | Shared lazy Firebase Admin init (getFirestore, getAuth) |
| Modify | `api/ai-generate.js` | Token verification + rate limit check before proxying Anthropic |
| Modify | `admin.html` ~line 12736 | Add `Authorization` header with Firebase ID token to fetch call |

---

### Task 1: Create shared Firebase Admin helper

**Files:**
- Create: `api/_lib/firebase-admin.js`

- [ ] **Step 1: Create `api/_lib/` directory and write the module**

```js
// api/_lib/firebase-admin.js
let _admin;

function getAdmin() {
  if (!_admin) {
    _admin = require('firebase-admin');
    if (!_admin.apps.length) {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      _admin.initializeApp({ credential: _admin.credential.cert(sa) });
    }
  }
  return _admin;
}

module.exports = {
  getFirestore: () => getAdmin().firestore(),
  getAuth:      () => getAdmin().auth(),
};
```

- [ ] **Step 2: Verify existing screen-monitor.js still works (no changes needed — it initializes inline; leave it alone)**

  This module is additive. Existing files are not touched in this task.

- [ ] **Step 3: Commit**

```bash
git -C app add api/_lib/firebase-admin.js
git -C app commit -m "feat: add shared Firebase Admin helper for API functions"
```

---

### Task 2: Add token verification and rate limiting to `ai-generate.js`

**Files:**
- Modify: `api/ai-generate.js`

- [ ] **Step 1: Write a manual test to confirm the endpoint currently accepts unauthenticated requests**

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST https://app.zigns.io/api/ai-generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test"}'
```
Expected: `200` (no auth required today — this is the vulnerability we're fixing)

- [ ] **Step 2: Replace `api/ai-generate.js` with the version below**

Replace the entire file:

```js
// Vercel serverless function — proxies Anthropic API so the key never touches the browser.
// Requires a valid Firebase ID token in: Authorization: Bearer <token>
// Rate limit: DAILY_AI_LIMIT generations per user per calendar day (UTC).

const { getAuth, getFirestore } = require('./_lib/firebase-admin');

const DAILY_AI_LIMIT = 50;

const AI_SYSTEM_PROMPT = `You are a professional digital signage slide designer. When given a description, you create complete Fabric.js canvas JSON for a 1920x1080 slide.

Return ONLY a valid JSON object with this structure:
{ "version": "6.0.0", "objects": [...], "background": "#hexcolor" }

Rules:
- Canvas is 1920px wide, 1080px tall
- Use only these object types: textbox, rect, circle, line, triangle
- Every object needs: type, left, top, width, height, fill, opacity
- Textbox objects also need: text, fontSize, fontFamily, fontWeight, textAlign, fill
- Use Google Fonts: Montserrat, Oswald, Raleway, Playfair Display, Anton, Open Sans, Bebas Neue, Lato
- Create visually striking designs with strong typography hierarchy
- Use at least 3 layers of visual interest: background, decorative shapes, text
- Text sizes: headlines 60-120px, subheadings 32-56px, body 24-40px
- All text must be at least 200px from any edge
- Do not use images (no image objects) — use colored rectangles as placeholders
- Return ONLY the JSON, no explanation, no markdown, no code blocks

Example 1 — Corporate announcement on navy:
{"version":"6.0.0","background":"#1a2744","objects":[{"type":"rect","left":0,"top":0,"width":1920,"height":1080,"fill":"#1a2744","opacity":1},{"type":"rect","left":153,"top":88,"width":1614,"height":5,"fill":"#C9A84C","opacity":1},{"type":"textbox","left":200,"top":340,"width":1520,"height":160,"text":"ANNUAL COMPANY MEETING","fontSize":110,"fontFamily":"Montserrat","fontWeight":"bold","textAlign":"center","fill":"#ffffff","opacity":1},{"type":"rect","left":760,"top":520,"width":400,"height":5,"fill":"#C9A84C","opacity":1},{"type":"textbox","left":200,"top":548,"width":1520,"height":70,"text":"Thursday, March 28  ·  10:00 AM  ·  Main Conference Room","fontSize":46,"fontFamily":"Open Sans","fontWeight":"normal","textAlign":"center","fill":"#a8bcd4","opacity":1},{"type":"textbox","left":200,"top":930,"width":1520,"height":50,"text":"ACME CORPORATION","fontSize":34,"fontFamily":"Montserrat","fontWeight":"bold","textAlign":"center","fill":"rgba(201,168,76,0.75)","opacity":1},{"type":"rect","left":153,"top":990,"width":1614,"height":5,"fill":"#C9A84C","opacity":1}]}

Example 2 — Bold happy hour promo:
{"version":"6.0.0","background":"#1a0030","objects":[{"type":"rect","left":0,"top":0,"width":1920,"height":1080,"fill":"#e91e8c","opacity":0.22},{"type":"rect","left":115,"top":43,"width":1690,"height":4,"fill":"rgba(255,255,255,0.2)","opacity":1},{"type":"rect","left":115,"top":1033,"width":1690,"height":4,"fill":"rgba(255,255,255,0.2)","opacity":1},{"type":"textbox","left":200,"top":180,"width":1520,"height":260,"text":"HAPPY HOUR","fontSize":200,"fontFamily":"Bebas Neue","fontWeight":"bold","textAlign":"center","fill":"#ffffff","opacity":1},{"type":"textbox","left":200,"top":460,"width":1520,"height":90,"text":"EVERY FRIDAY  ·  5 PM — 8 PM","fontSize":68,"fontFamily":"Bebas Neue","fontWeight":"bold","textAlign":"center","fill":"rgba(255,255,255,0.82)","opacity":1},{"type":"rect","left":710,"top":600,"width":500,"height":80,"fill":"#FFD700","opacity":1},{"type":"textbox","left":710,"top":616,"width":500,"height":50,"text":"50% OFF ALL DRINKS","fontSize":40,"fontFamily":"Montserrat","fontWeight":"bold","textAlign":"center","fill":"#1a0030","opacity":1}]}

Example 3 — Clean minimal product launch:
{"version":"6.0.0","background":"#ffffff","objects":[{"type":"rect","left":0,"top":0,"width":1920,"height":8,"fill":"#111111","opacity":1},{"type":"rect","left":0,"top":1072,"width":1920,"height":8,"fill":"#111111","opacity":1},{"type":"textbox","left":200,"top":80,"width":1520,"height":60,"text":"N E W  A R R I V A L","fontSize":44,"fontFamily":"Raleway","fontWeight":"normal","textAlign":"center","fill":"rgba(0,0,0,0.42)","opacity":1},{"type":"rect","left":538,"top":172,"width":844,"height":578,"fill":"#f5f5f5","opacity":1},{"type":"textbox","left":538,"top":390,"width":844,"height":120,"text":"PRODUCT IMAGE","fontSize":48,"fontFamily":"Montserrat","fontWeight":"normal","textAlign":"center","fill":"rgba(0,0,0,0.18)","opacity":1},{"type":"textbox","left":200,"top":800,"width":1520,"height":100,"text":"Premium Wireless Headphones","fontSize":72,"fontFamily":"Raleway","fontWeight":"300","textAlign":"center","fill":"#111111","opacity":1},{"type":"textbox","left":200,"top":908,"width":1520,"height":55,"text":"$149.00  ·  Free shipping on orders over $50","fontSize":38,"fontFamily":"Open Sans","fontWeight":"normal","textAlign":"center","fill":"#666666","opacity":1}]}`;

async function verifyToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    const decoded = await getAuth().verifyIdToken(header.slice(7));
    return decoded.uid;
  } catch {
    return null;
  }
}

async function checkRateLimit(uid) {
  const db    = getFirestore();
  const today = new Date().toISOString().slice(0, 10);
  const ref   = db.collection('rateLimits').doc(uid);

  return db.runTransaction(async tx => {
    const doc  = await tx.get(ref);
    const data = doc.exists ? doc.data() : {};
    if (data.date === today && data.count >= DAILY_AI_LIMIT) return false;
    tx.set(ref, { date: today, count: data.date === today ? data.count + 1 : 1 });
    return true;
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server not configured — contact the site owner.' });

  const uid = await verifyToken(req);
  if (!uid) return res.status(401).json({ error: 'Authentication required.' });

  const allowed = await checkRateLimit(uid);
  if (!allowed) {
    return res.status(429).json({ error: `Daily AI generation limit (${DAILY_AI_LIMIT}) reached. Try again tomorrow.` });
  }

  const { prompt, style, colorScheme } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  const userMsg =
    `Create a digital signage slide for: "${prompt}"\n` +
    `Style: ${style || 'Professional'}\n` +
    `Color scheme: ${colorScheme || 'Brand Colors'}\n` +
    `Canvas: 1920×1080px\n` +
    `Return ONLY the Fabric.js JSON.`;

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-5',
        max_tokens: 4096,
        system:     AI_SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: userMsg }],
      }),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: data?.error?.message || `Upstream error ${upstream.status}`,
      });
    }
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
```

- [ ] **Step 3: Commit**

```bash
git -C app add api/ai-generate.js
git -C app commit -m "feat: require Firebase auth + enforce daily rate limit on ai-generate"
```

---

### Task 3: Pass Firebase ID token from `admin.html`

**Files:**
- Modify: `admin.html` ~line 12736 (inside `generateAiSlide()`)

The `auth` variable is already available in scope (`const auth = getAuth()`). `currentUser` is also in scope as `currentUser`.

- [ ] **Step 1: Find the fetch call**

The call is at approximately line 12736:
```js
const res = await fetch('/api/ai-generate', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    prompt:      aiLastPrompt,
    style:       aiLastStyle,
    colorScheme: aiLastColor,
  }),
});
```

- [ ] **Step 2: Replace with token-bearing version**

```js
const idToken = await currentUser.getIdToken();
const res = await fetch('/api/ai-generate', {
  method: 'POST',
  headers: {
    'content-type':  'application/json',
    'authorization': `Bearer ${idToken}`,
  },
  body: JSON.stringify({
    prompt:      aiLastPrompt,
    style:       aiLastStyle,
    colorScheme: aiLastColor,
  }),
});
```

- [ ] **Step 3: Update the error display to handle 429 gracefully**

The existing error handler at ~line 12746 already renders `errData.error` — the 429 message `"Daily AI generation limit (50) reached. Try again tomorrow."` will display automatically. No change needed.

- [ ] **Step 4: Commit**

```bash
git -C app add admin.html
git -C app commit -m "feat: send Firebase ID token with AI generation requests"
```

---

### Task 4: Deploy and verify

- [ ] **Step 1: Push to production**

```bash
git -C app push origin main
```

- [ ] **Step 2: Verify unauthenticated requests are now rejected**

Wait ~2 minutes for deploy, then:
```bash
curl -s -o /dev/null -w "%{http_code}" -X POST https://app.zigns.io/api/ai-generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test"}'
```
Expected: `401`

- [ ] **Step 3: Verify the AI slide generator still works in the app**

Open `https://app.zigns.io`, log in, open a slideshow, open the AI panel, generate a slide. It should work as before.

- [ ] **Step 4: Prepend a DEVLOG.md entry**

Add to the top of `app/DEVLOG.md`:
```
## Session [N] — 2026-04-25
- Added Firebase token auth + daily rate limiting (50/user/day) to `/api/ai-generate`
- Created `api/_lib/firebase-admin.js` shared init module
- `admin.html`: `generateAiSlide()` now attaches Firebase ID token to request
```

---

## Notes

- The `rateLimits/{uid}` Firestore collection is new. No index needed — it's a single-doc read by key.
- `DAILY_AI_LIMIT = 50` is defined at the top of `ai-generate.js`. Adjust freely.
- `getIdToken()` returns a cached token unless it's within 5 minutes of expiry; no extra latency in practice.
- The `Access-Control-Allow-Headers` line in the handler must include `Authorization` — added in Task 2.
