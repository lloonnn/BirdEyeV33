package com.birdeye

import androidx.annotation.StringRes
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.birdeye.ui.theme.BirdEye
import com.birdeye.ui.theme.PatrolSpacing

/** A label for a key state or check, in English. */
@Composable
fun StateLabel(
    @StringRes label: Int,
    modifier: Modifier = Modifier,
    style: TextStyle = MaterialTheme.typography.titleMedium,
    color: Color = MaterialTheme.colorScheme.onSurface,
) {
    Text(stringResource(label), modifier, style = style, color = color)
}

/** Result of one self check. Warn shows a problem but does not block Start shift. */
enum class CheckState { Pass, Warn, Fail }

fun checkOf(pass: Boolean) = if (pass) CheckState.Pass else CheckState.Fail

@Composable
private fun CheckState.color() = when (this) {
    CheckState.Pass -> BirdEye.status.done
    CheckState.Warn -> BirdEye.status.medium
    CheckState.Fail -> BirdEye.status.high
}

@StringRes
private fun CheckState.word() = when (this) {
    CheckState.Pass -> R.string.pass
    CheckState.Warn -> R.string.warning
    CheckState.Fail -> R.string.fail
}

/** A tick, an exclamation mark or a cross in a ring, so a check result never relies on colour alone. */
@Composable
fun StatusIcon(state: CheckState, modifier: Modifier = Modifier, iconSize: Dp = 28.dp) {
    val color = state.color()
    val description = stringResource(state.word())
    Canvas(modifier.size(iconSize).semantics { contentDescription = description }) {
        val stroke = iconSize.toPx() / 10
        drawCircle(color, radius = this.size.minDimension / 2 - stroke / 2, style = Stroke(stroke))
        val w = this.size.width
        when (state) {
            CheckState.Pass -> {
                drawLine(color, Offset(w * 0.28f, w * 0.52f), Offset(w * 0.44f, w * 0.68f), stroke, StrokeCap.Round)
                drawLine(color, Offset(w * 0.44f, w * 0.68f), Offset(w * 0.73f, w * 0.36f), stroke, StrokeCap.Round)
            }
            CheckState.Warn -> {
                drawLine(color, Offset(w * 0.5f, w * 0.27f), Offset(w * 0.5f, w * 0.56f), stroke, StrokeCap.Round)
                drawCircle(color, radius = stroke * 0.7f, center = Offset(w * 0.5f, w * 0.72f))
            }
            CheckState.Fail -> {
                drawLine(color, Offset(w * 0.33f, w * 0.33f), Offset(w * 0.67f, w * 0.67f), stroke, StrokeCap.Round)
                drawLine(color, Offset(w * 0.67f, w * 0.33f), Offset(w * 0.33f, w * 0.67f), stroke, StrokeCap.Round)
            }
        }
    }
}

/** One self check row: icon, name, and the word Pass, Warning or Fail. */
@Composable
fun CheckRow(@StringRes label: Int, state: CheckState, detail: String? = null) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = PatrolSpacing.touchTarget),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(PatrolSpacing.md),
    ) {
        StatusIcon(state)
        Column(Modifier.weight(1f)) {
            StateLabel(label)
            detail?.let {
                Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        StateLabel(state.word(), color = state.color())
    }
}

/** Visible marker for invented data (plan rule 3). */
@Composable
fun MockLabel(modifier: Modifier = Modifier, note: String? = null) {
    Surface(
        modifier = modifier,
        shape = MaterialTheme.shapes.small,
        color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(2.dp, BirdEye.status.medium),
    ) {
        Row(
            Modifier.padding(horizontal = PatrolSpacing.sm, vertical = PatrolSpacing.xs),
            horizontalArrangement = Arrangement.spacedBy(PatrolSpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(stringResource(R.string.mock_label), style = MaterialTheme.typography.labelLarge, color = BirdEye.status.medium)
            note?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
        }
    }
}

/** Full-width button, never shorter than PatrolSpacing.touchTarget (56 dp). */
@Composable
fun PatrolButton(
    @StringRes label: Int,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    outlined: Boolean = false,
) {
    val content: @Composable () -> Unit = {
        Text(stringResource(label), style = MaterialTheme.typography.labelLarge)
    }
    val buttonModifier = modifier.fillMaxWidth().heightIn(min = PatrolSpacing.touchTarget)
    if (outlined) {
        OutlinedButton(onClick, buttonModifier, enabled) { content() }
    } else {
        Button(onClick, buttonModifier, enabled) { content() }
    }
}

/** Large counter for one-second glances: number in Geist Mono, label below. */
@Composable
fun Counter(value: String, @StringRes label: Int, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(value, style = MaterialTheme.typography.displayLarge, color = MaterialTheme.colorScheme.onSurface)
        StateLabel(label, style = MaterialTheme.typography.bodyLarge)
    }
}
