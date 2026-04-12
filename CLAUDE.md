# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Deployment

```bash
git push origin main   # auto-deploys to production via Vercel GitHub integration
```

There is no build step. All files are served statically by Vercel except the `api/` directory.

## Architecture

This is a **no-framework, no-bundler** web app. Everything runs directly in the browser via ES module `<script type="module">` tags inside HTML files.

### HTML files (frontend)
- **`admin.html`** — The entire admin UI (~16,000 lines). All CSS, HTML, and JS live in one file. Firebase SDK is imported via CDN ESM. No component framework.
- **`display.html`** — Runs on the TV/screen. Connects to Firestore via `onSnapshot`, plays slides as a slideshow. Uses Fabric.js for designed slides.
- **`login.html`** — Auth page (email/password + Google OAuth).

### Page system in `admin.html`
Pages are `<div id="page-{name}" class="page">` elements toggled by:
```js
showPage('name')   // hides all pages, shows page-{name}, sets nav-item.active
```
Active pages get `display: flex` via `.page.active { display: flex; }`. Individual pages override flex direction and padding with `#page-{name}.active { ... }`.

**Current pages:**
| Page | Description |
|------|-------------|
| `dashboard` | Overview cards, quick actions |
| `slideshows` | Slideshow list + slide designer (Fabric.js canvas) |
| `apps` | App widgets (clock, weather, etc.) |
| `media` | Media library |
| `schedules` | Calendar-based scheduling |
| `screens` | Screen management + pairing |
| `brandkit` | Brand colors, fonts, logo |
| `analytics` | Screen uptime and slide play stats |
| `settings` | Account settings hub (see below) |
| `profile` | User profile settings (see below) |

### Settings page (`page-settings`)
Uses a **hub + sub-view** pattern (Yodeck-inspired):
- Default state: `#settingsHub` div visible — a categorized list of rows (icon, title, desc, status, arrow)
- Clicking a row: `showSettingsSub('subId')` hides hub, shows `#settingsSub-{subId}`
- Back button: `showSettingsHub()` restores hub

**Sub-views:**
| Sub ID | Content |
|--------|---------|
| `billing` | Plan badge, usage bars, plan comparison table, Stripe portal |
| `org` | Organization name input |
| `team` | Team member list, invite flow, pending invitations |
| `roles` | Role descriptions (Admin / Editor / Viewer) |
| `screentags` | Screen tag management (placeholder) |
| `bootscreen` | Boot screen logo upload (placeholder) |
| `ai` | AI content generation toggle |
| `fonts` | Custom font upload (placeholder) |
| `api` | API token generation (placeholder) |
| `privacy` | Data export, account deletion |

Hub status values (`shPlanStatus`, `shOrgNameStatus`, `shMembersStatus`) are updated by `updateSettingsHubStatus()` whenever settings is shown.

### Profile page (`page-profile`)
Tabbed layout with 5 tabs. Tab switching: `switchProfileTab('tabName', btnEl)`.

| Tab | Content |
|-----|---------|
| `basic` | First/last name, email (read-only), timezone, language, date/time format, first day of week, newsletter opt-in, account deletion link |
| `notifications` | Email toggles: screen offline, screen online, new login location |
| `password` | Old / new / verify password with eye-toggle; reauthenticates via `EmailAuthProvider` before `updatePassword` |
| `twofactor` | Toggle UI only — **not yet implemented** (deferred; see 2FA notes below) |
| `theme` | Visual light/dark selector; saves to `localStorage('signage-theme')` and `data-theme` on `<html>` |

Profile data is read/written to `users/{uid}` in Firestore via `loadProfileData()` / `saveProfileBasicInfo()` / `saveProfileNotifications()`. Display name synced to Firebase Auth via `updateProfile()`.

### 2FA — Deferred
The Two Factor tab is a placeholder toggle. To implement:
- **Recommended approach:** Custom TOTP via a Vercel API function (`/api/verify-totp`) using the `otpauth` npm package. Works on free Firebase Spark plan.
- Alternative: Firebase Identity Platform TOTP MFA (requires Blaze plan upgrade).
- Flow: generate secret → show QR code → user scans with authenticator app → verify 6-digit code → store encrypted secret + `twoFactorEnabled: true` in `users/{uid}`.

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
| `organizations/{id}` | Org settings, member list, slideshow list, subscription/plan |
| `organizations/{id}/media` | Media library entries |
| `organizations/{id}/analytics` | Analytics events |
| `screens/{id}` | Screen records with `slideshowId`, `orgId`, `lastSeen` |
| `pairingCodes/{code}` | 6-char codes written by display.html, consumed by admin pairing flow |
| `users/{uid}` | User profile + org membership (see schema below) |
| `brandKits/{orgId}` | Brand kit (colors, fonts, logo URL) |
| `invitations/{id}` | Pending invites |

