import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
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
    testImplementation(libs.junit)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
    debugImplementation(libs.androidx.compose.ui.tooling)
}