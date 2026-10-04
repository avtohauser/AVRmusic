// "Listen together": one queue and one playing position for everyone in the session. The server keeps
// the session; every phone waits for its changes (a long poll) and follows them — the same queue, the
// same track, the position within a couple of seconds, playing or paused. What the listener does in
// the player (play, pause, next, seek, add to the queue …) goes to the server instead of the player
// and comes back to everyone. Changes made outside the app's screens (the shade, the lock screen,
// a track ending by itself) are noticed in the player's state and sent too.
package space.avthsr.music.player

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import space.avthsr.music.App
import space.avthsr.music.Platform
import space.avthsr.music.api.Api
import space.avthsr.music.api.ApiException
import space.avthsr.music.api.JamView
import space.avthsr.music.api.Track
import space.avthsr.music.api.jam
import space.avthsr.music.api.jamOp
import space.avthsr.music.api.joinJam
import space.avthsr.music.api.leaveJam
import space.avthsr.music.api.myJam
import space.avthsr.music.api.startJam
import space.avthsr.music.tr
import kotlin.math.abs

object Jam {
  /** what plays in a session (sent with play reports, keeps "My Wave" from topping up) */
  const val CONTEXT = "jam"

  private val _view = MutableStateFlow<JamView?>(null)
  /** the session the listener is in, or null */
  val view: StateFlow<JamView?> = _view.asStateFlow()
  val active get() = _view.value != null

  private var loop: Job? = null
  private var watch: Job? = null
  /** the player's changes until then are the session's own (just applied), not the listener's */
  private var quietUntil = 0L
  private var lastIndex = -1
  private var lastPlaying = false

  /** Starts a session with what plays now; friends can join it. */
  suspend fun start() {
    val s = PlayerConn.state.value
    enter(Api.startJam(s.queue.map { it.id }, s.index.coerceAtLeast(0), PlayerConn.position(), s.wantsToPlay))
  }

  suspend fun join(id: String) = enter(Api.joinJam(id))

  /** After a restart of the app: back into the session the listener was in. */
  suspend fun resume() {
    if (active || Api.session.value == null) return
    runCatching { Api.myJam() }.getOrNull()?.let { enter(it) }
  }

  fun leave() {
    stop()
    App.scope.launch { runCatching { Api.leaveJam() } }
  }

  private fun stop() {
    loop?.cancel(); loop = null
    watch?.cancel(); watch = null
    _view.value = null
    if (Queue.context.value == CONTEXT) Queue.context.value = null
  }

  private fun enter(v: JamView) {
    _view.value = v
    Queue.context.value = CONTEXT
    apply(v)
    follow(v.id)
    watchPlayer()
  }

  /** Waits for the session's changes and follows them, until the listener leaves or it ends. */
  private fun follow(id: String) {
    loop?.cancel()
    loop = App.scope.launch {
      while (isActive) {
        val cur = _view.value?.takeIf { it.id == id } ?: break
        val next = try {
          Api.jam(id, cur.version)
        } catch (e: CancellationException) {
          throw e
        } catch (e: ApiException) {
          if (e.status == 403 || e.status == 404) null else { delay(3000); continue }
        } catch (e: Exception) {
          delay(3000); continue
        }
        if (next == null) {
          if (_view.value?.id == id) { stop(); App.say(tr("Совместное прослушивание закончилось")) }
          break
        }
        if (_view.value?.id != id) break
        val changed = next.version != cur.version
        _view.value = next
        if (changed) describe(next)
        // a reply without changes still carries the fresh position: a chance to correct a drift
        apply(next)
      }
    }
  }

  /** "Петя добавил трек" — what a friend just did, as a short message. */
  private fun describe(v: JamView) {
    val who = v.lastBy ?: return
    if (who.id == Api.user?.id) return
    val name = who.displayName
    val text = when (v.lastAction) {
      "joined" -> tr("{} присоединяется", name)
      "left" -> tr("{} вышел(а)", name)
      "add" -> tr("{} добавил(а) в очередь", name)
      "replace" -> tr("{} включил(а) другое", name)
      else -> null
    }
    text?.let { App.say(it) }
  }

