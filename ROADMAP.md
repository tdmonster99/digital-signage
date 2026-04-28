# Zigns Development Roadmap

---

## Phase 4 — Competitive Parity (Complete)

Gap analysis against Yodeck, ScreenCloud, Rise Vision, OptiSigns, Screenly, and TelemetryTV (April 2026). All 12 items shipped. **Phase 5 (below) is the next focus.**

---

### 1. Multi-Zone / Split-Screen Layouts
**Why:** Present in 6/6 competitors. The single biggest functional gap — competitors treat zone layouts as a core feature. Restaurants need a ticker strip + main content zone. Offices want a clock/date zone + bulletin zone. Without it, Zigns can't match a basic Yodeck or OptiSigns demo.
**What to build:**
- Zone editor in the slide designer: drag-and-resize zone rectangles on a canvas (similar to Fabric.js object model already in use)
- Zone types: media (image/video), widget (clock/weather/etc.), ticker, web page
- Save zones as an array on the slide doc with `{type, x, y, w, h, content}`
- `display.html`: render each zone as an absolutely-positioned div at its saved coordinates

**Files:** `admin.html`, `display.html`

---

### 2. Offline Content Caching
**Why:** Present in 6/6 competitors. Every competitor caches content to the device so screens survive network interruptions. Zigns requires a live connection — if Firestore or Wi-Fi drops, the screen goes blank. Unacceptable for unattended screens in restaurants and retail.
**What to build:**
- Service worker (already registered) — extend to cache all media URLs (images, videos) using a Cache Storage strategy on first play
- On Firestore disconnect: continue playing from the in-memory slide list (already held in `slides[]`)
- Cache invalidation: re-download assets when slide content changes (compare `updatedAt` timestamp)
- Visual indicator in `display.html` when running in offline mode

**Files:** `display.html`, `service-worker.js`

---

### 3. Digital Menu Board Mode
**Why:** Present in 5/6 competitors. Restaurants are a primary SMB vertical. A purpose-built menu board is a specific slide type with category headers, item rows (name, description, price), allergen badges, and a background color/image — distinct from a free-form designed slide.
**What to build:**
- New slide type `menuboard` in admin: modal with category/item editor (add/remove rows, name, price, description, badge icons)
- Menu board theme picker: background color, accent color, font style
- `display.html`: `renderMenuBoard()` — renders a structured layout from the items data, not a Fabric.js canvas
- Optional: time-of-day pricing zones (breakfast/lunch/dinner menus via expiration dates already built)

**Files:** `admin.html`, `display.html`

---

### 4. PowerPoint Integration
**Why:** Present in 4/6 competitors. PowerPoint is the most common content format in offices and schools — operators already have decks they want on screen without redesigning from scratch. Importing PPTX directly removes the biggest friction point for the office/education vertical.
**What to build:**
- "Import PowerPoint" button in the Add Slide / media flow
- Backend `api/import-pptx.js`: accepts an uploaded `.pptx` file, uses LibreOffice (Vercel container) or the Microsoft Graph API to convert each slide to a PNG, uploads PNGs to S3
- Alternatively: use a third-party conversion service (e.g. CloudConvert API) to avoid self-hosting a converter
- Each converted PNG becomes an `image` slide in the current slideshow, preserving slide order
- Show a progress indicator during conversion (may take several seconds per slide)

**Files:** `admin.html`, `api/import-pptx.js`

---

### 5. Canva Integration
**Why:** Present in 6/6 competitors. SMBs already use Canva daily for menus, promos, and social posts. Import directly rather than forcing users to export a PNG, then upload manually. Lowest-friction content creation path for non-designers.

**Note:** The old Canva Design Button SDK is deprecated. The current path is **Canva Connect APIs** (OAuth 2.0). The button has been removed from the UI until the proper integration is built.

**What to build:**
- Register an app in the Canva developer portal → Connect APIs
- OAuth 2.0 flow: user authorizes Zigns to access their Canva designs
- Backend `api/canva-callback.js`: handles OAuth callback, exchanges code for access token, stores token in Firestore against `users/{uid}`
- "Import from Canva" button opens OAuth popup; on completion, fetches user's recent designs via Canva Connect API
- User picks a design → export as PNG → upload to S3 → create image slide

