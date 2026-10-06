// The listener's own devices see each other: this phone reports what it plays every few seconds (while the
// app is open or the music plays) and waits for commands from the others — play, pause, skip, seek, or
// "play this here" with a whole queue. From here, any other device can be controlled the same way, and
// the music can move between them in both directions.
package space.avthsr.music.player

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import space.avthsr.music.App
import space.avthsr.music.Platform
import space.avthsr.music.api.Api
import space.avthsr.music.api.DeviceCommand
import space.avthsr.music.api.DeviceInfo
import space.avthsr.music.api.deviceCommand
import space.avthsr.music.api.deviceCommands
import space.avthsr.music.api.deviceHeartbeat
import space.avthsr.music.api.deviceQueue
import space.avthsr.music.tr

object Devices {
  private val _list = MutableStateFlow<List<DeviceInfo>>(emptyList())
  /** the listener's devices online, this one included */
  val list: StateFlow<List<DeviceInfo>> = _list.asStateFlow()

  val id: String by lazy {
    Api.prefs.getString("device.id", null) ?: ("d" + kotlin.random.Random.nextLong().toULong().toString(36)).also { Api.prefs.edit().putString("device.id", it).apply() }
  }
  private val kind get() = if (Platform.name == "iOS") "ios" else "android"
  private val name get() = Platform.device.substringBefore(",").trim().ifBlank { Platform.name }.take(60)

  private var visible = false
  private var beat: Job? = null
  private var commands: Job? = null
  private var seq = 0

  /** Reports start with the music too (played from the notification, the lock screen, a widget). */
  fun init() {
    App.scope.launch { PlayerConn.state.collect { if (it.wantsToPlay) start() } }
  }

  /** The app came to the front or went away (the reports go on while the music plays). */
  fun visible(on: Boolean) {
    visible = on
    if (on) start()
  }

  private fun wanted() = Api.session.value != null && (visible || PlayerConn.state.value.wantsToPlay)

  private fun start() {
    if (beat?.isActive != true) beat = App.scope.launch {
      while (isActive && wanted()) {
        report()
        delay(if (visible) 8_000 else 20_000)
      }
    }
    if (commands?.isActive != true) commands = App.scope.launch {
      while (isActive && wanted()) {
        try {
          val r = Api.deviceCommands(id, seq)
          if (r.seq < seq) seq = r.seq // the server restarted
          r.commands.forEach { run(it) }
          if (r.commands.isNotEmpty()) seq = r.commands.maxOf { it.seq } else if (r.seq > seq && r.commands.isEmpty()) seq = r.seq
        } catch (e: CancellationException) {
          throw e
        } catch (_: Exception) {
          delay(5_000)
        }
      }
    }
  }

  /** Tells the server what plays here; its answer is the listener's devices. */
  suspend fun report() {
    val s = PlayerConn.state.value
    runCatching { Api.deviceHeartbeat(id, name, kind, s.track?.id, PlayerConn.position(), s.wantsToPlay, s.queue.map { it.id }, s.index) }
      .onSuccess { _list.value = it }
  }

  /** A command from another device. */
  private fun run(c: DeviceCommand) {
    when (c.type) {
      "play" -> if (!PlayerConn.state.value.playing) PlayerConn.toggle()
      "pause" -> if (PlayerConn.state.value.wantsToPlay) PlayerConn.toggle()
      "next" -> PlayerConn.next()
      "prev" -> PlayerConn.prev()
      "seek" -> c.positionMs?.let { PlayerConn.seek(it) }
      "transfer" -> App.scope.launch {
        // the server already holds the queue sent here, with its tracks
        val q = runCatching { Api.deviceQueue(id) }.getOrNull()
        val tracks = q?.tracks.orEmpty().takeIf { list -> list.map { it.id } == c.trackIds.take(list.size) && list.isNotEmpty() }
          ?: c.trackIds.take(50).mapNotNull { tid -> runCatching { Api.track(tid) }.getOrNull() }
        if (tracks.isEmpty()) return@launch
        if (Jam.active) Jam.leave()
        PlayerConn.jamLoad(tracks, c.index.coerceIn(0, tracks.size - 1), c.positionMs ?: 0, c.playing)
        App.say(tr("Музыка перешла на это устройство"))
      }
    }
    App.scope.launch { delay(600); report() }
  }

  /* ---------- controlling another device ---------- */

  fun command(target: String, type: String, positionMs: Long? = null, volume: Float? = null) {
    App.scope.launch {
      runCatching { Api.deviceCommand(target, id, type, positionMs, volume) }
        .onSuccess { delay(500); report() }
        .onFailure { App.say(it.message ?: tr("Не получилось")) }
    }
  }

  /** What plays here goes on on [target] from the same place; here it pauses. */
  fun sendTo(target: DeviceInfo) {
    val s = PlayerConn.state.value
    if (s.queue.isEmpty()) return App.say(tr("Здесь ничего не играет"))
    App.scope.launch {
      runCatching { Api.deviceCommand(target.id, id, "transfer", PlayerConn.position(), trackIds = s.queue.map { it.id }, index = s.index.coerceAtLeast(0), playing = true) }
        .onSuccess {
          if (PlayerConn.state.value.wantsToPlay) PlayerConn.toggle()
          App.say(tr("Играет на «{}»", target.name))
          delay(800); report()
        }
        .onFailure { App.say(it.message ?: tr("Не получилось")) }
    }
  }

  /** What plays on [source] goes on here; there it pauses. */
  fun takeFrom(source: DeviceInfo) {
    App.scope.launch {
      runCatching { Api.deviceQueue(source.id) }
        .onSuccess { q ->
          if (q.tracks.isEmpty()) return@onSuccess App.say(tr("Там ничего не играет"))
          runCatching { Api.deviceCommand(source.id, id, "pause") }
          if (Jam.active) Jam.leave()
          PlayerConn.jamLoad(q.tracks, q.index.coerceIn(0, q.tracks.size - 1), q.positionMs, true)
          delay(800); report()
        }
        .onFailure { App.say(it.message ?: tr("Не получилось")) }
    }
  }
}
