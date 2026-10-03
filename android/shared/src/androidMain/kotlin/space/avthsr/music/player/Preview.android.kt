// Previews on Android: an ExoPlayer of its own that takes the audio focus, so the music pauses.
package space.avthsr.music.player

import space.avthsr.music.Platform
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

actual object Preview {
  private var player: ExoPlayer? = null
  private val _playing = MutableStateFlow<Long?>(null)
  /** the catalogue track whose preview is playing */
  actual val playing: StateFlow<Long?> = _playing.asStateFlow()

  actual fun toggle(id: Long, url: String) {
    if (_playing.value == id) return stop()
    val p = player ?: ExoPlayer.Builder(Platform.context)
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

  actual fun stop() {
    player?.stop()
    _playing.value = null
  }
}