**Files:** `admin.html`, `api/canva-callback.js`, `api/canva-export.js`

---

### 6. Social Media Feeds (Instagram + Google Reviews)
**Why:** Instagram is on 6/6 competitors; Google Reviews on 4/6. High demand in restaurants and retail — live social proof with zero content-creation effort for operators.
**Status:** Implemented 2026-04-19. Google Reviews and Instagram feed slides are available.
**What to build:**
- **Instagram:** New widget slide type `instagram`. Admin modal: access token, optional professional account ID, username, display style, max posts, refresh interval, and theme. Backend proxy route in `api/proxy.js` fetches latest posts via the current Instagram API and `display.html` renders grid, spotlight, and carousel layouts.
- **Google Reviews:** New widget slide type `googlereviews`. Admin modal: Google Place ID input, min star filter, max reviews to show. Backend proxy route in `api/proxy.js` fetches via Google Places API. `display.html`: renders star rating + review text + reviewer name.

**Files:** `admin.html`, `display.html`, `api/proxy.js` (merged to stay within 12 Vercel functions)

---

### 7. Content Templates Library
**Why:** Present in 5/6 competitors (500–1,000+ templates each). A blank canvas is a barrier for non-designers. Even 30–50 quality templates dramatically reduce onboarding drop-off — operators can pick a template and swap in their content in minutes.
**Status:** Expanded 2026-04-20. The existing Design a Slide template gallery now works as a Content Templates Library with category filters, high-quality preview, and "Use Template" insertion into the current slideshow draft. The catalog now ships 46 designed templates across office, safety, wayfinding, restaurant, retail, healthcare, education, events, holiday, and social media families, and the newest pass pushes more of them toward photo-led compositions.
**What to build:**
- Keep the static template catalog inside `admin.html` per the no-split frontend rule; each template generates a designed-slide payload matching the existing slide schema.
- Template gallery modal in admin: filter by category (Business, Office, Safety, Wayfinding, Restaurant, Retail, Healthcare, Education, Events, Holiday, Social Media), click to preview, "Use Template" inserts slides into the current slideshow.
- Continue refining the 40–60+ catalog toward more photo-rich, Yodeck-style layouts; thumbnails continue to be generated from designed slides.

**Files:** `admin.html`

---

### 8. Proof of Play Reporting
**Why:** Present in 5/6 competitors. Gates access to advertising and franchise customer segments — any operator running paid content on screens, or any franchisor verifying brand compliance, needs to verify content actually played.
**What to build:**
- `display.html`: on each slide advance, write an event to `organizations/{orgId}/analytics` with `{slideId, slideshowId, screenId, playedAt, durationMs}`
- Admin analytics page: query the collection, group by slide/screen/date; render a table and chart — "Slide X played N times across Y screens in date range"
- Export to CSV button

**Files:** `display.html`, `admin.html`

---

### 9. Google Sheets Live Data Widget
**Why:** SMB version of Power BI — present in 6/6 competitors. Offices display daily sales numbers, inventory counts, shift schedules, or leaderboards from a Google Sheet without a BI tool. Low effort with very high perceived value.
**What to build:**
- New widget slide type `googlesheets`. Admin modal: Google Sheet URL input, range (e.g. `Sheet1!A1:D10`), refresh interval, display style (table or single-value)
- Backend proxy `api/sheets-proxy.js`: accepts sheet ID + range + API key, returns JSON array of rows
- `display.html`: `renderGoogleSheet()` — renders a styled table or big-number display from the data

**Files:** `admin.html`, `display.html`, `api/sheets-proxy.js`

---

### 10. Emergency Broadcast Override
**Why:** Present in 3/6 competitors (ScreenCloud, OptiSigns primarily). Instantly override all screens with an urgent message — fire drill, store closure, urgent safety alert — without navigating to each screen. Low effort to build, high operational safety value.
**What to build:**
- "Broadcast" button in admin header (Admin role only): opens a modal with message text input + optional background color (red/yellow/white)
- Writes to `organizations/{orgId}/broadcast` doc with `{active: true, message, color, createdAt}`
- `display.html`: `onSnapshot` listener on the broadcast doc; when `active: true`, immediately overlays a full-screen message div (z-index above everything including working-hours overlay)
- Auto-dismiss after configurable timeout, or manually cleared from admin by setting `active: false`

