package space.avthsr.music

import android.app.Application
import android.os.Build
import android.util.Log
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.decode.GifDecoder
import coil.decode.ImageDecoderDecoder
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import space.avthsr.music.api.Api
import space.avthsr.music.api.Likes
import space.avthsr.music.player.Net
import space.avthsr.music.player.Offline
import space.avthsr.music.player.Queue
import java.io.File

class App : Application(), ImageLoaderFactory {
  override fun onCreate() {
    super.onCreate()
    installCrashCatcher()
    Api.init(this)
    Lang.init()
    space.avthsr.music.api.News.init(this)
    Queue.init(this)
    Offline.init(this)
    space.avthsr.music.ui.Look.init()
    Net.init(this)
    reportLastCrash()
    if (Api.session.value != null) scope.launch {
      Likes.load()
      runCatching { Api.refreshMe() }
    }
  }

  override fun newImageLoader(): ImageLoader = ImageLoader.Builder(this)
    .crossfade(180)
    // animated canvases (GIF / animated WebP)
    .components { if (Build.VERSION.SDK_INT >= 28) add(ImageDecoderDecoder.Factory()) else add(GifDecoder.Factory()) }
    .build()

  private val crashFile get() = File(filesDir, "crash.txt")

  /** A crash is written down before the app goes; the next start shows it and sends it to the server. */
  private fun installCrashCatcher() {
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, e ->
      runCatching { crashFile.writeText(Log.getStackTraceString(e)) }
      previous?.uncaughtException(thread, e)
    }
  }

  private fun reportLastCrash() {
    val text = runCatching { crashFile.takeIf { it.exists() }?.readText() }.getOrNull() ?: return
    crashFile.delete()
    lastCrash.value = text
    report(text)
  }

  companion object {
    /** the stack trace of the previous run's crash, shown once */
    val lastCrash = MutableStateFlow<String?>(null)

    fun report(stack: String) {
      val device = "${Build.MANUFACTURER} ${Build.MODEL}, Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})"
      scope.launch { runCatching { Api.reportError(stack.lineSequence().firstOrNull().orEmpty(), stack, device) } }
    }

    /** an error in background work is reported and shown, never a crash */
    private val handler = CoroutineExceptionHandler { _, e ->
      report(Log.getStackTraceString(e))
      say(e.message ?: tr("Что-то пошло не так"))
    }

    /** Work that must outlive a screen (likes, play reports, requests to the server). */
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main + handler)

    /** Short messages shown as a snackbar. */
    val messages = MutableSharedFlow<String>(extraBufferCapacity = 8)
    fun say(text: String) { messages.tryEmit(text) }
  }
}
