package space.avthsr.music

import android.app.Application
import android.os.Build
import android.util.Log
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.gif.AnimatedImageDecoder
import coil3.gif.GifDecoder
import space.avthsr.music.ui.imageLoader
import java.io.File

class AndroidApp : Application(), SingletonImageLoader.Factory {
  override fun onCreate() {
    super.onCreate()
    Platform.attach(this, BuildConfig.VERSION_NAME)
    installCrashCatcher()
    App.start(takeLastCrash())
  }

  override fun newImageLoader(context: PlatformContext): ImageLoader = imageLoader(context) {
    // animated canvases (GIF / animated WebP)
    if (Build.VERSION.SDK_INT >= 28) add(AnimatedImageDecoder.Factory()) else add(GifDecoder.Factory())
  }

  private val crashFile get() = File(filesDir, "crash.txt")

  /** A crash is written down before the app goes; the next start shows it and sends it to the server. */
  private fun installCrashCatcher() {
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, e ->
      runCatching { crashFile.writeText(Log.getStackTraceString(e)) }
      previous?.uncaughtException(thread, e)
    }
  }

  private fun takeLastCrash(): String? {
    val text = runCatching { crashFile.takeIf { it.exists() }?.readText() }.getOrNull() ?: return null
    crashFile.delete()
    return text
  }
}
