plugins {
  kotlin("jvm")
  kotlin("plugin.serialization")
}
dependencies {
  api(project(":model"))
  api("com.github.TeamNewPipe:NewPipeExtractor:${providers.gradleProperty("newpipe.version").get()}")
  api("com.squareup.okhttp3:okhttp:4.12.0")
}
