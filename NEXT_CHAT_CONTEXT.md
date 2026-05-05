# Next Chat Context (2026-04-27, sessions 40–45)

Use this as the first-read handoff snapshot before making new changes.

## Where We Left Off

Two parallel tracks have been running today:

**Track 1 — Code-review audit.** A `superpowers:code-reviewer` pass on `admin.html`, `mobile.html`, `login.html`, `display.html` found **5 Critical, 6 High, 9 Medium, 20+ Low** bugs. **17 / 40+ fixed** (all Critical + all High + 6 Medium across sessions 40–42). Backlog below.

**Track 2 — Kitcast competitive gaps.** A side-by-side comparison vs Kitcast Pro lives in `app/KITCAST_GAP_ANALYSIS.md`. Closed since the doc was written: audio playback (sessions 44–45). Multi-user is broadly shipping; rough edges tightened in session 43. Platform compatibility is now underway: 5.4.0 diagnostics shipped, 5.4.1 Android has a native WebView shell, 5.4.2 ChromeOS has a managed-kiosk runbook, 5.4.3/5.4.4 Tizen/webOS have first wrapper scaffolds plus proven local package builds, and 5.4.5 tvOS has a source-level SwiftUI/WKWebView scaffold/runbook ready for later Xcode import. Top remaining gaps: SSO/SAML, MDM/Zero-Touch, real-device platform validation, and remaining emergency/CAP polish.

**Resume points:**
- Audit: continue Medium batch — items below.
- Kitcast → **Phase 5 in `ROADMAP.md`** is the next focus. Tags/priority/emergency playlist and CAP foundations are mostly shipped. Platform sequence agreed 2026-05-03: 5.4.0 player compatibility foundation → 5.4.1 Android → 5.4.2 ChromeOS Kiosk → 5.4.3 Tizen → 5.4.4 webOS → 5.4.5 tvOS → later Fire/BrightSign. Android now has release-signing hooks, configurable player URL, optional device-owner lock-task mode, and production smoke/kiosk docs; ChromeOS has a managed-kiosk runbook; Tizen/webOS have redirect-wrapper scaffolds, package-spike scripts, generated PNG package icons, and Windows-local package builds; tvOS has a source-level SwiftUI/WKWebView scaffold and runbook, but Xcode project creation/signing requires a Mac. Next likely work: validate Android/ChromeOS/Tizen/webOS on hardware; for Tizen, check whether Samsung hardware requires regenerating the distributor certificate with a TV DUID; for tvOS, create the Xcode project when macOS is available.

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
  - #33 addressed after session recovery — new display pairing credentials, `/api/screen-token`, credential-aware Firestore rules, and legacy write compatibility removed; old screens auto-return to pairing when they come online

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

- **#33** `?screen=xxx` URL impersonation — addressed with pair-time screen secrets, hashed credentials on `screens/{id}`, `/api/screen-token` Firebase custom tokens, and rules requiring screen tokens for heartbeat/analytics writes. Legacy write compatibility has been removed; old screens will return to pairing when they next load online.
- **#35** `?slideshow=xxx` URL exposure — addressed after #33. Slideshow parent docs and published slide subcollections now require either org-member auth or a Firebase custom screen token; admin previews wait for auth, and unpaired copied `?screen=` links stop before playback.
- **#8/#20** mobile upload validation / zero-byte upload rejection — addressed. Mobile image uploads reject empty files, non-images, and images over 25 MB; `/api/upload-url` requires `size`, rejects zero-byte files, applies server-side caps, and keeps browser uploads under `signage/`.
- **#23/#29** listener lifecycle cleanup — addressed. Admin/mobile slideshow listeners are torn down on page navigation/sign-out, and broadcast listeners are cleaned up/rebound by org.

### Other Medium / Low items still open

- #18 pairing `data.orgId` spread shadow — addressed with #33 by always using `currentOrgId` during screen pairing
- #25 CSS-injection / minor XSS via `screen.id` in inline onclick (defense-in-depth)
- #31 `applyPlaylist` silently drops unknown slide types
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
3. **Slideshow subcollection migration** — complete. Re-verified 2026-05-05 with a read-only Firestore audit across all 16 slideshow docs: no parent `slides[]` or `draftSlides[]` arrays remain and no slideshow needs backfill.
4. **Phase 5.4 platform work** — agreed sequence: player compatibility foundation, Android, ChromeOS Kiosk, Tizen, webOS, tvOS, later Fire/BrightSign. 5.4.0 diagnostics are shipped. 5.4.1 Android has a `player-android/` WebView shell with fullscreen, wake behavior, boot receiver, network/renderer recovery, reset/reload menu, native shell diagnostics, configurable player URL, release-signing hooks, optional device-owner lock-task mode, and production smoke/kiosk docs; remaining Android work is release-key creation plus emulator/real-device validation. 5.4.2 ChromeOS runbook is in `player-chromeos/`. 5.4.3 Tizen is in `player-tizen/`; Windows-local `.wgt` packaging/signing succeeded with Tizen Studio at `C:\tizen-studio`, `profiles.xml` at `C:\tizen-studio-data\profile\profiles.xml`, and Samsung profile `zigns-tv-dev`. 5.4.4 webOS is in `player-webos/`; Windows-local `.ipk` packaging succeeded with `@webos-tools/cli` 3.2.3. 5.4.5 tvOS is in `player-tvos/` as a source scaffold/runbook that still needs Xcode/macOS for project creation, signing, and Apple TV validation. Remaining platform work is real-device install/launch/playback validation.
5. **Analytics daily rollup** — aggregation cron to prevent expensive dashboard queries at scale
6. **Google Cloud OAuth verification** — user is mid-flow; needs to verify `zigns.io` ownership in Search Console (TXT record on `@`) before branding goes through
7. **CRON_SECRET query fallback** — complete for `screen-monitor.js`, `cap-poll.js`, and `analytics-rollup.js`; query-string secret requests return 401. Keep future cron endpoints header-only.

## Manual Testing Wishlist

User wants to actually test the app via browser automation. Path requires:
- Playwright installed (not yet)
- Test account credentials (user undecided whether to share `jzegar2@gmail.com` creds or create a dedicated test account)
- Defined flow list (auth, screens, content, billing, mobile)

## Architecture Reminders

- Single-file `admin.html` (~16,000 lines) — DO NOT split
- No framework, no bundler — ES modules via CDN
- Firebase SDK 10.12.0 from `gstatic.com`
- Vercel plan: Pro; old 12-function Hobby cap no longer applies, but count `api/` before adding functions
- After any session that changes files: prepend DEVLOG entry
- Deploy: `git push origin main` only; never `vercel deploy`

## Key Files To Read First In Next Chat

1. `CLAUDE.md` (root + this file's project)
2. `AGENTS.md`
3. `DEVLOG.md` (top entries — sessions 40, 41 cover today's work)
4. This file
