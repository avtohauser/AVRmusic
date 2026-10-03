// The shared player's engine on Android: a MediaController connected to PlaybackService (ExoPlayer in
// a media session), so the music lives in the service and the shade player while the app is closed.
package space.avthsr.music.player

import android.content.ComponentName
import android.content.Context
import androidx.core.content.ContextCompat
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import space.avthsr.music.api.ArtistSummary
import space.avthsr.music.api.Track

class AndroidEngine private constructor(private val c: MediaController) : PlayerEngine {
  override var onChange: ((Boolean) -> Unit)? = null

  private val listener = object : Player.Listener {
    override fun onEvents(player: Player, events: Player.Events) {
      onChange?.invoke(events.contains(Player.EVENT_TIMELINE_CHANGED))
    }
  }

  init { c.addListener(listener) }

  private fun fallback(item: MediaItem): Track {
    val m = item.mediaMetadata
    return Track(
      id = item.mediaId,
      title = m.title?.toString().orEmpty(),
      artist = ArtistSummary("", m.artist?.toString().orEmpty()),
      coverUrl = m.artworkUri?.toString(),
    )
  }

  override val count get() = c.mediaItemCount
  override fun trackAt(i: Int): Track = c.getMediaItemAt(i).let { Queue.track(it.mediaId) ?: fallback(it) }
  override val index get() = c.currentMediaItemIndex
  override val isPlaying get() = c.isPlaying
  override val isBuffering get() = c.playbackState == Player.STATE_BUFFERING
  override val isIdle get() = c.playbackState == Player.STATE_IDLE
  override val isEnded get() = c.playbackState == Player.STATE_ENDED
  override var shuffle: Boolean
    get() = c.shuffleModeEnabled
    set(v) { c.shuffleModeEnabled = v }
  override var repeat: Int
    get() = c.repeatMode
    set(v) { c.repeatMode = v }
  override val durationMs get() = c.duration.takeIf { it != C.TIME_UNSET && it > 0 } ?: 0L
  override val positionMs get() = c.currentPosition
  override var speed: Float
    get() = c.playbackParameters.speed
    set(v) { c.setPlaybackSpeed(v) }

  override fun order(): List<Int> {
    val tl = c.currentTimeline
    if (tl.isEmpty) return emptyList()
    return buildList {
      var i = tl.getFirstWindowIndex(c.shuffleModeEnabled)
      while (i != C.INDEX_UNSET && size < tl.windowCount) { add(i); i = tl.getNextWindowIndex(i, Player.REPEAT_MODE_OFF, c.shuffleModeEnabled) }
    }
  }

  override fun setTracks(tracks: List<Track>, start: Int) = c.setMediaItems(tracks.map { mediaItemOf(it) }, start, 0L)
  override fun prepare() = c.prepare()
  override fun play() = c.play()
  override fun pause() = c.pause()
  override fun seekTo(ms: Long) = c.seekTo(ms)
  override fun seekToDefault(index: Int) = c.seekToDefaultPosition(index)
  override fun next() = c.seekToNext()
  override fun previous() = c.seekToPrevious()
  override fun previousTrack() = c.seekToPreviousMediaItem()
  override fun move(from: Int, to: Int) = c.moveMediaItem(from, to)
  override fun removeRange(from: Int, to: Int) = c.removeMediaItems(from, to)
  override fun remove(index: Int) = c.removeMediaItem(index)
  override fun insert(at: Int, tracks: List<Track>) = c.addMediaItems(at, tracks.map { mediaItemOf(it) })
  override fun append(tracks: List<Track>) = c.addMediaItems(tracks.map { mediaItemOf(it) })
  override fun stop() = c.stop()
  override fun clear() = c.clearMediaItems()

  companion object {
    private var future: ListenableFuture<MediaController>? = null
    private var engine: AndroidEngine? = null

    /** Connects to the service; PlayerConn gets the engine once it is ready. */
    fun connect(context: Context) {
      if (future != null) return
      val app = context.applicationContext
      val f = try {
        MediaController.Builder(app, SessionToken(app, ComponentName(app, PlaybackService::class.java))).buildAsync()
      } catch (e: Exception) {
        PlayerConn.failed(e)
        return
      }
      future = f
      f.addListener({
        val c = try { f.get() } catch (e: Exception) { null }
        if (c == null) {
          future = null
        } else if (future === f) {
          val e = AndroidEngine(c)
          engine = e
          PlayerConn.attach(e)
        }
      }, ContextCompat.getMainExecutor(app))
    }

    /** The app went to the background: let go of the service (it keeps playing on its own). */
    fun release() {
      PlayerConn.detach()
      engine?.let { it.c.removeListener(it.listener) }
      engine = null
      future?.let { MediaController.releaseFuture(it) }
      future = null
    }
  }
}
