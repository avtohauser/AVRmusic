// The player's covers as a deck: the playing track on top, the next ones peeking out behind it, each a
// little smaller, askew and darker further down. The top card is thrown off in any direction with the
// finger: it flies out that way and lands under the pile, and the next card rises in its place. The last
// nine thrown cards lie around the pile, only their edges showing, each on the side it was thrown to;
// grab one by its edge and pull, and it comes back on top (its song plays). Track changes from anywhere
// (the end of a song, the buttons, the queue) flip the deck the same way. One continuous cursor moves
// along the playing order on the expressive spring; every card's place is computed from it while
// drawing, so flipping never recomposes.
package space.avthsr.music.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.VectorConverter
import androidx.compose.animation.core.animate
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.awaitTouchSlopOrCancellation
import androidx.compose.foundation.gestures.drag
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.GraphicsLayerScope
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.input.pointer.util.addPointerInputChange
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import space.avthsr.music.api.Track
import space.avthsr.music.player.PlayerConn
import space.avthsr.music.player.PlayerUi
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sign
import kotlin.math.sin

private val CardShape = RoundedCornerShape(32.dp)

/** How far behind the top card the pile shows (cards), and how much each one peeks out above. */
private const val DEPTH = 3f
private val PEEK = 16.dp

/** How many thrown cards lie around the pile. */
private const val RING = 9

/** Where along a throw the card turns back toward the pile (and slips under it). */
private const val OUT = 0.55f

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
  /** the direction each thrown card went (track id → radians), so it lies on that side of the pile */
  val angles = mutableStateMapOf<String, Float>()
  /** the card a finger holds (its place in the playing order) and how far it has been moved */
  var held by mutableStateOf<Int?>(null)
  var hand by mutableStateOf(Offset.Zero)
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

/* ---------- where a card lies ---------- */

private fun hash(t: Track) = t.id.hashCode() and 0x7fffffff

/** each card lies a little askew in the pile, always the same way for the same track */
private fun tiltOf(t: Track) = (hash(t) % 9 - 4) * 1.3f

/** 0..1, the same for the same track: how far its edge shows */
private fun jitterOf(t: Track) = (hash(t) / 9 % 1000) / 1000f

private fun Deck.angleOf(t: Track): Float = angles[t.id] ?: ((hash(t) / 9000 % 3600) / 3600f * 2f * PI.toFloat())

/** A thrown card's resting place around the pile, for a card [side] px wide. */
private class Rest(val angle: Float, side: Float, t: Track) {
  val c = cos(angle)
  val s = sin(angle)
  private val axis = max(abs(c), abs(s))
  /** from the pile's centre: its edge shows 7–11 % of the card beyond the top card */
  val dist = side * (0.07f + 0.04f * jitterOf(t)) / axis
  /** far enough out to clear the top card */
  val far = side * 1.06f / axis
  val rotation = tiltOf(t) * 1.6f + 9f * c
  val offset get() = Offset(c * dist, s * dist)
}

private const val REST_SCALE = 0.96f
private const val REST_DARK = 0.38f

private fun lerp(a: Float, b: Float, k: Float) = a + (b - a) * k

/** A drag longer than the throw path's far point slows down instead of running off it. */
private fun soften(r: Float, far: Float): Float {
  val knee = far * 0.7f
  return if (r <= knee) r else knee + (far - knee) * (1f - exp(-(r - knee) / (far - knee)))
}

