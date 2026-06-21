# Screen Diagnostic Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add granular screen incident diagnostics so offline events include a useful last-known-state timeline and best-guess cause.

**Architecture:** Extend the existing `display.html` -> `/api/screen-heartbeat` -> `screens/{id}` and analytics flow rather than adding a new telemetry stack. The player will emit compact diagnostic events and keep a rolling timeline on the screen document; the monitor will snapshot that timeline when a screen flips offline; the admin panel and email copy will surface the resulting incident.

**Tech Stack:** No framework or bundler. Browser ES modules in `display.html` / `admin.html`, CommonJS Vercel APIs in `api/`, Firebase Admin SDK, Firestore, Resend.

---

### Task 1: Static Smoke Expectations

**Files:**
- Modify: `/Users/jzegar/dev/zigns/app/scripts/pilot-smoke.mjs`

- [ ] Add static assertions for the new diagnostic timeline hooks.
- [ ] Run `npm run smoke:static` and verify it fails because the production code does not yet include those hooks.

### Task 2: Player Timeline Emission

**Files:**
- Modify: `/Users/jzegar/dev/zigns/app/display.html`

- [ ] Add a compact event helper that records `player_timeline` events with a state snapshot.
- [ ] Emit timeline events for boot/page load, focus/blur, visibility, online/offline, pagehide, freeze/resume, fullscreen changes, JS errors, asset errors, live/cache listener state, slideshow errors, watchdog restarts, and heartbeat failures.
- [ ] Include recent timeline context in heartbeat diagnostics.

### Task 3: Server Heartbeat Persistence

**Files:**
- Modify: `/Users/jzegar/dev/zigns/app/api/screen-heartbeat.js`

- [ ] Sanitize and persist the rolling `diagnosticTimeline`.
- [ ] Mirror meaningful timeline events into analytics as `player_timeline`.
- [ ] Keep writes bounded to avoid oversized screen documents.

### Task 4: Offline Incident Snapshot

**Files:**
- Modify: `/Users/jzegar/dev/zigns/app/api/screen-monitor.js`

- [ ] When a screen flips offline, classify the likely cause from `lastHeartbeat`, `diagnosticTimeline`, and timing.
- [ ] Save `offlineIncident` on the screen document.
- [ ] Include the diagnosis and last-known state in the offline email.

### Task 5: Admin Diagnostic UI

**Files:**
- Modify: `/Users/jzegar/dev/zigns/app/admin.html`

- [ ] Surface the offline incident, last-known-state fields, and timeline rows.
- [ ] Include the same information in the copyable diagnostic report.
- [ ] Escape all user-controlled values before interpolating into HTML.

### Task 6: Docs And Verification

**Files:**
- Modify: `/Users/jzegar/dev/zigns/app/DEVLOG.md`

- [ ] Prepend a DEVLOG entry.
- [ ] Run static smoke and syntax checks for edited API files.