**Files:** `admin.html`, `display.html`

---

### 11. Content Approval Workflow
**Why:** Present in 4/6 competitors. Unlocks franchise, multi-location, and regulated-industry accounts — managers can approve slides before they go live. Without it, the Editor role can publish anything with no review gate.
**Status:** Implemented 2026-04-19. Admins can require approval before editor publishing, review pending slideshow drafts, approve to publish, reject with a note, and send Resend notifications through the existing invite/notification API function.
**What to build:**
- Add `approvalRequired: boolean` setting to org (Admin toggles in Settings)
- When enabled: Editor's Publish button changes to "Submit for Review" → sets slideshow to `status: 'pending_review'`
- Admin sees a "Pending Review" badge on slideshows and a review queue in the Slideshows page
- Admin can Approve (publishes immediately) or Reject (returns to draft with optional comment)
- Email notification via Resend on both submit and approval/rejection

**Files:** `admin.html`, `api/send-invite.js` (or new `api/send-notification.js`)

---

### 12. 14-Day Trial + Automatic Downgrade
**Why:** Lower-friction trials help new orgs evaluate the full product before committing, while still landing them on the Starter/Free 1-screen floor when the trial ends.
**Status:** Implemented 2026-04-23. Opt-in "Start 14-day free trial" link on each paid tier in the billing page. Rides on Stripe's native trial (`trial_period_days: 14` with `trial_settings.end_behavior.missing_payment_method: 'cancel'`), so conversion and expiry are handled by Stripe — no custom cron needed. Trial status and `trialEndsAt` are captured on the org subscription via the existing webhook, surfaced as a countdown banner in billing and a badge in the settings hub. Admin-side `enforceScreenLimit()` marks overflow screens `suspended: true` when paired count exceeds the plan's `screensAllowed`; `display.html` shows a "Subscription limit reached" overlay for those screens until an admin upgrades or unpairs.
**What was built:**
- Checkout accepts `trial: true`, Stripe collects the card up front and auto-charges on day 15.
- Webhook captures `trialStartedAt` / `trialEndsAt` / `status: 'trialing'` into the org doc.
- Billing UI shows trial banner with days-left countdown; settings hub status shows "Premium trial · 10d left".
- Feature gating already reads from `plan`, so trialing orgs get full paid-tier access automatically.
- `display.html` has a dedicated suspended overlay for over-limit screens (z-index above stages, below broadcast).

**Files:** `admin.html`, `display.html`, `api/stripe-sessions.js`, `api/stripe-webhook.js`

---

## Summary Table — Phase 4

| # | Feature | Effort | Impact | Competitors |
|---|---|---|---|---|
| 1 | Multi-zone layouts | High | Very High | 6/6 | ✓ |
| 2 | Offline content caching | Medium | Very High | 6/6 | ✓ |
| 3 | Digital menu board | Medium | High | 5/6 | ✓ |
| 4 | PowerPoint integration | Medium | High | 4/6 | ✓ |
| 5 | Canva integration (Connect APIs) | Medium | High | 6/6 | ✓ |
| 6 | Social media feeds (Instagram + Reviews) | Medium | High | 6/6 / 4/6 | ✓ |
| 7 | Content templates library | Medium | High | 5/6 |
| 8 | Proof of play reporting | Low | High | 5/6 | ✓ |
| 9 | Google Sheets live data widget | Low | High | 6/6 | ✓ |
| 10 | Emergency broadcast override | Low | Medium | 3/6 | ✓ |
| 11 | Content approval workflow | Medium | Medium | 4/6 | ✓ |
| 12 | 14-day trial + auto-downgrade | Medium | High | — | ✓ |

---

## Phase 5 — Kitcast-Driven Differentiators (Next Focus)

Sourced from `KITCAST_GAP_ANALYSIS.md` (2026-04-27). The three priority clusters below are the agreed Phase 5 scope. Items 4–6 from the gap analysis (SSO/SAML, MDM/Zero-Touch/Kiosk, Time Machine / multi-workspace / data residency / white-label) are deferred to a future Enterprise tier.

---

### 5.1 Tags + Priority Overrides + Pre-Built Emergency Playlist

