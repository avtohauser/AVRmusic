plugins {
  kotlin("multiplatform")
  kotlin("plugin.serialization")
}
kotlin {
  jvm()
  sourceSets {
    commonMain.dependencies { api("org.jetbrains.kotlinx:kotlinx-serialization-json:1.9.0") }
  }
}
