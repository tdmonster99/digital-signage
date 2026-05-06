# Zigns Pilot Quickstart

Use this runbook when onboarding a pilot customer or internal test group. For repeatable validation runs, use `docs/PILOT_SMOKE_TEST.md`.

## Current Pilot: Novares

Production app: https://app.zigns.io

Organization: `Novares`

Pilot plan:
- All paid/premium app features enabled
- Unlimited screens
- Unlimited users
- 100 GB storage allowance

Current pilot users:
- `jzegar@novaresteam.com` - Admin
- `astacy@novaresteam.com` - Editor
- `tpaul@novaresteam.com` - Editor

Important: these users should join the `Novares` organization through explicit pending invitations. Do not use a global email-domain fallback that upgrades any personal org created by those emails.

## First Sign-In

1. Open https://app.zigns.io/login.
2. Sign in with the exact invited email address.
3. If using Google, select the invited Google account when prompted.
4. On first sign-in, `/api/link-account` should auto-accept the pending invitation and place the user in the `Novares` organization.
5. Confirm the lower-left account panel shows the expected email and role.

Expected roles:
- Admins can manage team members, billing/settings, screens, and all content.
- Editors can create and edit media, slideshows, schedules, and screens. They cannot manage team members or billing settings.

If a pilot user lands in a new personal organization instead of `Novares`, do not keep testing in that org. Sign out and verify that the pending invitation email exactly matches the login email.

## Create And Publish Content

1. Go to `Slideshows`.
2. Use `Add Media`, `Design a Slide`, or app/widget slides to add content.
3. Check individual slide durations if timing matters.
4. Click `Publish`.
5. Select the target screen(s) and confirm.

If approval workflow is enabled for the organization, Editors may see `Submit for Review` instead of direct publish. An Admin must approve the draft before it appears on screens.

## Set Up A Display

Player setup URL: https://app.zigns.io/display.html

1. Open the player setup URL on the TV, kiosk, browser, or native player app.
2. A 6-character pairing code appears.
3. In Zigns, go to `Screens` -> `Add Screen`.
4. Enter the code and click `Connect Screen`.
5. Assign the screen to a slideshow if it is not already showing the intended content.
6. For browser displays, use fullscreen mode. Press F11 on Windows, Linux, or ChromeOS.

For native Android, Tizen, webOS, or tvOS wrappers, the app opens the same hosted player URL inside the native shell.

## Pilot Smoke Checklist

Detailed harness: `docs/PILOT_SMOKE_TEST.md`

For each pilot account:
- Can sign in and remain signed in after refresh.
- Lands in the expected organization.
- Can see the correct role badge.
- Can create or edit a slideshow.
- Can add at least one image or designed slide.
- Can publish to a paired screen.
- Display updates within a few seconds after publish.
- Screen can be renamed, assigned to a slideshow, and removed by an Admin.

For each display device:
- Pairing code appears.
- Pairing succeeds from the dashboard.
- Published image/designed slides render.
- YouTube or webpage slides either render or show a clear blocked/unsupported message.
- Device survives a browser/app reload and resumes the assigned slideshow.

## Support Notes To Capture

When a pilot user reports an issue, capture:
- User email
- Organization name
- Browser/device and operating system
- Screen name or pairing code if relevant
- Slideshow name
- Approximate time of the issue with timezone
- Screenshot or photo
- Whether the problem happened after publish, reload, sign-in, pairing, or idle playback

For screen playback issues, open `Screens`, select the screen, and check Player Diagnostics before changing the screen assignment.