/** Places card [p] (track [t]) for the current cursor and finger. */
private fun GraphicsLayerScope.place(deck: Deck, t: Track, p: Int, pos: Int) {
  val side = size.width
  val x = p - deck.cursor.value
  val held = deck.held == p
  shape = CardShape
  clip = true
  when {
    // the top card in the hand: it follows the finger; the farther, the more it turns toward its landing
    held && p == pos -> {
      val h = deck.hand
      val r = h.getDistance()
      val angle = if (r > 0.5f) atan2(h.y, h.x) else deck.angleOf(t)
      val rest = Rest(angle, side, t)
      val shown = soften(r, rest.far)
      val u = OUT * shown / rest.far
      translationX = rest.c * shown
      translationY = rest.s * shown
      rotationZ = lerp(0f, rest.rotation, u)
      val k = lerp(1f, REST_SCALE, u)
      scaleX = k; scaleY = k
      shadowElevation = 24.dp.toPx()
    }
    // a thrown card pulled back by its edge: lifted over the pile, straightening as it comes in
    held -> {
      val rest = Rest(deck.angleOf(t), side, t)
      val at = rest.offset + deck.hand
      val k = (1f - at.getDistance() / rest.dist).coerceIn(0f, 1f)
      translationX = at.x
      translationY = at.y
      rotationZ = lerp(rest.rotation, 0f, k)
      val sc = lerp(REST_SCALE, 1f, k)
      scaleX = sc; scaleY = sc
      shadowElevation = 24.dp.toPx()
    }
    // the pile: the top edges step up, each card behind peeks out above the one in front
    x >= 0f -> {
      val d = min(x, DEPTH)
      val k = 1f - 0.08f * d
      scaleX = k; scaleY = k
      translationY = -(1f - k) * size.height / 2f - d * PEEK.toPx()
      rotationZ = tiltOf(t) * min(d, 1f)
      alpha = if (x > DEPTH - 0.6f) ((DEPTH + 0.2f - x) / 0.8f).coerceIn(0f, 1f) else 1f
      shadowElevation = (24f - 7f * d).coerceAtLeast(4f).dp.toPx()
    }
    // on its way: out to clear the pile, then back under it to its place (and the same way back)
    x > -1f -> {
      val u = -x
      val rest = Rest(deck.angleOf(t), side, t)
      val dist = if (u <= OUT) rest.far * u / OUT else lerp(rest.far, rest.dist, (u - OUT) / (1f - OUT))
      translationX = rest.c * dist
      translationY = rest.s * dist
      rotationZ = lerp(0f, rest.rotation, u)
      val k = lerp(1f, REST_SCALE, u)
      scaleX = k; scaleY = k
      shadowElevation = (if (u <= OUT) 24f else lerp(24f, 6f, (u - OUT) / (1f - OUT))).dp.toPx()
    }
    // around the pile, only its edge showing; older ones lower and darker, the tenth fades away
    else -> {
      val j = -x
      val rest = Rest(deck.angleOf(t), side, t)
      translationX = rest.offset.x
      translationY = rest.offset.y
      rotationZ = rest.rotation
      scaleX = REST_SCALE; scaleY = REST_SCALE
      alpha = (RING + 1f - j).coerceIn(0f, 1f)
      shadowElevation = 6.dp.toPx()
    }
  }
}

/** How dark card [p] is: down the pile and around it, darker (read while drawing, so it follows the cursor). */
private fun Deck.darkness(p: Int): Float {
  if (held == p) return 0f
  val x = p - cursor.value
  return when {
    x >= 0f -> 0.22f * min(x, 2f)
    x > -1f -> if (-x <= OUT) 0f else lerp(0f, REST_DARK, (-x - OUT) / (1f - OUT))
    else -> min(REST_DARK + 0.03f * (-x - 1f), 0.62f)
  }
}

/** Which layer card [p] is drawn in; changes only when a card crosses from one to another. */
private fun Deck.layer(p: Int): Float {
  if (held == p) return 400f
  val x = p - cursor.value
  return when {
    x >= 0f -> 200f - floor(x)
    x > -OUT -> 300f
    else -> 100f - ceil(-x)
  }
}

/** The top card's size for the deck's box: room around it for the thrown cards' edges and above for the pile. */
private fun Density.deckSide(w: Float, h: Float): Float =
  minOf(w * 0.84f, (h - PEEK.toPx() * 2.5f) * 0.88f, 420.dp.toPx()).coerceAtLeast(120.dp.toPx())

