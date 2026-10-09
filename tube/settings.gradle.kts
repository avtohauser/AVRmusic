// avrtube: video without ads on the NewPipe engine, for Android and iPhone, in the avr look.
//   :model  — what the app and the server exchange (Kotlin Multiplatform)
//   :core   — NewPipeExtractor wrapped: search, videos and their streams, channels, playlists, comments
//             (the Android app runs it on the phone; the server runs it for the iPhone)
//   :engine — the server for the iPhone: the same core over HTTP, and a signed proxy for the streams
//             (YouTube ties a stream's address to whoever asked for it)
pluginManagement {
  repositories { gradlePluginPortal(); mavenCentral(); google() }
}
dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
  repositories {
    mavenCentral()
    google()
    // NewPipeExtractor and its JSON parser are published on JitPack
    maven("https://jitpack.io")
  }
}
rootProject.name = "avrtube"
include(":model", ":core", ":engine")
