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

## Slideshow Authoring Smoke

| Step | Expected Result |
|---|---|
| Open Slideshows. | Existing slideshows show clear names and accurate slide counts. |
| Create a new slideshow. | It appears in the slideshow list and can be selected. |
| Rename the slideshow. | New name persists after refresh. |
| Add an image slide. | Slide appears in the grid and preview. |
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
| Mark a slideshow as an emergency playlist. | It appears in the saved playlist emergency picker. |
| Trigger saved emergency playlist by tag or all screens. | Matching displays switch to the emergency playlist and return after clear/expiry. |

## CAP Alert Smoke

Do not trigger real public alerts casually. Use test fixtures/manual validation where possible.

| Step | Expected Result |
|---|---|
| Configure CAP fields on a test screen. | State, county FIPS, severity floor, and enabled state persist. |
| Review CAP analytics view. | CAP render totals and recent rows load without permission errors. |
| If a safe test alert is available, run poll path. | Matching screen shows the alert overlay above normal playback. |
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
