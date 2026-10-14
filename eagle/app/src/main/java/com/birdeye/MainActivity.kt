package com.birdeye

import android.Manifest
import android.app.Activity
import android.os.Bundle
import android.util.Log
import android.os.SystemClock
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import com.birdeye.ui.theme.BirdEyeTheme
import kotlinx.coroutines.delay

class MainActivity : ComponentActivity() {
    private val shift: ShiftViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!BuildConfig.CAMERA_HEIGHT_SET) {
            Log.w(
                "BirdEye",
                "Camera height not set, using ${BuildConfig.CAMERA_HEIGHT_M} m. " +
                    "Set birdeye.cameraHeightM in eagle/local.properties and rebuild.",
            )
        }
        enableEdgeToEdge()
        setContent {
            BirdEyeTheme {
                BirdEyeApp(shift)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        shift.resumeTick++
    }
}

/** Switches screens by the shift state. No navigation library: three screens need no back stack. */
@Composable
fun BirdEyeApp(shift: ShiftViewModel) {
    val context = LocalContext.current
    var permissionResults by remember { mutableIntStateOf(0) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        permissionResults++
    }
    // Re-checked after every permission answer and every return to the app.
    val tick = shift.resumeTick + permissionResults
    val cameraGranted = remember(tick) { hasPermission(context, Manifest.permission.CAMERA) }
    val locationGranted = remember(tick) { hasPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) }
    LaunchedEffect(locationGranted) { if (locationGranted) shift.startLocation() }

    val now by produceState(SystemClock.elapsedRealtime()) {
        while (true) {
            delay(1000)
            value = SystemClock.elapsedRealtime()
        }
    }
    val preview: @Composable (Modifier) -> Unit = { CameraPreview(it) }

    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        when (shift.screen) {
            Screen.StartShift -> {
                val tilt = rememberTilt()
                val checks = StartChecks(
                    camera = cameraGranted,
                    location = locationGranted,
                    gps = if (locationGranted) shift.gpsCheck(now) else null,
                    charging = rememberCharging(),
                    mount = mountPasses(tilt, shift.settings),
                )
                StartShiftScreen(
                    checks = checks,
                    tilt = tilt,
                    settings = shift.settings,
                    cameraHeightM = BuildConfig.CAMERA_HEIGHT_M,
                    cameraHeightSet = BuildConfig.CAMERA_HEIGHT_SET,
                    onAllowPermissions = {
                        launcher.launch(
                            arrayOf(
                                Manifest.permission.CAMERA,
                                Manifest.permission.ACCESS_FINE_LOCATION,
                                Manifest.permission.ACCESS_COARSE_LOCATION,
                            ),
                        )
                    },
                    onStart = { tilt?.let { shift.startShift(it.pitchDownDeg) } },
                    preview = preview,
                )
            }

            Screen.Scanning -> {
                ScanningWindow(brightness = shift.settings.scanningBrightness)
                // Back must not drop a running shift; End shift is the only way out.
                BackHandler {}
                ScanningScreen(
                    cooling = shift.cooling,
                    defectsToday = 0, // placeholder until the queue exists (phase 2), shown with MOCK
                    recordsWaiting = 0, // placeholder until the queue exists (phase 2), shown with MOCK
                    endShiftReason = shift.endShiftReason(now),
                    noGpsSeconds = shift.settings.endShiftNoFixS.toInt(),
                    // Debug builds only. The demo uses a release build, so the toggle is hidden there.
                    showDebug = BuildConfig.DEBUG,
                    onEndShift = { shift.endShift() },
                    onToggleCooling = { shift.cooling = !shift.cooling },
                    preview = preview,
                )
            }

            Screen.EndOfShift -> EndOfShiftScreen(
                distanceKm = shift.distanceM / 1000,
                defectsFound = 0, // placeholder until the queue exists (phase 2), shown with MOCK
                uploadsCompleted = 0, // placeholder until uploads exist (phase 2), shown with MOCK
                onNewShift = { shift.newShift() },
            )
        }
    }
}

/**
 * Scanning runs with the app on screen (plan, tier 1): keep the screen on, and dim it to
 * scanning_brightness to cut heat. The previous brightness comes back when Scanning ends.
 */
@Composable
private fun ScanningWindow(brightness: Float) {
    val view = LocalView.current
    val window = (LocalContext.current as? Activity)?.window
    DisposableEffect(view, window, brightness) {
        view.keepScreenOn = true
        val previous = window?.attributes?.screenBrightness
        window?.let { it.attributes = it.attributes.apply { screenBrightness = brightness } }
        onDispose {
            view.keepScreenOn = false
            if (window != null && previous != null) {
                window.attributes = window.attributes.apply { screenBrightness = previous }
            }
        }
    }
}