**Why:** Single biggest enterprise differentiator missing today. A natural cluster — tagging is the foundation that unlocks both smart playlists and pre-built emergency content. Kitcast Pro has all three; Zigns has none. Required to win schools, healthcare, multi-location retail.

**Status:** Not started. Existing Broadcast feature (real-time text overlay) covers part of the emergency use case but is not a designed-slide playlist.

**What to build:**

- **Tagging system** — first-class `tags: string[]` on screens, slideshows, slides, and media. Settings hub already has a `screentags` placeholder; promote it to a real Tag Manager (create/rename/delete tags org-wide). Tags become the join key for everything below.
- **Smart Playlists** — a slideshow option "Auto-include slides tagged X". Resolved at publish time so `display.html` doesn't need to change.
- **Priority Overrides** — schedules gain a `priority: number` field. When two schedules overlap on a screen, higher priority wins. `display.html` schedule resolver needs an ordered pass instead of first-match.
- **Pre-built Emergency Playlist** — a special slideshow type (`emergencyPlaylist: true`) that admins design ahead of time (designed slides, logos, instructions). New "Trigger Emergency" button on Screens page activates it across selected screens or by tag (e.g. "all healthcare-floor screens"). Reuses existing Broadcast overlay z-index 200 path; replaces the current text-only Broadcast modal with a "Quick message / Use saved playlist" tabbed picker.

**Files:** `admin.html`, `display.html` (schedule resolver + emergency overlay), Firestore schema additions on `screens/{id}`, `slideshows/{id}`, `organizations/{id}.tags`.

---

### 5.2 Emergency CAP Feed Integration

