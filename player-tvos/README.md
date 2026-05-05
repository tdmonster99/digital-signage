# Zigns tvOS Player Spike

Technical spike for a native Apple TV player shell around the hosted Zigns
display player.

Apple TV does not provide a normal browser/kiosk URL path, so the supported
shape for Zigns is a small native tvOS app that embeds the hosted player in a
`WKWebView`.

## Status

- Current state: source-level scaffold and runbook. The Swift files in
  `ZignsPlayer/` are intended to be imported into a new Xcode tvOS App project.
- Package target: signed tvOS app distributed by local Xcode install,
  TestFlight, App Store, Apple Business Manager, or Apple School Manager.
- Not production-supported until an Xcode project is created on macOS, signed,
  run on Apple TV hardware, and smoke tested.

Official references:

- tvOS app submission overview:
  https://developer.apple.com/tvos/submit/
- Apple Developer Program membership:
  https://developer.apple.com/support/compare-memberships/
- Run an app on a device with Xcode:
  https://help.apple.com/xcode/mac/current/en.lproj/dev5a825a1ca.html
- TestFlight distribution:
  https://help.apple.com/xcode/mac/current/en.lproj/dev2539d985f.html

## Wrapper Design

The native app launches a `WKWebView` pointing to:

```text
https://app.zigns.io/display.html?nativePlatform=tvos&nativeVersion=<app-version>
```

The hosted player remains the source of truth for pairing, screen-token auth,
playlist playback, offline cache, analytics, and diagnostics. The native tvOS
shell exists for Apple TV installation, signing, launcher metadata, wake/idle
behavior, remote-friendly reset/reload actions, and future Apple-specific
deployment hooks.

## What Can Be Done Without a Mac

- Keep this runbook and technical spike current.
- Maintain the Swift source scaffold in `ZignsPlayer/`.
- Validate that the hosted player already recognizes `nativePlatform=tvos` in
  diagnostics.
- Define the smoke matrix and support boundaries before hardware arrives.
- Prepare Apple Developer account and bundle ID decisions.

## What Requires macOS / Xcode

- Create the `.xcodeproj` or `.xcworkspace`.
- Add app icons, launch screen assets, and signing capabilities.
- Build the tvOS target.
- Pair Apple TV hardware with Xcode.
- Install locally or upload to TestFlight/App Store Connect.
- Validate `WKWebView` behavior on real Apple TV hardware.

## Recommended Xcode Project Settings

- Template: **tvOS App**.
- Interface: **SwiftUI**.
- Language: **Swift**.
- Product name: `Zigns Player`.
- Bundle ID: `io.zigns.player.tvos`.
- Minimum deployment target: choose after first hardware validation. Start with
  the oldest tvOS version Apple/Xcode still supports for app submission, then
  raise if WebKit behavior requires it.
- Signing: automatic signing with the Zigns Apple Developer team.

After creating the project, replace the generated Swift files with the files in
`ZignsPlayer/` or copy their contents into the generated app target.

## Apple Developer Inputs

- Apple Developer Program team for distribution.
- App Store Connect app record for TestFlight/App Store distribution.
- Bundle ID: `io.zigns.player.tvos`.
- App display name: `Zigns Player`.
- Privacy answers: the hosted player uses Firebase/Auth-related storage,
  analytics/proof-of-play events, and network access to Zigns/CDN/media sources.
- Distribution lane decision:
  - Local Xcode install for first hardware spike.
  - TestFlight for private pilot validation.
  - App Store for broad self-serve customers.
  - Apple Business Manager custom app if enterprise/customer-specific
    distribution becomes the better fit.

Do not commit Apple signing certificates, provisioning profiles, exported
archives, App Store Connect API keys, or private issuer/key IDs.

## Apple TV Pairing Flow

1. Create the tvOS project on a Mac and enable automatic signing.
2. Connect the Mac and Apple TV to the same network.
3. In Xcode, open **Window > Devices and Simulators**.
4. On Apple TV, open **Settings > Remotes and Devices > Remote App and
   Devices**.
5. Select the discovered Apple TV in Xcode and enter the pairing code shown on
   the TV.
6. Run **Zigns Player** from Xcode.
7. The app should show the normal Zigns pairing code.
8. In Zigns admin, open Screens, pair the code, and rename the screen with the
   device location.

## Spike Validation Checklist

- Xcode project builds and signs for tvOS.
- App installs and launches on Apple TV hardware.
- First launch shows the Zigns pairing code.
- Admin pairing succeeds and survives app restart.
- Firestore realtime updates work for publish, delete, and replace operations.
- Image, video, PDF, designed slide, webpage, and YouTube slides render.
- YouTube autoplay and iframe behavior are acceptable in tvOS WebKit.
- Offline cache behavior is documented honestly; tvOS may evict WebKit storage
  more aggressively than signage-focused platforms.
- Apple Remote actions do not expose unwanted navigation or strand the player.
- `UIApplication.shared.isIdleTimerDisabled` keeps playback visible during
  normal signage use.
- Admin diagnostics reports shell `tvos <version>`, viewport, media support,
  online/offline transitions, and recent player errors.

## Open Questions

- Minimum Apple TV model and tvOS version.
- Whether tvOS WebKit allows the full current media matrix, especially YouTube
  autoplay and iframe-heavy webpage slides.
- Whether Apple App Review accepts the player as a signage client or whether
  custom/private distribution is preferable.
- Whether the app needs a native settings/reset screen beyond the basic reload
  and reset actions planned for the first Xcode pass.
- Whether enterprise buyers expect MDM-managed Apple TV deployment through
  Apple Business Manager and Jamf/Mosyle/Kandji.
