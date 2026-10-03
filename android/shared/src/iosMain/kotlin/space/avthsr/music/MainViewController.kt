@file:OptIn(ExperimentalNativeApi::class, ExperimentalForeignApi::class)

// What the Swift app calls: start the shared app once, its screen, links opened from outside.
package space.avthsr.music

import androidx.compose.ui.window.ComposeUIViewController
import coil3.SingletonImageLoader
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.io.buffered
import kotlinx.io.files.Path
import kotlinx.io.files.SystemFileSystem
import kotlinx.io.readString
import kotlinx.io.writeString
import platform.Foundation.NSURLComponents
import platform.Foundation.NSURLQueryItem
import platform.UIKit.UIViewController
import space.avthsr.music.player.IosEngine
import space.avthsr.music.player.PlayerConn
import space.avthsr.music.ui.AvrTheme
import space.avthsr.music.ui.Root
import space.avthsr.music.ui.imageLoader
import kotlin.experimental.ExperimentalNativeApi

private var started = false

private val crashFile get() = Path(Platform.dataDir + "/crash.txt")

/** A crash is written down before the app goes; the next start shows it and sends it to the server. */
private fun installCrashCatcher() {
  setUnhandledExceptionHook { e ->
    runCatching { SystemFileSystem.sink(crashFile).buffered().use { it.writeString(e.stackTraceToString()) } }
  }
}

private fun takeLastCrash(): String? = runCatching {
  if (!SystemFileSystem.exists(crashFile)) return null
  val text = SystemFileSystem.source(crashFile).buffered().use { it.readString() }
  SystemFileSystem.delete(crashFile)
  text
}.getOrNull()

/** Called from the Swift app's init, while the app is launching. */
fun start() {
  if (started) return
  started = true
  installCrashCatcher()
  SingletonImageLoader.setSafe { imageLoader(it) }
  App.start(takeLastCrash())
  PlayerConn.attach(IosEngine())
}

fun MainViewController(): UIViewController = ComposeUIViewController { AvrTheme { Root() } }

/** A link to the site (or an avrmusic:// link) opens its screen. */
fun openLink(url: String) {
  val c = NSURLComponents(string = url) ?: return
  val query = c.queryItems?.mapNotNull { it as? NSURLQueryItem }?.associate { it.name to (it.value ?: "") } ?: emptyMap()
  val path = if (c.scheme == "avrmusic") "/" + (c.host ?: "") + (c.path ?: "") else c.path ?: return
  Links.open(path, query)
}
