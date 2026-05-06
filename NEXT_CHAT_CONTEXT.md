# Next Chat Context (updated 2026-05-06)

Use this as the first-read handoff snapshot before making new changes.

## Current State

- Repo: `/home/jzegar/dev/zigns/app`
- Production app: https://app.zigns.io
- Deploy path: `git push origin main` only; never `vercel deploy`
- Architecture: no framework, no bundler; all admin UI stays in `admin.html`
- Phase 4 competitive parity: complete
- Audit backlog: critical, high, recommended medium, and known mobile/admin small items are closed
- Slideshow subcollection migration: complete and re-verified
- Vercel Pro infra: cron endpoints are header-auth only; query-string cron secrets return 401
- Novares pilot: use explicit pending invitations into the `Novares` org, not personal-org fallback grants

## Active Priority Order

### 1. Pilot QA / Smoke-Test Harness

This is the next recommended workstream because Novares pilot testing is beginning.

Current docs:
- `docs/PILOT_QUICKSTART.md` — pilot onboarding, roles, pairing, and support intake
- `docs/PILOT_SMOKE_TEST.md` — repeatable manual smoke-test harness for account, role, invite delivery, slideshow, pairing, playback, mobile, tags/emergency, and CAP checks
- `scripts/pilot-smoke.mjs` — dependency-free sanity script with static checks, live public page checks, optional Firebase email/password bootstrap checks, and optional invite-email send checks

Recommended next steps:
- Run `node scripts/pilot-smoke.mjs --static` locally before pilot-impacting changes.
- Run the harness against production with an Admin account and one Editor account; use `ZIGNS_SMOKE_INVITE_EMAIL` with a controlled inbox when validating invite delivery.
- Record failures with the in-app issue report helper: desktop Profile -> Report Issue, or mobile Account -> Copy issue report.
- Create a dedicated Firebase email/password test account if we want `scripts/pilot-smoke.mjs` to verify org/role bootstrap automatically.
- If browser credentials become available, add a small browser smoke suite for login/session, slideshow CRUD, publish, and pairing-modal sanity checks.

### 2. Phase 5.1 Tags / Priority / Emergency Playlist

Status: mostly shipped.

Shipped:
- Organization tag manager
- Screen tags and tag chips
- Slideshow tags and auto-include rules
- Slide and media tag editors
- Smart playlist publish resolution
- Schedule event priority
- Saved emergency playlist trigger by all screens or tags
- Display-side emergency playlist override and return behavior
- Saved emergency playlist picker limited to explicitly marked emergency slideshows
- Admin confirmation for marking emergency playlists, explicit trigger confirmation, and recent activity entries for trigger/clear

Remaining polish:
- Smoke-test tag propagation across screens, slideshows, slides, and media.
- Consider a richer emergency playlist management UI instead of the current prompt-based Slideshow Tags flow.
- Add stronger audit history if pilot feedback shows recent activity is not enough.
- Consider advanced targeting beyond all/tag/screen IDs later.

### 3. Phase 5.2 CAP Alerts / Emergency-CAP Polish

Status: foundation shipped.

Shipped:
- Per-screen CAP configuration
- Dedicated `api/cap-poll.js` Vercel Cron route
- Firestore overlap guard
- `capAlerts/{orgId}` mirror doc
- Display-side CAP overlay above normal playback
- Auto-clear through polling/expiry path
- CAP render analytics in the Analytics page

Remaining polish:
- Safer test fixtures or admin-side test mode for validating alert rendering without waiting for real public alerts.
- Bilingual copy controls.
- Better defaults for screen CAP config, such as state/FIPS suggestions.
- Richer support guidance for schools, healthcare, and manufacturing.
- IPAWS/FEMA path remains Enterprise-only later.

### 4. Phase 5.3 Vercel Pro Infrastructure

Status: largely complete.

Shipped:
- `api/screen-monitor.js` on Vercel Cron
- `api/cap-poll.js` split and scheduled
- `api/analytics-rollup.js` deployed and manually verified
- Function duration tuning for CAP poll and analytics rollup
- Query-string cron-secret fallback removed
- Sensitive env var cleanup and duplicate Vercel project deletion completed per `ROADMAP.md`

Remaining polish:
- Optional next scheduled-origin verification for analytics rollup.
- Evaluate explicit function durations for heavyweight import routes only if logs show timeouts.
- Keep future cron endpoints header-auth only.

## Platform Compatibility Hold

Phase 5.4 remains important but is waiting on real hardware validation.

- Android: native WebView shell exists; remaining gate is release signing key plus Android TV/signage smoke testing.
- ChromeOS: managed kiosk runbook exists; remaining gate is managed-device validation.
- Tizen: `.wgt` packaging/signing proved locally with Tizen Studio and Samsung profile `zigns-tv-dev`; remaining gate is Samsung TV/signage install, playback validation, and DUID/distributor-certificate check.
- webOS: `.ipk` packaging proved locally with webOS CLI 3.2.3; remaining gate is LG webOS hardware install/playback validation.
- tvOS: SwiftUI/WKWebView source scaffold exists; Xcode project, signing, and hardware validation require macOS.
- Fire TV / BrightSign: deferred unless customer demand or an RFP requires them.

## Pilot Users

Organization: `Novares`

- `jzegar@novaresteam.com` — Admin
- `astacy@novaresteam.com` — Editor
- `tpaul@novaresteam.com` — Editor

If any of these users land in a personal org instead of `Novares`, stop testing and verify the pending invitation email exactly matches the login email.

## Known Manual Tasks

- Google Cloud OAuth verification is still a manual external task: verify `zigns.io` ownership in Search Console before branding approval can finish.
- Real-device platform validation is pending user hardware availability.

## Recent Useful Commits

- `f7649be feat: polish pilot support flow` — issue-report helpers, mobile publish state hardening, handoff cleanup
- `4786d0b fix: leave screen name prompt empty` — post-pair naming input starts blank
- `724ac02 feat: prompt for screen name after pairing` — post-pair screen naming flow
- `e8acbfa docs: close pilot audit handoff` — pilot quickstart and audit cleanup
- `ce8213b fix: harden screen limit enforcement` — screen-limit concurrency and YouTube fallback hardening

## Docs To Read First

1. `AGENTS.md`
2. `CLAUDE.md`
3. `DEVLOG.md` top entry
4. `ROADMAP.md` Phase 5 sections
5. `docs/PILOT_QUICKSTART.md`
6. `docs/PILOT_SMOKE_TEST.md`

## Standing Rules

- Use lowercase `/home/jzegar/dev/zigns` as canonical.
- Do not use `/home/jzegar/Dev` except as a compatibility symlink.
- Do not split `admin.html`.
- Do not npm-install Firebase.
- After file changes, prepend `DEVLOG.md`.
- Deploy app only by `git push origin main`.
