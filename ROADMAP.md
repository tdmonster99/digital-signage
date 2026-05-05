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

## Phase 5 — Kitcast-Driven Differentiators + Pro Infrastructure (Next Focus)

Sourced from `KITCAST_GAP_ANALYSIS.md` (2026-04-27), plus the 2026-04-28 Vercel Pro upgrade. The priority order is product-critical differentiators first, then operational leverage now unlocked by Pro. Items 4–6 from the gap analysis (SSO/SAML, MDM/Zero-Touch/Kiosk, Time Machine / multi-workspace / data residency / white-label) are deferred to a future Enterprise tier.

---

### 5.1 Tags + Priority Overrides + Pre-Built Emergency Playlist

**Why:** Single biggest enterprise differentiator missing today. A natural cluster — tagging is the foundation that unlocks both smart playlists and pre-built emergency content. Kitcast Pro has all three; Zigns has none. Required to win schools, healthcare, multi-location retail.

**Status:** Mostly shipped 2026-04-28. Screen/org/slideshow/slide/media tag management, smart playlist publish resolution, schedule event priority, saved emergency playlist marking, and saved-playlist emergency override are now implemented. Remaining: fuller emergency playlist governance and any advanced targeting beyond all/tag/screen IDs.

**What shipped 2026-04-28:**
- Settings → Screen Tags is now a real org tag manager backed by `organizations/{orgId}.tags`, with create/rename/delete and cleanup across screen docs.
- Screen cards render tag chips; screen edit normalizes comma-separated tags and auto-adds them to the org tag registry.
- Schedule events have `priority: number`; `display.html` resolves overlapping active events by highest priority, then latest start time.
- Emergency Broadcast modal has Quick Message / Saved Playlist tabs. Saved Playlist writes `broadcasts/{orgId}` with `mode: 'playlist'`, `slideshowId`, optional `targetTags`, and existing `autoDismiss`.
- `display.html` honors playlist broadcasts by temporarily switching to the emergency slideshow for matching screens, then resuming the assigned schedule/slideshow when cleared or locally auto-dismissed.
- Slideshow Options manages slideshow tags, smart auto-include tags, and `emergencyPlaylist: true`.
- Slide and media cards now expose tag editors. Org tag rename/delete propagates through screens, slideshow metadata, slides/drafts, and media records.
- Smart playlists materialize at publish/approval time by appending matching published slides from other org slideshows, so `display.html` stays unchanged.

**What to build:**

- **Tagging system** — first-class `tags: string[]` on screens, slideshows, slides, and media. Settings hub already has a `screentags` placeholder; promote it to a real Tag Manager (create/rename/delete tags org-wide). Tags become the join key for everything below. **Shipped across screens, slideshows, slides, and media.**
- **Smart Playlists** — a slideshow option "Auto-include slides tagged X". Resolved at publish time so `display.html` doesn't need to change. **Shipped for published slides in other org slideshows.**
- **Priority Overrides** — schedules gain a `priority: number` field. When two schedules overlap on a screen, higher priority wins. `display.html` schedule resolver needs an ordered pass instead of first-match. **Shipped for events within a screen's assigned schedule.**
- **Pre-built Emergency Playlist** — a special slideshow type (`emergencyPlaylist: true`) that admins design ahead of time (designed slides, logos, instructions). New "Trigger Emergency" button on Screens page activates it across selected screens or by tag (e.g. "all healthcare-floor screens"). Reuses existing Broadcast overlay z-index 200 path; replaces the current text-only Broadcast modal with a "Quick message / Use saved playlist" tabbed picker. **Shipped using tagged slideshows marked `emergencyPlaylist: true`; remaining work is governance/polish.**

**Files:** `admin.html`, `display.html` (schedule resolver + emergency overlay), Firestore schema additions on `screens/{id}`, `slideshows/{id}`, `organizations/{id}.tags`.

---

### 5.2 Emergency CAP Feed Integration

