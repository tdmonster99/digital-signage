# Zigns Dev Log

Running log of changes by session. Append a new entry at the top after each session.

---

## 2026-04-15 (cont.) — Claude
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
