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
    val gpsFix: Boolean,
    val charging: Boolean,
    val mount: Boolean,
) {
    val allPass get() = camera && location && gpsFix && charging && mount
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
            BilingualLabel(
                R.string.start_shift_en, R.string.start_shift_ms,
                Modifier.weight(1f), style = MaterialTheme.typography.headlineMedium,
            )
            MockLabel()
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
        CheckRow(R.string.check_camera_en, R.string.check_camera_ms, checks.camera)
        CheckRow(R.string.check_location_en, R.string.check_location_ms, checks.location)
        CheckRow(R.string.check_gps_en, R.string.check_gps_ms, checks.gpsFix)
        CheckRow(R.string.check_charging_en, R.string.check_charging_ms, checks.charging)
        CheckRow(
            R.string.check_mount_en, R.string.check_mount_ms, checks.mount,
            detail = tilt?.let {
                stringResource(
                    R.string.mount_tilt_value,
                    "%.1f".format(it.pitchDownDeg),
                    "%.0f".format(settings.mountTiltMinDeg),
                    "%.0f".format(settings.mountTiltMaxDeg),
                )
            } ?: stringResource(R.string.mount_tilt_unknown),
        )
        if (!checks.camera || !checks.location) {
            PatrolButton(R.string.allow_permissions_en, R.string.allow_permissions_ms, onAllowPermissions, outlined = true)
        }
        PatrolButton(R.string.start_shift_en, R.string.start_shift_ms, onStart, enabled = checks.allPass)
    }
}

/** Mount passes when the camera looks down by mount_tilt_min_deg to mount_tilt_max_deg (starting values). */
fun mountPasses(tilt: Tilt?, settings: AppSettings): Boolean =
    tilt != null && tilt.pitchDownDeg in settings.mountTiltMinDeg.toFloat()..settings.mountTiltMaxDeg.toFloat()

// Preview-only values. Not real readings.
internal val PreviewSettings = AppSettings(
    cameraHeightM = 1.3, mountTiltMinDeg = 2.0, mountTiltMaxDeg = 20.0, gpsFixMaxAgeS = 5.0,
    stillSpeedMaxMps = 0.5, endShiftStillS = 10.0, distanceMaxAccuracyM = 20.0,
)

@Preview(name = "Start shift, checks failing", widthDp = 400, heightDp = 900)
@Composable
private fun StartShiftFailingPreview() {
    BirdEyeTheme(darkTheme = true) {
        StartShiftScreen(
            checks = StartChecks(camera = false, location = false, gpsFix = false, charging = true, mount = false),
            tilt = Tilt(pitchDownDeg = 31f, rollScreenDeg = 4f),
            settings = PreviewSettings,
            onAllowPermissions = {},
            onStart = {},
            preview = { CameraPreview(it) },
        )
    }
}

@Preview(name = "Start shift, all pass", widthDp = 400, heightDp = 900)
@Composable
private fun StartShiftPassingPreview() {
    BirdEyeTheme(darkTheme = true) {
        StartShiftScreen(
            checks = StartChecks(camera = true, location = true, gpsFix = true, charging = true, mount = true),
            tilt = Tilt(pitchDownDeg = 8f, rollScreenDeg = 0f),
            settings = PreviewSettings,
            onAllowPermissions = {},
            onStart = {},
            preview = { CameraPreview(it) },
        )
    }
}
