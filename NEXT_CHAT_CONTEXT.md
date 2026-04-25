# Next Chat Context (2026-04-25)

Use this as the first-read handoff snapshot before making new changes.

## Current State
- Phase 4 status in `ROADMAP.md`: **12/12 complete.** Phase 4 competitive parity is fully done.
- Most recent work (session ending 2026-04-25):
  - Synced 6 unmerged Codex sessions (template polish + apps icon refresh) from working tree to git as commit `4ef0fad`.
  - Built **Phase 4 #12 — 14-Day Trial + Automatic Downgrade** in commit `4bf5d66`.
  - Set up Stripe products and Vercel env vars to make the trial work end-to-end on production.
  - Forced a fresh production deploy via `vercel deploy --prod --archive=tgz` so the new env vars took effect (commit `8abb727` is an empty commit; the live deploy is `digital-signage-njatrc7mn-...` aliased to `app.zigns.io`).

## Latest Commits
- `8abb727` — Trigger redeploy for Stripe price ID env vars (empty commit)
- `4bf5d66` — Add 14-day trial and auto-downgrade (Phase 4 #12)
- `4ef0fad` — Refresh app catalog icons and enrich template library (backfilled Codex sessions 30–35)

## What Changed In Trial / Auto-Downgrade Build
- `api/stripe-sessions.js`: checkout accepts `trial: true`; passes `trial_period_days: 14` with `trial_settings.end_behavior.missing_payment_method: 'cancel'`.
- `api/stripe-webhook.js`: captures `trialStartedAt` / `trialEndsAt` / `status: 'trialing'` from Stripe events. `customer.subscription.deleted` clears the trial fields.
- `admin.html`: "Start 14-day free trial" link under each paid-tier upgrade button (visible only when org is on Free). Trial countdown banner in billing sub-view. Plan badge gets a "TRIAL" suffix when trialing. Settings hub shows `Premium trial · 10d left`. New `enforceScreenLimit()` writes `suspended: true` on overflow screens (oldest-first wins).
- `display.html`: new `#stageSuspended` overlay (z-index 150) shows "Subscription limit reached" when `screen.suspended === true`.

## What Changed In Stripe Setup
- Renamed Stripe product `prod_UIc5chUUGf9uJG` from "Pro" → **"Standard"** (cosmetic — billing portal / receipts now read "Standard").
- Created new Stripe product **"Premium"** (`prod_UOXEK4T3lMk8o0`) with $10/screen/mo recurring price (`price_1TPk9eRudWboEbYXKOY7Y3M8`).
- Set three Vercel env vars in **Production + Development** environments (Preview is not set — only matters for PR preview deploys):
  - `STRIPE_STANDARD_PRICE_ID = price_1TK0rRRudWboEbYXjnNkzBNO`
  - `STRIPE_PREMIUM_PRICE_ID = price_1TPk9eRudWboEbYXKOY7Y3M8`
  - `STRIPE_EARLY_ADOPTER_PRICE_ID = price_1TK0rQRudWboEbYXZNxV8ql3`

## Important Operational Notes
- **Live mode only.** Production uses live Stripe keys, so any trial signup will collect a real card and auto-charge on day 15. To test safely, either use a real card and cancel before 14 days, or set up test-mode price IDs separately (the env var conventions exist — `STRIPE_SECRET_KEY_TEST` is already set in all environments).
- **`enforceScreenLimit()` runs on admin visits, not autonomously.** When a trial expires while no admin is on the dashboard, over-limit screens keep playing until the next admin login. Acceptable for MVP. Could be moved to `api/screen-monitor.js` cron later.
- **Vercel CLI quirk:** plain `vercel deploy --prod` hangs because `node_modules/` is huge; always use `vercel deploy --prod --archive=tgz`.
- **GitHub-push didn't auto-trigger a deploy for the empty commit `8abb727`.** Vercel may ignore zero-diff commits. Use `--archive=tgz` deploy if a redeploy is ever needed without code change.

## Key Files To Read First In Next Chat
1. `AGENTS.md`
2. `CLAUDE.md`
3. `DEVLOG.md` (top entries — session 36 covers the trial work)
4. `ROADMAP.md` (Phase 4 all marked complete)
5. `admin.html` (renderBillingSection at ~9328, enforceScreenLimit at ~19330)
6. `api/stripe-sessions.js` and `api/stripe-webhook.js`
7. `display.html` (#stageSuspended overlay at ~2362, applySuspended hook at ~2141)

## Immediate Next Targets (Recommended)
Since Phase 4 is fully complete, the next chat is open for whatever the user prioritizes. Possible directions:
1. **End-to-end test the trial flow** in production with a real card (and cancel before day 14). Confirm the trial banner, plan badge, and `screen.suspended` enforcement all behave correctly.
2. **Add test-mode Stripe price IDs** for safer staging — set `STRIPE_STANDARD_PRICE_ID_TEST` etc., or wire the checkout path to use test-mode in Preview deploys.
3. **Move `enforceScreenLimit()` to a cron** (`api/screen-monitor.js`) so plan downgrades enforce immediately even without an admin visit.
4. **Phase 5 planning** — gap analysis is overdue. Phase 4 was about parity with Yodeck/ScreenCloud/Rise/OptiSigns/Screenly/TelemetryTV; now Zigns sits at parity. Phase 5 should focus on differentiators.
5. **Set Stripe price IDs in Preview environment** if PR preview deploys ever need the trial flow (currently only Production + Development have them — see CLI quirk note above).

## Known Pending Items / Backlog
- `.impeccable.md` is untracked in working tree (added by Codex session 31, persistent design context). Decide whether to commit or leave it personal.
- `Zigns Bugs.txt` is untracked. Likely a personal scratch file — leave alone unless user says otherwise.
- `firestore.rules` is untracked — Firestore security rules file. Not part of the Vercel deploy pipeline. Worth checking if rules are ever published to Firebase from local.

## Notes
- Frontend architecture constraints still apply: single-file `admin.html`, no framework/bundler.
- Any new session that changes files must prepend a DEVLOG entry.
- Vercel CLI 51.8.0 is installed and the project is linked at `D:\Dev\zigns\app\.vercel\project.json`.
