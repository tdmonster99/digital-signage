# Zigns Dev Log

Running log of changes by session. Append a new entry at the top after each session.

---

## 2026-04-26 — Claude Code (session 40) — Critical bug fixes from code-review audit

Five high-priority issues from the bug audit fixed in priority order:

- **#10/#26 — `javascript:` URL XSS via webpage slide (Critical)**:
  - `admin.html` `saveWebpageSlide()`: now rejects any URL whose protocol is not `http:` or `https:` after `new URL()` parse.
  - `admin.html` `_mzSaveZoneState()`: webpage zones with non-http(s) URLs are blanked out before save.
  - `display.html`: added `safeIframeUrl()` helper. Both `iframeWebpage.src` (single-zone) and the multizone webpage iframe `ifr.src` now route through it. Anything other than http/https resolves to `about:blank`. Defense-in-depth — even if a malicious slide is in Firestore from before this fix, the display refuses to load it.

- **#11 — `acceptInvitation` email mismatch (Critical)**:
  - `admin.html` now compares `inv.email.toLowerCase() === user.email.toLowerCase()` before adding the user to the org. On mismatch: toast a clear error, sign the user out so they can re-auth with the correct account. Closes the invite-link-sharing hole.

- **#17 — `initUserAndOrg` silent org-loss on transient errors (Critical)**:
  - `admin.html`: split the user-doc fetch and org-doc fetch into separate try/catch blocks. A transient Firestore error during boot no longer falls through to `createOrg()` (which would orphan the user from their real org). Instead, a new `showBootError()` overlay appears with a Reload button. Auto-create only happens on the legitimate "user doc does not exist" path.

- **#1 — `mobile.html` listener leak when leaving Content tab (High)**:
  - `mobile.html` `switchTab()`: now calls `closeShowDetail(true)` at the top, regardless of which tab is being entered. Prevents the slideshow `onSnapshot` listener from leaking when a user opens a slideshow and then switches to Screens or Account.

- **#2 — `mobile.html` `appendDraft` lost-write race (High)**:
  - `mobile.html`: imported `runTransaction`. `appendDraft()` now wraps the read-modify-write in a Firestore transaction, so two rapid uploads from mobile (or a mobile upload concurrent with an admin edit) no longer silently lose slides.

---

## 2026-04-25 — Claude Code (session 39)

- **screen-monitor.js: parallelized Firestore reads to eliminate duplicate org fetches**:
  - All org docs now fetched once per run in a single `Promise.all()` batch and stored in `orgMap`
  - `orgMap` passed into `enforceAllScreenLimits()` and `notifyOrg()` — neither function re-reads org docs
  - User docs in `notifyOrg()` fetched in parallel; notification+write pairs are now concurrent
  - Reduces latency for cron runs with many screens across many orgs

---

## 2026-04-25 — Claude Code (session 38)

- **Rate limiting for AI generation — full stack implementation**:
  - `api/_lib/firebase-admin.js` (new): shared Firebase Admin SDK initializer; parses `FIREBASE_SERVICE_ACCOUNT_JSON` env var and exports a singleton `adminApp` + `getAdminDb()` helper so all API routes share one initialization.
  - `api/ai-generate.js`: now requires an `Authorization: Bearer <firebase-id-token>` header. Verifies the token with Firebase Admin, then enforces a **50 AI generations per user per day** rate limit via the `rateLimits/{uid}` Firestore collection (resets at UTC midnight). Returns `401` for missing/invalid token and `429` with a `retryAfter` field when the limit is exceeded.
  - `admin.html` — `generateAiSlide()`: fetches the current user's Firebase ID token via `currentUser.getIdToken()` and sends it as the Authorization header. Added a null-`currentUser` guard that shows a toast and aborts early if called while logged out.
  - No new environment variables — uses the existing `FIREBASE_SERVICE_ACCOUNT_JSON` and `ANTHROPIC_API_KEY`.

---

## 2026-04-25 — Session 37

- **`api/screen-monitor.js`**: Added `enforceAllScreenLimits()`. On every cron run, screens are now grouped by org, each org's `subscription.screensAllowed` is read from Firestore, and overflow screens (newest-first) are suspended/unsuspended automatically. Previously this only happened when an admin visited the dashboard (`enforceScreenLimit()` in `admin.html`). No new API function added — runs inside the existing cron endpoint.

---