  /** Brings this phone's player to the session's state. */
  private fun apply(v: JamView) {
    if (v.queue.isEmpty()) return
    val s = PlayerConn.state.value
    val index = v.index.coerceIn(0, v.queue.size - 1)
    quietUntil = Platform.nowMs() + 2500
    lastIndex = index
    lastPlaying = v.playing
    if (s.queue.map { it.id } != v.queue.map { it.id }) {
      PlayerConn.jamLoad(v.queue, index, v.positionMs, v.playing)
      return
    }
    if (s.index != index) PlayerConn.jamGo(index, v.positionMs)
    else if (abs(PlayerConn.position() - v.positionMs) > 2500) PlayerConn.jamSeek(v.positionMs)
    if (s.wantsToPlay != v.playing) PlayerConn.jamPlaying(v.playing)
  }

  /** Changes made outside the app's buttons (shade, lock screen, a track that ended) go to the session. */
  private fun watchPlayer() {
    watch?.cancel()
    watch = App.scope.launch {
      PlayerConn.state.collect { s ->
        val v = _view.value ?: return@collect
        if (Platform.nowMs() < quietUntil || s.queue.map { it.id } != v.queue.map { it.id }) return@collect
        if (s.index >= 0 && s.index != lastIndex && abs(s.index - lastIndex) == 1) {
          lastIndex = s.index
          send(buildJsonObject { put("op", "skip"); put("index", s.index) })
        }
        if (s.wantsToPlay != lastPlaying) {
          lastPlaying = s.wantsToPlay
          send(buildJsonObject { put("op", if (s.wantsToPlay) "play" else "pause") })
        }
      }
    }
  }

  /** The player was attached again (the app came back): catch up with the session. */
  fun resync() {
    _view.value?.let { apply(it) }
  }

  private fun send(body: JsonObject) {
    val v = _view.value ?: return
    App.scope.launch {
      runCatching { Api.jamOp(v.id, body) }
        .onSuccess { nv -> if (_view.value?.id == nv.id) { _view.value = nv; apply(nv) } }
        .onFailure { App.say(it.message ?: tr("Не получилось")) }
    }
  }

  private fun ids(list: List<Track>) = JsonArray(list.map { JsonPrimitive(it.id) })

  /* ---------- the player's actions while in a session ---------- */

  fun toggle() = send(buildJsonObject { put("op", if (_view.value?.playing == true) "pause" else "play") })
  fun next() = send(buildJsonObject { put("op", "next") })
  fun prev() = send(buildJsonObject { put("op", "prev") })
  fun skip(index: Int) = send(buildJsonObject { put("op", "skip"); put("index", index) })
  fun seek(ms: Long) = send(buildJsonObject { put("op", "seek"); put("positionMs", ms.coerceAtLeast(0)) })
  fun remove(index: Int) = send(buildJsonObject { put("op", "remove"); put("index", index) })
  fun move(from: Int, to: Int) = send(buildJsonObject { put("op", "move"); put("from", from); put("to", to) })

  fun add(list: List<Track>, next: Boolean) {
    Queue.remember(list)
    send(buildJsonObject { put("op", "add"); put("trackIds", ids(list)); put("next", next) })
    App.say(if (next) tr("Будет следующим у всех") else tr("Добавлено в общую очередь"))
  }

  /** Something else for everyone (an album, a playlist, the wave …). */
  fun replace(list: List<Track>, index: Int, positionMs: Long = 0) {
    if (list.isEmpty()) return
    Queue.remember(list)
    send(buildJsonObject { put("op", "replace"); put("trackIds", ids(list.take(500))); put("index", index.coerceIn(0, list.size - 1)); put("positionMs", positionMs) })
  }
}
