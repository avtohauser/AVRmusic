plugins {
  kotlin("jvm")
  kotlin("plugin.serialization")
  id("com.gradleup.shadow")
  application
}
application { mainClass.set("space.avthsr.tube.engine.MainKt") }
val ktor = "3.3.1"
dependencies {
  implementation(project(":core"))
  implementation("io.ktor:ktor-server-core:$ktor")
  implementation("io.ktor:ktor-server-netty:$ktor")
  implementation("io.ktor:ktor-server-content-negotiation:$ktor")
  implementation("io.ktor:ktor-server-status-pages:$ktor")
  implementation("io.ktor:ktor-serialization-kotlinx-json:$ktor")
  implementation("ch.qos.logback:logback-classic:1.5.18")
}
tasks.shadowJar {
  archiveFileName.set("engine.jar")
  mergeServiceFiles()
}
