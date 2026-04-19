# Zigns Dev Log

Running log of changes by session. Append a new entry at the top after each session.

---

## 2026-04-19 — Codex (session 12)
- **Template library UX simplification**: removed the redundant Templates toolbar button and the confusing Design/Use gallery toggle.
  - `admin.html`: Design a Slide remains the single entry point; choosing a template now opens a preview with clear Customize and Use Template actions.
  - `ROADMAP.md`: updated the template-library status to reflect the unified Design a Slide gallery flow.

---

## 2026-04-19 — Codex (session 11)
- **Content Templates Library initial implementation**: reused the existing designer template catalog as a library flow.
  - `admin.html`: added a Templates toolbar entry, Design/Use gallery modes, template preview via the high-quality slide preview lightbox, and "Use Template" insertion into the current slideshow draft.
  - `admin.html`: added queued offscreen Fabric rendering for template thumbnails/previews so library insertion does not collide with background thumbnail generation.
  - `ROADMAP.md`: updated the Content Templates Library item to reflect the initial in-file implementation and remaining catalog expansion work.

---

## 2026-04-19 — Codex (session 10)
- **Instagram feed widget**: shipped the Phase 4 social-feed gap for Instagram.
  - `admin.html`: enabled the Instagram app card, added an Instagram slide modal, slide save/edit flow, slide-card badge/icon, and slideshow targeting.
  - `display.html`: added a dedicated Instagram stage with grid, spotlight, and rotating carousel layouts plus refresh/cycle cleanup.
  - `api/proxy.js`: added a POST `type=instagram` route that proxies Instagram API media without putting the access token in the URL.
  - `ROADMAP.md`: marked Social Media Feeds complete; Content Templates Library is next.

---

## 2026-04-19 — Codex (session 9)
- **Slide preview quality fix**: hover Preview now renders designed slides from the saved Fabric canvas JSON at a larger preview resolution instead of reusing the small card thumbnail.
  - Enlarged the preview lightbox image stage so slide previews display closer to screen-preview size while staying within the viewport.

---

## 2026-04-19 — Codex (session 8)
- **Designed slide image thumbnail fallback**: when Fabric thumbnail export fails because an inserted image taints the canvas, designed slide cards now fall back to the first image URL in the saved canvas JSON instead of showing the generic image placeholder.
  - Applied the fallback to standalone designed slides, slide preview, and group thumbnails.

---

## 2026-04-19 — Codex (session 7)
- **Template gallery green bar root cause**: moved the Waiting Room Welcome card's absolute header stripes inside `.tmpl-preview`; they were siblings of the preview, so Edge positioned them at the top of the gallery as the visible green bar.

---

## 2026-04-19 — Codex (session 6)
- **Template gallery canvas leak fix**: changed template thumbnail and AI preview rendering to use detached Fabric `StaticCanvas` instances that never attach to the document, preventing the green healthcare-template render from appearing above the gallery in Edge.

---

## 2026-04-19 — Codex (session 5)
- **Template gallery green bar follow-up**: added explicit offscreen Fabric render hosts, cleanup for orphan full-size Fabric canvases, and service worker cache bump/no-cache shell fetches so stale admin shells do not preserve the escaped template thumbnail canvas.

---

## 2026-04-19 — Codex (session 4)
- **Template gallery visual bug fix**: hid the offscreen Fabric canvas host used for template thumbnail generation so its generated `.canvas-container` wrapper can no longer appear as a green bar above the template picker.

---

## 2026-04-19 — Codex (session 3)
- **App modal close controls**: added a consistent top-right `X` close button to app/widget modals so users can dismiss them without scrolling to the footer Cancel button.
  - Covered Clock, QR Code, Weather, Countdown, Google Sheets, Google Reviews, Menu Board, and Multi-Zone Layout modals.
  - Added shared `.app-modal-close` styling with hover/focus states and kept existing Cancel buttons.

---

