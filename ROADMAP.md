# Zigns Development Roadmap

Prioritized based on feature audit (2026-04-12). Focused on SMB target market: restaurants, retail, offices.

---

## Phase 1 — Core Gaps (High Impact, Low-Medium Effort)

These fix existing infrastructure that is built but not wired up, or add small widgets with outsized customer value.

### 1. Schedule Display-Side Enforcement
**Why:** The full schedule editor exists in `admin.html` and saves to Firestore. `display.html` never reads it — screens just loop their assigned slideshow regardless of schedule. This is the highest-leverage fix in the codebase.
**What to build:**
- Read `screen.scheduleId` in `display.html` on load
- Fetch the schedule doc from Firestore
- At each minute boundary, check which time block is active and switch the playing slideshow accordingly
- Handle day-of-week and recurrence rules already stored in the schedule data model

**Files:** `display.html`

---

### 2. QR Code Widget
**Why:** Extremely high demand in restaurants (table ordering, WiFi password), retail (product pages, loyalty programs), and offices (meeting room booking, surveys). Small library, fast to build.
**What to build:**
- Add QR code slide type using `qrcode.js` (~3 KB)
- Admin modal: URL input, size, foreground/background color, optional label text
- `display.html`: render QR as canvas or SVG element on screen

**Files:** `admin.html`, `display.html`

---

### 3. Weather Widget
**Why:** Standard expectation for any digital signage platform. High value in retail lobbies, waiting rooms, hospitality.
**What to build:**
- Admin modal: city/zip input, unit (°F/°C), display style (current only vs. 3-day forecast), theme
- Backend proxy route `/api/weather` — fetches from OpenWeatherMap free tier, returns sanitized JSON
- `display.html`: weather slide type renders icon, temperature, condition, location label

**Files:** `admin.html`, `display.html`, `api/weather.js`

---

### 4. Online/Offline Email Notifications
**Why:** Operators of unattended screens (restaurants, retail) need to know when a screen goes dark. The preference UI and Firestore storage are already done — only the delivery is missing.
**What to build:**
- Vercel cron job (`/api/screen-monitor`) runs every 5 minutes
- Reads all screens where `lastSeen` is older than threshold (e.g. 10 min)
- If screen transitions to offline and `notifOffline` is true, send email via Resend (already integrated)
- Track `lastNotifiedAt` on the screen doc to avoid repeated alerts
- Same logic for online recovery notification

**Files:** `api/screen-monitor.js`, `vercel.json` (cron config)

---

### 5. RSS Ticker with Live Feed
**Why:** The scrolling ticker overlay and renderer in `display.html` are fully built — it just uses static text. Connecting it to a live RSS feed is a small delta with high perceived value (news, sports, company announcements).
**What to build:**
- Admin ticker modal: add "RSS Feed URL" input option alongside static text
- Backend proxy route `/api/rss-proxy` — fetches RSS XML server-side (avoids CORS), parses `<title>` items, returns JSON array of headlines
- `display.html`: if slide has `rssUrl`, fetch from proxy on load and refresh headlines every N minutes

**Files:** `admin.html`, `display.html`, `api/rss-proxy.js`

---

## Phase 2 — Scheduling & Automation

Features that reduce manual work for operators managing multiple locations.

### 6. Working Hours (Automatic Screen On/Off)
**Why:** Restaurants and retail stores want screens on at opening and off at close without anyone touching anything. Reduces power consumption and prevents content showing outside business hours.
**What to build:**
- Add "Working Hours" section to screen edit panel: start time, end time, active days (checkboxes)
- Save to screen Firestore doc
- `display.html`: on each minute tick, check if current local time is within working hours
  - Outside hours: black screen (stop playback, hide all elements)
  - On transition to "open": resume playback

**Files:** `admin.html`, `display.html`

---

### 7. Countdown Timer Widget
**Why:** Happy hour countdowns, sale end times, event promos — all key use cases for restaurants and retail. Template gallery already has a static placeholder.
**What to build:**
- Admin modal: target date/time, label text, display style (days/hours/mins/secs), font/color/bg options
- `display.html`: `renderCountdown()` updates every second; when timer reaches zero, show configurable end message or auto-remove slide

**Files:** `admin.html`, `display.html`

---

## Phase 3 — Multi-Location & Scale

Features needed as customers grow beyond a single location.

### 8. Per-Screen Timezone
**Why:** Any customer with screens in multiple time zones (national chain, franchise) needs this. The clock widget already supports IANA timezones per-slide — this lifts it to the screen level.
**What to build:**
- Add timezone dropdown (IANA strings) to screen edit panel in `admin.html`
- Pass `screen.timezone` to `display.html` via Firestore
- Use it as the reference timezone for: clock rendering, schedule enforcement (item 1), working hours (item 6)

**Files:** `admin.html`, `display.html`

---

### 9. PDF Display
**Why:** Menus, flyers, and price lists are commonly in PDF format. High demand from restaurants and hospitality customers who want to reuse existing assets.
**What to build:**
- Option A (server-side, recommended): `/api/pdf-convert` — accepts a PDF URL, uses `pdf-to-img` or Puppeteer to render pages as PNG images, returns image URLs stored in S3
- Option B (client-side): Use `pdf.js` in `display.html` to render pages directly in the browser
- Admin: PDF upload → convert to slide sequence or single-page slide
- `display.html`: handle `type:'pdf'` (or treat converted pages as regular image slides)

**Files:** `admin.html`, `display.html`, `api/pdf-convert.js`

---

### 10. Media Expiration Dates
**Why:** Promotional content (Happy Hour, weekend sale, seasonal menu) should disappear automatically after a date without the operator having to manually remove it. Prevents stale content from displaying indefinitely.
**What to build:**
- Add optional "Expires on" date picker to slide card settings in `admin.html`
- Store `expiresAt` (ISO timestamp) on the slide object in Firestore
- `display.html` `applyPlaylist()`: filter out any slides where `expiresAt` is in the past before building the play queue
- Admin: visual indicator on expired/expiring-soon slide cards

**Files:** `admin.html`, `display.html`

---

## Summary Table

| # | Feature | Phase | Effort | Impact |
|---|---|---|---|---|
| 1 | Schedule display-side enforcement | 1 | Medium | High |
| 2 | QR code widget | 1 | Low | High |
| 3 | Weather widget | 1 | Low-Medium | High |
| 4 | Online/offline email notifications | 1 | Low | High |
| 5 | RSS ticker with live feed | 1 | Low | Medium |
| 6 | Working hours | 2 | Low | High |
| 7 | Countdown timer | 2 | Low | Medium |
| 8 | Per-screen timezone | 3 | Low | Medium |
| 9 | PDF display | 3 | High | Medium |
| 10 | Media expiration dates | 3 | Low | Medium |
