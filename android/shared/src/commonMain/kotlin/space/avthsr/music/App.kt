// The app's own state, the same on every phone: the background scope, short messages, the last crash,
// and what a link or a notification asked to open.
package space.avthsr.music

import io.ktor.http.encodeURLParameter
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import space.avthsr.music.api.Api
import space.avthsr.music.api.Likes
import space.avthsr.music.api.News
import space.avthsr.music.player.Net
import space.avthsr.music.player.Offline
import space.avthsr.music.player.Queue
import space.avthsr.music.ui.Look

object App {
  /** the stack trace of the previous run's crash, shown once */
  val lastCrash = MutableStateFlow<String?>(null)

  /** Everything the screens rely on, once at start (the platform is attached before). */
  fun start(previousCrash: String?) {
    Api.init()
    Lang.init()
    News.init()
    Queue.init()
    Offline.init()
    Look.init()
    Net.init()
    if (previousCrash != null) {
      lastCrash.value = previousCrash
      report(previousCrash)
    }
    if (Api.session.value != null) scope.launch {
      Likes.load()
      runCatching { Api.refreshMe() }
    }
  }

  fun report(stack: String) {
    scope.launch { runCatching { Api.reportError(stack.lineSequence().firstOrNull().orEmpty(), stack, Platform.device) } }
  }

  /** an error in background work is reported and shown, never a crash */
  private val handler = CoroutineExceptionHandler { _, e ->
    report(e.stackTraceToString())
    say(e.message ?: tr("Что-то пошло не так"))
  }

  /** Work that must outlive a screen (likes, play reports, requests to the server). */
  val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main + handler)

  /** Short messages shown as a snackbar. */
  val messages = MutableSharedFlow<String>(extraBufferCapacity = 8)
  fun say(text: String) { messages.tryEmit(text) }
}

/** What the system asked the app to show: the player (from the shade), a screen (a link), an invite. */
object Links {
  /** the shade player was tapped */
  val openPlayer = MutableStateFlow(false)

  /** a link to the site (or a launcher shortcut, or a notification) asks for this screen */
  val deepLink = MutableStateFlow<String?>(null)

  /** an invite link was opened: registration with this code */
  val invite = MutableStateFlow<String?>(null)

  /** A link to the site ("/album/…", "/register?invite=…") becomes the screen it shows. */
  fun open(path: String, query: Map<String, String> = emptyMap()) {
    val s = path.trim('/').split('/')
    deepLink.value = when {
      s.size >= 2 && s[0] in setOf("album", "artist", "playlist", "genre") -> "${s[0]}/${s[1].encodeURLParameter()}"
      s.size >= 3 && s[0] == "catalog" && s[1] == "album" -> "calbum/${s[2]}"
      s.size >= 3 && s[0] == "catalog" && s[1] == "artist" -> "cartist/${s[2]}"
      s[0] in setOf("search", "library", "liked", "profile") -> s[0]
      s[0] == "admin" -> "admin"
      s[0] == "history" -> "history"
      s[0] == "downloads" -> "downloads"
      s[0] == "news" -> "news"
      s[0] == "register" -> { query["invite"]?.let { invite.value = it }; null }
      else -> null
    }
  }
}
