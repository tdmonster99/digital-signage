# Zigns Android Player

Thin native Android shell for the hosted Zigns display player.

The app loads `https://app.zigns.io/display.html` in a locked-down WebView and
lets the existing web player handle pairing, screen-token auth, playlist
playback, offline cache, and analytics. The native shell adds Android signage
behavior around that player: fullscreen mode, screen wake behavior, boot launch,
network recovery, WebView renderer recovery, and a small maintenance menu.

## Current Scope

- Android TV and Android signage boxes running Android 8.0+.
- Sideload/debug APK for validation, signed release APK for early production
  pilots. Play Store / managed Play distribution is a later packaging step.
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

The player URL defaults to `https://app.zigns.io/display.html`. Override it for
staging or local validation with either a Gradle property or environment
variable:

```bash
gradle --no-daemon :app:assembleDebug \
  -PzignsPlayerUrl=https://app.zigns.io/display.html
```

```bash
export ZIGNS_ANDROID_PLAYER_URL=https://app.zigns.io/display.html
gradle --no-daemon :app:assembleDebug
```

## Release APK Signing

Release signing is configured but secrets are intentionally local-only. Use
either environment variables:

```bash
export ZIGNS_ANDROID_KEYSTORE=/secure/path/zigns-player-release.jks
export ZIGNS_ANDROID_KEYSTORE_PASSWORD=...
export ZIGNS_ANDROID_KEY_ALIAS=zigns-player
export ZIGNS_ANDROID_KEY_PASSWORD=...

gradle --no-daemon :app:assembleRelease
```

Or create an ignored `player-android/keystore.properties` file:

```properties
storeFile=/secure/path/zigns-player-release.jks
storePassword=...
keyAlias=zigns-player
keyPassword=...
```

Then build:

```bash
gradle --no-daemon :app:assembleRelease
```

When signing values are present, the signed APK is written under
`app/build/outputs/apk/release/`. Without signing values, Gradle can still
produce an unsigned release artifact for CI/build smoke only; do not install or
ship unsigned release builds.

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
screen on while the activity is visible, tries to relaunch after boot, and can
enter Android lock-task mode when provisioned as device owner. For production
fleets, pair it with the device's kiosk/device-owner tooling:

- Set **Zigns Player** as the launcher or a pinned app.
- Disable system sleep/reboot prompts where the hardware allows it.
- Allow launch-on-boot for the app.
- Provision Zigns as device owner when the hardware allows it so the shell can
  auto-enter lock-task mode.
- Use the admin Screen diagnostics panel to confirm `Shell: android <version>`
  and verify viewport, codecs, cache support, and online/offline events.

Some consumer Android/Google TV builds restrict background activity launches
after boot unless the app is provisioned as kiosk/device owner or the device
vendor explicitly allows autostart.

### Device Owner Test Provisioning

Device-owner setup normally requires an MDM/Android Enterprise enrollment flow.
For an emulator or a dedicated lab device with no accounts configured, you can
use ADB:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell dpm set-device-owner io.zigns.player/.ZignsDeviceAdminReceiver
adb shell monkey -p io.zigns.player 1
```

After launch, the player should hide system navigation and enter lock-task mode.
Long-press the screen, or press Menu/Settings on a remote, to open maintenance
actions. Device-owner state can be hard to remove on consumer hardware; use a
test device or AVD unless you are prepared to retire it through MDM or factory
reset it.

## Production Smoke Test Matrix

Run this checklist before listing a hardware profile as supported:

- **Install/update:** fresh install, update over prior debug or release build,
  reboot, and verify launch-on-boot behavior.
- **Pairing:** pair a new screen code from the admin Screens page, reload the
  Android app, and confirm it keeps the same screen identity.
- **Playback:** publish image, video, designed slide, webpage, and YouTube
  slides; confirm each renders fullscreen without touch input.
- **Playlist changes:** delete or replace the currently displayed slide and
  publish; confirm the Android player switches away from stale content within
  one realtime update.
- **Offline/recovery:** disconnect network during playback, confirm cached
  content continues where possible, reconnect, and confirm diagnostics report
  online again.
- **Kiosk:** validate remote/menu access to Reload player and Reset pairing;
  when device owner is enabled, validate lock-task entry and the maintenance
  Exit kiosk action.
- **Diagnostics:** in admin Screen details, confirm Android shell version,
  viewport, media support, cache support, online/offline events, and recent
  errors are accurate.
