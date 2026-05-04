# Zigns webOS Player Spike

Technical spike for an LG webOS TV / webOS Signage Web App wrapper around the
hosted Zigns display player.

## Status

- Current state: source scaffold only.
- Package target: `.ipk` Web app built with the webOS CLI.
- Not production-supported until it is packaged, installed, and smoke tested on
  real LG webOS signage hardware.

Official references:

- webOS TV `appinfo.json` metadata:
  https://webostv.developer.lge.com/develop/references/appinfo-json
- webOS TV app template:
  https://webostv.developer.lge.com/develop/getting-started/app-template
- webOS CLI reference:
  https://webostv.developer.lge.com/develop/tools/cli-introduction

## Wrapper Design

The packaged app launches `index.html`, which immediately redirects to:

```text
https://app.zigns.io/display.html?nativePlatform=webos&nativeVersion=0.1.0
```

The hosted player remains the source of truth for pairing, screen-token auth,
playlist playback, offline cache, analytics, and diagnostics. The local webOS
package exists for launcher metadata, install/update packaging, signing or
store distribution, and future platform hooks.

## Build Requirements

- webOS SDK / CLI.
- LG developer device setup for simulator or physical TV.
- `icon.png` and `largeicon.png` exported from `icon.svg` before packaging.

The checked-in `appinfo.json` points at PNG icons because LG's app metadata docs
define PNG icons for packaging/submission. Keep the SVG as the source asset and
export platform-size PNGs locally before building.

## Package / Install Sketch

From `player-webos/`:

```bash
ares-package .
ares-setup-device
ares-install --device <device-name> io.zigns.player_0.1.0_all.ipk
ares-launch --device <device-name> io.zigns.player
```

Treat these as spike notes until confirmed against the local webOS CLI and a
real LG signage panel.

## Spike Validation Checklist

- PNG icons are exported and `.ipk` packaging succeeds.
- App installs and launches on a webOS TV/signage device.
- First launch shows the Zigns pairing code.
- Admin pairing succeeds and survives app restart.
- Firestore realtime updates work for publish, delete, and replace operations.
- Image, video, PDF, designed slide, webpage, and YouTube slides render.
- YouTube autoplay and iframe behavior are acceptable on target firmware.
- Offline cache behavior matches Chrome/Android expectations.
- Remote-control Back/Home behavior does not strand the app in a bad state.
- Device power-on or signage scheduler can relaunch the app unattended.
- Admin diagnostics reports shell `webos 0.1.0`, viewport, media support, and
  online/offline transitions.

## Open Questions

- Minimum supported webOS TV / webOS Signage version and model year.
- Best deployment lane: sideload, LG Seller Lounge, LG ConnectedCare/signage
  tooling, or MDM partner.
- Whether any LG-specific APIs are needed for power, watchdog, orientation, or
  autostart behavior.
- Whether the app needs a local keepalive or service once long-run panel testing
  starts.
