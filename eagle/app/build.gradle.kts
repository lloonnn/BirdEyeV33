import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
}

// Per-phone values live in local.properties, which is not committed. Reason: each phone and
// vehicle differs, and the values must not end up in git. The device ID will be read the same way.
val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

// Camera height in metres for the distance-ahead formula, per phone (key birdeye.cameraHeightM).
// If it is missing or not a positive number, the app uses 1.0 (starting value, to be tuned) and
// Start shift shows "height not set" as a warning.
val cameraHeightSetting = localProperties.getProperty("birdeye.cameraHeightM")?.trim()?.toDoubleOrNull()
    ?.takeIf { it > 0.0 }

// Which backend the app talks to (key birdeye.api): "mock" (default) or "real". Only Api.kt reads the
// resulting BuildConfig field.
val birdEyeBaseUrl = localProperties.getProperty("birdeye.baseUrl")?.trim() ?: ""
val birdEyeDeviceId = localProperties.getProperty("birdeye.deviceId")?.trim()?.takeIf { it.isNotEmpty() } ?: "eagle-dev"
// Replay mode (key birdeye.replay=true): a recorded video and fake GPS replace the camera and GPS. Works in release builds too.
val birdEyeReplay = localProperties.getProperty("birdeye.replay")?.trim()?.lowercase() == "true"
val birdEyeApi = localProperties.getProperty("birdeye.api")?.trim() ?: "mock"
when (birdEyeApi) {
    "mock" -> Unit
    "real" -> if (birdEyeBaseUrl.isEmpty()) throw GradleException("birdeye.api=real needs birdeye.baseUrl in local.properties, for example http://192.168.1.10:8000")
    else -> throw GradleException("birdeye.api must be mock or real, not '$birdEyeApi'.")
}

android {
    namespace = "com.birdeye"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        applicationId = "com.birdeye"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField("double", "CAMERA_HEIGHT_M", (cameraHeightSetting ?: 1.0).toString())
        buildConfigField("boolean", "CAMERA_HEIGHT_SET", (cameraHeightSetting != null).toString())
        buildConfigField("String", "BIRDEYE_API", "\"$birdEyeApi\"")
        buildConfigField("boolean", "REPLAY", birdEyeReplay.toString())
        buildConfigField("String", "DEVICE_ID", "\"$birdEyeDeviceId\"")
        buildConfigField("String", "BIRDEYE_BASE_URL", "\"$birdEyeBaseUrl\"")
    }

    buildTypes {
        release {
            // Optimise the whole app, not only androidx, kotlin and kotlinx. Reason: with the template's
            // packageScope, R8 rewrote kotlin classes that unoptimised code still used, and the release
            // build crashed at startup (IllegalAccessError in kotlin.collections).
            optimization {
                enable = true
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    // The model must stay uncompressed so LiteRT can memory-map it.
    androidResources {
        noCompress += "tflite"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.camera.core)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.litert)
    implementation(libs.litert.gpu)
    // litert-support 1.4.2 clashes with its own -api artifact (same namespace), so the api one is excluded.
    implementation(libs.litert.support) {
        exclude(group = "com.google.ai.edge.litert", module = "litert-support-api")
    }
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    testImplementation(libs.junit)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
    debugImplementation(libs.androidx.compose.ui.tooling)
}