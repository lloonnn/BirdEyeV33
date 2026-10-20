import java.net.URI
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
val birdEyeApi = localProperties.getProperty("birdeye.api")?.trim() ?: "mock"
val birdEyeBaseUrl = localProperties.getProperty("birdeye.baseUrl")?.trim() ?: ""
// Replay mode (key birdeye.replay=true): a recorded video and fake GPS replace the camera and GPS. Works in release builds too.
// It may be combined with api=real: the full-chain test sends replayed detections to the real backend.
val birdEyeReplay = localProperties.getProperty("birdeye.replay")?.trim()?.lowercase() == "true"
when (birdEyeApi) {
    "mock" -> Unit
    "real" -> if (birdEyeBaseUrl.isEmpty()) throw GradleException("birdeye.api=real needs birdeye.baseUrl in local.properties, for example http://192.168.1.10:8000")
    else -> throw GradleException("birdeye.api must be mock or real, not '$birdEyeApi'.")
}
// Device id sent with every record (key birdeye.deviceId). The real backend needs one per phone, so a
// shared default would merge devices; mock mode ignores it.
val birdEyeDeviceId = localProperties.getProperty("birdeye.deviceId")?.trim()?.takeIf { it.isNotEmpty() }
    ?: if (birdEyeApi == "real") throw GradleException("birdeye.api=real needs a unique birdeye.deviceId in local.properties, for example car-01") else "eagle-dev"
// Cleartext HTTP is allowed in debug builds only, and only to the host of birdeye.baseUrl. Release builds
// block it, so a release build must use an https baseUrl.
val birdEyeCleartextHost: String = if (birdEyeBaseUrl.startsWith("http://")) URI(birdEyeBaseUrl).host ?: "" else ""
val releaseBlockedBaseUrl = birdEyeApi == "real" && birdEyeBaseUrl.startsWith("http://")
tasks.matching { it.name == "preReleaseBuild" }.configureEach {
    doFirst {
        if (releaseBlockedBaseUrl) {
            throw GradleException("Release builds block cleartext HTTP. Use an https birdeye.baseUrl for release, or build debug.")
        }
    }
}

/** Writes the debug network security config: cleartext blocked everywhere except the laptop host. */
abstract class GenerateNetworkConfig : DefaultTask() {
    @get:Input abstract val cleartextHost: Property<String>

    @get:OutputDirectory abstract val outputDir: DirectoryProperty

    @TaskAction fun write() {
        val domain = cleartextHost.get().takeIf { it.isNotEmpty() }
            ?.let { "\n    <domain-config cleartextTrafficPermitted=\"true\">\n        <domain includeSubdomains=\"false\">$it</domain>\n    </domain-config>" } ?: ""
        val dir = outputDir.get().asFile.resolve("xml").apply { mkdirs() }
        dir.resolve("network_security_config.xml").writeText(
            "<?xml version=\"1.0\" encoding=\"utf-8\"?>\n" +
                "<!-- Generated for debug builds from birdeye.baseUrl. Cleartext HTTP only to that host. -->\n" +
                "<network-security-config>\n    <base-config cleartextTrafficPermitted=\"false\" />$domain\n</network-security-config>\n",
        )
    }
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

androidComponents {
    onVariants(selector().withBuildType("debug")) { variant ->
        val generate = tasks.register<GenerateNetworkConfig>("generate${variant.name.replaceFirstChar { it.uppercase() }}NetworkConfig") {
            cleartextHost.set(birdEyeCleartextHost)
        }
        variant.sources.res?.addGeneratedSourceDirectory(generate, GenerateNetworkConfig::outputDir)
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