# Zigns Pilot Smoke Test Harness

Use this checklist for each pilot build or production deploy that needs confidence before users test broadly.

Production app: https://app.zigns.io
Player setup URL: https://app.zigns.io/display.html

## Test Record

Copy this block for each run.

```text
Run ID:
Date/time:
Tester:
App URL:
Browser/device:
Organization:
Account/email:
Role:
Display device:
Result: PASS / PASS WITH NOTES / FAIL
Notes:
Issue reports copied: yes/no
```

## Prerequisites

- Pilot account can sign in to the expected organization.
- At least one test slideshow exists or can be created.
- At least one display target is available: browser player, Android player, or platform wrapper.
- A small image file is available for upload.
- Optional: a YouTube URL and a webpage URL for media compatibility checks.

## Scripted Sanity Checks

The smoke scripts automatically load `ZIGNS_*` values from `.env.local` or `.env` when those variables are not already exported in the shell. They intentionally ignore unrelated keys so normal app secrets are not pulled into the smoke process.

Run the no-network static check before or after a deploy:

```bash
node scripts/pilot-smoke.mjs --static
```

Run public production reachability checks:

```bash
node scripts/pilot-smoke.mjs --base-url https://app.zigns.io
```

Optional authenticated bootstrap check for a dedicated Firebase email/password test account:

```bash
ZIGNS_SMOKE_EMAIL="pilot-test@example.com" \
ZIGNS_SMOKE_PASSWORD="use-a-dedicated-test-password" \
ZIGNS_SMOKE_EXPECTED_ORG="Zigns Smoke Test" \
ZIGNS_SMOKE_EXPECTED_ROLE="admin" \
node scripts/pilot-smoke.mjs --base-url https://app.zigns.io
```

Optional invite send check from a dedicated Admin test account:

```bash
ZIGNS_SMOKE_EMAIL="pilot-admin@example.com" \
ZIGNS_SMOKE_PASSWORD="use-a-dedicated-test-password" \
ZIGNS_SMOKE_EXPECTED_ORG="Zigns Smoke Test" \
ZIGNS_SMOKE_EXPECTED_ROLE="admin" \
ZIGNS_SMOKE_INVITE_EMAIL="pilot-invitee+smoke@example.com" \
ZIGNS_SMOKE_INVITE_ROLE="viewer" \
node scripts/pilot-smoke.mjs --base-url https://app.zigns.io
```

Notes:
- The authenticated check supports Firebase email/password accounts. Google OAuth sign-in still needs a browser/manual run.
- Do not use a real user's personal password for this script. Create a dedicated test account when we are ready for automated authenticated checks.
- Set `ZIGNS_SMOKE_EXPECTED_ORG` and `ZIGNS_SMOKE_EXPECTED_ROLE` for authenticated runs so org/role drift fails early.
- The invite send check creates or reuses a pending invite and verifies that Resend accepted the email for delivery. The tester still needs to confirm inbox delivery manually.
- Add `--json` when piping results into another tool.

## Browser Smoke

Run a real browser UI check when a dedicated email/password pilot test account is available:

```bash
ZIGNS_BROWSER_EMAIL="pilot-admin@example.com" \
ZIGNS_BROWSER_PASSWORD="use-a-dedicated-test-password" \
ZIGNS_BROWSER_EXPECTED_ORG="Zigns Smoke Test" \
ZIGNS_BROWSER_EXPECTED_ROLE="admin" \
npm run smoke:browser -- --base-url https://app.zigns.io
```

What it checks:
- Login form controls render in a browser.
- Email/password login reaches the dashboard and expected org/role.
- Team invite modal opens and defaults to Editor.
- Slideshow Tags modal opens with tags, auto-include, and emergency controls.
- Screens -> Emergency Playlists manager opens.
- Screens -> Emergency Audit panel is present.
- Add Screen pairing modal opens or shows the screen-limit prompt.
- Profile issue report modal opens with copied context.

If the authenticated account is not an Admin, the browser pass still checks editor-safe flows and reports the admin-only invite/emergency coverage as skipped. Use a dedicated Admin account in the `Zigns Smoke Test` org for full pilot coverage.

