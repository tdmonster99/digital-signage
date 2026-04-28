# Next Chat Context (2026-04-27, sessions 40–45)

Use this as the first-read handoff snapshot before making new changes.

## Where We Left Off

Two parallel tracks have been running today:

**Track 1 — Code-review audit.** A `superpowers:code-reviewer` pass on `admin.html`, `mobile.html`, `login.html`, `display.html` found **5 Critical, 6 High, 9 Medium, 20+ Low** bugs. **17 / 40+ fixed** (all Critical + all High + 6 Medium across sessions 40–42). Backlog below.

**Track 2 — Kitcast competitive gaps.** A side-by-side comparison vs Kitcast Pro lives in `app/KITCAST_GAP_ANALYSIS.md`. Closed since the doc was written: audio playback (sessions 44–45). Multi-user is broadly shipping; rough edges tightened in session 43. Top remaining gaps: Tags + Priority Overrides + pre-built Emergency Playlist cluster, Emergency CAP feed, native players (Tizen/webOS/BrightSign), SSO/SAML, MDM/Zero-Touch.

**Resume points:**
- Audit: continue Medium batch — items below.
- Kitcast → **Phase 5 in `ROADMAP.md`** is the next focus. Three priority clusters scoped: (5.1) Tags + Priority Overrides + pre-built Emergency Playlist, (5.2) Emergency CAP feed (NWS first, IPAWS deferred), (5.3) Native players for Tizen / webOS / BrightSign. Pick any cluster to start; they're independent.

## Sessions This Day (2026-04-27)

- **Session 45** — Audio tap-to-enable overlay (commit `16cff0d`):
  - New `#audioUnlock` overlay shown when playlist contains audio slides and screen hasn't been unlocked yet
  - Click/tap/keypress unlocks; primes `audioEl` with silent WAV inside the user gesture; persists `zigns-audio-unlocked=1` to localStorage so reboots don't re-prompt
  - If an audio slide is already on stage when user unlocks, immediately swaps in the slide's real URL and resumes (instead of waiting for next slide cycle)
  - Z-index 199 — emergency Broadcasts (200) still pre-empt

- **Session 44** — Audio slide type (commit `fea05e7`):
  - New `audio` slide type with "Now Playing" card UI in `display.html` (animated equalizer bars + big title)
  - File accept patterns updated, `probeAudioDuration()` sets slide.dwell to ceil(duration), 100 MB cap
  - Slide grid + media library updated with music-icon thumbnail and `Audio` badge + filter tab
  - Closes the Kitcast audio gap

- **Session 43** — Multi-user rough-edge tightening (commit `126d906`):
  - Over-limit team banner that updates live via `subscribeToOrg` snapshot when Stripe downgrade webhook lands
  - `removeMember` writes soft-delete audit record to `organizations/{id}.removedMembers[]` (capped at 50)
  - `initUserAndOrg` handles removed-user re-entry — orgId=null path now routes to `acceptInvitation` or `createOrg` instead of boot error

- **Session 42** — Medium-severity bug fixes (commit `f70a95d`):
  - #16 `currentOrg` listener — added `subscribeToOrg(orgId)` with `onSnapshot` so plan/role updates from Stripe webhooks propagate live
  - #22 `screensUnsub` reset on org change — folded into #16's helper
  - #21 awaited the 5 remaining fire-and-forget `pushToFirestore()` calls
  - #19 file-size validation — added `_enforceSize()` in `lib/s3-upload.js` (50 MB image / 500 MB video / 100 MB other) plus a friendlier per-file pre-check in `handleFiles`
  - #27 `backgroundImage` CSS injection — added `safeCssBgUrl()` helper, switched both call sites to `setProperty`
  - #28 `crossfadeTo` now awaits `renderWeather` and `renderMultizone`
  - #33 deferred — needs Firestore rules + server token endpoint

- **Session 40** — Critical bug fixes (commit `654cba8`):
  - #10/#26 Webpage slide `javascript:` URL XSS — whitelisted http/https on save (admin.html `saveWebpageSlide` + multizone) and at render (display.html `safeIframeUrl()` helper used by both single-zone and multizone iframe paths)
  - #11 `acceptInvitation` email mismatch — verifies `inv.email === user.email` before joining; signs out + toasts on mismatch
  - #17 `initUserAndOrg` silent org-loss — split user-doc/org-doc fetches into separate try/catches; new `showBootError()` overlay; auto-create only on legitimate "doc not found"
  - #1 `mobile.html` listener leak — `closeShowDetail(true)` now called at top of every `switchTab`
  - #2 `mobile.html` `appendDraft` lost-write race — wrapped in `runTransaction` (added to imports)

