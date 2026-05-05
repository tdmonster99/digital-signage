# tvOS Technical Spike

This spike keeps the first Apple TV pass intentionally thin: build a reliable
native wrapper, then let the existing hosted display player do the real work.

## Hypothesis

Zigns can support Apple TV with a native tvOS shell that embeds
`https://app.zigns.io/display.html` in `WKWebView`, passes
`nativePlatform=tvos`, disables idle sleep while visible, and exposes a small
remote-friendly reload/reset path.

## Non-Goals For The First Spike

- No native Firebase SDK.
- No native media renderer.
- No local playlist database outside WebKit storage.
- No App Store submission until real-device playback behavior is known.
- No Apple Business Manager custom-app path until the basic TestFlight path is
  proven.

## Architecture

```text
Apple TV launcher
  -> Zigns Player tvOS app
    -> SwiftUI shell
      -> WKWebView
        -> https://app.zigns.io/display.html?nativePlatform=tvos&nativeVersion=...
          -> existing pairing, screen token, playback, cache, analytics
```

The hosted player already emits platform diagnostics when `nativePlatform=tvos`
is present, so admin Screen details can identify this as an Apple TV shell
without a native telemetry bridge.

## First Xcode Pass

1. Create a tvOS SwiftUI app named `Zigns Player`.
2. Use bundle ID `io.zigns.player.tvos`.
3. Copy the files from `ZignsPlayer/` into the app target.
4. Add app icons and launch screen assets in Xcode.
5. Enable automatic signing.
6. Run on the Apple TV simulator for a smoke check.
7. Pair with real Apple TV hardware and run from Xcode.

## Native Controls

Initial controls should be deliberately minimal:

- Normal launch: open hosted player.
- Menu/Back: do not navigate away from the player by default.
- Long press or future hidden gesture: show a native maintenance sheet.
- Maintenance actions:
  - Reload player.
  - Reset pairing by clearing WebKit website data and reloading with `reset=1`.

The source scaffold includes the player loading pieces. The maintenance UI is a
Mac/Xcode follow-up because remote-event handling should be tested against real
tvOS focus behavior instead of guessed from WSL.

## Risks To Validate

- **Autoplay:** tvOS WebKit may handle video and YouTube autoplay differently
  than Chrome/Android/Tizen/webOS.
- **Storage:** tvOS may evict WebKit caches/local storage under pressure.
- **Remote behavior:** Menu/Home/Back behavior may interrupt signage playback.
- **App Review:** A thin web-wrapper signage player may need clear product
  framing and privacy answers.
- **MDM:** Enterprise Apple TV deployment may depend on Apple Business Manager
  plus Jamf/Mosyle/Kandji rather than public App Store discovery.

## Decision Gates

Call tvOS viable only after:

- Real Apple TV can pair and remain paired after app restart.
- Publish/delete/replace updates arrive in realtime.
- The core slide matrix renders acceptably.
- The player stays awake during extended playback.
- Reset/reload is possible without deleting/reinstalling the app.
- Distribution path is chosen: TestFlight, App Store, or custom app.
