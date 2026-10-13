package com.birdeye.ui.theme

/*
 * Bird Eye v33 theme for the Android patrol app (Kotlin + Jetpack Compose + Material 3).
 * Same tokens as the dashboard's globals.css, so both look like one product.
 *
 * Geist and Geist Mono are bundled in res/font (SIL OFL 1.1, licence text in
 * assets/licenses/geist-OFL.txt), so type works offline with no font provider.
 */

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.birdeye.R

// ---------- Colour tokens (mirror globals.css) ----------

private object Light {
    val background = Color(0xFFFFFFFF)
    val foreground = Color(0xFF0A0A0A)
    val card = Color(0xFFFFFFFF)
    val primary = Color(0xFF171717)
    val onPrimary = Color(0xFFFAFAFA)
    val muted = Color(0xFFF5F5F5)
    val mutedForeground = Color(0xFF737373)
    val border = Color(0xFFE5E5E5)
    val destructive = Color(0xFFB91C1C)
}

private object Dark {
    val background = Color(0xFF0A0A0A)
    val foreground = Color(0xFFFAFAFA)
    val card = Color(0xFF171717)
    val primary = Color(0xFFE5E5E5)
    val onPrimary = Color(0xFF171717)
    val muted = Color(0xFF262626)
    val mutedForeground = Color(0xFFA3A3A3)
    val border = Color(0xFF2E2E2E)
    val destructive = Color(0xFFF87171)
}

/** The shared status colour language: map pins, badges, scanning state. */
@Immutable
data class StatusColors(
    val high: Color,     // fix first, check failed, stopped
    val medium: Color,   // cooling down, needs attention
    val low: Color,      // low urgency, detected
    val done: Color,     // scanning, confirmed fixed, check passed
    val neutral: Color,  // idle, scheduled
)

private val LightStatus = StatusColors(
    high = Color(0xFFB91C1C),
    medium = Color(0xFFD97706),
    low = Color(0xFF1D4ED8),
    done = Color(0xFF15803D),
    neutral = Color(0xFFA3A3A3),
)

private val DarkStatus = StatusColors(
    high = Color(0xFFF87171),
    medium = Color(0xFFFBBF24),
    low = Color(0xFF60A5FA),
    done = Color(0xFF4ADE80),
    neutral = Color(0xFF737373),
)

val LocalStatusColors = staticCompositionLocalOf { LightStatus }

private val LightScheme = lightColorScheme(
    primary = Light.primary,
    onPrimary = Light.onPrimary,
    secondary = Light.muted,
    onSecondary = Light.primary,
    background = Light.background,
    onBackground = Light.foreground,
    surface = Light.card,
    onSurface = Light.foreground,
    surfaceVariant = Light.muted,
    onSurfaceVariant = Light.mutedForeground,
    outline = Light.border,
    outlineVariant = Light.border,
    error = Light.destructive,
    onError = Light.onPrimary,
)

private val DarkScheme = darkColorScheme(
    primary = Dark.primary,
    onPrimary = Dark.onPrimary,
    secondary = Dark.muted,
    onSecondary = Dark.foreground,
    background = Dark.background,
    onBackground = Dark.foreground,
    surface = Dark.card,
    onSurface = Dark.foreground,
    surfaceVariant = Dark.muted,
    onSurfaceVariant = Dark.mutedForeground,
    outline = Dark.border,
    outlineVariant = Dark.border,
    error = Dark.destructive,
    onError = Dark.onPrimary,
)

// ---------- Type: Geist and Geist Mono, same as the dashboard ----------

val Geist = FontFamily(
    Font(R.font.geist_regular, FontWeight.Normal),
    Font(R.font.geist_medium, FontWeight.Medium),
    Font(R.font.geist_semibold, FontWeight.SemiBold),
)

val GeistMono = FontFamily(
    Font(R.font.geist_mono_regular, FontWeight.Normal),
    Font(R.font.geist_mono_medium, FontWeight.Medium),
    Font(R.font.geist_mono_semibold, FontWeight.SemiBold),
)

// Larger than the dashboard: read at a glance in a moving vehicle.
private val PatrolTypography = Typography(
    displayLarge = TextStyle(fontFamily = GeistMono, fontWeight = FontWeight.SemiBold, fontSize = 56.sp), // big counters
    headlineMedium = TextStyle(fontFamily = Geist, fontWeight = FontWeight.SemiBold, fontSize = 28.sp),   // "Scanning"
    titleLarge = TextStyle(fontFamily = Geist, fontWeight = FontWeight.SemiBold, fontSize = 22.sp),
    titleMedium = TextStyle(fontFamily = Geist, fontWeight = FontWeight.Medium, fontSize = 18.sp),
    bodyLarge = TextStyle(fontFamily = Geist, fontWeight = FontWeight.Normal, fontSize = 18.sp),
    bodyMedium = TextStyle(fontFamily = Geist, fontWeight = FontWeight.Normal, fontSize = 16.sp),
    labelLarge = TextStyle(fontFamily = Geist, fontWeight = FontWeight.Medium, fontSize = 18.sp),         // buttons
    labelMedium = TextStyle(fontFamily = GeistMono, fontWeight = FontWeight.Medium, fontSize = 14.sp),    // versions, IDs
)

// ---------- Shape: same 10 dp corner as the dashboard's --radius ----------

private val PatrolShapes = Shapes(
    small = RoundedCornerShape(6.dp),
    medium = RoundedCornerShape(10.dp),
    large = RoundedCornerShape(14.dp),
)

/**
 * Wrap the app in this. The patrol app defaults to dark: less glare at the
 * windscreen at night and less screen heat on OLED phones.
 */
@Composable
fun BirdEyeTheme(
    darkTheme: Boolean = true,
    content: @Composable () -> Unit,
) {
    val status = if (darkTheme) DarkStatus else LightStatus
    CompositionLocalProvider(LocalStatusColors provides status) {
        MaterialTheme(
            colorScheme = if (darkTheme) DarkScheme else LightScheme,
            typography = PatrolTypography,
            shapes = PatrolShapes,
            content = content,
        )
    }
}

/** Usage: BirdEye.status.done for the green "Scanning" state. */
object BirdEye {
    val status: StatusColors
        @Composable get() = LocalStatusColors.current
}

// Spacing and sizes shared with the dashboard (4 dp grid).
object PatrolSpacing {
    val xs = 4.dp
    val sm = 8.dp
    val md = 16.dp
    val lg = 24.dp
    val xl = 32.dp
    val touchTarget = 56.dp // larger than the 44 dp minimum, for use in a vehicle
}
