package com.birdeye

import android.Manifest
import android.content.pm.ApplicationInfo
import android.os.Bundle
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
    val debuggable = remember { context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0 }
    val preview: @Composable (Modifier) -> Unit = { CameraPreview(it) }

    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        when (shift.screen) {
            Screen.StartShift -> {
                val tilt = rememberTilt()
                val checks = StartChecks(
                    camera = cameraGranted,
                    location = locationGranted,
                    gpsFix = locationGranted && shift.hasFix(now),
                    charging = rememberCharging(),
                    mount = mountPasses(tilt, shift.settings),
                )
                StartShiftScreen(
                    checks = checks,
                    tilt = tilt,
                    settings = shift.settings,
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
                KeepScreenOn()
                // Back must not drop a running shift; End shift is the only way out.
                BackHandler {}
                ScanningScreen(
                    cooling = shift.cooling,
                    defectsToday = 0, // placeholder until the queue exists (phase 2), shown with MOCK
                    recordsWaiting = 0, // placeholder until the queue exists (phase 2), shown with MOCK
                    canEndShift = shift.isStill(now),
                    showDebug = debuggable,
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

/** Scanning runs with the app on screen (plan, tier 1), so the screen stays on while it shows. */
@Composable
private fun KeepScreenOn() {
    val view = LocalView.current
    DisposableEffect(view) {
        view.keepScreenOn = true
        onDispose { view.keepScreenOn = false }
    }
}
