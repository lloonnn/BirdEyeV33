package com.birdeye

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.unit.dp
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import com.birdeye.ui.theme.BirdEye
import com.birdeye.ui.theme.BirdEyeTheme
import com.birdeye.ui.theme.PatrolSpacing

/**
 * Readable in a one-second glance. Cooling down is a variant of this screen, not its own screen:
 * same layout, medium status colour and the cooling label. Counts come from the Room queue.
 */
@Composable
fun ScanningScreen(
    cooling: Boolean,
    defectsToday: Int,
    reviewCount: Int,
    recordsWaiting: Int,
    uploadsCompleted: Int,
    rejected: Int,
    showMock: Boolean,
    endShiftReason: EndShiftReason?,
    noGpsSeconds: Int,
    showDebug: Boolean,
    debugStats: String,
    debugReason: String,
    replayTime: String?,
    replayStatus: String?,
    onEndShift: () -> Unit,
    onToggleCooling: () -> Unit,
    canAddFake: Boolean,
    onAddFake: () -> Unit,
    mockFails: Boolean,
    onToggleMockFails: () -> Unit,
    preview: @Composable (Modifier) -> Unit,
) {
    var debugOpen by rememberSaveable { mutableStateOf(false) }
    Box(Modifier.fillMaxSize()) {
        preview(Modifier.fillMaxSize())
        // Replay preparation can take a while; say so in the middle of the picture.
        if (replayStatus?.startsWith("Preparing") == true) {
            Text(replayStatus, Modifier.align(Alignment.Center), style = MaterialTheme.typography.headlineMedium)
        }
        Column(
            Modifier.fillMaxSize().safeDrawingPadding().padding(PatrolSpacing.md),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Surface(
                shape = MaterialTheme.shapes.large,
                color = MaterialTheme.colorScheme.surface.copy(alpha = 0.6f),
                // A translucent colour has no matching content colour, so set it, or text falls back to black.
                contentColor = MaterialTheme.colorScheme.onSurface,
            ) {
                Column(Modifier.fillMaxWidth().padding(PatrolSpacing.md), verticalArrangement = Arrangement.spacedBy(PatrolSpacing.sm)) {
                    StateLabel(
                        if (cooling) R.string.cooling else R.string.scanning,
                        style = MaterialTheme.typography.headlineMedium,
                        color = if (cooling) BirdEye.status.medium else BirdEye.status.done,
                    )
                    // Second row, so the state word never wraps.
                    if (replayTime != null || showMock) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(PatrolSpacing.md)) {
                            if (replayTime != null) {
                                ReplayLabel()
                                Text(replayTime, style = MaterialTheme.typography.titleMedium)
                            }
                            if (showMock) MockLabel()
                        }
                    }
                }
            }
            Surface(
                shape = MaterialTheme.shapes.large,
                color = MaterialTheme.colorScheme.surface.copy(alpha = if (debugOpen) 0.85f else 0.6f),
                // A translucent colour has no matching content colour, so set it, or text falls back to black.
                contentColor = MaterialTheme.colorScheme.onSurface,
            ) {
                Column(Modifier.padding(PatrolSpacing.md), verticalArrangement = Arrangement.spacedBy(PatrolSpacing.md)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(PatrolSpacing.md)) {
                        Counter(defectsToday.toString(), R.string.defects_today, Modifier.weight(1f))
                        Counter(recordsWaiting.toString(), R.string.records_waiting, Modifier.weight(1f))
                        Counter(uploadsCompleted.toString(), R.string.uploads_completed, Modifier.weight(1f))
                    }
                    PatrolButton(R.string.end_shift, onEndShift, enabled = endShiftReason != null)
                    // Always say why End shift is or is not available.
                    Text(
                        when (endShiftReason) {
                            EndShiftReason.Still -> stringResource(R.string.end_reason_still)
                            EndShiftReason.NoGps -> stringResource(R.string.end_reason_no_gps, noGpsSeconds.toString())
                            null -> stringResource(R.string.stop_to_end)
                        },
                        style = MaterialTheme.typography.bodyLarge,
                    )
                    // Debug builds only; release builds have no debug section at all.
                    if (showDebug) {
                        TextButton(
                            onClick = { debugOpen = !debugOpen },
                            modifier = Modifier.fillMaxWidth().heightIn(min = PatrolSpacing.touchTarget),
                        ) { Text(if (debugOpen) "Debug  ▴" else "Debug  ▾", style = MaterialTheme.typography.labelLarge) }
                        if (debugOpen) {
                            Column(
                                Modifier.heightIn(max = 280.dp).verticalScroll(rememberScrollState()),
                                verticalArrangement = Arrangement.spacedBy(PatrolSpacing.sm),
                            ) {
                                // Records the backend refused (4xx other than 429). Drivers never act on it.
                                Text(stringResource(R.string.debug_rejected, rejected), style = MaterialTheme.typography.bodyLarge)
                                Text("Review: $reviewCount", style = MaterialTheme.typography.bodyLarge)
                                Text(debugStats, style = MaterialTheme.typography.bodyLarge)
                                Text(debugReason, style = MaterialTheme.typography.bodyLarge)
                                replayStatus?.let { Text(it, style = MaterialTheme.typography.bodyLarge) }
                                DebugButton(stringResource(R.string.debug_add_fake), onAddFake, enabled = canAddFake)
                                Row {
                                    DebugButton(
                                        stringResource(if (cooling) R.string.debug_cooling_off else R.string.debug_cooling_on),
                                        onToggleCooling,
                                        Modifier.weight(1f),
                                    )
                                    if (showMock) {
                                        DebugButton(
                                            stringResource(if (mockFails) R.string.debug_mock_fail_off else R.string.debug_mock_fail_on),
                                            onToggleMockFails,
                                            Modifier.weight(1f),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Debug builds only; English only because drivers never see it. */
@Composable
private fun DebugButton(label: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    TextButton(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().heightIn(min = PatrolSpacing.touchTarget),
        enabled = enabled,
    ) { Text(label, style = MaterialTheme.typography.labelLarge) }
}

@Preview(name = "Scanning, still", widthDp = 400, heightDp = 860)
@Composable
internal fun ScanningPreview() {
    BirdEyeTheme(darkTheme = true) {
        ScanningScreen(
            cooling = false, defectsToday = 3, reviewCount = 2, recordsWaiting = 1, uploadsCompleted = 2, rejected = 0, showMock = true, endShiftReason = EndShiftReason.Still, noGpsSeconds = 30, showDebug = true, debugStats = "GPU 42 ms, 3.0 fps", debugReason = "top pothole 0.62: review band", replayTime = null, replayStatus = null,
            onEndShift = {}, onToggleCooling = {}, canAddFake = true, onAddFake = {}, mockFails = false, onToggleMockFails = {}, preview = { CameraPreview(it) },
        )
    }
}

@Preview(name = "Cooling down variant, moving", widthDp = 400, heightDp = 860)
@Composable
internal fun CoolingPreview() {
    BirdEyeTheme(darkTheme = true) {
        ScanningScreen(
            cooling = true, defectsToday = 3, reviewCount = 2, recordsWaiting = 1, uploadsCompleted = 2, rejected = 0, showMock = true, endShiftReason = null, noGpsSeconds = 30, showDebug = false, debugStats = "", debugReason = "", replayTime = null, replayStatus = null,
            onEndShift = {}, onToggleCooling = {}, canAddFake = true, onAddFake = {}, mockFails = false, onToggleMockFails = {}, preview = { CameraPreview(it) },
        )
    }
}
