package com.birdeye

import android.content.Context
import android.util.Log
import androidx.core.content.edit

/**
 * The one place that reads birdeye.api (BuildConfig.BIRDEYE_API, from local.properties).
 * Everything else asks this object for a [BirdEyeApi] and never knows which one it got.
 */
object Api {
    /** True while the app talks to the mock. Screens show the MOCK label while this is true. */
    val isMock: Boolean = BuildConfig.BIRDEYE_API == "mock"

    /** Device id sent with every record. Mock ids start with "mock-" (plan rule 3); real ids are birdeye.deviceId. */
    val deviceId: String = if (isMock) "mock-car-01" else BuildConfig.DEVICE_ID

    @Volatile private var instance: BirdEyeApi? = null

    fun get(context: Context): BirdEyeApi = instance ?: synchronized(this) {
        instance ?: create(context.applicationContext).also { instance = it }
    }

    private fun create(context: Context): BirdEyeApi = when (BuildConfig.BIRDEYE_API) {
        "mock" -> MockBirdEyeApi(failUploads = { mockFails(context) }, log = { Log.i("BirdEye", it) })
        "real" -> RealBirdEyeApi(BuildConfig.BIRDEYE_BASE_URL, log = { Log.i("BirdEye", it) })
        else -> error("birdeye.api=${BuildConfig.BIRDEYE_API} must be mock or real")
    }

    // Debug setting for the mock, kept in preferences so the upload worker sees the same value.
    private const val PREFS = "mock_api"
    private const val KEY_FAIL = "fail_uploads"

    fun mockFails(context: Context): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_FAIL, false)

    fun setMockFails(context: Context, fail: Boolean) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit { putBoolean(KEY_FAIL, fail) }
}
