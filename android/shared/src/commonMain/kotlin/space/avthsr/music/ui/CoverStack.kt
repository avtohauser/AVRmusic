// The player's covers as a deck: the playing track on top, the next ones peeking out behind it, each a
// little smaller, askew and darker further down. The top card is thrown off in any direction with the
// finger: it flies that way out of the cover area and stays stuck out past its edge, wherever the throw
// pointed (top, bottom, the sides, the corners), under the player's other parts, and the next card
// rises in its place. Every thrown
// card stays around like that, older ones a little further out; grab one and pull, and it comes back on
// top (its song plays). Track changes from anywhere
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
import androidx.compose.foundation.layout.fillMaxSize
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
import androidx.compose.foundation.background
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
import coil3.compose.AsyncImage
import coil3.compose.LocalPlatformContext
import coil3.request.ImageRequest
import coil3.request.crossfade
import androidx.compose.ui.layout.ContentScale
import space.avthsr.music.api.Api
import space.avthsr.music.api.Track
import space.avthsr.music.player.PlayerConn
import space.avthsr.music.player.PlayerUi
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.ceil
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sign
import kotlin.math.sin

private val CardShape = RoundedCornerShape(32.dp)

/** How far behind the top card the pile shows (cards), and how much each one peeks out above. */
private const val DEPTH = 3f
private val PEEK = 16.dp

/** How many thrown cards stay around the pile (older ones are buried under these anyway). */
private const val AROUND = 60

/** Thrown cards older than this are decoded small: they are only ever seen at the edges. */
private const val FULL_AGE = 2f

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
  /** the card a finger holds (its place in the playing order) and where the finger has moved it */
  var held by mutableStateOf<Int?>(null)
  var hand by mutableStateOf(Offset.Zero)
  /** the held card is the top one being thrown (not a thrown one being pulled back) */
  var throwing by mutableStateOf(false)
  /** the thrown card is on its own way to its place now, in the direction it was let go */
  var flying by mutableStateOf(false)
  /** how old the card pulled back was when it was grabbed (its place at the edge stays put meanwhile) */
  var heldAge by mutableStateOf(0f)
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

/** 0..1, the same for the same track: how it lies beside the pile */
private fun jitterOf(t: Track) = (hash(t) / 9 % 1000) / 1000f
private fun jitter2Of(t: Track) = (hash(t) / 9001 % 1000) / 1000f

private fun Deck.angleOf(t: Track): Float = angles[t.id] ?: ((hash(t) / 9000 % 3600) / 3600f * 2f * PI.toFloat())

/** The deck's measures in px: the top card's side and the box it is centred in (the cover area). */
private class Geo(val side: Float, val boxW: Float, val boxH: Float)

/**
 * A thrown card's place: behind the edge of the cover area where its throw pointed (any side or corner),
 * sticking out into it by its inner edge; [age] 0 for the last one, older ones a little further out.
 */
private class Rest(angle: Float, g: Geo, t: Track, age: Float) {
  private val half = g.side * REST_SCALE / 2f
  val center: Offset
  init {
    val c = cos(angle)
    val s = sin(angle)
    val hw = g.boxW / 2f
    val hh = g.boxH / 2f
    // how much of it shows inside: the gap beside the top card at most, a little less for older cards
    val older = max(0.55f, 1f - 0.03f * age)
    val showX = min((g.boxW - g.side) / 2f * 0.95f, half * 0.8f) * older
    val showY = min((g.boxH - g.side) / 2f * 0.95f, half * 0.8f) * older
    // where the throw's line leaves the area, spread a little along the edge so cards thrown alike don't hide each other
    val along = (jitterOf(t) - 0.5f) * half * 1.2f
    val toSide = if (abs(c) < 1e-4f) Float.MAX_VALUE else hw / abs(c)
    val toTopBottom = if (abs(s) < 1e-4f) Float.MAX_VALUE else hh / abs(s)
    center = if (toSide <= toTopBottom) {
      val y = (s * toSide + along).coerceIn(-(hh + half - showY), hh + half - showY)
      Offset(sign(c) * (hw + half - showX), y)
    } else {
      val x = (c * toTopBottom + along).coerceIn(-(hw + half - showX), hw + half - showX)
      Offset(x, sign(s) * (hh + half - showY))
    }
  }
  val rotation = tiltOf(t) * 2f + (jitter2Of(t) - 0.5f) * 20f
}