- **Session 41** — High-severity bug fixes (commit `36a1612`):
  - #12 Pairing double-submit — `pairingConfirmBtn` disabled at start, re-enabled in `finally`
  - #13 + #14 `removeMember` — replaced `arrayRemove(member)` with filter-by-uid; refuse to remove org owner; refuse to remove the last admin
  - #15 `escHtml` single-quote escape — added `'` → `&#39;`

Plus three earlier UI fixes today: bottom nav SVG icons (`d47bdf9`), `100dvh` ordering (`e96bdcd`), unified Zigns logo across app (`98a5019`), mobile companion app + admin redirect (`0b48073`).

## Audit Backlog (resume here)

Reference: the full audit lives in conversation context; the commit log + DEVLOG entries from sessions 40–41 cover the fixed items. The remaining items are listed in priority order.

### Medium severity — recommended next batch

- **#33** `?screen=xxx` URL lets anyone impersonate a screen (`display.html`) — no auth on display, so anyone with a copied URL can write the heartbeat as that screen. **Needs Firestore rules + short-lived tokens or server-side pairing — design + deploy work, not a one-line fix.** Sketch: write Firestore rules requiring a signed claim token on `screens/{id}` writes; add `/api/screen-token` issuing short-lived JWTs after pairing succeeds; display.html sends the token in heartbeat updates. ✅ everything else from the original Medium "next batch" is done as of session 42.

### Other Medium / Low items still open

- #8 mobile.html no file size validation (25MB image cap recommended)
- #18 pairing `data.orgId` spread shadow — currently in `confirmPairingCode`, fix by always using `currentOrgId`
- #20 zero-byte file upload not rejected
- #23 slideshow `unsubscribe` listener never closed on logout/page nav
- #24 `enforceScreenLimit` runs from every admin's session — concurrent admins double-write
- #25 CSS-injection / minor XSS via `screen.id` in inline onclick (defense-in-depth)
- #29 `_subscribeBroadcast` runs once but never unsubs
- #31 `applyPlaylist` silently drops unknown slide types
- #34 youtubeFallback background uses unescaped URL (videoId is validated, low risk)
- #35 `?slideshow=xxx` URL exposes any org's slideshow (preview path)
- #36–#42 login.html buttons not disabled during async (#36/#37/#38), `showLinkAccountPrompt` unescaped email innerHTML (#40), swallowed `getRedirectResult` errors (#41)

### Mobile.html small items

- #3 Publish button stuck in "Publishing…" if snapshot delayed
- #4 `screens.sort()` mutates live array
- #6 `parseInt(...) || 30` accepts negatives — clamp to [5, 3600]
- #7 YouTube slide stores `url` field redundantly
- #9 `name.split(' ')` returns `undefined` initials when consecutive spaces

## Active Vercel Project

The active project is **`digital-signage`**. Linked in `.vercel/project.json`.
- `app.zigns.io` → `digital-signage`
- `app/` repo: `git push origin main` auto-deploys
- `site/` repo (in `D:\Dev\zigns\site\`): on `redesign/optisigns-driven` branch — separate

## Carryover Tasks (not from audit)

These remain from earlier days:

1. **Mark Vercel env vars as Sensitive** (5 min, manual in dashboard) — `GOOGLE_PLACES_API_KEY`, `CRON_SECRET`, `CLOUDCONVERT_API_KEY`, `GOOGLE_SHEETS_API_KEY`, `OPENWEATHER_API_KEY`
2. **Delete duplicate Vercel `app` project** (2 min, manual in dashboard)
3. **Slideshow subcollection migration** — `slides[]` will hit 1MB limit at scale; needs migration script + admin/display rewrites
4. **Phase 5 planning** — Phase 4 is complete (12/12); next phase not yet scoped
5. **Analytics daily rollup** — aggregation cron to prevent expensive dashboard queries at scale
6. **Google Cloud OAuth verification** — user is mid-flow; needs to verify `zigns.io` ownership in Search Console (TXT record on `@`) before branding goes through
7. **CRON_SECRET in URL query** — currently logged. Switch to `Authorization: Bearer` header only.

## Manual Testing Wishlist

User wants to actually test the app via browser automation. Path requires:
- Playwright installed (not yet)
- Test account credentials (user undecided whether to share `jzegar2@gmail.com` creds or create a dedicated test account)
- Defined flow list (auth, screens, content, billing, mobile)

## Architecture Reminders

- Single-file `admin.html` (~16,000 lines) — DO NOT split
- No framework, no bundler — ES modules via CDN
- Firebase SDK 10.12.0 from `gstatic.com`
- Vercel Hobby limit: 12 serverless functions in `api/`
- After any session that changes files: prepend DEVLOG entry
- Deploy: `git push origin main` only; never `vercel deploy`

## Key Files To Read First In Next Chat

1. `CLAUDE.md` (root + this file's project)
2. `AGENTS.md`
3. `DEVLOG.md` (top entries — sessions 40, 41 cover today's work)
4. This file
