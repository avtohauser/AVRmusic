// The screens' side of the player: a MediaController connected to PlaybackService, its state as a
// flow, and the actions (play a list, next, like, start "My Wave" …).
package space.avthsr.music.player

import space.avthsr.music.tr
import android.content.ComponentName
import android.content.Context
import androidx.core.content.ContextCompat
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import space.avthsr.music.App
import space.avthsr.music.api.Api
import space.avthsr.music.api.ArtistSummary
import space.avthsr.music.api.Track
import kotlin.random.Random

data class PlayerUi(
  val track: Track? = null,
  val playing: Boolean = false,
  val loading: Boolean = false,
  val queue: List<Track> = emptyList(),
  val index: Int = -1,
  val shuffle: Boolean = false,
  val repeat: Int = Player.REPEAT_MODE_OFF,
  val durationMs: Long = 0,
)

object PlayerConn {
  private var future: ListenableFuture<MediaController>? = null
  private var controller: MediaController? = null
  private val pending = mutableListOf<(MediaController) -> Unit>()
  private var queue: List<Track> = emptyList()

  private val _state = MutableStateFlow(PlayerUi())
  val state: StateFlow<PlayerUi> = _state.asStateFlow()

  fun connect(context: Context) {
    if (future != null) return
    val app = context.applicationContext
    val f = try {
      MediaController.Builder(app, SessionToken(app, ComponentName(app, PlaybackService::class.java))).buildAsync()
    } catch (e: Exception) {
      App.report(android.util.Log.getStackTraceString(e))
      App.say(tr("Плеер не запустился: {}", e.message))
      return
    }
    future = f
    f.addListener({
      val c = try { f.get() } catch (e: Exception) { null }
      if (c == null) {
        future = null
      } else {
        controller = c
        c.addListener(listener)
        speed.value = runCatching { Api.prefs.getFloat("speed", 1f) }.getOrDefault(1f)
        if (c.playbackParameters.speed != speed.value) c.setPlaybackSpeed(speed.value)
        sync(true)
        val actions = pending.toList()
        pending.clear()
        actions.forEach { it(c) }
      }
    }, ContextCompat.getMainExecutor(app))
  }

  /** The app went to the background: let go of the service (it keeps playing on its own). */
  fun release() {
    controller?.removeListener(listener)
    future?.let { MediaController.releaseFuture(it) }
    future = null
    controller = null
  }

  private val listener = object : Player.Listener {
    override fun onEvents(player: Player, events: Player.Events) {
      sync(events.contains(Player.EVENT_TIMELINE_CHANGED))
    }
  }

  private fun fallback(item: MediaItem): Track {
    val m = item.mediaMetadata
    return Track(
      id = item.mediaId,
      title = m.title?.toString().orEmpty(),
      artist = ArtistSummary("", m.artist?.toString().orEmpty()),
      coverUrl = m.artworkUri?.toString(),
    )
  }

  private fun sync(timeline: Boolean) {
    val c = controller ?: return
    if (timeline || queue.size != c.mediaItemCount) {
      queue = (0 until c.mediaItemCount).map { i -> c.getMediaItemAt(i).let { Queue.track(it.mediaId) ?: fallback(it) } }
    }
    val idx = c.currentMediaItemIndex
    val track = queue.getOrNull(idx)
    _state.value = PlayerUi(
      track = track,
      playing = c.isPlaying,
      loading = c.playbackState == Player.STATE_BUFFERING,
      queue = queue,
      index = idx,
      shuffle = c.shuffleModeEnabled,
      repeat = c.repeatMode,
      durationMs = c.duration.takeIf { it != C.TIME_UNSET && it > 0 } ?: track?.durationMs ?: 0,
    )
  }

  private fun withController(action: (MediaController) -> Unit) {
    val c = controller
    if (c != null) action(c) else pending.add(action)
  }

  fun position(): Long = controller?.currentPosition ?: 0L

  /** Plays a list starting at [index]; [context] says where it comes from (for the stats and the wave). */
  fun play(tracks: List<Track>, index: Int = 0, context: String? = null, shuffle: Boolean = false) {
    if (tracks.isEmpty()) return
    Queue.remember(tracks)
    Queue.context.value = context
    withController { c ->
      c.shuffleModeEnabled = shuffle
      val start = if (shuffle) Random.nextInt(tracks.size) else index.coerceIn(0, tracks.size - 1)
      c.setMediaItems(tracks.map { mediaItemOf(it) }, start, 0L)
      c.prepare()
      c.play()
    }
  }

  fun toggle() = withController { c ->
    if (c.isPlaying) c.pause()
    else {
      if (c.playbackState == Player.STATE_IDLE) c.prepare()
      if (c.playbackState == Player.STATE_ENDED) c.seekToDefaultPosition(0)
      c.play()
    }
  }

  /** Stops and empties the queue (signing out). */
  fun stop() {
    Queue.context.value = null
    controller?.let { it.stop(); it.clearMediaItems() }
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
    withController { it.setPlaybackSpeed(v) }
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
    sleepAt.value = System.currentTimeMillis() + minutes * 60_000L
    sleepJob = App.scope.launch {
      delay(minutes * 60_000L)
      withController { it.pause() }
      sleepAt.value = null
      App.say(tr("Таймер сна: музыка остановлена"))
    }
  }

  fun move(from: Int, to: Int) = withController { if (from != to) it.moveMediaItem(from, to) }

  /** Leaves only the current track in the queue. */
  fun clearQueue() = withController { c ->
    val cur = c.currentMediaItemIndex
    if (cur + 1 < c.mediaItemCount) c.removeMediaItems(cur + 1, c.mediaItemCount)
    if (cur > 0) c.removeMediaItems(0, cur)
  }

  fun next() = withController { it.seekToNext() }
  fun prev() = withController { it.seekToPrevious() }
  fun seek(ms: Long) = withController { it.seekTo(ms) }
  fun skipTo(index: Int) = withController { it.seekToDefaultPosition(index); it.play() }
  fun removeAt(index: Int) = withController { it.removeMediaItem(index) }
  fun toggleShuffle() = withController { it.shuffleModeEnabled = !it.shuffleModeEnabled }

  fun cycleRepeat() = withController {
    it.repeatMode = when (it.repeatMode) {
      Player.REPEAT_MODE_OFF -> Player.REPEAT_MODE_ALL
      Player.REPEAT_MODE_ALL -> Player.REPEAT_MODE_ONE
      else -> Player.REPEAT_MODE_OFF
    }
  }

  fun playNext(t: Track) {
    if (queue.isEmpty()) return play(listOf(t))
    Queue.remember(listOf(t))
    withController { it.addMediaItem(it.currentMediaItemIndex + 1, mediaItemOf(t)) }
    App.say(tr("Будет следующим"))
  }

  fun enqueue(t: Track) {
    if (queue.isEmpty()) return play(listOf(t))
    Queue.remember(listOf(t))
    withController { it.addMediaItem(mediaItemOf(t)) }
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
