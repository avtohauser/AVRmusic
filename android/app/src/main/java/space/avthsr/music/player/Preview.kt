// 30-second previews of catalogue tracks (before fetching them to the server). A small player of its
// own: it takes the audio focus, so the music pauses while a preview plays.
package space.avthsr.music.player

import android.content.Context
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

object Preview {
  private var player: ExoPlayer? = null
  private val _playing = MutableStateFlow<Long?>(null)
  /** the catalogue track whose preview is playing */
  val playing: StateFlow<Long?> = _playing.asStateFlow()

  fun toggle(context: Context, id: Long, url: String) {
    if (_playing.value == id) return stop()
    val p = player ?: ExoPlayer.Builder(context.applicationContext)
      .setAudioAttributes(AudioAttributes.Builder().setUsage(C.USAGE_MEDIA).setContentType(C.AUDIO_CONTENT_TYPE_MUSIC).build(), true)
      .build()
      .also { created ->
        player = created
        created.addListener(object : Player.Listener {
          override fun onPlaybackStateChanged(playbackState: Int) { if (playbackState == Player.STATE_ENDED) stop() }
          override fun onIsPlayingChanged(isPlaying: Boolean) { if (!isPlaying && created.playbackState != Player.STATE_BUFFERING) _playing.value = null }
        })
      }
    p.setMediaItem(MediaItem.fromUri(url))
    p.prepare()
    p.play()
    _playing.value = id
  }

  fun stop() {
    player?.stop()
    _playing.value = null
  }
}