private const val REST_SCALE = 0.62f
private const val REST_DARK = 0.3f

private fun lerp(a: Float, b: Float, k: Float) = a + (b - a) * k

/** Places card [p] (track [t]) for the current cursor and finger. */
private fun GraphicsLayerScope.place(deck: Deck, t: Track, p: Int, g: Geo) {
  val x = p - deck.cursor.value
  val held = deck.held == p
  shape = CardShape
  clip = true
  when {
    // the top card in the hand: it follows the finger and, the farther out, the more it shrinks and turns
    // toward how it will lie beside the pile
    held && deck.throwing -> {
      val h = deck.hand
      val angle = if (deck.flying || h.getDistance() < 0.5f) deck.angleOf(t) else atan2(h.y, h.x)
      val rest = Rest(angle, g, t, 0f)
      val k = (h.getDistance() / rest.center.getDistance().coerceAtLeast(1f)).coerceIn(0f, 1f)
      translationX = h.x
      translationY = h.y
      rotationZ = lerp(0f, rest.rotation, k)
      val sc = lerp(1f, REST_SCALE, k)
      scaleX = sc; scaleY = sc
      shadowElevation = 24.dp.toPx()
    }
    // a thrown card pulled back: it grows and straightens as it comes over the pile
    held -> {
      val rest = Rest(deck.angleOf(t), g, t, deck.heldAge)
      val at = rest.center + deck.hand
      val k = (1f - at.getDistance() / rest.center.getDistance().coerceAtLeast(1f)).coerceIn(0f, 1f)
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
    // on its way between the top and its place at the edge (either way)
    x > -1f -> {
      val u = -x
      val rest = Rest(deck.angleOf(t), g, t, 0f)
      translationX = rest.center.x * u
      translationY = rest.center.y * u
      rotationZ = lerp(0f, rest.rotation, u)
      val sc = lerp(1f, REST_SCALE, u)
      scaleX = sc; scaleY = sc
      shadowElevation = lerp(24f, 0f, u).dp.toPx()
    }
    // stuck out from behind the area's edge; older ones further out and darker (no shadows: dozens of them)
    else -> {
      val rest = Rest(deck.angleOf(t), g, t, -x - 1f)
      translationX = rest.center.x
      translationY = rest.center.y
      rotationZ = rest.rotation
      scaleX = REST_SCALE; scaleY = REST_SCALE
      alpha = (AROUND + 1f + x).coerceIn(0f, 1f)
      shadowElevation = 0f
    }
  }
}

/** How dark card [p] is: down the pile and around it, darker (read while drawing, so it follows the cursor). */
private fun Deck.darkness(p: Int): Float {
  if (held == p) return 0f
  val x = p - cursor.value
  return when {
    x >= 0f -> 0.22f * min(x, 2f)
    x > -1f -> lerp(0f, REST_DARK, -x)
    else -> min(REST_DARK + 0.03f * (-x - 1f), 0.55f)
  }
}

/** Which layer card [p] is drawn in; changes only when a card crosses from one to another. */
private fun Deck.layer(p: Int): Float {
  if (held == p) return 400f
  val x = p - cursor.value
  return when {
    x >= 0f -> 200f - floor(x)
    // flying over everything; at the edges, under the pile, the most recent above the older
    x > -1f -> 300f
    else -> 100f - ceil(-x)
  }
}

/** The deck's measures for its box: room around the top card for the thrown ones' edges and above it for the pile. */
private fun Density.geo(w: Float, h: Float): Geo {
  val side = minOf(w * 0.74f, (h - PEEK.toPx() * 2.5f) * 0.8f, 420.dp.toPx()).coerceAtLeast(120.dp.toPx())
  return Geo(side, w, h)
}

/** The card under a finger at [at] (from the deck's centre): the top one, or a thrown one by its edge. */
private fun Density.pick(deck: Deck, s: PlayerUi, pos: Int, at: Offset, g: Geo): Int? {
  val top = g.side / 2f
  val hasTop = s.deckTrack(pos) != null
  if (hasTop && abs(at.x) <= top && abs(at.y) <= top) return pos
  // the thrown ones, the most recent first (it lies above the older)
  val half = g.side * REST_SCALE / 2f
  for (j in 1..AROUND) {
    val p = pos - j
    val t = s.deckTrack(p) ?: break
    val rest = Rest(deck.angleOf(t), g, t, j - 1f)
    val q = at - rest.center
    val a = -rest.rotation * PI.toFloat() / 180f
    val lx = q.x * cos(a) - q.y * sin(a)
    val ly = q.x * sin(a) + q.y * cos(a)
    if (abs(lx) <= half && abs(ly) <= half) return p
  }
  // the pile's edges peeking out above the top card
  if (hasTop && abs(at.x) <= top && at.y < -top && at.y >= -top - PEEK.toPx() * DEPTH) return pos
  return null
}

@Composable
fun CoverStack(s: PlayerUi, deck: Deck, modifier: Modifier = Modifier, pauseScale: () -> Float = { 1f }) {
  val order = s.deckOrder()
  val pos = s.deckPos()
  val cursor = deck.cursor
  val scope = rememberCoroutineScope()

  BoxWithConstraints(
    // not clipped: the thrown cards reach past the area, under the player's other parts (which keep
    // their touches: only the area itself takes the deck's)
    modifier
      .graphicsLayer { val k = pauseScale(); scaleX = k; scaleY = k }
      .pointerInput(pos, order, s.queue) {
        awaitEachGesture {
          val down = awaitFirstDown(requireUnconsumed = false)
          val g = geo(size.width.toFloat(), size.height.toFloat())
          val center = Offset(size.width / 2f, size.height / 2f)
          val p = pick(deck, s, pos, down.position - center, g) ?: return@awaitEachGesture
          val t = s.deckTrack(p) ?: return@awaitEachGesture
          val start = awaitTouchSlopOrCancellation(down.id) { change, _ -> change.consume() } ?: return@awaitEachGesture
          val tracker = VelocityTracker()
          tracker.addPointerInputChange(start)
          val throwing = p == pos
          deck.dragging = true
          deck.throwing = throwing
          deck.flying = false
          deck.hand = start.position - down.position
          deck.heldAge = (pos - p - 1f).coerceAtLeast(0f)
          deck.held = p
          val ended = drag(start.id) { change ->
            deck.hand += change.positionChange()
            change.consume()
            tracker.addPointerInputChange(change)
            if (throwing) {
              // the next card rises and the colours follow as far as the throw has come
              val h = deck.hand
              val angle = if (h.getDistance() < 0.5f) deck.angleOf(t) else atan2(h.y, h.x)
              val k = (h.getDistance() / Rest(angle, g, t, 0f).center.getDistance().coerceAtLeast(1f)).coerceIn(0f, 1f)
              scope.launch { cursor.snapTo(pos + 0.6f * k) }
            }
          }
          val v = tracker.calculateVelocity()
          val fling = Offset(v.x, v.y)
          val h = deck.hand
          val r = h.getDistance()
          val spatial = Motion.expressive.defaultSpatialSpec<Float>()
          fun finish() {
            deck.held = null
            deck.throwing = false
            deck.flying = false
            deck.dragging = false
          }
          if (throwing) {
            val angle = if (r > g.side * 0.03f) atan2(h.y, h.x) else atan2(fling.y, fling.x)
            val outward = fling.x * h.x + fling.y * h.y > 0f
            val go = ended && pos < order.lastIndex &&
              (r > g.side * 0.25f || (fling.getDistance() > 1100f && outward && r > g.side * 0.04f))
            if (go) {
              // it flies on the way it was thrown and sticks out from behind the screen's edge on that side
              deck.angles[t.id] = angle
              deck.flying = true
              val place = Rest(angle, g, t, 0f).center
              PlayerConn.next()
              scope.launch {
                coroutineScope {
                  launch {
                    animate(Offset.VectorConverter, h, place, initialVelocity = fling, animationSpec = Motion.expressive.defaultSpatialSpec()) { o, _ -> deck.hand = o }
                  }
                  launch { cursor.animateTo(pos + 1f, spatial) }
                }
                finish()
              }
            } else {
              scope.launch {
                coroutineScope {
                  launch { animate(Offset.VectorConverter, h, Offset.Zero, animationSpec = Motion.expressive.fastSpatialSpec()) { o, _ -> deck.hand = o } }
                  launch { cursor.animateTo(pos.toFloat(), Motion.expressive.fastSpatialSpec()) }
                }
                finish()
              }
            }
          } else {
            val go = ended && (r > g.side * 0.08f || fling.getDistance() > 900f)
            if (go) {
              // pulled in from the edge: back on top, and its song plays
              val home = Offset.Zero - Rest(deck.angleOf(t), g, t, deck.heldAge).center
              if (p == pos - 1) PlayerConn.prevTrack() else PlayerConn.seekToTrack(order[p])
              scope.launch {
                // from far back, like any long jump, only the last steps are shown
                if (pos - p > 3) cursor.snapTo(p + 2.5f)
                coroutineScope {
                  launch { cursor.animateTo(p.toFloat(), spatial) }
                  launch { animate(Offset.VectorConverter, h, home, animationSpec = Motion.expressive.defaultSpatialSpec()) { o, _ -> deck.hand = o } }
                }
                finish()
              }
            } else {
              scope.launch {
                animate(Offset.VectorConverter, h, Offset.Zero, animationSpec = Motion.expressive.fastSpatialSpec()) { o, _ -> deck.hand = o }
                finish()
              }
            }
          }
        }
      },
    contentAlignment = Alignment.Center,
  ) {
    val density = LocalDensity.current
    val g = remember(constraints.maxWidth, constraints.maxHeight, density) {
      density.geo(constraints.maxWidth.toFloat(), constraints.maxHeight.toFloat())
    }
    val side = with(density) { g.side.toDp() }
    // which cards exist right now; changes only when the cursor passes a whole card
    val base by remember { derivedStateOf { floor(cursor.value).toInt() } }
    for (p in max(0, base - AROUND - 1)..(base + DEPTH.toInt() + 1)) {
      val track = s.deckTrack(p) ?: continue
      key(p) { StackCard(track, p, deck, g, side, top = p == pos) }
    }
  }
}

@Composable
private fun StackCard(t: Track, p: Int, deck: Deck, g: Geo, side: Dp, top: Boolean) {
  val z by remember(p) { derivedStateOf { deck.layer(p) } }
  // an old card, seen only at the edge, is decoded small (dozens of them at once)
  val small by remember(p) { derivedStateOf { deck.held != p && deck.cursor.value - p > FULL_AGE } }
  val density = LocalDensity.current
  Box(
    Modifier.zIndex(z).size(side)
      .then(if (top) Modifier.sharedCover("np:${t.id}") else Modifier)
      .graphicsLayer { place(deck, t, p, g) },
  ) {
    DeckCover(t.coverUrl, side, if (small) (g.side * REST_SCALE).toInt().coerceAtMost(with(density) { 220.dp.roundToPx() }) else null)
    // down the pile and around it, darker: a layer's alpha, so flipping never redraws the cover
    Box(Modifier.matchParentSize().graphicsLayer { alpha = deck.darkness(p) }.background(Color.Black))
  }
}

/**
 * A card's picture. It reads nothing from the theme: the colours flow with every flip, and dozens of
 * cards must not be recomposed for each step of it. The card's layer rounds it.
 */
@Composable
private fun DeckCover(url: String?, side: Dp, sizePx: Int?) {
  val u = Api.img(url)
  Box(Modifier.size(side).background(Color(0xFF2B2930))) {
    if (u != null) {
      val context = LocalPlatformContext.current
      val request = remember(u, sizePx) {
        ImageRequest.Builder(context).data(u).placeholderMemoryCacheKey(u).crossfade(true)
          .apply { if (sizePx != null) size(sizePx) }.build()
      }
      AsyncImage(model = request, contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
    }
  }
}
