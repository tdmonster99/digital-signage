# Zigns Development Roadmap

---

## Phase 4 — Competitive Parity (Current Focus)

Gap analysis against Yodeck, ScreenCloud, Rise Vision, OptiSigns, Screenly, and TelemetryTV (April 2026). Items ordered by priority: table-stakes gaps first, then high-value differentiators.

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
**Status:** Initial implementation 2026-04-19. The existing designer template gallery now also works as a Content Templates Library with a Templates toolbar entry, category filters, high-quality preview, and "Use Template" insertion into the current slideshow draft. Catalog expansion remains.
**What to build:**
- Keep the static template catalog inside `admin.html` per the no-split frontend rule; each template generates a designed-slide payload matching the existing slide schema.
- Template gallery modal in admin: filter by category (Restaurant, Retail, Office, Event, Holiday), click to preview, "Use Template" inserts slides into the current slideshow.
- Expand the initial set from the current 19 designed templates to 40–60 templates covering primary verticals; thumbnails generated from designed slides.

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
**What to build:**
- Add `approvalRequired: boolean` setting to org (Admin toggles in Settings)
- When enabled: Editor's Publish button changes to "Submit for Review" → sets slideshow to `status: 'pending_review'`
- Admin sees a "Pending Review" badge on slideshows and a review queue in the Slideshows page
- Admin can Approve (publishes immediately) or Reject (returns to draft with optional comment)
- Email notification via Resend on both submit and approval/rejection

**Files:** `admin.html`, `api/send-invite.js` (or new `api/send-notification.js`)

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
| 11 | Content approval workflow | Medium | Medium | 4/6 |

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
