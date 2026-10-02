// Swiping between tracks, as in Spotify: drag the track to the left for the next one, to the right for the
// previous one. It follows the finger, goes on past a fifth of the width, springs back short of it.
package space.avthsr.music.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationVector1D
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import space.avthsr.music.player.PlayerConn
import kotlin.math.abs

@Composable
fun rememberTrackSwipe(): Animatable<Float, AnimationVector1D> = remember { Animatable(0f) }

fun Modifier.trackSwipe(offset: Animatable<Float, AnimationVector1D>, scope: CoroutineScope, enabled: Boolean = true): Modifier =
  if (!enabled) this
  else this
    .pointerInput(Unit) {
      detectHorizontalDragGestures(
        onDragEnd = {
          val x = offset.value
          val limit = size.width * 0.2f
          scope.launch {
            when {
              x < -limit -> PlayerConn.next()
              x > limit -> PlayerConn.prevTrack()
            }
            offset.animateTo(0f, Motion.expressive.fastSpatialSpec())
          }
        },
        onDragCancel = { scope.launch { offset.animateTo(0f, Motion.expressive.fastSpatialSpec()) } },
      ) { change, dx ->
        change.consume()
        scope.launch { offset.snapTo(offset.value + dx) }
      }
    }
    .graphicsLayer {
      translationX = offset.value
      alpha = 1f - (abs(offset.value) / size.width.coerceAtLeast(1f)).coerceIn(0f, 0.6f)
    }
