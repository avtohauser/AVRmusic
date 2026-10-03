// The app itself, shared by Android and iOS: screens (Compose Multiplatform with Material 3 Expressive),
// the server API, the queue and My Wave, offline tracks, settings. What differs per platform sits in
// androidMain / iosMain behind small expect / actual declarations; the Android app module adds the
// Media3 player service, the iOS app the AVPlayer side.
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
  id("org.jetbrains.kotlin.multiplatform")
  id("com.android.library")
  id("org.jetbrains.compose")
  id("org.jetbrains.kotlin.plugin.compose")
  id("org.jetbrains.kotlin.plugin.serialization")
}

val cmp = "1.11.1"
val ktor = "3.3.1"
val coil = "3.3.0"

kotlin {
  androidTarget { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }
  listOf(iosArm64(), iosSimulatorArm64()).forEach { target ->
    target.binaries.framework { baseName = "Shared"; isStatic = true }
  }
  compilerOptions {
    freeCompilerArgs.add("-Xexpect-actual-classes")
    optIn.addAll("androidx.compose.material3.ExperimentalMaterial3ExpressiveApi", "androidx.compose.material3.ExperimentalMaterial3Api")
  }

  sourceSets {
    commonMain.dependencies {
      api("org.jetbrains.compose.runtime:runtime:$cmp")
      api("org.jetbrains.compose.foundation:foundation:$cmp")
      api("org.jetbrains.compose.animation:animation:$cmp")
      api("org.jetbrains.compose.ui:ui:$cmp")
      api("org.jetbrains.compose.material3:material3:1.11.0-alpha07")
      api("org.jetbrains.compose.components:components-resources:$cmp")
      api("androidx.graphics:graphics-shapes:1.1.0")
      api("org.jetbrains.androidx.navigation:navigation-compose:2.9.2")
      api("org.jetbrains.androidx.lifecycle:lifecycle-runtime-compose:2.9.6")
      api("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")
      api("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0")
      api("io.ktor:ktor-client-core:$ktor")
      api("io.coil-kt.coil3:coil-compose:$coil")
      implementation("io.coil-kt.coil3:coil-network-ktor3:$coil")
      implementation("com.materialkolor:material-color-utilities:4.0.2")
      implementation("com.squareup.okio:okio:3.16.2")
    }
    androidMain.dependencies {
      implementation("io.ktor:ktor-client-okhttp:$ktor")
      implementation("io.coil-kt.coil3:coil-gif:$coil")
      implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
      implementation("androidx.activity:activity-compose:1.9.3")
      implementation("androidx.core:core-ktx:1.13.1")
      implementation("androidx.work:work-runtime-ktx:2.10.1")
      implementation("androidx.media3:media3-exoplayer:1.4.1")
    }
    iosMain.dependencies {
      implementation("io.ktor:ktor-client-darwin:$ktor")
    }
  }
}

android {
  namespace = "space.avthsr.music.shared"
  compileSdk = 36
  defaultConfig { minSdk = 23 }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
}

compose.resources {
  publicResClass = true
  packageOfResClass = "space.avthsr.music.res"
  generateResClass = always
}
