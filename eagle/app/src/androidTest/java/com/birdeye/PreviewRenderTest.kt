package com.birdeye

import android.graphics.Bitmap
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * Renders every @Preview on a device and saves a PNG to the app's files/previews folder, so the
 * previews are checked without Android Studio. Pull them with:
 * adb shell run-as com.birdeye tar c files/previews | tar x
 */
@RunWith(AndroidJUnit4::class)
class PreviewRenderTest {
    @get:Rule
    val compose = createComposeRule()

    private fun render(name: String, content: @Composable () -> Unit) {
        compose.setContent(content)
        compose.waitForIdle()
        val bitmap = compose.onRoot().captureToImage().asAndroidBitmap()
        val dir = File(InstrumentationRegistry.getInstrumentation().targetContext.filesDir, "previews")
        dir.mkdirs()
        File(dir, "$name.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    @Test fun startShiftFailing() = render("start_shift_failing") { StartShiftFailingPreview() }

    @Test fun startShiftPassing() = render("start_shift_passing") { StartShiftPassingPreview() }

    @Test fun scanning() = render("scanning") { ScanningPreview() }

    @Test fun cooling() = render("cooling") { CoolingPreview() }

    @Test fun endOfShift() = render("end_of_shift") { EndOfShiftPreview() }
}
