// The screens' side of the player: the platform's engine (a MediaController connected to
// PlaybackService on Android, AVPlayer on iOS), its state as a flow, and the actions (play a list,
// next, like, start "My Wave" …).
package space.avthsr.music.player

import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import space.avthsr.music.App
import space.avthsr.music.Platform
import space.avthsr.music.api.Api
import space.avthsr.music.api.Track
import space.avthsr.music.tr
import kotlin.random.Random

/** Repeat modes (the same numbers as Media3's). */
object Repeat {
  const val OFF = 0
  const val ONE = 1
  const val ALL = 2
}

/** What the platform's player does; PlayerConn keeps the rest (the screens' state, the wave, timers). */
interface PlayerEngine {
  /** called on every change; true when the queue itself changed */
  var onChange: ((queueChanged: Boolean) -> Unit)?

  val count: Int
  /** the queue item at [i]: its track if known, otherwise what the engine knows of it */
  fun trackAt(i: Int): Track
  val index: Int
  val isPlaying: Boolean
  val isBuffering: Boolean
  val isIdle: Boolean
  val isEnded: Boolean
  var shuffle: Boolean
  var repeat: Int
  /** 0 when unknown */
  val durationMs: Long
  val positionMs: Long
  /** the queue's indices in the order they play */
  fun order(): List<Int>
  var speed: Float

  fun setTracks(tracks: List<Track>, start: Int)
  fun prepare()
  fun play()
  fun pause()
  fun seekTo(ms: Long)
  fun seekToDefault(index: Int)
  fun next()
  /** the previous track, or the start of this one after a few seconds */
  fun previous()
  fun previousTrack()
  fun move(from: Int, to: Int)
  fun removeRange(from: Int, to: Int)
  fun remove(index: Int)
  fun insert(at: Int, tracks: List<Track>)
  fun append(tracks: List<Track>)
  fun stop()
  fun clear()
}

data class PlayerUi(
  val track: Track? = null,
  val playing: Boolean = false,
  val loading: Boolean = false,
  val queue: List<Track> = emptyList(),
  val index: Int = -1,
  val shuffle: Boolean = false,
  val repeat: Int = Repeat.OFF,
  val durationMs: Long = 0,
  /** the queue's indices in the order they play (shuffle included), for the cover deck */
  val order: List<Int> = emptyList(),
)

object PlayerConn {
  private var engine: PlayerEngine? = null
  private val pending = mutableListOf<(PlayerEngine) -> Unit>()
  private var queue: List<Track> = emptyList()

  private val _state = MutableStateFlow(PlayerUi())
  val state: StateFlow<PlayerUi> = _state.asStateFlow()
  private val _currentId = MutableStateFlow<String?>(null)
  /** Only the playing track's id: track lists follow it without redrawing on every pause or buffering. */
  val currentId: StateFlow<String?> = _currentId.asStateFlow()

  /** The platform's player is ready (the app came to the front). */
  fun attach(e: PlayerEngine) {
    engine = e
    e.onChange = { sync(it) }
    speed.value = runCatching { Api.prefs.getFloat("speed", 1f) }.getOrDefault(1f)
    if (e.speed != speed.value) e.speed = speed.value
    sync(true)
    val actions = pending.toList()
    pending.clear()
    actions.forEach { it(e) }
  }

  /** The app went to the background: let go of the player (it keeps playing on its own). */
  fun detach() {
    engine?.onChange = null
    engine = null
  }

  fun failed(e: Throwable) {
    App.report(e.stackTraceToString())
    App.say(tr("Плеер не запустился: {}", e.message))
  }

  private fun sync(timeline: Boolean) {
    val c = engine ?: return
    if (timeline || queue.size != c.count) {
      queue = (0 until c.count).map { i -> c.trackAt(i) }
    }
    val idx = c.index
    val track = queue.getOrNull(idx)
    _currentId.value = track?.id
    _state.value = PlayerUi(
      track = track,
      playing = c.isPlaying,
      loading = c.isBuffering,
      queue = queue,
      index = idx,
      shuffle = c.shuffle,
      repeat = c.repeat,
      durationMs = c.durationMs.takeIf { it > 0 } ?: track?.durationMs ?: 0,
      order = c.order(),
    )
  }

  private fun withController(action: (PlayerEngine) -> Unit) {
    val c = engine
    if (c != null) action(c) else pending.add(action)
  }

  fun position(): Long = engine?.positionMs ?: 0L

  /** Plays a list starting at [index]; [context] says where it comes from (for the stats and the wave). */
  fun play(tracks: List<Track>, index: Int = 0, context: String? = null, shuffle: Boolean = false) {
    if (tracks.isEmpty()) return
    Queue.remember(tracks)
    Queue.context.value = context
    withController { c ->
      c.shuffle = shuffle
      val start = if (shuffle) Random.nextInt(tracks.size) else index.coerceIn(0, tracks.size - 1)
      c.setTracks(tracks, start)
      c.prepare()
      c.play()
    }
  }