## 2026-04-19 — Codex (session 2)
- **Google Reviews widget** (Phase 4 #6 partial): added `googlereviews` as a new social slide type.
  - `admin.html`: Social app card, add/edit modal, slide save flow, slide-grid thumbnail/badge/edit button.
  - `display.html`: new `stageReviews`, Google Reviews renderer, refresh interval, stage cleanup, and `applyPlaylist` recognition.
  - `api/proxy.js`: added `type=googlereviews` route using Google Places Place Details reviews, merged into the existing proxy to stay at the 12-function Vercel Hobby limit.
  - `ROADMAP.md`: marked Google Reviews implemented while Instagram remains.
  - **Setup required:** add `GOOGLE_PLACES_API_KEY` or `GOOGLE_MAPS_API_KEY` in Vercel with Places API enabled.

---

## 2026-04-19 — Codex
- **Menu Board modal theme normalization**: updated the `menuboard` app modal to use the app's standard modal theme tokens (`--surface`, `--surface2`, `--border`, `--text`, `--muted`, `--accent`) instead of hard-coded dark colors. Form controls, category/item editor rows, badges, buttons, empty state, and inline modal header text now adapt with the rest of the app theme.

---

## 2026-04-18 — Claude (session 2)
- **Menu Board bug fixes**: three bugs in the newly-added `menuboard` slide type.
  - `openMenuboardModal`: replaced undefined `allSlideshows` loop with `_populateShowSelect('mbShowTarget')`.
  - `saveMenuboardSlide` edit path: replaced non-existent `saveDraft()` / `renderSlideList()` with `pushToFirestore()` / `renderGrid()`.
  - `saveMenuboardSlide` add path: was always going through `_addSlideToShow` (writes to Firestore but never updates local `slides[]` or refreshes the UI). Now uses direct `slides.push()` + `renderGrid()` + `pushToFirestore()` when targeting the current show — same pattern as QR, Clock, Countdown, etc.

---

## 2026-04-18 — Claude
- **Canva PKCE fix**: eliminated `FIREBASE_SERVICE_ACCOUNT_JSON` dependency from OAuth flow. Instead of storing the PKCE `code_verifier` in Firestore, it's now base64url-encoded into the `state` parameter alongside the `uid`. Callback decodes state to retrieve both. No server-side storage needed; Firestore and Firebase Admin removed from `api/canva.js` entirely.

---

## 2026-04-17 — Claude
- **Canva Integration** (Phase 4 #5): full OAuth 2.0 + design import via Canva Connect API.
  - `api/canva.js`: single serverless function (merged to stay at 12-function Hobby limit) handling 4 routes: OAuth initiation (redirect to Canva authorize), OAuth callback (exchange code → return tokens via postMessage), list designs (GET action=designs), export design as PNG + upload to S3 (POST action=export). Polls export job up to 7s to fit within Vercel 10s timeout.
  - `api/proxy.js`: merged `rss-proxy.js` + `weather.js` into one file to free up a slot for canva.js. Routes: `?type=rss&url=...` and `?type=weather&location=...`. Updated `display.html` (RSS + weather) and `admin.html` (weather) to use `/api/proxy?type=...`.
  - admin.html: "Canva" button in Add Media modal "Other sources" row. `#canvaModal` (purple `#7d2ae8` theme): connect screen (Connect Canva button opens OAuth popup), design grid with thumbnails + multi-select checkboxes, search/filter, load-more pagination, Import button. Token stored in Firestore `users/{uid}.canvaToken` for persistence across sessions; auto-cleared on 401. Each selected design exports as PNG and becomes an image slide.
  - **Setup required (user):** Register app at canva.com/developers → Connect APIs. Set redirect URI to `https://app.zigns.io/api/canva`. Add `CANVA_CLIENT_ID` and `CANVA_CLIENT_SECRET` to Vercel env vars.

---

## 2026-04-16 (cont.) — Claude
- **Group editor UX**: click-to-preview (click filmstrip card → full image appears in main area with accent-border highlight); drag-to-reorder fixed (dragFrom was per-card closure var, hoisted to strip-level so drop target can see it); thumbnailUrl set on PPTX and PDF page slides so filmstrip shows actual images.
- **PPTX import fixes** (3 rounds): (1) set thumbnailUrl on page slides; (2) URL-encode filenames with spaces; (3) switch from import/url to import/s3 + fix CLOUDFRONT_URL env var name + remove acl:'private'.
- **Emergency Broadcast Override** (Phase 4 #10): fully implemented.
  - admin.html: red "Broadcast" button in Screens page header (admin-only). `#broadcastModal` with message textarea, 5 color swatches (red/orange/yellow/black/white), auto-dismiss selector (never/30s/1m/5m/10m). Active broadcast shows a pulsing banner under the Screens header with message preview and a "Clear" button. Writes to `broadcasts/{orgId}` Firestore doc `{active, message, color, autoDismiss, createdAt, createdBy}`. `_subscribeBroadcast()` listens on that doc and updates the banner in real time. Wired into `initUserAndOrg` so it starts after org is known.
  - display.html: `#stageBroadcast` overlay div, `z-index: 200` (above `#stageClosed` at 100 and the ticker). CSS: full-screen, flex-column, large ⚠ icon + message text. `_subscribeBroadcast(orgId)` called on first screen snapshot — `onSnapshot(doc(db,'broadcasts',orgId))` shows/hides the overlay, applies background color (auto light/dark text), starts auto-dismiss `setTimeout`. Error handler is a no-op so unauthenticated display ignores permission errors.
  - **Firestore rule required:** `match /broadcasts/{orgId} { allow read: if true; allow write: if request.auth != null; }` — user confirmed added to Firebase console.
- **PowerPoint Integration** (Phase 4 #4): server-side conversion via CloudConvert API v2.
  - admin.html: "PowerPoint" button added to Add Media modal "Other sources" row. Hidden `#pptxFileInput` (accept `.pptx`). `isPptx` branch in `handleFiles`. `handlePptxFile()`: uploads PPTX to S3 (progress 0–30%), POSTs to `/api/import-pptx` to start a CloudConvert job, polls GET `/api/import-pptx?jobId=...` every 2 s (progress 32–90%), creates a Slide Group from returned CloudFront URLs.
  - api/import-pptx.js (new): POST creates a CloudConvert job with 3 tasks — `import/url` from CloudFront → `convert` (LibreOffice, output PNG) → `export/s3` direct to S3 with `pptx-imports/{orgId}/{batchId}/{{filename}}` key. GET polls job status; on finish reads `export-to-s3` task result files, sorts numerically, returns CloudFront URLs.
  - **Requires:** `CLOUDCONVERT_API_KEY` Vercel env var. Get a free API key at cloudconvert.com (250 free conversion minutes/month on free plan). Sandbox keys work for testing.
- **Emergency Broadcast Override** (Phase 4 #10): fully implemented.
  - admin.html: red "Broadcast" button in Screens page header (admin-only). `#broadcastModal` with message textarea, 5 color swatches (red/orange/yellow/black/white), and auto-dismiss selector (never/30s/1m/5m/10m). Active broadcast shows a pulsing banner under the Screens header with message preview and a "Clear" button. Writes to `broadcasts/{orgId}` Firestore doc `{active, message, color, autoDismiss, createdAt, createdBy}`. `_subscribeBroadcast()` listens on that doc and updates the banner in real time. Wired into `initUserAndOrg` so it starts after org is known.
  - display.html: `#stageBroadcast` overlay div, `z-index: 200` (above `#stageClosed` at 100 and the ticker). CSS: full-screen, flex-column, large ⚠ icon + message text. `_subscribeBroadcast(orgId)` called on first screen snapshot — `onSnapshot(doc(db,'broadcasts',orgId))` shows/hides the overlay, applies background color (auto light/dark text), starts auto-dismiss `setTimeout`. Error handler is a no-op so unauthenticated display ignores permission errors.
  - **Firestore rule required:** add `match /broadcasts/{orgId} { allow read: if true; }` in Firebase console so unauthenticated displays can read broadcast docs.
- **Canva integration** (Phase 4 #5): "Canva" button added to Add Media modal's Upload From grid. Lazy-loads Canva Button SDK v2. `importFromCanva()` opens design picker → on publish fetches export PNG → uploads to S3 via `s3UploadBlob` → adds as image slide. `CANVA_API_KEY` constant in admin.html; register `app.zigns.io` in Canva developer portal.
- **Proof of play** already fully implemented (slide_view events + analytics dashboard) — marked done.
- **Google Sheets widget** (Phase 4 #9): new `api/sheets-proxy.js` proxies Google Sheets v4 API (requires `GOOGLE_SHEETS_API_KEY` env var). New `googlesheets` slide type in admin (app card + modal) and display (`stageSheets`, `renderGoogleSheet`, `_mzRenderGoogleSheet`). Supports table and big-number display styles, configurable refresh interval, dark/light theme. Works as standalone slide and as a multizone zone.

---

## 2026-04-16 — Claude
- **Multizone black bars fixed**: switched widget zone scaling from `Math.min` (fit/letterbox) to `Math.max` (cover/fill) in `display.html:775`. Eliminates top/bottom black bars in left-right split layouts.
- **Offline media caching** (Phase 4 #2): created `display-sw.js` — dedicated service worker for `display.html` that caches the display shell (network-first) and all CloudFront media assets (`*.cloudfront.net`, cache-first). Registered via inline `<script>` at bottom of `display.html`. Also wired `window.online/offline` browser events to the existing `setOffline()` indicator. Slideshow JSON was already cached in localStorage; this adds the missing media layer so slides play fully offline.
- **ROADMAP updated**: added PowerPoint integration entry (#4); marked multi-zone and offline caching as shipped.

---

## 2026-04-15 (cont.) — Claude
- **Multi-zone widget rendering bugs fixed** (follow-up to Phase 4 #1).
  - display.html `_mzRenderCountdown`: replaced all CSS class-based sizing (`#stageCountdown .cd-*` rules don't apply inside `.mz-zone-inner`) with inline styles — `12vw` digit, `1.6vw` unit label, flex layout on container. Countdown now renders at correct size in zones.
  - display.html `_mzRenderWeather`: pre-set background/color synchronously before async fetch so loading and error states are visible (was black-on-black before fix).
  - display.html weather caching (both standalone and multizone): errors now cached client-side with 10-min TTL — on 429 or any fetch failure, subsequent slide loops show cached error immediately without hitting the API. Stops the rate-limit spiral where every loop retried the blocked key. Added AbortController 15s timeout and surfaced error message text in zone UI.
  - **Note:** OpenWeather API key hit rate limit during testing — will self-clear within 1-2 hours. Verify via `/api/weather?location=Chicago,IL&units=imperial`.

---

## 2026-04-15 (cont.) — Claude
- **Phase 4 #1 Multi-Zone Layout** implemented (competitive parity — present in 6/6 competitors).
  - admin.html: new `multizone` slide type; `MZ_PRESETS` defines 6 layouts (Main+Sidebar 70/30, Split 50/50, Main+Bottom Bar, Header+Main, 4-Up Grid, Content+Panel 60/40); modal uses same two-column dark-left design as weather modal; layout picker renders SVG rect thumbnails; per-zone content type selector (image/video/youtube/clock/weather/qr/countdown/webpage) with type-specific config fields; zone state preserved when switching types; `openMultiZoneModal(editIdx)` handles both add and edit; slide card shows "Zones" badge + layout SVG thumbnail.
  - display.html: `#stageMultizone` stage (z-index 9); `renderMultizone(slide)` creates absolutely-positioned `.mz-zone` divs per zone; media zones (image/video/youtube/webpage) use native fill; widget zones (clock/weather/qr/countdown) render into a 1920×1080 inner div scaled via `transform: scale()` to fit the zone; `mzTimers[]` tracks all zone intervals, `stopMultizone()` clears them on slide change; `applyPlaylist` filter extended to include multizone type.
- **Competitive gap analysis** added to ROADMAP.md as Phase 4 (10 items, priorities based on live competitor research across Yodeck, ScreenCloud, Rise Vision, OptiSigns, Screenly, TelemetryTV). Phases 1–3 archived as completed.

## 2026-04-15 (cont.) — Claude
- **Phase 3 #10 Media Expiration Dates** implemented and tested end-to-end. Roadmap complete.
  - admin.html: per-slide calendar icon on slide/group cards opens `#expirationModal` (datetime-local input + Save/Remove); stores ISO string on `slide.expiresAt`. `expirationBadgeHtml` renders red "Expired" or amber "Expires in Nd" badges (`EXPIRING_SOON_MS = 3 days`). Calendar button turns amber when a date is set.
  - display.html: `applyPlaylist` filters slides (and group children) where `expiresAt <= now`. `advance()` re-checks mid-playback so a slide that expires while playing is skipped on next tick.

## 2026-04-15 (cont.) — Claude
- **Phase 3 #9 PDF Display** implemented and tested end-to-end (client-side conversion path).
  - admin.html: `fileInput` accepts PDFs; `handleFiles` branches to `handlePdfFile`, which lazy-loads pdf.js (jsdelivr CDN v4.7.76), renders each page to a 1920px-wide canvas, uploads each as a PNG via `s3UploadBlob`, and pushes a Slide Group (one image slide per page). Zero display.html / backend changes — pages flow through the existing image pipeline.
- display.html: added `<link rel="icon" href="/favicon.svg">` to stop browsers auto-probing `/favicon.ico` (404 noise).

## 2026-04-15 (cont.) — Claude
- **Phase 3 #8 Per-Screen Timezone** implemented and tested end-to-end. Set screen tz to London, confirmed clock, schedule eval, and working hours all respect it.
  - admin.html: IANA timezone dropdown added to the screen edit panel (same options as clock widget); loaded/saved on `screen.timezone`
  - display.html: new `_tzNow()` helper derives `{dow, mins}` in the screen's tz via `Intl.DateTimeFormat`; reused by `_schedGetTarget` and `_whIsOpen`. `renderClockEl` falls back: slide tz → screen tz → device local
  - Bug fixed: initial declaration of `screenTimezone` was in an inner scope — `renderClockEl` couldn't see it, threw ReferenceError. Hoisted to module scope alongside `activeSlideshowId`.

## 2026-04-15 (cont.) — Claude
- **Phase 2 #7 Countdown Timer** implemented and tested end-to-end.
  - admin.html: activated the Apps "Countdown Timer" card (was Coming Soon); added `#countdownModal` (label, target datetime, units d/h/m/s selector, end message, theme, accent color, dwell); slide-card thumb/badge/edit; `openCountdownModal`/`saveCountdownSlide`
  - display.html: `#stageCountdown` with `vw`-scaled typography; `renderCountdown` ticks every 1s (or 30s when seconds aren't shown); swaps to end-message text at zero; wired into `_hideAllStages`, `crossfadeTo`, and playlist filter

- **Phase 2 #6 Working Hours** implemented and tested end-to-end.
  - admin.html: Working Hours section in screen edit panel (enable toggle, start/end time, day pickers using Mon=0 convention); load/save to `screen.workingHours`
  - display.html: `#stageClosed` full-screen overlay (z-index 100); `_whIsOpen` with wrap-past-midnight support; minute tick; guards in screen snapshot and `_schedApply` to halt playback while closed and resume on open transition

## 2026-04-15 — Claude
- **#4 Online/Offline Email Notifications** tested end-to-end. Vercel Hobby plan only allows daily crons, so we're driving `/api/screen-monitor` from cron-job.org every 5 min.
  - api/screen-monitor.js: added `CRON_SECRET` Bearer check, then added `?secret=` query-param fallback since cron-job.org's Authorization header didn't reach the handler on first attempt (401)
  - vercel.json: removed the Vercel cron entry (not used)
  - cron-job.org URL: `https://app.zigns.io/api/screen-monitor?secret=...`, GET, every 5 min
  - First test run: 200 OK, 11 screens checked, 5 flipped to offline with notifications delivered (expected one-time cold-start noise since `onlineStatus` was undefined on every screen)

## 2026-04-14 (cont.) — Claude
- **#3 Weather Widget** — added client + server caching to stop 429 rate-limit blocks:
  - display.html: 30-min in-memory cache keyed by `location|units`; playlist loops no longer re-fetch on every weather slide
  - api/weather.js: bumped Vercel CDN cache from `s-maxage=600` → `1800`
- **#1 Schedule Display-Side Enforcement** tested end-to-end. Three bugs found and fixed:
  - display.html subscribeToSlideshow: added stale-callback guard (`if (activeSlideshowId !== slideshowId) return`) so a late-firing snapshot from a previously-cancelled listener can't stomp the current show after a schedule switch
  - display.html _schedGetTarget: day-of-week mismatch — admin day buttons use Mon=0…Sun=6 (per DAY_LABELS), but JS `getDay()` is Sun=0…Sat=6. Fixed with `(getDay() + 6) % 7` conversion
  - Firestore security rules: added `organizations/{orgId}/schedules/{schedId}` with `allow read: if true` so the unauthenticated display can read the schedule doc
  - admin.html loadSchedulesFromOrg: the built-in `sched-demo` schedule lived only in memory. Users could assign it to a screen, but the Firestore doc didn't exist, so display silently fell back to baseShowId. Now seeds the demo to Firestore if the org has no schedules yet.

## 2026-04-14 — Claude
Working down the Phase 1 roadmap testing list.
- **#5 RSS Ticker** tested end-to-end. Fixed three bugs:
  - display.html: animation wasn't resetting cleanly on content change (glitch)
  - display.html: ticker was being hidden/re-fetched on every designed-slide load, causing a flash every 5–10s on loop. Added per-URL cache + skip-if-already-running guard
  - api/rss-proxy.js: capped at 8 headlines (was 20) so full-cycle scroll time stays reasonable
  - Bumped speed constants: slow 80→120, medium 160→250, fast 280→420 px/sec
- **#2 QR Code** previously tested ✓
- **#3 Weather Widget** partially tested:
  - admin.html saveWeatherSlide: fixed silent-failure bugs (captured editIdx before close; try/catch around save; empty-targetShowId guard; _populateShowSelect length check)
  - display.html applyPlaylist: widened filter to include `weather` and `youtube` types (were being silently dropped from the playlist, causing "No active slides")
  - **Blocked on OPENWEATHER_API_KEY activation** — user added the key but API was returning 401. New OpenWeatherMap keys can take up to 2 hours to activate. Verify redeploy happened after adding the env var.
- **Next up:** #1 Schedule Display-Side Enforcement. Schedule reader logic already exists in display.html around line 972–1036 — test by creating a schedule, assigning it to a screen, and verifying slideshow switches at block boundaries.

## 2026-04-08 — Claude
- Migrated all media storage from Cloudinary to AWS S3 (us-east-2, bucket: zigns-media) + CloudFront
  - Created api/upload-url.js: presigned PUT URL generator (15 min expiry, checksum disabled, path-style URLs)
  - Created lib/s3-upload.js: browser utility (s3Upload, s3UploadBlob, s3UploadWithProgress with real XHR progress)
  - Replaced 8 Cloudinary upload sites in admin.html: local file drop, Google Drive, OneDrive, designer image, designer bg, version thumbnail, slide thumbnail, brand kit logo
- Fixed OneDrive picker v8 command flow (multiple rounds):
  - Picker sends {type:'command'} not 'result' — added acknowledge response
  - Items in command flow have no @microsoft.graph.downloadUrl — resolved via Graph API /content endpoint with MSAL ssoSilent token (uses existing Microsoft browser session, no popup needed)
- Fixed Google Drive OAuth: updated Authorized JavaScript Origins in Google Cloud Console to include app.zigns.io
- S3 CORS policy required AllowedHeaders:["*"] to pass preflight (SDK was adding extra headers)
- Root cause of all S3 failures: AWS_S3_BUCKET env var was set on zigns-website Vercel project, not digital-signage

## 2026-04-07 — Gemini
- Moved live URL to https://app.zigns.io (custom subdomain, replacing digital-signage-pi.vercel.app)
- Updated hardcoded URLs in admin.html, display.html, api/send-invite.js, api/stripe-checkout.js, api/stripe-portal.js, api/stripe-webhook.js
- Vercel: added app.zigns.io as custom domain
- Namecheap: created CNAME record for `app` pointing to cname.vercel-dns.com
- Firebase: added app.zigns.io to Authorized Domains in Auth settings

## 2026-04-06 — Claude
- Toolbar: removed three-dot overflow menu and dropdown entirely
- Toolbar: increased icon sizes from 14px to 18px (Add Media, Design a Slide, Create Group, Clear All)
- Clear All button now always visible in toolbar (was hidden on mobile behind overflow)

## 2026-04-06 — Claude
- display.html: added ?reset URL param — clears localStorage screenId and shows pairing screen (no console access needed)

## 2026-04-05 — Claude
- Redesigned screen pairing to display-initiated flow
  - display.html auto-generates 6-char code, writes to Firestore pairingCodes/{code} as pending, polls every 3s
  - On claim, fades out and starts playback using screenId written by admin
- admin.html Add Screen modal: replaced code-generator UI with code-entry input field
  - Admin types code shown on display → looks up Firestore doc → creates screen doc → sets status: paired + screenId
- display.html pairing screen HTML: updated to Zigns-branded "Ready to Connect" design

## 2026-04-04 — Claude
- display.html: updated pairing screen CSS to "Ready to Connect" dark design
  - Zigns logo mark + wordmark, large animated pulsing code block, instruction text, URL footer

## 2026-04-03 — Claude
- Toolbar redesign: replaced individual buttons with single "+ Add Media" button
- Add Media modal: 4-up cloud source grid (Cloudinary, OneDrive, Google Drive, Dropbox) + row buttons for YouTube/Web Page/URL
- Mobile overflow menu added for Design a Slide, Create Group, Clear All (later removed 2026-04-06)

## 2026-04-03 — Claude
- Rebranded app from "Signage" to "Zigns"
  - Title, manifest.json name/short_name, theme_color updated to #0043ce
  - Added .zigns-mark (black border box in light mode, accent in dark) + .zigns-wordmark CSS components
  - Accent color updated to #0043ce (navy blue)

## 2026-04-02 — Claude
- Google Drive: replaced Google Picker SDK with custom full-browser modal
  - Three tabs: My Drive, Shared with me, Shared drives
  - Breadcrumb navigation, folder/file grid, thumbnails
  - Downloads via Drive API v3 /files/{id}?alt=media with Bearer token, uploads to Cloudinary
- Google Drive picker fix: was only showing Images tab (DocsView with setIncludeFolders fixes it)

## 2026-04-01 — Claude
- OneDrive picker: reverted from custom Graph API browser to native v8 postMessage picker
- Fixed picker timeout: origin filter was too strict (only onedrive.live.com); expanded to all MS subdomains
- Fixed picker not returning files: personal OneDrive uses MessagePort (msg.replyTo), not window.postMessage
- Fixed auth stall: removed authentication:{} and MSAL token entirely — personal OneDrive uses browser session cookies; items include pre-signed downloadUrl