**Why:** Procurement checkbox for schools, healthcare, government, manufacturing. Several US states require automated severe-weather and AMBER alert display in public spaces. Kitcast lists CAP support; Zigns has manual Broadcast only. Audio playback (the other half of priority #2 in the gap analysis) shipped 2026-04-27.

**Status:** Partial foundation shipped 2026-04-28. Per-screen CAP config, `capAlerts/{orgId}` mirroring, and `display.html` alert overlay are implemented. CAP polling has been split from `api/screen-monitor.js` into dedicated `api/cap-poll.js`, deployed, and production-verified on Vercel Cron. CAP render audit UX shipped 2026-05-01 in the Analytics page. Remaining: bilingual copy controls, richer alert testing, and possible IPAWS/FEMA path for Enterprise later.

**What to build:**

- **NWS first** (free, no auth, well-documented at `api.weather.gov/alerts`). IPAWS deferred — requires FEMA COG authorization, treat as Enterprise-only later.
- **CAP polling** — dedicated `api/cap-poll.js` Vercel Cron endpoint runs every minute, uses `Authorization: Bearer <CRON_SECRET>`, reuses the shared Firebase Admin helper, and holds a short Firestore lease at `cronLocks/cap-poll` so duplicate cron invocations do not overlap. Hits the NWS public CAP feed with the required `User-Agent` header. Filters active alerts by state + county FIPS codes + minimum severity (Minor / Moderate / Severe / Extreme).
- **Per-screen config** — Screens settings gain CAP fields: state, county FIPS code(s), severity floor, on/off toggle. Pull defaults from screen timezone / IP geolocation when first paired. **Manual config shipped; auto-defaults remain.**
- **`capAlerts/{orgId}` Firestore doc** mirrors the existing `broadcasts/{orgId}` shape. `display.html` listens via `onSnapshot` and renders an alert overlay above slides using a variant of the Broadcast overlay (z-index 201), styled with NWS standard severity colors and headline + area + instructions + expiry. **Shipped.**
- **Auto-clear** when the alert's `<expires>` timestamp passes or no matching active alerts remain. **Shipped through the CAP poll refresh path and display-side expiry filtering.**
- **Audit trail** — log every alert rendered to a screen for compliance reporting (some procurement RFPs ask for this). **Shipped 2026-05-01: Analytics now includes CAP render totals, reached-screen count, latest render table, and CSV export fields; future display events include headline, area, expiry, and source metadata.**

**Files:** `api/cap-poll.js`, `display.html`, `admin.html` (per-screen CAP config UI), Firestore `capAlerts/{orgId}` and `screens/{id}.cap` config.

**Vercel function count check:** project is on Vercel Pro; the old 12-function Hobby cap no longer applies. CAP polling now has its own cron endpoint so alert latency can be tuned separately from screen status monitoring.

---

### 5.3 Vercel Pro Infrastructure Upgrade

**Why:** The project is now on Vercel Pro, so the old Hobby workarounds can be unwound where they reduce risk or improve product behavior. This has higher near-term value than Enterprise packaging because it improves reliability, alert latency, and operational simplicity for every customer.

**Priority:** High. Do before broader Enterprise-only features. It directly supports CAP/emergency reliability and proof-of-play scale.

**Status:** In progress 2026-04-29. `/api/screen-monitor` is configured in `vercel.json` to run every 5 minutes on Vercel Cron and production logs confirmed Vercel-triggered runs. cron-job.org was disabled, and `screen-monitor.js` now requires `Authorization: Bearer <CRON_SECRET>` only. Fallback-removal deploy verified: `?secret=` requests return 401 and Vercel Cron still returns 200. CAP split is deployed and production-verified with `/api/cap-poll` scheduled every minute, a targeted 60s function duration, and a Firestore overlap guard. Analytics rollup is deployed with a daily `/api/analytics-rollup` cron, a targeted 300s function duration, and a Firestore overlap guard. Public unauthenticated and query-secret requests return 401; manual authenticated verification returned 200 for `2026-04-28` with 4 orgs processed, 1 org with events, 1 event processed, and 0 failures. Automatic scheduled-origin verification remains optional for the next `08:17 UTC` cron tick.

**What to build:**

- **Move screen monitoring to Vercel Cron** — add `crons` entry for `/api/screen-monitor` in `vercel.json`, likely `*/5 * * * *`. Keep `CRON_SECRET`; Vercel sends it as `Authorization: Bearer <CRON_SECRET>`. After one verified production run, remove the `?secret=` query fallback so the secret is no longer exposed in URLs or request logs. **Complete 2026-04-29: configured, production-verified, cron-job.org disabled, and fallback removed.**
- **Split CAP polling into `api/cap-poll.js`** — move NWS polling out of `screen-monitor.js` and run it every 1 minute on Vercel Cron. Keep `screen-monitor.js` focused on offline/online status and plan screen-limit enforcement. Add a simple Firestore lock/idempotency guard because Vercel Cron can overlap or duplicate invocations. **Complete 2026-04-29: deployed and production-verified.**
- **Add analytics daily rollup cron** — create a daily job that aggregates raw `organizations/{orgId}/analytics` events into daily proof-of-play summaries. This keeps dashboard reads cheaper and faster as event volume grows. **Deployed and manually verified 2026-04-29: `api/analytics-rollup.js` writes `organizations/{orgId}/analyticsDaily/{YYYY-MM-DD}`; public auth checks passed; authenticated manual run returned 200.**
- **Set explicit function durations where useful** — use `vercel.json` `functions` config for long-running routes such as `api/import-pptx.js`, `api/canva.js`, `api/cap-poll.js`, and the future analytics rollup. Do this deliberately, not globally, so runaway functions still fail quickly. **`api/cap-poll.js` now has `maxDuration: 60`; `api/analytics-rollup.js` now has `maxDuration: 300`; other routes remain to be evaluated.**
- **Defer broad endpoint splitting** — do not split `api/proxy.js` just because Pro allows more functions. Split weather/RSS/reviews/Instagram only when different cache/security behavior or debugging needs justify the endpoint churn.

**Files:** `vercel.json`, `api/screen-monitor.js`, new `api/cap-poll.js`, new `api/analytics-rollup.js`, docs/tests as needed.

**Test plan:** Deploy preview and verify each cron endpoint manually with `Authorization: Bearer <CRON_SECRET>`, then promote. Vercel Cron scheduling only activates on production deployments, so confirm production Cron Jobs logs after promotion, then remove any cron-job.org duplicate schedule. Screen-monitor cron production verification completed 2026-04-29; after fallback-removal deploy, query-string secret calls returned 401 and the next Vercel Cron run returned 200. CAP poll production cron verification completed 2026-04-29. Analytics rollup production deploy completed 2026-04-29; unauthenticated and query-string secret requests returned 401, and an authenticated manual run returned 200. Automatic scheduled-origin verification remains optional for the next `08:17 UTC` tick.

---

### 5.4 Player Platform Compatibility

**Why:** Biggest competitive moat for Kitcast — proprietary signage OS support is the primary procurement filter for buyers replacing existing fleets, while Android and ChromeOS are the fastest path to reliable low-cost signage hardware. Browser playback already works on Windows, macOS, Linux, ChromeOS, and Raspberry Pi-class devices, but unattended signage needs more than a URL: auto-start, kiosk lockdown, watchdog recovery, platform diagnostics, offline behavior, and store/sideload packaging.

**Status:** 5.4.0 browser player diagnostics shipped 2026-05-03. 5.4.1 Android initial WebView shell landed 2026-05-03, with release-signing hooks, configurable player URL, device-owner lock-task support, and production smoke/kiosk docs added 2026-05-04. 5.4.2 ChromeOS kiosk docs/checklist and 5.4.3/5.4.4 Tizen/webOS wrapper scaffolds landed 2026-05-04. Tizen/webOS packaging-spike scripts and required package icons landed 2026-05-05. Windows-local packaging is now proven for Tizen `.wgt` signing with `zigns-tv-dev` and for webOS `.ipk` packaging with webOS CLI 3.2.3. 5.4.5 tvOS now has a source-level SwiftUI/WKWebView scaffold and runbook under `player-tvos/`, but Xcode project creation, signing, and Apple TV validation require macOS. Remaining before calling these production-ready: Android signing/hardware validation, ChromeOS managed-device validation, real Samsung/LG panel install/launch/playback validation, and tvOS Xcode/hardware validation. BrightSign is deferred until a customer/RFP requires it.

**What to build:**

- **5.4.0 Player compatibility foundation** — shipped first pass: `display.html` reports stable player version, detected platform, viewport/screen metrics, feature/media probes, watchdog restarts, slideshow errors, and online/offline transitions through analytics; admin Screen details now surface those diagnostics.
- **5.4.1 Android TV / Android signage APK** — native WebView shell under `player-android/`: hosted/configurable player URL, auto-launch receiver, fullscreen/keep-awake behavior, network and renderer recovery, reset/reload maintenance menu, optional device-owner lock-task kiosk mode, Android shell diagnostics, release-signing hooks, and sideload/build/kiosk smoke-test notes. Remaining before production-ready: create/secure the release signing key, build/install on Android TV/signage hardware, and validate offline/media behavior.
- **5.4.2 ChromeOS kiosk profile** — first runbook added under `player-chromeos/`: managed kiosk launch URL, recommended hardware, Google Admin policy checklist, install flow, support intake checklist, and smoke-test matrix. Remaining: validate on a managed ChromeOS device and capture exact customer-console policy names.
- **5.4.3 Samsung Tizen** — first Tizen Web Application scaffold added under `player-tizen/`: `config.xml`, redirect wrapper, generated PNG package icon, Bash/PowerShell package-spike scripts, signing inputs, packaging notes, and panel smoke checklist. Windows-local `.wgt` packaging/signing succeeded with Tizen Studio at `C:\tizen-studio` and Samsung profile `zigns-tv-dev`. Remaining: install on Samsung commercial signage hardware and validate Firestore realtime, offline cache, YouTube/webpage behavior, remote keys, unattended launch, and whether a device-specific distributor certificate/DUID is required.
- **5.4.4 LG webOS Signage** — first webOS Web App scaffold added under `player-webos/`: `appinfo.json`, redirect wrapper, generated PNG package icons, Bash/PowerShell package-spike scripts, CLI packaging notes, and panel smoke checklist. Windows-local `.ipk` packaging succeeded with webOS CLI 3.2.3. Remaining: install/launch on LG webOS signage hardware, validate playback, and choose supported OS/model floor.
- **5.4.5 Apple TV / tvOS** — native tvOS player. Apple TV has no normal browser path, so this is a real native shell rather than a packaged web page. Source-level scaffold exists under `player-tvos/` with SwiftUI + `WKWebView` files, signing/distribution notes, and a smoke checklist. Remaining: create the Xcode project on macOS, add app icons/launch assets, sign with an Apple Developer team, run on Apple TV hardware, validate media/WebKit behavior, and choose TestFlight/App Store/custom-app distribution.
- **Later: Fire TV / BrightSign** — Fire OS should inherit as much as possible from Android, but consumer Fire Stick deployment/autostart limitations keep it behind the core wave. BrightSign remains future Enterprise/RFP-driven work because it is a distinct BrightScript/HTML5 ecosystem and needs separate renderer validation.

**Files:** `display.html`, `service-worker.js`, Firestore rules/schema for player diagnostics, `player-android/`, `player-chromeos/`, `player-tizen/`, `player-webos/`, `player-tvos/`, then new platform projects/build pipelines outside the current no-bundler web app. Coordinate with marketing site (`site/`) Hardware page once any one platform ships.

---

## Operations / Housekeeping

Small non-feature tasks that need to get done.

| Task | Priority | Notes |
|------|----------|-------|
| Mark Vercel env vars as Sensitive | Medium | Complete 2026-04-29. Production and Preview credential-like vars now report `type: sensitive` in Vercel metadata, including `CRON_SECRET`, API keys, Stripe secrets, Firebase service account JSON, AWS access keys, `RESEND_API_KEY`, and `ANTHROPIC_API_KEY`. `CRON_SECRET` was rotated after a whitespace-tainted update attempt, key values were re-entered cleanly, and production deployment `dpl_4L4ggRx1iWtDTTLd6ZuPrZRjrVMc` is verified on `app.zigns.io`. Development entries remain `encrypted` because Vercel CLI treats Sensitive as a Production/Preview setting. |
| Delete duplicate Vercel `app` project | Low | Complete 2026-04-29. Deleted stale duplicate project `app` (`prj_tTB7997K3tjd169MssthjYSnhini`) after confirming it had no custom domain and only duplicated `main` branch deployments. `digital-signage` remains the active project linked to `app.zigns.io`. |
| Move `CRON_SECRET` to `Authorization` header only | High | Folded into Phase 5.3 Vercel Pro Infrastructure Upgrade. Complete for `screen-monitor.js`, `cap-poll.js`, and `analytics-rollup.js`; query-string secret requests return 401. |

---

## Scalability Backlog

Known weaknesses to address before significant user growth.

| Task | Risk | Notes |
|------|------|-------|
| Slideshow subcollection migration | High | Complete 2026-04-30. Compatibility code and Firestore rules are deployed; production migration moved all 14 slideshow docs to `slideshows/{id}/slides/{slideId}` / `draftSlides/{slideId}` subcollections. After manual admin/display verification, `--cleanup-arrays` removed legacy parent `slides[]` / `draftSlides[]`. Final verification found 12 published slide docs, 4 draft slide docs, no parent arrays, and no count mismatches. |
| Analytics daily rollup | Medium | Folded into Phase 5.3 Vercel Pro Infrastructure Upgrade. `api/analytics-rollup.js` is deployed with a daily Vercel Cron schedule, writes `organizations/{orgId}/analyticsDaily/{YYYY-MM-DD}` summaries, and returned 200 on an authenticated manual production run. |

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
