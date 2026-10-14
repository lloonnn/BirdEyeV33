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

/** English on top, Malay below, for key states (eagle/CLAUDE.md: drivers may read either). */
@Composable
fun BilingualLabel(
    @StringRes en: Int,
    @StringRes ms: Int,
    modifier: Modifier = Modifier,
    style: TextStyle = MaterialTheme.typography.titleMedium,
    color: Color = MaterialTheme.colorScheme.onSurface,
) {
    Column(modifier) {
        Text(stringResource(en), style = style, color = color)
        Text(
            stringResource(ms),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

/** A tick or a cross drawn in a ring, so pass and fail never rely on colour alone. */
@Composable
fun StatusIcon(pass: Boolean, modifier: Modifier = Modifier, iconSize: Dp = 28.dp) {
    val color = if (pass) BirdEye.status.done else BirdEye.status.high
    val description = stringResource(if (pass) R.string.pass_en else R.string.fail_en)
    Canvas(modifier.size(iconSize).semantics { contentDescription = description }) {
        val stroke = iconSize.toPx() / 10
        drawCircle(color, radius = this.size.minDimension / 2 - stroke / 2, style = Stroke(stroke))
        val w = this.size.width
        if (pass) {
            drawLine(color, Offset(w * 0.28f, w * 0.52f), Offset(w * 0.44f, w * 0.68f), stroke, StrokeCap.Round)
            drawLine(color, Offset(w * 0.44f, w * 0.68f), Offset(w * 0.73f, w * 0.36f), stroke, StrokeCap.Round)
        } else {
            drawLine(color, Offset(w * 0.33f, w * 0.33f), Offset(w * 0.67f, w * 0.67f), stroke, StrokeCap.Round)
            drawLine(color, Offset(w * 0.67f, w * 0.33f), Offset(w * 0.33f, w * 0.67f), stroke, StrokeCap.Round)
        }
    }
}

/** One self check row: icon, name in both languages, and the word Pass or Fail. */
@Composable
fun CheckRow(@StringRes en: Int, @StringRes ms: Int, pass: Boolean, detail: String? = null) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = PatrolSpacing.touchTarget),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(PatrolSpacing.md),
    ) {
        StatusIcon(pass)
        Column(Modifier.weight(1f)) {
            BilingualLabel(en, ms)
            detail?.let {
                Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        BilingualLabel(
            if (pass) R.string.pass_en else R.string.fail_en,
            if (pass) R.string.pass_ms else R.string.fail_ms,
            color = if (pass) BirdEye.status.done else BirdEye.status.high,
        )
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

/** Full-width button, never shorter than PatrolSpacing.touchTarget (56 dp). Label in both languages. */
@Composable
fun PatrolButton(
    @StringRes en: Int,
    @StringRes ms: Int,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    outlined: Boolean = false,
) {
    val content: @Composable () -> Unit = {
        Text("${stringResource(en)} / ${stringResource(ms)}", style = MaterialTheme.typography.labelLarge)
    }
    val buttonModifier = modifier.fillMaxWidth().heightIn(min = PatrolSpacing.touchTarget)
    if (outlined) {
        OutlinedButton(onClick, buttonModifier, enabled) { content() }
    } else {
        Button(onClick, buttonModifier, enabled) { content() }
    }
}

/** Large counter for one-second glances: number in Geist Mono, label in both languages. */
@Composable
fun Counter(value: String, @StringRes en: Int, @StringRes ms: Int, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(value, style = MaterialTheme.typography.displayLarge, color = MaterialTheme.colorScheme.onSurface)
        BilingualLabel(en, ms, style = MaterialTheme.typography.bodyLarge)
    }
}
