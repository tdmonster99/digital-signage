# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Deployment

```bash
vercel --prod          # deploy to app.zigns.io
git push               # does NOT auto-deploy — must run vercel --prod manually
```

There is no build step. All files are served statically by Vercel except the `api/` directory.

## Architecture

This is a **no-framework, no-bundler** web app. Everything runs directly in the browser via ES module `<script type="module">` tags inside HTML files.

### HTML files (frontend)
- **`admin.html`** — The entire admin UI (~15,000 lines). All CSS, HTML, and JS live in one file. Firebase SDK is imported via CDN ESM. No component framework.
- **`display.html`** — Runs on the TV/screen. Connects to Firestore via `onSnapshot`, plays slides as a slideshow. Uses Fabric.js for designed slides.
- **`login.html`** — Auth page (email/password + Google OAuth).

### `api/` directory (backend — Vercel serverless functions)
Each file exports a single `module.exports = async function handler(req, res)`. Node.js + CommonJS only.

| File | Purpose |
|------|---------|
| `upload-url.js` | Generates presigned S3 PUT URLs for direct browser→S3 uploads |
| `import-slides.js` | Imports Google Slides as PNGs, uploads to S3 |
| `ai-generate.js` | Proxies Anthropic API for AI slide generation |
| `send-invite.js` | Sends invitation emails via Resend |
| `stripe-checkout.js` | Creates Stripe checkout sessions |
| `stripe-portal.js` | Creates Stripe billing portal sessions |
| `stripe-webhook.js` | Handles Stripe webhooks, updates Firestore subscription state |

### Firebase / Firestore
Firebase project: `digital-signage-2`. Collections:

| Collection | Contains |
|-----------|---------|
| `slideshows/{id}` | Slides array, draft state, settings. `draftSlides` = unsaved, `slides` = published |
| `slideshows/{id}/slideVersions/{slideId}/versions` | Version history per slide |
| `organizations/{id}` | Org settings, member list, slideshow list, plan |
| `organizations/{id}/media` | Media library entries |
| `organizations/{id}/analytics` | Analytics events |
| `screens/{id}` | Screen records with `slideshowId`, `orgId`, `lastSeen` |
| `pairingCodes/{code}` | 6-char codes written by display.html, consumed by admin pairing flow |
| `users/{uid}` | User profile + org membership |
| `brandKits/{orgId}` | Brand kit (colors, fonts, logo URL) |
| `invitations/{id}` | Pending invites |

### Media storage
Files upload directly from the browser to **S3** (bucket: `zigns-media`, region: `us-east-2`) via presigned PUT URLs from `/api/upload-url`. Served via **CloudFront**.

### Key global state in `admin.html`
- `slides[]` — current slideshow's slides (in-memory working copy)
- `currentShowId` — active slideshow ID (default: `"main"`)
- `currentOrgId` / `currentOrg` — org document
- `currentUser` — Firebase Auth user
- `_cachedScreens[]` / `screensUnsub` — screens listener state
- `_screensReady` — true once the screens `onSnapshot` has fired at least once

### Screen pairing flow
1. `display.html` writes a 6-char code to `pairingCodes/{code}` with `status: pending`
2. Admin enters the code → `admin.html` creates a `screens/{id}` doc and updates `pairingCodes/{code}` to `status: paired`
3. `display.html` polls every 3s, sees `status: paired`, reads its `screenId`, and begins playback
4. `?slot=2` URL param on display.html gives a second independent screen identity on the same machine

### Slideshow draft/publish model
- Editing auto-saves to `draftSlides` / `draftDwell` / `draftFitMode` / `draftTransition` on the Firestore doc
- **Publish** copies draft fields to `slides` / `defaultDwell` etc. and pushes to assigned screens via their `slideshowId`
- `display.html` reads published `slides`, not draft

### Multi-org / plan limits
Plan limits are defined both in `admin.html` (client-side, for UI gating) and in `api/stripe-webhook.js` (server-side, written to Firestore on subscription events). The Firestore org doc is the source of truth at runtime.

## Environment variables (Vercel)
Set in Vercel Dashboard → digital-signage project → Settings → Environment Variables:
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `STRIPE_SECRET_KEY`, `STRIPE_SECRET_KEY_TEST`, `STRIPE_WEBHOOK_SECRET`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET`, `CLOUDFRONT_BASE_URL`
- `RESEND_API_KEY`
- `ANTHROPIC_API_KEY`
