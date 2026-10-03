// The player's covers as a deck: the playing track on top, the next ones peeking out behind it, each a
// little smaller, askew and darker further down. Flipping through it follows the finger: drag the top
// card away to the left and the next one rises in its place; drag to the right and the previous card
// comes back onto the pile. Track changes from anywhere (the end of a song, the buttons, the queue)
// flip it the same way. One continuous cursor moves along the playing order on the expressive spring;
// every card's place in the pile is computed from it while drawing, so flipping never recomposes.
package space.avthsr.music.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationVector1D
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import space.avthsr.music.api.Track
import space.avthsr.music.player.PlayerConn
import space.avthsr.music.player.PlayerUi
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.min
import kotlin.math.sign

private val CardShape = RoundedCornerShape(32.dp)

/** How far behind the top card the pile shows (cards), and how much each one peeks out above. */
private const val DEPTH = 3f
private val PEEK = 16.dp

/** The queue in playing order (shuffle included), the place of the playing track in it, and the track at a place. */
fun PlayerUi.deckOrder(): List<Int> = order.ifEmpty { queue.indices.toList() }
fun PlayerUi.deckPos(): Int = deckOrder().indexOf(index).coerceAtLeast(0)
fun PlayerUi.deckTrack(p: Int): Track? = deckOrder().getOrNull(p)?.let { queue.getOrNull(it) }

/**
 * Where the deck is: a continuous place along the playing order (5.3 = the sixth card a third of the
 * way off). The player owns it, so the colours and the background can follow a flip too.
 */
class Deck(start: Float) {
  val cursor = Animatable(start)
  var dragging by mutableStateOf(false)
}

@Composable
fun rememberDeck(s: PlayerUi): Deck {
  val pos = s.deckPos()
  val deck = remember { Deck(pos.toFloat()) }
  // a track change from anywhere flips the deck; a long jump only shows its last step
  LaunchedEffect(pos) {
    if (deck.dragging) return@LaunchedEffect
    val gap = pos - deck.cursor.value
    if (abs(gap) > 2.5f) deck.cursor.snapTo(pos - sign(gap) * 1.5f)
    deck.cursor.animateTo(pos.toFloat(), Motion.expressive.defaultSpatialSpec())
  }
  return deck
}

@Composable
fun CoverStack(s: PlayerUi, deck: Deck, modifier: Modifier = Modifier, pauseScale: () -> Float = { 1f }) {
  val order = s.deckOrder()
  val pos = s.deckPos()
  val cursor = deck.cursor
  val scope = rememberCoroutineScope()

  BoxWithConstraints(
    modifier
      .graphicsLayer { val k = pauseScale(); scaleX = k; scaleY = k }
      .pointerInput(pos, order.size) {
        detectHorizontalDragGestures(
          onDragStart = { deck.dragging = true },
          onDragEnd = {
            deck.dragging = false
            val p = cursor.value - pos
            scope.launch {
              when {
                p > 0.18f && pos < order.lastIndex -> { PlayerConn.next(); cursor.animateTo(pos + 1f, Motion.expressive.defaultSpatialSpec()) }
                p < -0.18f && pos > 0 -> { PlayerConn.prevTrack(); cursor.animateTo(pos - 1f, Motion.expressive.defaultSpatialSpec()) }
                else -> cursor.animateTo(pos.toFloat(), Motion.expressive.fastSpatialSpec())
              }
            }
          },
          onDragCancel = { deck.dragging = false; scope.launch { cursor.animateTo(pos.toFloat(), Motion.expressive.fastSpatialSpec()) } },
        ) { change, dx ->
          change.consume()
          // the deck resists a little past the first and the last card
          val next = cursor.value - dx / size.width
          val lo = if (pos > 0) pos - 1.1f else pos - 0.15f
          val hi = if (pos < order.lastIndex) pos + 1.1f else pos + 0.15f
          scope.launch { cursor.snapTo(next.coerceIn(lo, hi)) }
        }
      },
    contentAlignment = Alignment.Center,
  ) {
    // room above the top card for the pile to peek out
    val side = minOf(maxWidth, maxHeight - PEEK * 2.5f, 420.dp).coerceAtLeast(120.dp)
    // which cards exist right now; changes only when the cursor passes a whole card
    val base by remember { derivedStateOf { floor(cursor.value).toInt() } }
    // drawn from the bottom of the pile up: the card flying off (or coming back) on the left ends on top
    for (p in (base + DEPTH.toInt()) downTo (base - 1)) {
      val track = order.getOrNull(p)?.let { s.queue.getOrNull(it) } ?: continue
      key(p) { StackCard(track, p, cursor, side, top = p == pos) }
    }
  }
}

@Composable
private fun StackCard(t: Track, p: Int, cursor: Animatable<Float, AnimationVector1D>, side: Dp, top: Boolean) {
  // each card lies a little askew in the pile, always the same way for the same track
  val tilt = remember(t.id) { ((t.id.hashCode() and 0x7fffffff) % 9 - 4) * 1.3f }
  Box(
    Modifier.size(side)
      .then(if (top) Modifier.sharedCover("np:${t.id}") else Modifier)
      .graphicsLayer {
        val x = p - cursor.value
        if (x < 0f) {
          // leaving to the left (or coming back from there), turning as it goes
          translationX = x * size.width * 1.15f
          translationY = -x * x * 24.dp.toPx()
          rotationZ = x * 18f
          alpha = (1.6f + x).coerceIn(0f, 1f)
          shadowElevation = 24.dp.toPx()
        } else {
          val d = min(x, DEPTH)
          val k = 1f - 0.08f * d
          scaleX = k
          scaleY = k
          // the top edges step up: each card behind peeks out above the one in front
          translationY = -(1f - k) * size.height / 2f - d * PEEK.toPx()
          rotationZ = tilt * min(d, 1f)
          alpha = if (x > DEPTH - 0.6f) ((DEPTH + 0.2f - x) / 0.8f).coerceIn(0f, 1f) else 1f
          shadowElevation = (24f - 7f * d).coerceAtLeast(4f).dp.toPx()
        }
        shape = CardShape
        clip = true
      }
      .drawWithContent {
        drawContent()
        // further down the pile, darker
        val x = p - cursor.value
        if (x > 0f) drawRect(Color.Black, alpha = 0.22f * min(x, 2f))
      },
  ) {
    Cover(t.coverUrl, Modifier.size(side), CardShape)
  }
}
