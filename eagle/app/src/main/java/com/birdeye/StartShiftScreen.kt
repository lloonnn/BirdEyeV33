package com.birdeye

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.birdeye.ui.theme.BirdEye
import com.birdeye.ui.theme.BirdEyeTheme
import com.birdeye.ui.theme.PatrolSpacing

/** Result of the Start shift self checks. Start is enabled only when every one passes. */
data class StartChecks(
    val camera: Boolean,
    val location: Boolean,
    /** Null while location permission is missing. */
    val gps: GpsCheck?,
    val charging: Boolean,
    val mount: Boolean,
) {
    val allPass get() = camera && location && gps is GpsCheck.Ok && charging && mount
}

/**
 * The one screen the driver touches. Done while parked: permissions, GPS, charging and the mount
 * check, with a horizon line over the preview to line up the mount.
 */
@Composable
fun StartShiftScreen(
    checks: StartChecks,
    tilt: Tilt?,
    settings: AppSettings,
    cameraHeightM: Double,
    cameraHeightSet: Boolean,
    onAllowPermissions: () -> Unit,
    onStart: () -> Unit,
    preview: @Composable (Modifier) -> Unit,
) {
    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .safeDrawingPadding()
            .verticalScroll(rememberScrollState())
            .padding(PatrolSpacing.md),
        verticalArrangement = Arrangement.spacedBy(PatrolSpacing.md),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            StateLabel(
                R.string.start_shift,
                Modifier.weight(1f), style = MaterialTheme.typography.headlineMedium,
            )
            if (Api.isMock) MockLabel()
        }
        Box(
            Modifier
                .fillMaxWidth()
                .height(220.dp)
                .clip(MaterialTheme.shapes.medium)
                .background(MaterialTheme.colorScheme.surface),
        ) {
            if (checks.camera) preview(Modifier.fillMaxSize())
            HorizonOverlay(
                tilt = tilt,
                fov = if (checks.camera) rememberCameraFov() else null,
                color = if (checks.mount) BirdEye.status.done else BirdEye.status.medium,
                modifier = Modifier.fillMaxSize(),
            )
        }
        CheckRow(R.string.check_camera, checkOf(checks.camera))
        CheckRow(R.string.check_location, checkOf(checks.location))
        CheckRow(
            R.string.check_gps,
            checkOf(checks.gps is GpsCheck.Ok),
            detail = when (val gps = checks.gps) {
                null -> stringResource(R.string.gps_needs_permission)
                is GpsCheck.Ok -> stringResource(R.string.gps_ready)
                GpsCheck.LocationOff -> stringResource(R.string.gps_location_off)
                // No fix and a too-rough fix need the same action from the driver: wait.
                GpsCheck.NoFix, is GpsCheck.TooInaccurate -> stringResource(R.string.gps_searching)
            },
        )
        CheckRow(R.string.check_charging, checkOf(checks.charging))
        CheckRow(
            R.string.check_mount, checkOf(checks.mount),
            // Upward tilt shows as "up" rather than a negative number of degrees down.
            detail = tilt?.let {
                stringResource(
                    if (it.pitchDownDeg < 0) R.string.mount_tilt_up else R.string.mount_tilt_down,
                    "%.1f".format(kotlin.math.abs(it.pitchDownDeg)),
                    "%.0f".format(settings.mountTiltMinDeg),
                    "%.0f".format(settings.mountTiltMaxDeg),
                )
            } ?: stringResource(R.string.mount_tilt_unknown),
        )
        // A warning, not a fail: the shift can run, but distance ahead uses the default height.
        val height = "%.2f".format(cameraHeightM)
        CheckRow(
            R.string.check_height,
            if (cameraHeightSet) CheckState.Pass else CheckState.Warn,
            detail = stringResource(if (cameraHeightSet) R.string.height_set else R.string.height_not_set, height),
        )
        if (!checks.camera || !checks.location) {
            PatrolButton(R.string.allow_permissions, onAllowPermissions, outlined = true)
        }
        PatrolButton(R.string.start_shift, onStart, enabled = checks.allPass)
    }
}

/** Mount passes when the camera looks down by mount_tilt_min_deg to mount_tilt_max_deg (starting values). */
fun mountPasses(tilt: Tilt?, settings: AppSettings): Boolean =
    tilt != null && tilt.pitchDownDeg in settings.mountTiltMinDeg.toFloat()..settings.mountTiltMaxDeg.toFloat()

// Preview-only values. Not real readings.
internal val PreviewSettings = AppSettings(
    mountTiltMinDeg = 2.0, mountTiltMaxDeg = 20.0, gpsFixMaxAgeS = 5.0, gpsFixMaxAccuracyM = 10.0, stillSpeedMaxMps = 0.5,
    endShiftStillS = 10.0, endShiftNoFixS = 30.0, distanceMaxAccuracyM = 20.0, scanningBrightness = 0.1f,
    uploadMaxRecords = 50, uploadBackoffS = 30.0, logKeepDays = 2.0,
)

@Preview(name = "Start shift, checks failing", widthDp = 400, heightDp = 900)
@Composable
internal fun StartShiftFailingPreview() {
    BirdEyeTheme(darkTheme = true) {
        StartShiftScreen(
            checks = StartChecks(camera = false, location = false, gps = null, charging = true, mount = false),
            tilt = Tilt(pitchDownDeg = 31f, rollScreenDeg = 4f),
            settings = PreviewSettings,
            cameraHeightM = 1.0,
            cameraHeightSet = false,
            onAllowPermissions = {},
            onStart = {},
            preview = { CameraPreview(it) },
        )
    }
}

@Preview(name = "Start shift, all pass", widthDp = 400, heightDp = 900)
@Composable
internal fun StartShiftPassingPreview() {
    BirdEyeTheme(darkTheme = true) {
        StartShiftScreen(
            checks = StartChecks(camera = true, location = true, gps = GpsCheck.Ok(6f), charging = true, mount = true),
            tilt = Tilt(pitchDownDeg = 8f, rollScreenDeg = 0f),
            settings = PreviewSettings,
            cameraHeightM = 1.3,
            cameraHeightSet = true,
            onAllowPermissions = {},
            onStart = {},
            preview = { CameraPreview(it) },
        )
    }
}
