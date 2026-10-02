// Canvas: the short looping clip (or animated image) of a track, shown behind the player like on the
// site. A muted ExoPlayer of its own plays the video, cropped to fill, and pauses with the music.
package space.avthsr.music.ui

import android.view.TextureView
import androidx.annotation.OptIn
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.VideoSize
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import coil.compose.AsyncImage
import space.avthsr.music.api.Api
import space.avthsr.music.api.Track

/** The track's canvas filling [modifier]'s box, or nothing when it has none. */
@Composable
fun TrackCanvas(t: Track, playing: Boolean, modifier: Modifier = Modifier) {
  if (!t.hasCanvas) return
  val url = remember(t.id) { Api.canvasUrl(t.id) }
  if (t.canvasKind == "image") {
    AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Crop, modifier = modifier)
  } else {
    CanvasVideo(url, playing, modifier)
  }
}

@OptIn(UnstableApi::class)
@Composable
private fun CanvasVideo(url: String, playing: Boolean, modifier: Modifier) {
  val context = LocalContext.current
  var ratio by remember(url) { mutableFloatStateOf(9f / 16f) }
  val player = remember(url) {
    ExoPlayer.Builder(context).build().apply {
      volume = 0f
      repeatMode = Player.REPEAT_MODE_ONE
      setMediaItem(MediaItem.fromUri(url))
      prepare()
    }
  }
  DisposableEffect(player) {
    val listener = object : Player.Listener {
      override fun onVideoSizeChanged(videoSize: VideoSize) {
        if (videoSize.width > 0 && videoSize.height > 0) ratio = videoSize.width * videoSize.pixelWidthHeightRatio / videoSize.height
      }
    }
    player.addListener(listener)
    onDispose {
      player.removeListener(listener)
      player.release()
    }
  }
  LaunchedEffect(player, playing) { player.playWhenReady = playing }
  BoxWithConstraints(modifier.clipToBounds(), contentAlignment = Alignment.Center) {
    // crop to fill: the video is at least as big as the box both ways
    val w = maxOf(maxWidth, maxHeight * ratio)
    val h = w / ratio
    AndroidView(
      factory = { ctx -> TextureView(ctx).also { player.setVideoTextureView(it) } },
      modifier = Modifier.requiredSize(w, h),
    )
  }
}