**`users/{uid}` document schema:**
```js
{
  orgId:              string,
  role:               'admin' | 'editor' | 'viewer',
  email:              string,
  displayName:        string,
  onboardingComplete: boolean,
  // Profile page fields:
  firstName:    string,
  lastName:     string,
  timezone:     string,   // e.g. 'America/Chicago'
  dateFormat:   string,   // 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MMM D, YYYY'
  timeFormat:   '12' | '24',
  firstDay:     'monday' | 'sunday',
  newsletter:   boolean,
  notifOffline:  boolean,
  notifOnline:   boolean,
  notifNewLogin: boolean,
  // Future:
  // twoFactorEnabled: boolean,
  // twoFactorSecret:  string (encrypted),
}
```

### Firebase Auth imports
All auth utilities imported at top of the `<script type="module">`:
```js
import { getAuth, GoogleAuthProvider, OAuthProvider,
         signInWithPopup, signInWithRedirect, getRedirectResult,
         onAuthStateChanged, signOut, updateProfile,
         createUserWithEmailAndPassword, signInWithEmailAndPassword,
         sendPasswordResetEmail, EmailAuthProvider,
         reauthenticateWithCredential, updatePassword }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
```

### Media storage
Files upload directly from the browser to **S3** (bucket: `zigns-media`, region: `us-east-2`) via presigned PUT URLs from `/api/upload-url`. Served via **CloudFront**.

### Key global state in `admin.html`
- `slides[]` — current slideshow's slides (in-memory working copy)
- `currentShowId` — active slideshow ID (default: `"main"`)
- `currentOrgId` / `currentOrg` — org document
- `currentUser` — Firebase Auth user
- `currentRole` — `'admin' | 'editor' | 'viewer'`
- `currentSubscription` — org's subscription object (plan, status, limits)
- `_cachedScreens[]` / `screensUnsub` — screens listener state

### Screen pairing flow
1. `display.html` writes a 6-char code to `pairingCodes/{code}` with `status: pending`
2. Admin enters the code → `admin.html` creates a `screens/{id}` doc and updates `pairingCodes/{code}` to `status: paired`
3. `display.html` polls every 3s, sees `status: paired`, reads its `screenId`, and begins playback
4. `?slot=2` URL param on display.html gives a second independent screen identity on the same machine

### Slideshow draft/publish model
- Editing auto-saves to `draftSlides` / `draftDwell` / `draftFitMode` / `draftTransition` on the Firestore doc
- **Publish** copies draft fields to `slides` / `defaultDwell` etc. and pushes to assigned screens via their `slideshowId`
- `display.html` reads published `slides`, not draft

### Roles & permissions
| Role | Can do |
|------|--------|
| `admin` | Everything: billing, team management, all screens and content |
| `editor` | Create/edit slideshows and slides. No team or billing access |
| `viewer` | Read-only. Cannot edit anything |

Role-restricted buttons use the `.admin-action` CSS class (hidden for non-admins via `applyRole()`).

### Multi-org / plan limits
Plan limits are defined in `admin.html` (client-side, for UI gating) in `PLAN_LIMITS` and in `api/stripe-webhook.js` (server-side, written to Firestore on subscription events). The Firestore org doc is the source of truth at runtime.

## Design system
- **Font:** DM Sans (UI), DM Mono (code/monospace)
- **Brand color:** `--accent: #0043ce` (light) / `#4d8bff` (dark)
- **Theme:** Full light/dark mode via CSS custom properties on `:root` and `[data-theme="dark"]`
- **Persisted:** `localStorage('signage-theme')`
- **Radius:** `--radius: 10px`
- **Surface layers:** `--bg` (page) → `--surface` (cards) → `--surface2` (inputs/hover)

## Environment variables (Vercel)
Set in Vercel Dashboard → digital-signage project → Settings → Environment Variables:
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `STRIPE_SECRET_KEY`, `STRIPE_SECRET_KEY_TEST`, `STRIPE_WEBHOOK_SECRET`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET`, `CLOUDFRONT_BASE_URL`
- `RESEND_API_KEY`
- `ANTHROPIC_API_KEY`