**Why:** Procurement checkbox for schools, healthcare, government, manufacturing. Several US states require automated severe-weather and AMBER alert display in public spaces. Kitcast lists CAP support; Zigns has manual Broadcast only. Audio playback (the other half of priority #2 in the gap analysis) shipped 2026-04-27.

**Status:** Not started.

**What to build:**

- **NWS first** (free, no auth, well-documented at `api.weather.gov/alerts`). IPAWS deferred — requires FEMA COG authorization, treat as Enterprise-only later.
- **`api/cap-poll.js`** Vercel cron, every 60s. Hits the NWS public CAP feed with the required `User-Agent` header. Filters active alerts by state + county FIPS codes + minimum severity (Minor / Moderate / Severe / Extreme).
- **Per-screen config** — Screens settings gain CAP fields: state, county FIPS code(s), severity floor, on/off toggle. Pull defaults from screen timezone / IP geolocation when first paired.
- **`capAlerts/{orgId}` Firestore doc** mirrors the existing `broadcasts/{orgId}` shape. `display.html` listens via `onSnapshot` and renders an alert overlay above slides using a variant of the Broadcast overlay (z-index 200), styled with NWS standard severity colors and bilingual headline + area + instructions + expiry.
- **Auto-clear** when the alert's `<expires>` timestamp passes or a cancel message arrives.
- **Audit trail** — log every alert rendered to a screen for compliance reporting (some procurement RFPs ask for this).

**Files:** `api/cap-poll.js`, `display.html`, `admin.html` (per-screen CAP config UI), Firestore `capAlerts/{orgId}` and `screens/{id}.cap` config.

**Vercel function count check:** currently below the 12-function Hobby limit; one new function is fine. Verify before merging.

---

### 5.3 Native Players for Tizen / webOS / BrightSign

**Why:** Biggest competitive moat for Kitcast — proprietary signage OS support is the primary procurement filter for buyers replacing existing fleets (most commercial displays in the wild are Samsung Tizen or LG webOS). Without native players, Zigns is locked out of every "we already have Samsung commercial displays" conversation.

**Status:** Not started. Hero chip and Hardware page already say "more platforms on the way" — committing now means making good on that.

**What to build:**

- **Samsung Tizen** — Tizen Studio app wrapping `display.html` in a Tizen WebApplication (essentially a kiosk WebView). Sign with a Samsung partner cert. Submit to Samsung Smart Signage app store. Auto-launch on boot, USB sideload supported for non-store deployments.
- **LG webOS** — webOS TV/Signage SDK app with the same WebView wrapper pattern. Submit to LG webOS Signage Marketplace. Older webOS Signage versions need a different SDK target — pick a floor (e.g. webOS 4.0+ / 2018 panels onward).
- **BrightSign** — different beast. BrightScript/HTML5 hybrid, no full Chromium. Likely path: a thin BrightScript shell that loads `display.html` in their HTML5 player widget, with platform shims for any Web APIs BrightSign's renderer doesn't support. Validate which `display.html` features actually work there before scoping.
- **Shared work** — pull the screen-pairing flow into a thin native shell so the same QR/code pairing works without keyboard input. Investigate whether Firestore websockets work on each platform's network stack (some commercial-display firewalls block them).
- **Decision gate** — if engineering investment is too high, lean explicitly into "BYOD / runs on hardware you already have" positioning on the marketing site instead. This is a real fork: Tizen + webOS + BrightSign is a multi-month effort, not a sprint.

**Files:** New repos / build pipelines per platform — outside the `app/` codebase. Coordinate with marketing site (`site/`) Hardware page once any one platform ships.

---

## Operations / Housekeeping

Small non-feature tasks that need to get done.

| Task | Priority | Notes |
|------|----------|-------|
| Mark Vercel env vars as Sensitive | Medium | `GOOGLE_PLACES_API_KEY`, `CRON_SECRET`, `CLOUDCONVERT_API_KEY`, `GOOGLE_SHEETS_API_KEY`, `OPENWEATHER_API_KEY` all flagged "Needs Attention" in Vercel dashboard. Edit each → check Sensitive → re-paste value. |
| Delete duplicate Vercel `app` project | Low | `digital-signage` is the active project (linked in `.vercel/project.json`). The `app` project is a stale duplicate — verify it has no custom domain or env vars, then delete. |
| Move `CRON_SECRET` to `Authorization` header only | Low | `screen-monitor.js` accepts secret via `?secret=` query param, which exposes it in server logs. Remove query-param path, keep header-only. |

---

## Scalability Backlog

Known weaknesses to address before significant user growth.

| Task | Risk | Notes |
|------|------|-------|
| Slideshow subcollection migration | High | `slides[]` and `draftSlides[]` stored in Firestore doc — 1MB doc limit will silently break writes for large slideshows. Migrate to `slideshows/{id}/slides/{slideId}` subcollection. Needs migration script + deep `admin.html` + `display.html` changes. Plan separately. |
| Analytics daily rollup | Low | Raw analytics events accumulate per org with no aggregation. Dashboard queries get expensive over time. Add a daily rollup cron. |

---

## Completed — Phase 1–3

All items below are shipped and in production as of April 2026.

| # | Feature | Phase | Shipped |
|---|---|---|---|
| 11 | Multi-zone / split-screen layouts | 4 | ✓ 2026-04-16 |
| 12 | Offline content caching | 4 | ✓ 2026-04-16 |
| 13 | Canva integration (Connect APIs) | 4 | ✓ 2026-04-17 |
| 14 | Google Sheets live data widget | 4 | ✓ 2026-04-16 |
| 15 | Emergency broadcast override | 4 | ✓ 2026-04-16 |
| 16 | PowerPoint integration | 4 | ✓ 2026-04-16 |
| 17 | Digital menu board | 4 | ✓ 2026-04-18 |
| 18 | Social media feeds (Instagram + Reviews) | 4 | ✓ 2026-04-19 |
| 19 | Content approval workflow | 4 | ✓ 2026-04-19 |
| 1 | Schedule display-side enforcement | 1 | ✓ 2026-04-14 |
| 2 | QR code widget | 1 | ✓ 2026-04-14 |
| 3 | Weather widget | 1 | ✓ 2026-04-14 |
| 4 | Online/offline email notifications | 1 | ✓ 2026-04-15 |
| 5 | RSS ticker with live feed | 1 | ✓ 2026-04-14 |
| 6 | Working hours (auto screen on/off) | 2 | ✓ 2026-04-15 |
| 7 | Countdown timer widget | 2 | ✓ 2026-04-15 |
| 8 | Per-screen timezone | 3 | ✓ 2026-04-15 |
| 9 | PDF display | 3 | ✓ 2026-04-15 |
| 10 | Media expiration dates | 3 | ✓ 2026-04-15 |
