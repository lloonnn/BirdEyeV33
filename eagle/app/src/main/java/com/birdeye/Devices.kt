package com.birdeye

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.os.BatteryManager
import android.util.Log
import android.view.Surface
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import kotlin.math.asin
import kotlin.math.atan
import kotlin.math.atan2
import kotlin.math.max
import kotlin.math.sqrt
import kotlin.math.tan

/** Camera tilt from gravity. pitchDownDeg is the camera axis angle below horizontal (alpha in the distance formula). */
data class Tilt(val pitchDownDeg: Float, val rollScreenDeg: Float)

/** Field of view of the back camera's sensor, long and short side, in degrees. */
data class CameraFov(val longSideDeg: Float, val shortSideDeg: Float)

private fun Double.toDeg() = Math.toDegrees(this).toFloat()
private fun Float.toRad() = Math.toRadians(this.toDouble()).toFloat()

/**
 * Reads the gravity sensor (accelerometer with a low-pass filter as fallback).
 * The back camera looks along the device's -z axis, so its angle below horizontal is
 * asin(g_z / |g|), whatever the screen orientation.
 */
@Composable
fun rememberTilt(): Tilt? {
    val context = LocalContext.current
    val view = LocalView.current
    var tilt by remember { mutableStateOf<Tilt?>(null) }
    DisposableEffect(Unit) {
        val sensorManager = context.getSystemService(SensorManager::class.java)
        val sensor = sensorManager.getDefaultSensor(Sensor.TYPE_GRAVITY)
            ?: sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
        val lowPass = sensor?.type == Sensor.TYPE_ACCELEROMETER
        val g = FloatArray(3)
        val listener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent) {
                for (i in 0..2) g[i] = if (lowPass) g[i] * 0.9f + event.values[i] * 0.1f else event.values[i]
                val norm = sqrt(g[0] * g[0] + g[1] * g[1] + g[2] * g[2])
                if (norm < 1f) return
                val pitch = asin((g[2] / norm).coerceIn(-1f, 1f).toDouble()).toDeg()
                // Gravity's up vector in screen axes, so the horizon line follows the display rotation.
                val (sx, sy) = when (view.display?.rotation ?: Surface.ROTATION_0) {
                    Surface.ROTATION_90 -> -g[1] to g[0]
                    Surface.ROTATION_180 -> -g[0] to -g[1]
                    Surface.ROTATION_270 -> g[1] to -g[0]
                    else -> g[0] to g[1]
                }
                tilt = Tilt(pitch, atan2(sx.toDouble(), sy.toDouble()).toDeg())
            }

            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
        }
        sensor?.let { sensorManager.registerListener(listener, it, SensorManager.SENSOR_DELAY_UI) }
        onDispose { sensorManager.unregisterListener(listener) }
    }
    return tilt
}

/** True while the phone is plugged in, from the sticky battery broadcast. */
@Composable
fun rememberCharging(): Boolean {
    val context = LocalContext.current
    var charging by remember { mutableStateOf(false) }
    DisposableEffect(Unit) {
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                charging = intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0
            }
        }
        val sticky = ContextCompat.registerReceiver(
            context, receiver, IntentFilter(Intent.ACTION_BATTERY_CHANGED), ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        sticky?.let { charging = it.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0 }
        onDispose { context.unregisterReceiver(receiver) }
    }
    return charging
}

@Composable
fun rememberCameraFov(): CameraFov? {
    val context = LocalContext.current
    return remember {
        try {
            val manager = context.getSystemService(CameraManager::class.java)
            manager.cameraIdList.asSequence()
                .map { manager.getCameraCharacteristics(it) }
                .firstOrNull { it.get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK }
                ?.let { chars ->
                    val size = chars.get(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE) ?: return@let null
                    val focal = chars.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS)?.firstOrNull()
                        ?: return@let null
                    fun fov(side: Float) = (2 * atan(side / (2 * focal).toDouble())).toDeg()
                    CameraFov(fov(max(size.width, size.height)), fov(minOf(size.width, size.height)))
                }
        } catch (e: Exception) {
            Log.w("BirdEye", "No camera field of view", e)
            null
        }
    }
}

/** CameraX Preview only, bound to the activity's lifecycle. No foreground service (plan, tier 1). */
@Composable
fun CameraPreview(modifier: Modifier = Modifier) {
    if (LocalInspectionMode.current) {
        Box(modifier.background(Color(0xFF1F2937)))
        return
    }
    val context = LocalContext.current
    val owner = context as? LifecycleOwner ?: return
    val previewView = remember {
        PreviewView(context).apply {
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            scaleType = PreviewView.ScaleType.FILL_CENTER
        }
    }
    DisposableEffect(owner) {
        val useCase = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
        val future = ProcessCameraProvider.getInstance(context)
        var provider: ProcessCameraProvider? = null
        future.addListener({
            try {
                provider = future.get().also {
                    it.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, useCase)
                }
            } catch (e: Exception) {
                Log.e("BirdEye", "Camera bind failed", e)
            }
        }, ContextCompat.getMainExecutor(context))
        onDispose { provider?.unbind(useCase) }
    }
    AndroidView(factory = { previewView }, modifier = modifier)
}

/**
 * Horizon line over a FILL_CENTER preview. The horizon sits f * tan(alpha) above the image centre,
 * where f is the focal length in view pixels. FILL_CENTER scales by the larger of the two axis ratios,
 * so f = max(w / (2 tan(hfov / 2)), h / (2 tan(vfov / 2))). Without a field of view the line stays at
 * the centre and only shows roll. It is a guide for lining up the mount; the check uses the sensor angle.
 */
@Composable
fun HorizonOverlay(tilt: Tilt?, fov: CameraFov?, color: Color, modifier: Modifier = Modifier) {
    Canvas(modifier) {
        val w = size.width
        val h = size.height
        val centre = Offset(w / 2, h / 2)
        val mark = 12.dp.toPx()
        drawLine(color.copy(alpha = 0.6f), centre - Offset(mark, 0f), centre + Offset(mark, 0f), 2.dp.toPx())
        drawLine(color.copy(alpha = 0.6f), centre - Offset(0f, mark), centre + Offset(0f, mark), 2.dp.toPx())
        if (tilt == null) return@Canvas
        val offset = fov?.let {
            val (hFov, vFov) = if (h > w) it.shortSideDeg to it.longSideDeg else it.longSideDeg to it.shortSideDeg
            val f = max(w / (2 * tan(hFov.toRad() / 2)), h / (2 * tan(vFov.toRad() / 2)))
            f * tan(tilt.pitchDownDeg.toRad())
        } ?: 0f
        val y = h / 2 - offset
        rotate(degrees = tilt.rollScreenDeg, pivot = Offset(w / 2, y)) {
            drawLine(color, Offset(-w, y), Offset(2 * w, y), 3.dp.toPx())
        }
    }
}