  fun toggle() = withController { c ->
    if (c.isPlaying) c.pause()
    else {
      if (c.isIdle) c.prepare()
      if (c.isEnded) c.seekToDefault(0)
      c.play()
    }
  }

  /** Stops and empties the queue (signing out). */
  fun stop() {
    Queue.context.value = null
    engine?.let { it.stop(); it.clear() }
  }

  /* ---------- speed, sleep timer, queue editing ---------- */

  val speed = MutableStateFlow(1f)
  /** when the sleep timer pauses the music (epoch ms), or null */
  val sleepAt = MutableStateFlow<Long?>(null)
  private var sleepJob: Job? = null
  val speeds = listOf(0.75f, 1f, 1.25f, 1.5f, 2f)

  fun setSpeed(v: Float) {
    speed.value = v
    runCatching { Api.prefs.edit().putFloat("speed", v).apply() }
    withController { it.speed = v }
  }

  fun cycleSpeed() {
    val i = speeds.indexOfFirst { it >= speed.value - 0.01f }
    setSpeed(speeds[(i + 1) % speeds.size])
  }

  /** Pauses the music in [minutes]; null switches the timer off. */
  fun setSleep(minutes: Int?) {
    sleepJob?.cancel()
    sleepAt.value = null
    if (minutes == null) return
    sleepAt.value = Platform.nowMs() + minutes * 60_000L
    sleepJob = App.scope.launch {
      delay(minutes * 60_000L)
      withController { it.pause() }
      sleepAt.value = null
      App.say(tr("Таймер сна: музыка остановлена"))
    }
  }

  fun move(from: Int, to: Int) = withController { if (from != to) it.move(from, to) }

  /** Leaves only the current track in the queue. */
  fun clearQueue() = withController { c ->
    val cur = c.index
    if (cur + 1 < c.count) c.removeRange(cur + 1, c.count)
    if (cur > 0) c.removeRange(0, cur)
  }

  fun next() = withController { it.next() }
  fun prev() = withController { it.previous() }
  /** the previous track itself (a swipe), not a restart of the current one */
  fun prevTrack() = withController { it.previousTrack() }
  fun seek(ms: Long) = withController { it.seekTo(ms) }
  fun skipTo(index: Int) = withController { it.seekToDefault(index); it.play() }
  fun removeAt(index: Int) = withController { it.remove(index) }
  fun toggleShuffle() = withController { it.shuffle = !it.shuffle }

  fun cycleRepeat() = withController {
    it.repeat = when (it.repeat) {
      Repeat.OFF -> Repeat.ALL
      Repeat.ALL -> Repeat.ONE
      else -> Repeat.OFF
    }
  }

  fun playNext(t: Track) = playNext(listOf(t))

  fun enqueue(t: Track) = enqueue(listOf(t))

  /** Puts tracks (one, or a whole album / playlist) right after the current one. */
  fun playNext(list: List<Track>) {
    if (list.isEmpty()) return
    if (queue.isEmpty()) return play(list)
    Queue.remember(list)
    withController { it.insert(it.index + 1, list) }
    App.say(tr("Будет следующим"))
  }

  fun enqueue(list: List<Track>) {
    if (list.isEmpty()) return
    if (queue.isEmpty()) return play(list)
    Queue.remember(list)
    withController { it.append(list) }
    App.say(tr("Добавлено в очередь"))
  }

  /** Starts (or restarts in another mode) "My Wave". */
  suspend fun startWave(mode: String = Queue.waveMode.value) {
    Queue.setWaveMode(mode)
    val recent = queue.map { it.id }.takeLast(30)
    val batch = Api.waveNext(mode, recent)
    if (batch.tracks.isEmpty()) throw IllegalStateException(tr("Пока нечего включить: в медиатеке мало треков"))
    play(batch.tracks, 0, Queue.WAVE)
  }

  /** 👎 in the wave: never again there, and the next track starts. */
  fun dislike(t: Track) {
    next()
    App.scope.launch { runCatching { Api.waveFeedback(t.id, -1) } }
  }

  /** A track and others like it. */
  suspend fun radio(t: Track) {
    val more = runCatching { Api.radio(t.id) }.getOrDefault(emptyList()).filter { it.id != t.id }
    play(listOf(t) + more, 0, "radio:${t.id}")
  }

  /** Plays a library track known only by id (e.g. from the catalogue). */
  suspend fun playId(id: String) {
    play(listOf(Api.track(id)))
  }
}
