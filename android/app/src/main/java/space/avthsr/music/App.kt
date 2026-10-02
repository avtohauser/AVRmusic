package space.avthsr.music

import android.app.Application
import coil.ImageLoader
import coil.ImageLoaderFactory
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.launch
import space.avthsr.music.data.Api
import space.avthsr.music.data.Likes
import space.avthsr.music.player.Queue

class App : Application(), ImageLoaderFactory {
  override fun onCreate() {
    super.onCreate()
    Api.init(this)
    Queue.init(this)
    if (Api.session.value != null) scope.launch {
      Likes.load()
      runCatching { Api.refreshMe() }
    }
  }

  override fun newImageLoader(): ImageLoader = ImageLoader.Builder(this).crossfade(180).build()

  companion object {
    /** Work that must outlive a screen (likes, play reports, requests to the server). */
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    /** Short messages shown as a snackbar. */
    val messages = MutableSharedFlow<String>(extraBufferCapacity = 8)
    fun say(text: String) { messages.tryEmit(text) }
  }
}
