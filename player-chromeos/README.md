# Zigns ChromeOS Kiosk Profile

Managed ChromeOS is the lowest-risk non-native platform for Zigns because the
hosted browser player already carries pairing, playback, offline cache, and
diagnostics. This directory is a deployment runbook, not a custom binary.

## Status

- Supported path target: managed Chromebox, Chromebase, or ChromeOS Flex device
  enrolled in Google Admin with a kiosk-capable ChromeOS management license.
- Current state: deployment documentation and support checklist are ready for a
  managed-device validation pass.
- Not production-certified until at least one managed ChromeOS device completes
  the smoke matrix below.

Official references:

- ChromeOS kiosk overview: https://chromeos.dev/en/kiosk
- Google for Developers kiosk guide:
  https://developers.google.com/chromeos/app-development/learn/kiosk

## Launch URL

Use this as the kiosk launch URL:

```text
https://app.zigns.io/display.html?nativePlatform=chromeos-kiosk&nativeVersion=0.1.0
```

Do not include a `screen` query parameter in production. The player should show
the normal Zigns pairing code on first launch, then retain its screen identity in
browser storage after it is paired from the admin dashboard.

## Recommended Hardware Profile

Prefer commercial devices with:

- ChromeOS Auto Update Expiration still far in the future.
- Wired Ethernet or stable enterprise Wi-Fi.
- HDMI-CEC or hardware power scheduling if the display needs automatic power
  control.
- At least 4 GB RAM for video-heavy playlists; 8 GB preferred for multizone and
  webpage slides.
- Fanless enclosure only when the device is rated for the installation
  temperature.

Avoid unmanaged consumer Chromebooks for production signage. They can validate
browser behavior, but they do not provide the remote management and kiosk
controls buyers expect.

## Google Admin Policy Checklist

Create a dedicated organizational unit for signage devices before enrollment.
Apply these policies to that OU:

- **Kiosk app**: deploy Zigns as the single auto-launched kiosk web app using the
  launch URL above.
- **Auto launch**: start the Zigns kiosk app without requiring user login.
- **Power**: disable sleep while on AC power; keep display on during signage
  hours unless the venue handles panel power separately.
- **Reboot**: set a planned maintenance reboot window outside business hours.
- **Updates**: use staged ChromeOS rollouts; validate new Chrome/WebView
  behavior on a test OU before broad fleet release.
- **Network**: preconfigure Wi-Fi or Ethernet and any enterprise certificates
  before the device reaches the site.
- **Time zone**: set the device time zone when the screen should not use local
  device auto-detection.
- **Remote access**: enable admin screenshot/log tooling if available in the
  customer's ChromeOS license.
- **Peripheral lockdown**: disable unmanaged USB/storage use where the venue
  requires it.

## Installation Flow

1. Enroll the ChromeOS device into the signage OU.
2. Confirm network, time, and update policies are applied.
3. Assign the Zigns kiosk launch URL as the auto-launched app.
4. Reboot the device.
5. Wait for the pairing code.
6. In Zigns admin, open Screens and pair the code.
7. Rename the screen with the device location and asset tag.
8. Publish a test slideshow and confirm playback.

## Support Checklist

Collect these details for each customer fleet:

- Device model and ChromeOS version.
- Network type: Ethernet, Wi-Fi, captive portal, proxy, or certificate-based.
- Display model, resolution, orientation, and power schedule.
- Whether the device is in Google Admin and which OU owns it.
- Whether ChromeOS updates are pinned, staged, or immediate.
- Whether remote screenshots/logs are available to support.
- Zigns screen ID, venue, location, and assigned slideshow.

## Production Smoke Test Matrix

Run this before listing a ChromeOS hardware profile as supported:

- **First boot:** device auto-launches Zigns after reboot without user login.
- **Pairing:** first launch shows a pairing code; admin pairing succeeds; reload
  keeps the same screen identity.
- **Playback:** image, video, PDF, designed slide, webpage, and YouTube slides
  render fullscreen.
- **Playlist changes:** deleting or replacing the active slide updates the kiosk
  quickly and does not keep stale YouTube/webpage content alive.
- **Offline/recovery:** disconnect network, confirm cached playback behavior,
  reconnect, and confirm diagnostics reports online again.
- **Power/reboot:** scheduled reboot returns to Zigns without manual input.
- **Update safety:** move one test device to the next ChromeOS release channel
  before production rollout.
- **Diagnostics:** admin Screen details show platform `chromeos`, correct
  viewport, cache support, media support, and recent online/offline events.

## Known Gaps

- No native ChromeOS app package is planned yet; the kiosk web app is the
  preferred path unless a buyer requires Chrome Web Store distribution.
- ChromeOS policy names and licensing labels vary by Admin Console generation;
  validate exact customer-console wording during the first managed deployment.
- Device sleep and HDMI power behavior can still depend on panel firmware.
