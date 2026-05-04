# Zigns Android Player

Thin native Android shell for the hosted Zigns display player.

The app loads `https://app.zigns.io/display.html` in a locked-down WebView and
lets the existing web player handle pairing, screen-token auth, playlist
playback, offline cache, and analytics. The native shell adds Android signage
behavior around that player: fullscreen mode, screen wake behavior, boot launch,
network recovery, WebView renderer recovery, and a small maintenance menu.

## Current Scope

- Android TV and Android signage boxes running Android 8.0+.
- Sideload/debug APK first. Play Store / managed Play distribution is a later
  packaging step.
- No native Firebase or account credentials. Pair through the normal Zigns admin
  screen pairing code.

## Build Requirements

- JDK 17
- Android SDK platform 36
- Android SDK build tools 36.1.0
- Android Gradle Plugin 9.1.0
- Gradle 9.3.1

The checked-in project does not include a Gradle wrapper jar. Open
`player-android/` in Android Studio or run it with a system Gradle install that
matches the versions above.

In this WSL workspace, source the local toolchain first:

```bash
source /home/jzegar/dev/zigns/.local-tools/env.sh
cd /home/jzegar/dev/zigns/app/player-android
gradle --no-daemon :app:assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Device Flow

1. Install and open **Zigns Player**.
2. The app opens the hosted display player in fullscreen mode.
3. If this Android device has not been paired, it shows the normal Zigns pairing
   code.
4. In the admin dashboard, open Screens and pair that code.
5. The WebView keeps its screen identity in local storage, same as a browser.

The app appends `ZignsAndroidPlayer/<version>` to the WebView user agent and
passes `nativePlatform=android&nativeVersion=<version>` to `display.html`.
Those values appear in player diagnostics after the screen reports its next
`player_capabilities` event.

## Maintenance Menu

Long-press the screen, or press Menu/Settings on a remote, to open the local
maintenance menu:

- Reload player
- Reset pairing
- Cancel

Reset pairing clears WebView storage/cookies/cache and reloads the display
player with `?reset=1`, returning the device to the pairing screen.

## Kiosk Notes

The app declares launcher and Android TV leanback launcher entries, keeps the
screen on while the activity is visible, and tries to relaunch after boot. For
production fleets, pair it with the device's kiosk/device-owner tooling:

- Set **Zigns Player** as the launcher or a pinned app.
- Disable system sleep/reboot prompts where the hardware allows it.
- Allow launch-on-boot for the app.
- Use the admin Screen diagnostics panel to confirm `Shell: android <version>`
  and verify viewport, codecs, cache support, and online/offline events.

Some consumer Android/Google TV builds restrict background activity launches
after boot unless the app is provisioned as kiosk/device owner or the device
vendor explicitly allows autostart.