Optional mutating CRUD pass:

```bash
ZIGNS_BROWSER_EMAIL="pilot-admin@example.com" \
ZIGNS_BROWSER_PASSWORD="use-a-dedicated-test-password" \
ZIGNS_BROWSER_EXPECTED_ORG="Zigns Smoke Test" \
ZIGNS_BROWSER_EXPECTED_ROLE="admin" \
ZIGNS_BROWSER_MUTATE=1 \
npm run smoke:browser -- --base-url https://app.zigns.io
```

The mutating pass creates a temporary slideshow, saves a `smoke` tag, toggles its emergency-ready state on and off from the Screens manager, then deletes the temporary slideshow. Only run it against a dedicated pilot test organization.

Run the Phase 5.1 tag propagation pass when validating tag manager or smart playlist changes:

```bash
ZIGNS_SMOKE_EMAIL="pilot-admin@example.com" \
ZIGNS_SMOKE_PASSWORD="use-a-dedicated-test-password" \
ZIGNS_SMOKE_EXPECTED_ORG="Zigns Smoke Test" \
ZIGNS_SMOKE_EXPECTED_ROLE="admin" \
npm run smoke:tags -- --base-url https://app.zigns.io
```

The tag propagation pass creates temporary screen, media, slideshow, published slide, and draft slide records, verifies org tag rename/delete propagation across all of them, then removes the temporary records. Only run it against a dedicated test organization.

## Account And Role Smoke

| Step | Expected Result |
|---|---|
| Sign in with the invited pilot email. | User lands in the intended organization, not a personal fallback org. |
| Refresh the page after dashboard loads. | User remains signed in and dashboard reloads without boot errors. |
| Check lower-left user panel. | Email and role badge match the intended account. |
| Open Profile -> Report Issue. | Issue report modal opens with user, org, URL, page, browser, and viewport context. |
| Copy the issue report. | Toast confirms the report copied. |

Role checks:
- Admin can open Settings -> Team and Screens.
- Editor can create/edit slideshows and screens, but cannot manage billing/team settings.
- Viewer, when used, should be read-only.

## Team Invite Smoke

| Step | Expected Result |
|---|---|
| As an Admin, open Settings -> Team -> Invite Member. | Invite modal opens and defaults to Editor. |
| Send an invite to a controlled test inbox. | Modal says the invite email was sent and also shows a copyable invite link. |
| Confirm the invite email arrives in the inbox. | Message comes from `hello@zigns.io`, subject names the inviter and organization, and the accept link opens Zigns. |
| Open Resend Logs and search the invitee email. | The email appears with sent/delivered status or a clear failure reason. |
| Accept the invite with the invited email. | User lands in the intended organization with the selected role. |
| Return to Settings -> Team. | Pending invite disappears and the new member appears in the team list. |

## Slideshow Authoring Smoke

| Step | Expected Result |
|---|---|
| Open Slideshows. | Existing slideshows show clear names and accurate slide counts. |
| Create a new slideshow. | It appears in the slideshow list and can be selected. |
| Rename the slideshow. | New name persists after refresh. |
| Add an image slide. | Slide appears in the grid and preview. |
| Add media from Google Photos, if the test Google account has a few disposable photos. | Google Photos picker opens, selected photos/videos import into the slideshow, and imported items appear in the media library. |
| Retry Google Photos after an OAuth scope/test-user error, if encountered. | The import modal stays open and shows the Google setup checklist instead of dropping back to a generic failure. |
| Design a slide from a template or blank canvas. | Slide saves as draft and appears in the grid. |
| Change one slide duration. | Duration value persists after navigation/refresh. |
| Save slideshow settings. | Dwell, fit mode, transition type, and speed save cleanly. |
| Publish the slideshow. | Publish completes and unpublished-change indicator clears. |

## Display Pairing Smoke