/** The card under a finger at [at] (from the deck's centre): the top one, or a thrown one by its edge. */
private fun Density.pick(deck: Deck, s: PlayerUi, pos: Int, at: Offset, side: Float): Int? {
  val half = side / 2f
  if (s.deckTrack(pos) != null && abs(at.x) <= half && at.y <= half && at.y >= -half - PEEK.toPx() * DEPTH) return pos
  for (j in 1..RING) {
    val p = pos - j
    val t = s.deckTrack(p) ?: continue
    val rest = Rest(deck.angleOf(t), side, t)
    val q = at - rest.offset
    val a = -rest.rotation * PI.toFloat() / 180f
    val lx = q.x * cos(a) - q.y * sin(a)
    val ly = q.x * sin(a) + q.y * cos(a)
    if (abs(lx) <= half * REST_SCALE && abs(ly) <= half * REST_SCALE) return p
  }
  return null
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
      .pointerInput(pos, order, s.queue) {
        awaitEachGesture {
          val down = awaitFirstDown(requireUnconsumed = false)
          val side = deckSide(size.width.toFloat(), size.height.toFloat())
          val center = Offset(size.width / 2f, size.height / 2f)
          val p = pick(deck, s, pos, down.position - center, side) ?: return@awaitEachGesture
          val t = s.deckTrack(p) ?: return@awaitEachGesture
          val start = awaitTouchSlopOrCancellation(down.id) { change, _ -> change.consume() } ?: return@awaitEachGesture
          val tracker = VelocityTracker()
          tracker.addPointerInputChange(start)
          deck.dragging = true
          deck.hand = start.position - down.position
          deck.held = p
          val throwing = p == pos
          val ended = drag(start.id) { change ->
            deck.hand += change.positionChange()
            change.consume()
            tracker.addPointerInputChange(change)
            if (throwing) {
              // the pile and the colours follow the throw as far as it has come
              val r = deck.hand.getDistance()
              val angle = if (r > 0.5f) atan2(deck.hand.y, deck.hand.x) else deck.angleOf(t)
              val far = Rest(angle, side, t).far
              scope.launch { cursor.snapTo(pos + OUT * soften(r, far) / far) }
            }
          }
          val v = tracker.calculateVelocity()
          val fling = Offset(v.x, v.y)
          val h = deck.hand
          val r = h.getDistance()
          val spatial = Motion.expressive.defaultSpatialSpec<Float>()
          val back = Motion.expressive.fastSpatialSpec<Offset>()
          if (throwing) {
            val angle = if (r > side * 0.03f) atan2(h.y, h.x) else atan2(fling.y, fling.x)
            val shown = soften(r, Rest(angle, side, t).far)
            val outward = fling.x * h.x + fling.y * h.y > 0f
            val go = ended && pos < order.lastIndex &&
              (shown > side * 0.28f || (fling.getDistance() > 1100f && outward && r > side * 0.04f))
            if (go) {
              // off it goes the way it was thrown, and lands under the pile on that side
              deck.angles[t.id] = angle
              deck.held = null
              PlayerConn.next()
              scope.launch {
                cursor.animateTo(pos + 1f, spatial)
                deck.dragging = false
              }
            } else {
              scope.launch {
                coroutineScope {
                  launch { animate(Offset.VectorConverter, h, Offset.Zero, animationSpec = back) { o, _ -> deck.hand = o } }
                  launch { cursor.animateTo(pos.toFloat(), Motion.expressive.fastSpatialSpec()) }
                }
                deck.held = null
                deck.dragging = false
              }
            }
          } else {
            val go = ended && (r > side * 0.1f || fling.getDistance() > 900f)
            if (go) {
              // pulled out from around the pile: back on top, and its song plays
              val home = Offset.Zero - Rest(deck.angleOf(t), side, t).offset
              if (p == pos - 1) PlayerConn.prevTrack() else PlayerConn.seekToTrack(order[p])
              scope.launch {
                coroutineScope {
                  launch { cursor.animateTo(p.toFloat(), spatial) }
                  launch { animate(Offset.VectorConverter, h, home, animationSpec = Motion.expressive.defaultSpatialSpec()) { o, _ -> deck.hand = o } }
                }
                deck.held = null
                deck.dragging = false
              }
            } else {
              scope.launch {
                animate(Offset.VectorConverter, h, Offset.Zero, animationSpec = back) { o, _ -> deck.hand = o }
                deck.held = null
                deck.dragging = false
              }
            }
          }
        }
      },
    contentAlignment = Alignment.Center,
  ) {
    val density = LocalDensity.current
    val side = with(density) { density.deckSide(constraints.maxWidth.toFloat(), constraints.maxHeight.toFloat()).toDp() }
    // which cards exist right now; changes only when the cursor passes a whole card
    val base by remember { derivedStateOf { floor(cursor.value).toInt() } }
    for (p in (base - RING - 1)..(base + DEPTH.toInt() + 1)) {
      val track = s.deckTrack(p) ?: continue
      key(p) { StackCard(track, p, deck, side, pos) }
    }
  }
}

@Composable
private fun StackCard(t: Track, p: Int, deck: Deck, side: Dp, pos: Int) {
  val z by remember(p) { derivedStateOf { deck.layer(p) } }
  Box(
    Modifier.zIndex(z).size(side)
      .then(if (p == pos) Modifier.sharedCover("np:${t.id}") else Modifier)
      .graphicsLayer { place(deck, t, p, pos) }
      .drawWithContent {
        drawContent()
        val dark = deck.darkness(p)
        if (dark > 0f) drawRect(Color.Black, alpha = dark)
      },
  ) {
    Cover(t.coverUrl, Modifier.size(side), CardShape)
  }
}
