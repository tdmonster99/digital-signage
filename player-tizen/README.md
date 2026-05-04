# Zigns Tizen Player Spike

Technical spike for a Samsung Tizen TV / Smart Signage Web Application wrapper
around the hosted Zigns display player.

## Status

- Current state: source scaffold only.
- Package target: `.wgt` Web application built with Tizen Studio and the TV
  extension.
- Not production-supported until it is packaged, signed, installed, and smoke
  tested on real Samsung commercial signage hardware.

Official references:

- Tizen Web Application overview:
  https://docs.tizen.org/application/web/index
- Tizen/Samsung TV first app guide:
  https://docs.tizen.org/application/web/get-started/tv/first-samsung-tv-app
- Samsung TV app configuration guide:
  https://developer.samsung.com/smarttv/develop/guides/fundamentals/configuring-tv-applications.html

## Wrapper Design

The packaged app launches `index.html`, which immediately redirects to:

```text
https://app.zigns.io/display.html?nativePlatform=tizen&nativeVersion=0.1.0
```

The hosted player remains the source of truth for pairing, screen-token auth,
playlist playback, offline cache, analytics, and diagnostics. The local Tizen
package exists to satisfy TV installation, launcher, signing, and future
platform-specific hooks.

## Build Requirements

- Tizen Studio with Samsung TV extension.
- A Samsung certificate profile suitable for the target device or store path.
- A target TV/signage panel with Developer Mode enabled, or a Tizen TV emulator.

## Package / Install Sketch

From `player-tizen/`, validate the project in Tizen Studio first. CLI commands
vary by installed Tizen Studio version, but the expected shape is:

```bash
tizen build-web -- .
tizen package -t wgt -s <security-profile> -- .buildResult
sdb devices
tizen install -n ZignsPlayer.wgt -t <device-name>
```

Treat these as spike notes until confirmed against the local Tizen Studio
install and a real Samsung signage panel.

## Spike Validation Checklist

- `.wgt` builds and signs with a local Samsung certificate profile.
- App installs and launches on a Samsung TV/signage device.
- First launch shows the Zigns pairing code.
- Admin pairing succeeds and survives app restart.
- Firestore realtime updates work for publish, delete, and replace operations.
- Image, video, PDF, designed slide, webpage, and YouTube slides render.
- YouTube autoplay and iframe behavior are acceptable on target firmware.
- Offline cache behavior matches Chrome/Android expectations.
- Remote-control keys do not expose unwanted browser chrome.
- Device power-on or signage scheduler can relaunch the app unattended.
- Admin diagnostics reports shell `tizen 0.1.0`, viewport, media support, and
  online/offline transitions.

## Open Questions

- Minimum supported Tizen version and panel model year.
- Best unattended launch path for Samsung commercial signage: native app,
  MagicINFO, URL Launcher fallback, or partner/store distribution.
- Whether strict content-security or access-origin rules need tightening after
  the media/CDN/widget matrix is known.
- Whether a local Tizen service is needed for watchdog or boot behavior.
