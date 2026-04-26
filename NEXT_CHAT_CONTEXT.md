# Next Chat Context (2026-04-26)

Use this as the first-read handoff snapshot before making new changes.

## Where We Left Off

A code-review agent (`superpowers:code-reviewer`) audited `admin.html`, `mobile.html`, `login.html`, `display.html`. It found **5 Critical, 6 High, 9 Medium, 20+ Low** bugs.

**Fixed so far (11 / 40+):** all Critical + all High.

**Resume point:** start the Medium-severity batch. The full ranked list is in this file under "Audit Backlog" below.

## Sessions This Day

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

- **#16** `currentOrg` never refreshed by listener (`admin.html`) — Stripe webhook updates plan but UI shows old plan until reload. Replace one-shot `getDoc(organizations/{id})` with `onSnapshot` that re-runs `syncPlanEntitlements` / `applyRole`.
- **#21** Several `pushToFirestore()` calls fire-and-forget (`admin.html:11365, 12420, 12556, 12562`) — racing the publish flow. `await` them or use a write batch.
- **#22** `screensUnsub` never resets on org change (`admin.html:19330`) — after `acceptInvitation`, the listener is still scoped to the previous org. Reset and re-init when `currentOrgId` changes.
- **#33** `?screen=xxx` URL lets anyone impersonate a screen (`display.html:2262`) — no auth on display, so anyone with a copied URL can write the heartbeat as that screen. Needs Firestore rules + short-lived tokens or server-side pairing.
- **#19** No file size validation on uploads (`admin.html:10555, 22486`) — multi-GB videos burn S3 egress. Reject `file.size > MAX_BYTES`.
- **#27** CSS injection via `backgroundImage` template (`display.html:1788, 803`) — defense-in-depth; assign via `setProperty` with `JSON.stringify(url)`.
- **#28** `crossfadeTo` doesn't await async helpers (`display.html:1745-1758`) — weather/multizone slides briefly show empty stage during fade-up. `await renderWeather/renderMultizone`.

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
