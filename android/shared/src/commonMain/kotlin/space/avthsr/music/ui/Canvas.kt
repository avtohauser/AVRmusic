// Canvas: the short looping clip (or animated image) of a track, shown behind the player like on the
// site. The platform's video player plays it muted, cropped to fill, and pauses with the music.
package space.avthsr.music.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import coil3.compose.AsyncImage
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

/** A muted looping video cropped to fill [modifier]'s box. */
@Composable
expect fun CanvasVideo(url: String, playing: Boolean, modifier: Modifier)