| Step | Expected Result |
|---|---|
| Open the player setup URL on the display target. | A 6-character pairing code appears. |
| In admin, open Screens -> Add Screen. | Modal shows the full player URL and pairing-code input. |
| Enter the pairing code and connect. | Screen pairs once; no duplicate screen is created by double-clicking. |
| Name the screen. | Friendly name saves and is visible in Screens. |
| Repeat with Skip on a second test if needed. | Default `Screen ABC123` naming still works. |
| Assign the paired screen to a slideshow. | Screen card shows the assigned slideshow. |
| Publish to the screen. | Display updates within a few seconds. |

## Playback Smoke

| Slide Type | Expected Result |
|---|---|
| Image | Renders without cropping surprises under the selected fit mode. |
| Designed slide | Renders text and shapes at the expected scale. |
| Video, if available | Plays or shows a clear autoplay/audio limitation when applicable. |
| YouTube | Plays in supported browsers/devices or shows a clear unsupported/blocked state. |
| Web page | Loads if the target site permits embedding; otherwise shows a clear blocked state. |
| Offline/reload | Browser or native player resumes assigned content after refresh. |

Before changing screen assignment for a playback bug, open Screens -> select the screen and review Player Diagnostics.

## Mobile Companion Smoke

Use a phone viewport or the mobile route.

| Step | Expected Result |
|---|---|
| Sign in on mobile. | User remains in the expected organization. |
| Open Content. | Slideshows list loads without desktop-only layout breakage. |
| Add an image or YouTube slide. | Draft state appears and Publish becomes available. |
| Tap Publish. | Button leaves `Publishing...` and returns to `Up to date` after success. |
| Open Account -> Copy issue report. | Context report copies successfully. |

## Tags, Priority, And Emergency Smoke

| Step | Expected Result |
|---|---|
| Create or rename an org tag. | Tag appears in Settings and is available on screens/slideshows/slides/media. |
| Add a tag to a screen. | Tag chip appears on the screen card. |
| Add tags or auto-include rules to a slideshow. | Settings persist and publish resolves matching slides. |
| Create overlapping schedule events with different priorities. | Display chooses the higher-priority event. |
| Mark a slideshow as an emergency playlist from Screens -> Emergency Playlists. | It appears in the saved playlist emergency picker. |
| Open the saved playlist emergency picker with no marked emergency playlists. | It does not allow arbitrary slideshow selection. |
| Trigger saved emergency playlist by tag or all screens. | Confirmation is required; matching displays switch to the emergency playlist and return after clear/expiry. |
| Clear the emergency broadcast. | Displays return to normal content and Emergency Audit records the clear action. |
| Refresh the Emergency Audit panel. | Recent trigger and clear entries load without Firestore permission errors. |

## CAP Alert Smoke

Do not trigger real public alerts casually. Use test fixtures/manual validation where possible.

| Step | Expected Result |
|---|---|
| Configure CAP fields on a test screen. | State selector, county FIPS normalization, severity floor, and enabled state persist. |
| Review the CAP pilot guidance in screen settings. | Schools, healthcare, and manufacturing setup guidance is visible without changing saved alert behavior. |
| Enter 1-3 digit county FIPS values and save. | Codes are normalized to 3 digits; blank FIPS still targets the whole selected state. |
| Use Send Test from the screen's CAP section. | A clearly marked TEST CAP overlay appears only on the targeted display and expires automatically. |
| Use Clear Test from the same section. | The TEST overlay clears without removing real NWS alerts. |
| Review CAP analytics view. | CAP render totals and recent rows load without permission errors. |
| If a real safe alert is available, run poll path. | Matching screen shows the NWS alert overlay above normal playback. |
| Clear or wait for expiry. | Display returns to assigned slideshow/schedule. |

## Support Intake

For every failure, capture:
- Copied issue report from Profile or mobile Account.
- Screenshot or photo.
- Display screen name and diagnostics, if playback-related.
- Exact publish or pairing time with timezone.
- Whether a reload changed the behavior.

## Exit Criteria

Mark the run as PASS only when:
- Auth, org routing, and role badge are correct.
- A slideshow can be created, edited, published, and viewed on a paired display.
- Screen pairing includes either friendly naming or the documented Skip behavior.
- Mobile publish returns to a non-busy state after success.
- Any blocked media type fails with a clear message instead of a blank screen.
