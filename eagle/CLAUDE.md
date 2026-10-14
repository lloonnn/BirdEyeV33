# eagle/CLAUDE.md

eagle is the Bird Eye v33 Android app. It captures camera frames, runs the detector on the phone, blurs crops and uploads small records. Read `../docs/decisions.md` and section 3 of `../docs/architecture.md` before adding features.

## Stack

- Kotlin, Jetpack Compose, Material 3. Package and namespace `com.birdeye`, single `:app` module.
- Gradle Kotlin DSL with a version catalog. Every dependency goes into `gradle/libs.versions.toml` and is referenced as `libs.*`. Reason: one place holds all versions.
- compileSdk and targetSdk 37, min SDK 26. Reason for 26: `java.time` works natively without desugaring, and the app writes timestamps with offsets.

## Commands

Run from `eagle/`. These are standard Android Gradle plugin tasks.

```bash
./gradlew assembleDebug                 # build the debug APK
./gradlew installDebug                  # install on a connected device or emulator
./gradlew testDebugUnitTest             # JVM unit tests
./gradlew testDebugUnitTest --tests com.birdeye.ExampleUnitTest   # one test class
./gradlew connectedDebugAndroidTest     # instrumented tests, needs a device or emulator
./gradlew lint                          # Android lint
```

Only the template example tests exist, plus `PreviewRenderTest`, which renders each `@Preview` on a device. Replay mode, the frame pipeline and the background services are not set up yet.

## Per-phone settings

Each phone's own values go in `eagle/local.properties`, which is not committed. Rebuild after changing them.

```properties
birdeye.cameraHeightM=1.2   # camera height above the road in metres, measured in the mount
```

If `birdeye.cameraHeightM` is missing, the app uses 1.0 m, shows "Height not set" as a warning on Start shift, and logs how to set it. Reason: the distance-ahead formula needs the real height, and each vehicle differs.

## Debug and release builds

The demo uses a release build. Debug-only controls, such as the cooling toggle on the Scanning screen, are shown only when `BuildConfig.DEBUG` is true, so they are hidden in the demo. Reason: a driver must never see test controls.

## Theme

- Every screen is wrapped in `BirdEyeTheme()` from `app/src/main/java/com/birdeye/ui/theme/BirdEyeTheme.kt`. Reason: one named theme mirrors the dashboard tokens. Status colours come from `BirdEye.status`, spacing from `PatrolSpacing`.
- Fonts are bundled in `app/src/main/res/font/` (Geist Regular, Medium, SemiBold; Geist Mono Regular, Medium, SemiBold), loaded with `Font(R.font.x, weight)`. Do not use Google downloadable fonts. Reason: no certificates file, and type works offline. The OFL licence text ships in `assets/licenses/geist-OFL.txt`.
- Token values must match `../dashboard/app/globals.css`. Change both in the same commit. Reason: the app and dashboard read as one product.
- Dark by default. Reason: less windscreen glare and less screen heat.
- Touch targets are at least 56 dp. Reason: the driver reads the screen in a one-second glance.
- Labels are in English only. Reason: the team decided on 14 Oct to drop Malay labels for the prototype.
- Status colour is always paired with a word or icon. Reason: colour alone is not readable for everyone.

## Libraries to add per feature

Add each one to the licence register in `../docs/decisions.md` before adding it. Pick the current stable version when you add it.

| Feature | Library |
|---|---|
| Detector | LiteRT (`com.google.ai.edge.litert`), with its GPU delegate |
| Camera | CameraX (`androidx.camera`): camera2, lifecycle, view |
| GPS | Google Play services location (`com.google.android.gms:play-services-location`) |
| Local queue | Room (`androidx.room`) with the KSP plugin for the compiler |
| Uploads | WorkManager (`androidx.work:work-runtime-ktx`) |

**Bundled model.** The offline fallback model lives in `app/src/main/assets/`. It is the only `.tflite` file committed to git; the root `.gitignore` ignores all others. It must not be compressed in the APK, so LiteRT can memory-map it:

```kotlin
android {
    androidResources {
        noCompress += "tflite"
    }
}
```

## Manifest permissions

Add these when the matching feature lands, not before. Reason: unused permissions alarm reviewers and users.

- `CAMERA`
- `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`
- `INTERNET`
- `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_CAMERA`, `FOREGROUND_SERVICE_LOCATION`, with `android:foregroundServiceType="camera|location"` on the scanning service
- `POST_NOTIFICATIONS` for the persistent scanning notification

**Network security config.** For the demo, allow cleartext HTTP to the laptop's address only, through `res/xml/network_security_config.xml` referenced from the manifest. Never allow cleartext globally. Reason: the laptop has no trusted certificate, and any server off the laptop uses HTTPS. Not set up yet.

Check the current Android rules for camera use in foreground services on the target SDK. Reason: the rules tighten with each Android release.

## Rules

- Thresholds (confidence bands, frame rate, input size, crop size, GPS and heartbeat intervals) come from `GET /config`, with starting values as defaults. Never hard-code them.
- Video is never stored or uploaded. Frames are analysed in memory and discarded.
- Faces and plates are blurred on the crop before it is written to the queue.
- Inference runs off the UI thread.
- Duplicate filter: same class within 5 m and 5 s (starting values).
- Upload in batches every 5 minutes during the shift over mobile data (starting value). There is no end-of-shift WiFi sync.
- `urgent` is always false in the 2-class version.
- Heartbeat `state` is `scanning`, `cooling` or `paused`; `pause_reason` is `heat` or `parked` when paused; `online` is a separate boolean; `model_error` reports a failed model load. See `../docs/api-contract.md`.
- Each active range in a track upload carries its frame rate. Reason: the backend counts frames per segment from it.

## Testing split

| What | Where | Reason |
|---|---|---|
| Layout and theme | Compose Preview | Fastest feedback, no device needed |
| Screen flows and navigation | Emulator | Real app lifecycle without hardware |
| Camera, GPS, model speed, heat | Real phone | The emulator cannot reproduce these |
