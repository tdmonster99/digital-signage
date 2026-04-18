# AGENTS.md — Zigns App

This file provides guidance to Codex and other AI coding agents working in this repository.
The authoritative architecture reference is **CLAUDE.md** — read it first and in full before making any changes.

## Quick orientation

- **`CLAUDE.md`** — full architecture, file map, Firestore schema, page system, roles, deployment
- **`ROADMAP.md`** — Phase 4 feature list with completion status; check the summary table for what's done vs. remaining
- **`DEVLOG.md`** — running session log; prepend a new entry after any session that makes changes

## What's been built (Phase 4 as of 2026-04-18)

All of the following are shipped and working in production:

| Feature | Notes |
|---|---|
| Multi-zone / split-screen layouts | `multizone` slide type |
| Offline content caching | Service worker + Cache Storage |
| Digital menu board | `menuboard` slide type, fixed 2026-04-18 |
| PowerPoint integration | CloudConvert API → `api/import-pptx.js` |
| Canva integration | OAuth 2.0 + Connect API → `api/canva.js` |
| Google Sheets widget | `googlesheets` slide type → `api/sheets-proxy.js` |
| Emergency broadcast override | `broadcasts/{orgId}` Firestore doc |
| Proof of play / analytics | `organizations/{orgId}/analytics` events |
| QR code, Weather, Clock, RSS ticker, Countdown | all widget slide types |
| Working hours, PDF display, Media expiration | display.html enforcement |

## What's still remaining (Phase 4)

| # | Feature | Priority |
|---|---|---|
| 6 | Social media feeds (Instagram + Google Reviews) | High |
| 7 | Content templates library | High |
| 11 | Content approval workflow | Medium |

## Critical rules — do not violate

1. **No framework, no bundler.** Everything runs as `<script type="module">` directly in the browser. No React, Vue, Vite, Webpack, npm install, or build steps for frontend code.
2. **Single-file frontend.** All admin UI lives in `admin.html` (~16,000+ lines). Do not split it out. Add new CSS inside the `<style>` block, new HTML before `</body>`, new JS inside the `<script type="module">`.
3. **`api/` is Node.js CommonJS only.** Each file exports `module.exports = async function handler(req, res)`. No ES module syntax in `api/`.
4. **Vercel Hobby limit: 12 serverless functions.** Count the files in `api/` before adding a new one. Merge into an existing file if at the limit.
5. **Firebase SDK via CDN.** Imported from `https://www.gstatic.com/firebasejs/10.12.0/`. Do not npm-install Firebase.
6. **Deployment is automatic.** `git push origin main` triggers Vercel. No build step needed.
7. **New slide types must be added to the `applyPlaylist` filter in `display.html`** or they will be silently dropped from playback.
8. **DEVLOG.md**: prepend a new dated entry at the top after any session that makes changes. Include what was built and any required setup steps (env vars, Firestore rules, third-party accounts).

## Pattern for new widget slide types

Follow the same structure as `googlesheets` or `menuboard`:

1. App card in `#page-apps` → `onclick="openXxxModal(null)"`
2. Modal HTML (before `</body>`) with a `display:none` wrapper div
3. Modal CSS in the `<style>` block
4. `window.openXxxModal`, `window.closeXxxModal`, `window.saveXxxSlide` on the `window` object
5. Save path: push to `slides[]` + `renderGrid()` + `pushToFirestore()` for current show; `_addSlideToShow()` for other shows
6. `isXxx = s.type === 'xxx'` detection in `renderGrid()` (around line 10835)
7. Edit button wired in the slide list render
8. `display.html`: add `s.type === 'xxx'` to the `applyPlaylist` filter; add a `<div id="stageXxx" class="stage"></div>`; add render + hide logic in the crossfade block
