# Zigns Release QA Gate

Use this gate before production deploys, pilot handoffs, and fixes that touch auth, slideshows, publishing, the designer, display playback, or smoke tooling.

Production app: https://app.zigns.io

Reference harness: `docs/PILOT_SMOKE_TEST.md`

## Required Setup

Use a dedicated Admin smoke account in the `Zigns Smoke Test` organization. The smoke scripts load `ZIGNS_*` values from `.env.local` or `.env`.

Expected local smoke variables:

```bash
ZIGNS_SMOKE_EMAIL="pilot-admin@example.com"
ZIGNS_SMOKE_PASSWORD="use-a-dedicated-test-password"
ZIGNS_SMOKE_EXPECTED_ORG="Zigns Smoke Test"
ZIGNS_SMOKE_EXPECTED_ROLE="admin"
```

Browser runs need Chrome, Edge, or a CDP endpoint:

```bash
ZIGNS_BROWSER_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

Never use a personal user password for scripted QA. Do not set `ZIGNS_SMOKE_INVITE_EMAIL` unless intentionally testing invite delivery.

## Gate 0: Preflight Doctor

Run this first when validating a new machine, after network/auth failures, or before a full release QA pass:

```bash
npm run smoke:doctor -- --base-url https://app.zigns.io
```

Pass means the app URL resolves, production is reachable, Firebase auth DNS is reachable, smoke credentials exist, and the browser can launch or the configured CDP endpoint responds.

Stop if this fails. Fix environment, DNS, credentials, or browser/CDP setup before running heavier smoke tests.

## Automated Gates

GitHub Actions runs `CI` on pushes and pull requests. It parses the smoke scripts and runs `npm run smoke:static`.

Use the manual `Release QA` workflow before release handoff when you want GitHub to run the production gate. It requires these repository secrets:

- `ZIGNS_SMOKE_EMAIL`
- `ZIGNS_SMOKE_PASSWORD`

Optional repository variables:

- `ZIGNS_SMOKE_EXPECTED_ORG` (defaults to `Zigns Smoke Test`)
- `ZIGNS_SMOKE_EXPECTED_ROLE` (defaults to `admin`)

The manual workflow defaults to the safe production smoke. Enable `run_mutation` only when you intentionally want temporary smoke data created and cleaned up in the smoke org.

## Gate 1: Safe Production Smoke

Run this for every production deploy candidate:

```bash
npm run smoke:pilot -- --base-url https://app.zigns.io
```

This runs static checks, public page checks, authenticated bootstrap, and browser UI checks. It does not create temporary slideshows unless mutation mode is enabled.

Expected release result:

```text
Zigns pilot QA: 3 pass, 2 warn, 0 fail
```

The two warnings should be the skipped editor save/publish and rendering mutation checks.

## Gate 2: Mutation Production Smoke

Run this before pilot handoffs and after changes to slideshows, publishing, the designer, display playback, YouTube/GIPHY/media rendering, or account/org access:

```bash
ZIGNS_PILOT_MUTATE=1 npm run smoke:pilot -- --base-url https://app.zigns.io
```

This creates and deletes temporary test slideshows in the `Zigns Smoke Test` org. It verifies:

- temporary slideshow create/tag/delete
- editor save/reopen/publish flow
- display preview rendering for designed slides
- image and YouTube playback stages
- republish after deleting YouTube content
- cleanup of temporary rendering slideshow

Expected release result:

```text
Zigns pilot QA: 5 pass, 0 warn, 0 fail
```

Stop if cleanup fails or if any temporary slideshow remains visible in the smoke org.

## Gate 3: Deeper Security And Tag Checks

Run these after changes to Firestore rules, membership, invitations, org settings, tags, emergency playlists, or publishing filters:

```bash
ZIGNS_PILOT_MUTATE=1 npm run smoke:pilot -- --base-url https://app.zigns.io --include-tags --include-rules
```

These checks intentionally touch temporary tag/screen/media/slideshow records and rules-denial paths. Use the smoke org only.

## Manual Spot Checks

After Gate 1 or Gate 2, do a quick human check when the change affects visible UX:

- Sign in at https://app.zigns.io/login.
- Confirm the lower-left account panel shows the expected smoke org and Admin role.
- Open Slideshows and confirm no stale smoke slideshows remain.
- Open the designer and confirm the toolbar/canvas still feels responsive.
- Open a display preview for an existing smoke slideshow and confirm it renders full-slide content.

## Release Decision

Ship when the relevant gate passes with `0 fail`.

Use `PASS WITH NOTES` only for documented, understood warnings such as intentionally skipped mutation checks. Do not ship on unresolved auth, cleanup, editor save/publish, or display rendering failures.
