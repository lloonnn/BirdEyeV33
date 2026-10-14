package com.birdeye

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import com.birdeye.ui.theme.BirdEyeTheme
import com.birdeye.ui.theme.PatrolSpacing

/** Shift summary, calculated on the phone. No shift record goes to the server (out of scope). */
@Composable
fun EndOfShiftScreen(distanceKm: Double, defectsFound: Int, uploadsCompleted: Int, onNewShift: () -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .safeDrawingPadding()
            .verticalScroll(rememberScrollState())
            .padding(PatrolSpacing.md),
        verticalArrangement = Arrangement.spacedBy(PatrolSpacing.lg),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            BilingualLabel(
                R.string.end_of_shift_en, R.string.end_of_shift_ms,
                Modifier.weight(1f), style = MaterialTheme.typography.headlineMedium,
            )
            MockLabel()
        }
        Counter(stringResource(R.string.distance_value, "%.2f".format(distanceKm)), R.string.distance_en, R.string.distance_ms)
        Counter(defectsFound.toString(), R.string.defects_found_en, R.string.defects_found_ms)
        Counter(uploadsCompleted.toString(), R.string.uploads_completed_en, R.string.uploads_completed_ms)
        MockLabel(note = stringResource(R.string.mock_counts_note))
        Spacer(Modifier.weight(1f))
        PatrolButton(R.string.new_shift_en, R.string.new_shift_ms, onNewShift)
    }
}

@Preview(name = "End of shift", widthDp = 400, heightDp = 860)
@Composable
private fun EndOfShiftPreview() {
    BirdEyeTheme(darkTheme = true) {
        EndOfShiftScreen(distanceKm = 12.4, defectsFound = 0, uploadsCompleted = 0, onNewShift = {})
    }
}