## 2026-04-23 — Claude (session 36)
- **14-day trial + automatic downgrade (Phase 4 #12)**: added opt-in trial flow that rides on Stripe's native trial machinery, with admin UI and display-side enforcement when plans drop below the paired screen count.
  - `api/stripe-sessions.js`: checkout now accepts `trial: true` and passes `trial_period_days: 14` with `trial_settings.end_behavior.missing_payment_method: 'cancel'`. Adds `trial=1` to the success URL so the UI can show a trial-specific toast.
  - `api/stripe-webhook.js`: `checkout.session.completed` and `customer.subscription.updated` now capture `status: 'trialing'`, `trialStartedAt`, `trialEndsAt`, and `currentPeriodEnd` from Stripe. `customer.subscription.deleted` clears the trial fields.
  - `admin.html`: added "Start 14-day free trial" link under each paid-tier upgrade button when the org is on Free. `startCheckout()` forwards the trial flag. New trial banner in the billing sub-view with days-remaining countdown. Plan badge gets a `trialing` suffix label. Settings hub `shPlanStatus` now shows "Premium trial · 10d left" when trialing.
  - `admin.html`: `enforceScreenLimit()` runs on every screens listener update and marks overflow screens (sorted by registration order, newest first) with `suspended: true`. Idempotent write — skips when the doc already matches.
  - `display.html`: new `#stageSuspended` overlay ("Subscription limit reached") shows when the screen's own doc has `suspended: true`; pauses the slideshow timer and hides on un-suspend.
  - No environment variables or external setup changes.

---

## 2026-04-21 — Codex (session 35)
- **Roadmap update**: added the 14-day trial and automatic downgrade flow to Phase 4 so the billing work is tracked alongside the rest of the product roadmap.
  - `ROADMAP.md`: inserted a new Phase 4 item for trialing paid tiers, automatic downgrade back to Starter/Free with one screen, and the supporting backend/UI pieces.
  - No environment variables or external setup changes.

## 2026-04-21 — Codex (session 34)
- **Widget icon second pass**: tightened the remaining generic app badges so the catalog feels more like a colorful app library than a row of placeholder glyphs.
  - `admin.html`: rebuilt the QR Code badge into a fuller QR-style mark with stronger finder blocks and a clearer code matrix.
  - `admin.html`: refreshed the remaining generic widget badges for RSS Ticker, Web Page, Menu Board, WiFi Password, and Stock Ticker so each one reads as a distinct, colorful mini-logo at gallery size.
  - `admin.html`: verified the updated Apps grid in a temporary local bypass preview render, including a taller viewport pass to spot-check the lower widget row.
  - `admin.html`: deployed the refreshed icon set to production and updated `app.zigns.io`.
  - No environment variables or external setup changes.

## 2026-04-21 — Codex (session 33)
- **Apps icon refresh**: updated the app catalog badges to feel more like Yodeck-style colorful app logos.
  - `admin.html`: increased the icon badge size, switched the badges to rounded-square containers, and added stronger shadows/borders so the catalog reads less like pale placeholder bubbles.
  - `admin.html`: replaced the most important brand tiles with more recognizable marks and colors, including YouTube, Instagram, Google Sheets, Google Slides, Google Reviews, and the remaining widget icons.
  - `admin.html`: deployed the updated catalog to production and visually checked the rendered Apps grid through a temporary local bypass copy because the production route still redirects to sign-in for anonymous sessions.
  - No environment variables or external setup changes.

## 2026-04-21 — Codex (session 32)
- **Template-richness follow-up**: turned the most sparse office/wayfinding templates into more image-led compositions and invalidated stale thumbnail cache data.
  - `admin.html`: added a reusable inset-photo helper and used it to give list, directory, split-welcome, and QR templates real photo panels instead of relying only on full-canvas backgrounds.
  - `admin.html`: switched `teammeeting` and `weeklyreminders` to split layouts with dedicated image tiles so the office boards feel more intentional and less flat.
  - `admin.html`: tightened text bounds on the metrics and directory renderers so long labels have more breathing room.
  - `admin.html`: bumped the thumbnail cache key to `zigns-template-thumbs-v2026-04-21-richer` so the gallery will regenerate with the updated template visuals.
  - No environment variables or external setup changes.

---

## 2026-04-21 — Codex (session 31)
- **Template polish pass**: fixed the broken extra-template layouts and made the new templates feel more photo-led.
  - `admin.html`: tightened the announcement, list, metrics, directory, warning, QR, and split-welcome renderers so long titles and body copy fit safely instead of clipping.
  - `admin.html`: switched several template backgrounds to Pexels-hosted images and made the preview/prefetch pipeline understand direct image URLs.
  - `.impeccable.md`: added persistent design context focused on legibility, safe margins, and photo-driven signage layouts.
  - No environment variables or external setup changes.

## 2026-04-21 — Codex (session 30)
- **Template gallery first-paint fix**: removed the blocking wait on extra template photo prefetch so the gallery can render immediately on open.
  - `admin.html`: `renderExtraTemplateGalleryCards()` now kicks off `prefetchTmplPhotoUrls()` in the background instead of awaiting it before inserting the extra template cards.
  - No environment variables or external setup changes.

## 2026-04-21 — Codex (session 29)
- **Cross-chat handoff context**: added a dedicated handoff snapshot so a new chat can resume immediately with current roadmap and implementation state.
  - `NEXT_CHAT_CONTEXT.md`: added current Phase 4 status, latest relevant commits, summary of recent preview/template performance work, and recommended next steps.
  - No environment variables or external setup changes.

---

## 2026-04-21 — Codex (session 28)
- **Template library load-time optimization**: reduced the generic-placeholder window and made template previews appear faster/more consistently.
  - `admin.html`: added background thumbnail warmup scheduling (after auth init and when opening Design a Slide) so previews start rendering before the user scrolls the gallery.
  - `admin.html`: switched template photo URL hydration from Unsplash metadata API round-trips to direct Unsplash image URLs, plus lightweight image preloading for top photo assets.
  - `admin.html`: added localStorage-backed template thumbnail cache (`zigns-template-thumbs-v2026-04-21`) so previously rendered previews load immediately on subsequent visits/reloads.
  - `admin.html`: prioritized thumbnail generation by currently visible gallery cards first, then remaining templates.
  - No new environment variables or external setup required.

---

## 2026-04-20 — Codex (session 27)
- **Dashboard preview fallback UX**: added a visible status pill on Live Preview so loading and failure states are obvious without scrolling or guesswork.
  - `admin.html`: added `#previewStatus` overlay in the Live Preview frame with state styles for loading, ready, and error.
  - `admin.html`: enhanced preview iframe logic with load/error listeners and state inspection of `display.html` (`#loader` / `#errBox`) so invalid slideshow or connection issues show a clear message.
  - No new environment variables or external setup required.

---

## 2026-04-20 — Codex (session 26)
- **Dashboard live preview fix**: fixed a blank/black preview regression when org slideshow IDs are not `main`.
  - `admin.html`: hardened `syncPreviewSelect()` so it always keeps a valid selected slideshow ID (preserving current selection when possible, otherwise falling back to the active show or first available show).
  - `admin.html`: updated preview iframe refresh logic to load `display.html?slideshow=<valid-id>` whenever the selected show changes or the iframe source is stale, and fall back to `about:blank` only when no shows exist.
  - No new environment variables or external setup required.

---

## 2026-04-20 — Codex (session 25)
- **Template library photo-led refinement**: pushed the template gallery further toward Yodeck-style photography and richer visual composition.
  - `admin.html`: added a shared template photo map, upgraded the reusable slide renderers to accept photo backdrops, and converted more of the built-in templates and extra catalog templates into image-led compositions.
  - `admin.html`: updated the gallery preview markup to wait for photo URLs and render real image-backed thumbnails for the photo-led templates instead of purely shape-based placeholders.
  - `ROADMAP.md`: clarified that the Content Templates Library is now in a quality pass focused on more photo-rich layouts.

## 2026-04-20 — Codex (session 24)
- **Template library expansion**: expanded the Design a Slide gallery into a much larger 46-template catalog inspired by the Yodeck reference PDF.
  - `admin.html`: added office, safety, wayfinding, education, events, and retail template families; wired the new cards into the gallery with new category filters and dynamic thumbnail rendering.
  - Verified the embedded app script parses cleanly after the template helper and renderer additions.
  - `ROADMAP.md`: updated the Content Templates Library status to reflect the expanded catalog and new category coverage.

---

## 2026-04-20 — Codex (session 23)
- **Legal copy cleanup**: removed Yodeck-style template residue from the app Terms of Service and aligned the wording with Zigns terminology.
  - `terms.html`: replaced `Authorized User` language with plain `User` wording and changed the user-limit clause to match the app's plan-based team member limits.
  - Verified the app legal pages contain no direct `Yodeck` references or leftover `Authorized User` phrases.

---

## 2026-04-20 — Codex (session 22)
- **Plan feature entitlements**: wired the pricing tiers to actual app behavior in `admin.html`.
  - Added a central `PLAN_FEATURES` map plus `hasFeature` / `guardFeature` helpers for Starter, Standard, Premium, Early Adopter, and Enterprise.
  - Gated paid surfaces with upgrade prompts: Schedules, Analytics, Brand Kit, Content Approval, advanced app modals, and premium template use.
  - Added visual locked states for unavailable app cards, template cards, and gated settings rows while preserving existing screen/user limit checks.

---

## 2026-04-20 — Codex (session 21)
- **Pricing structure update**: aligned app billing and marketing pricing tiers with Starter, Standard, Premium, Early Adopter, and Enterprise interest paths.
  - `admin.html`: updated the billing comparison table, plan labels, plan limits, and upgrade actions while keeping legacy `starter`/`pro` subscription keys compatible.
  - `api/stripe-sessions.js` and `api/stripe-webhook.js`: added Standard/Premium/Early Adopter plan aliases, per-screen checkout quantities, and webhook mapping for the new public tier names.
  - `D:\Dev\zigns\site`: updated `pricing.html`, `style.css`, and `api/checkout.js` so the marketing page shows the new tiers and Enterprise sales interest CTA.

---

## 2026-04-20 — Codex (session 20)
- **YouTube display timing fix**: fixed per-slide dwell values being treated as milliseconds on `display.html`.
  - `display.html`: added display-side dwell normalization so YouTube and widget slides saved with `dwell: 30` now stay up for 30 seconds instead of rapidly reloading the iframe.

---

## 2026-04-19 — Codex (session 19)
- **Content approval workflow**: added an org-level review gate for editor publishing.
  - `admin.html`: added the Content Approval setting, editor Submit Review behavior, Pending Review slideshow badges, admin review queue, approve/reject actions, and review status banners.
  - `api/send-invite.js`: reused the existing Resend function for approval submitted/approved/rejected notification emails without adding a new Vercel function.
  - `ROADMAP.md`: marked Content Approval Workflow implemented.

---

## 2026-04-19 — Codex (session 18)
- **Apps page ordering**: organized app cards so available integrations appear before Coming Soon items.
  - `admin.html`: added grid ordering for active cards and `.app-coming-soon` cards, preserving existing filters and card design.

---

## 2026-04-19 — Codex (session 17)
- **YouTube app activation**: promoted YouTube from a Coming Soon app tile to a working slideshow app.
  - `admin.html`: wired the Apps YouTube card into the existing YouTube slide flow, added add/edit modal support with slideshow targeting, duration, and thumbnail preview, and added slide-card editing for YouTube slides.

---

## 2026-04-19 — Codex (session 16)
- **YouTube display fallback**: hardened YouTube media slides so they do not render as a silent blank screen.
  - `admin.html`: improved YouTube URL parsing, saved the original URL alongside the parsed video ID, and made thumbnails work from either saved shape.
  - `display.html`: normalized YouTube slides from `videoId`, legacy `youtubeId`, or URL, switched embeds to `youtube-nocookie.com`, and added a visible loading/error fallback.

---

## 2026-04-19 — Codex (session 15)
- **Apps duplicate cleanup**: removed the obsolete Google Sheets Coming Soon card so the Apps page only shows the active Google Sheets integration.
  - `admin.html`: kept the working Google Sheets card that opens `openGoogleSheetsModal(null)`.

---

## 2026-04-19 — Codex (session 14)
- **Screen notification opt-out clarity**: made screen status emails point directly to notification preferences.
  - `api/screen-monitor.js`: added a "Manage notification settings" button and footer opt-out link to screen offline/online emails.
  - `admin.html`: added `admin.html?profile=notifications` deep-link handling so notification emails open the My Profile → Notifications tab directly.

---

## 2026-04-19 — Codex (session 13)
- **AI slide generation paused in UI**: removed the active AI generation entry points while keeping the dormant implementation in place for a future return.
  - `admin.html`: changed the AI Create template-gallery card to a Coming Soon tile.
  - `admin.html`: removed the AI Generate button from the slide designer toolbar so users cannot open the generation modal from the designer.
  - `admin.html`: changed `openAiModal()` to a Coming Soon guard to prevent any stale caller from opening the generator.

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
