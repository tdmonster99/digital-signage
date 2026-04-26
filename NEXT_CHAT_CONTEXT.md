# Next Chat Context (2026-04-25)

Use this as the first-read handoff snapshot before making new changes.

## Current State

- Phase 4 status in `ROADMAP.md`: **12/12 complete.** Phase 4 competitive parity is fully done.
- Most recent work (session ending 2026-04-25):
  - Completed a full scalability assessment of the codebase.
  - Implemented **API rate limiting** on `api/ai-generate.js`: requires Firebase ID token (`401` for unauthenticated), enforces 50 AI generations/user/day via `rateLimits/{uid}` Firestore collection (`429` when exceeded). Created shared `api/_lib/firebase-admin.js`.
  - Implemented **screen-monitor optimization**: org docs now fetched once per run in a single `Promise.all` batch (`orgMap`), passed into both `enforceAllScreenLimits` and `notifyOrg` — eliminated all duplicate Firestore reads and sequential awaits.
  - Verified both changes live in production (unauthenticated `/api/ai-generate` returns `401`; cron returns `{"ok":true,"checked":12,...}`).
  - Added Operations and Scalability Backlog sections to `ROADMAP.md`.

## Latest Commits

Run `git -C app log --oneline -8` to see the current state.

Key commits from this session:
- `dff68bb` — feat: add shared Firebase Admin helper
- `8fc791c` — fix: throw clear error when FIREBASE_SERVICE_ACCOUNT_JSON is missing
- `326ec39` — feat: require Firebase auth + enforce daily rate limit on ai-generate
- `6d3429d` — fix: log verifyToken errors and guard rate limit counter
- `a4bb2c5` — feat: send Firebase ID token with AI generation requests
- `4aa1e51` — fix: guard generateAiSlide against null currentUser
- `c061386` — perf: parallelize Firestore reads in screen-monitor
- `9ff5a16` — doc: DEVLOG session 39

## Active Vercel Project

The active project is **`digital-signage`** (not `app`). Linked in `.vercel/project.json`.
- `app.zigns.io` → `digital-signage` project
- There is a duplicate stale `app` project in Vercel — safe to delete after verifying it has no custom domain or env vars.

## Immediate Next Targets (Recommended)

1. **Mark Vercel env vars as Sensitive** (5 min, manual in dashboard)
   - `GOOGLE_PLACES_API_KEY`, `CRON_SECRET`, `CLOUDCONVERT_API_KEY`, `GOOGLE_SHEETS_API_KEY`, `OPENWEATHER_API_KEY` — all flagged "Needs Attention"
   - Edit each → check Sensitive checkbox → re-paste value

2. **Delete duplicate Vercel `app` project** (2 min, manual in dashboard)
   - Verify it has no custom domain/env vars, then delete

3. **Slideshow subcollection migration** (high effort, highest data-integrity risk)
   - `slides[]` in Firestore doc will hit 1MB limit for large slideshows
   - Needs a migration script + `admin.html` + `display.html` changes
   - Plan separately before touching anything

4. **Phase 5 planning** — what to build now that Phase 4 is done

5. **Analytics daily rollup** — add aggregation cron to prevent expensive dashboard queries at scale

## Known Pending Items / Backlog

- `.impeccable.md` is untracked (added by Codex session 31). Leave alone.
- `Zigns Bugs.txt` is untracked. Personal scratch file — leave alone.
- `firestore.rules` is untracked. Worth checking if rules are ever published to Firebase from local.
- `CRON_SECRET` is currently accepted via `?secret=` query param in screen-monitor — exposes it in logs. Low priority: remove query-param path, keep `Authorization: Bearer` header only.

## Scalability Status (as of this session)

| Item | Status |
|------|--------|
| Weather caching | ✅ Already handled via `Cache-Control: s-maxage=600` in `proxy.js` |
| API rate limiting (ai-generate) | ✅ Implemented this session |
| screen-monitor parallel reads | ✅ Implemented this session |
| Slideshow doc size (1MB limit) | ⏳ Backlog — needs planning |
| Analytics aggregation | ⏳ Backlog — low priority |

## Key Files To Read First In Next Chat

1. `AGENTS.md`
2. `CLAUDE.md`
3. `DEVLOG.md` (top entries — sessions 38–39 cover this session's work)
4. `ROADMAP.md` (Phase 4 complete; new Operations + Scalability Backlog sections added)
5. `api/_lib/firebase-admin.js` (new shared module)
6. `api/ai-generate.js` (new auth + rate limiting)
7. `api/screen-monitor.js` (optimized parallel reads)

## Notes

- Frontend architecture constraints still apply: single-file `admin.html`, no framework/bundler.
- Any new session that changes files must prepend a DEVLOG entry.
- Vercel CLI 51.8.0 is installed and linked at `D:\Dev\zigns\app\.vercel\project.json`.
- Active Vercel project: `digital-signage` (project ID: `prj_PYBCfcpx9G5Dd8K0ClImUYfDaJUf`).
