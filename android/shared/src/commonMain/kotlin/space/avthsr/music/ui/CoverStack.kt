// The player's covers as a deck: the playing track on top, the next ones peeking out behind it, each a
// little smaller, askew and darker further down. The top card is thrown off in any direction with the
// finger: it flies that way out of the cover area and stays stuck out past its edge, wherever the throw
// pointed (top, bottom, the sides, the corners), under the player's other parts, and the next card
// rises in its place. Every thrown card stays around like that, older ones a little further out; grab
// one and pull it in, and it comes back on top (its song plays). Track changes from anywhere (the end
// of a song, the buttons, the queue) flip the deck the same way.
//
// One continuous cursor moves along the playing order on the expressive spring, and the cards on the
// pile's rails are placed from it while drawing, so flipping never recomposes. A card let go of leaves
// the rails for a while: it flies home on its own spring, carried on by the finger's speed, so the next
// throw never waits for it and never shakes it. The deck runs a step ahead of the player: it shows the
// card it asked for at once and gives the player a moment to follow (a jam goes through the server);
// if the player stays where it was, the deck goes back to it.
package space.avthsr.music.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.FiniteAnimationSpec
import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.VectorConverter
import androidx.compose.foundation.background
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
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.GraphicsLayerScope
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.pointer.positionChange
import androidx.compose.ui.input.pointer.util.VelocityTracker
import androidx.compose.ui.input.pointer.util.addPointerInputChange
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import coil3.compose.AsyncImage
import coil3.compose.LocalPlatformContext
import coil3.request.ImageRequest
import coil3.request.crossfade
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
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
import kotlin.math.sqrt

private val CardShape = RoundedCornerShape(32.dp)

/** How far behind the top card the pile shows (cards), and how much each one peeks out above. */
private const val DEPTH = 3f
private val PEEK = 16.dp

/** How many thrown cards stay around the pile (older ones are buried under these anyway). */
private const val AROUND = 60

/** Thrown cards older than this are decoded small: they are only ever seen at the edges. */
private const val FULL_AGE = 2f

/** How far the next card rises while the top one is pulled all the way to its place at the edge. */
private const val RISE = 0.6f

/** Where a let-go card is headed: where the finger left it, carried on by its speed for this long (s). */
private const val CARRY = 0.12f

/** How long the player may take to follow the deck to the card it asked for (a jam goes through the server). */
private const val FOLLOW_MS = 2500L

/** The queue in playing order (shuffle included), the place of the playing track in it, and the track at a place. */
fun PlayerUi.deckOrder(): List<Int> = order.ifEmpty { queue.indices.toList() }
fun PlayerUi.deckPos(): Int = deckOrder().indexOf(index).coerceAtLeast(0)
fun PlayerUi.deckTrack(p: Int): Track? = deckOrder().getOrNull(p)?.let { queue.getOrNull(it) }

/** A card let go of, on its way home ([toTop]: back on top of the pile, otherwise to its place at the edge). */
class Flight(val toTop: Boolean, from: Offset) {
  /** where the card is from its home */
  val off = Animatable(from, Offset.VectorConverter)
  var job: Job? = null
}

/**
 * Where the deck is: a continuous place along the playing order (5.3 = the sixth card a third of the
 * way off). The player owns it, so the colours and the background can follow a flip too.
 */
class Deck(start: Int, val scope: CoroutineScope) {
  val cursor = Animatable(start.toFloat())
  /** how far the next card has risen under a throw that is still in the hand (the cursor stays put meanwhile) */
  var rise by mutableFloatStateOf(0f)
  /** where the deck is drawn */
  val at: Float get() = cursor.value + rise
  /** the card on top, or the one the deck is flipping to */
  var target by mutableIntStateOf(start)
  /** the card the deck asked the player for with a throw or a pull, until the player gets there */
  var asked by mutableStateOf<Int?>(null)
  /** a finger holds a card: the deck is the finger's until it lets go */
  var dragging by mutableStateOf(false)
  /** the direction each thrown card went (track id → radians), so it lies on that side of the pile */
  val angles = mutableStateMapOf<String, Float>()
  /** the card a finger holds (its place in the playing order) and where the finger has moved it */
  var held by mutableStateOf<Int?>(null)
  var hand by mutableStateOf(Offset.Zero)
  /** the held card is the top one being thrown (not a thrown one being pulled back) */
  var throwing by mutableStateOf(false)
  /** cards let go of and still on their way home, by their place in the playing order */
  val flights = mutableStateMapOf<Int, Flight>()

  /** Flips to [p]: the track changed from elsewhere. */
  suspend fun flipTo(p: Int) {
    target = p
    glide(Motion.expressive.defaultSpatialSpec())
  }

  /** The cursor goes to [target] from where the deck is drawn; a long jump only shows its last steps. */
  suspend fun glide(spec: AnimationSpec<Float>) {
    // the rise goes into the cursor; without one the cursor keeps its speed (flips in a row flow on)
    if (rise != 0f) {
      cursor.snapTo(at)
      rise = 0f
    }
    val gap = target - cursor.value
    if (abs(gap) > 2.5f) cursor.snapTo(target - sign(gap) * 1.5f)
    cursor.animateTo(target.toFloat(), spec)
  }
}

@Composable
fun rememberDeck(s: PlayerUi): Deck {
  val pos = s.deckPos()
  // the deck's own scope, not the cover area's: a flip goes on while the lyrics are up instead of the covers
  val scope = rememberCoroutineScope()
  val deck = remember { Deck(pos, scope) }
  LaunchedEffect(pos, deck.dragging, deck.asked) {
    if (deck.dragging) return@LaunchedEffect
    val asked = deck.asked
    if (asked != null) {
      // the deck is already on the card it asked for; if the player doesn't get there, it goes back to the player
      if (asked != pos) delay(FOLLOW_MS)
      deck.asked = null
      return@LaunchedEffect
    }
    // a track change from anywhere else flips the deck
    if (deck.target != pos) deck.flipTo(pos)
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

/** How long ago card [p] was thrown, in cards (0 for the last one); it follows the deck smoothly. */
private fun Deck.age(p: Int): Float = max(0f, at - p - 1f)

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

/**
 * A card off the pile's rails — in the hand or flying home: where it is (from the deck's centre), the
 * place at the edge it belongs to, and how far toward that place it is (0 on top, 1 there).
 */
private class Free(val at: Offset, val rest: Rest, val lifted: Boolean) {
  val u = (at.getDistance() / rest.center.getDistance().coerceAtLeast(1f)).coerceIn(0f, 1f)
}

private fun Deck.free(p: Int, t: Track, g: Geo): Free? {
  val flight = flights[p]
  return when {
    // the top card in the hand: the farther out, the more it shrinks and turns toward how it will lie
    // on the side the finger is taking it
    held == p && throwing -> {
      val h = hand
      Free(h, Rest(if (h.getDistance() < 0.5f) angleOf(t) else atan2(h.y, h.x), g, t, 0f), lifted = true)
    }
    // a thrown card pulled back: it grows and straightens as it comes over the pile
    held == p -> {
      val rest = Rest(angleOf(t), g, t, age(p))
      Free(rest.center + hand, rest, lifted = true)
    }
    flight != null -> {
      val rest = Rest(angleOf(t), g, t, age(p))
      Free(if (flight.toTop) flight.off.value else rest.center + flight.off.value, rest, lifted = false)
    }
    else -> null
  }
}

/** Places card [p] (track [t]) for the deck's place, the finger and the flights. */
private fun GraphicsLayerScope.place(deck: Deck, t: Track, p: Int, g: Geo) {
  shape = CardShape
  clip = true
  val free = deck.free(p, t, g)
  if (free != null) {
    translationX = free.at.x
    translationY = free.at.y
    rotationZ = lerp(0f, free.rest.rotation, free.u)
    val sc = lerp(1f, REST_SCALE, free.u)
    scaleX = sc; scaleY = sc
    shadowElevation = (if (free.lifted) 24f else lerp(24f, 0f, free.u)).dp.toPx()
    return
  }
  val x = p - deck.at
  when {
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
    // on its way between the top and its place at the edge (either way), flipped by a track change
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

/** How dark card [p] is: down the pile and around it, darker (read while drawing, so it follows the deck). */
private fun Deck.darkness(p: Int, t: Track, g: Geo): Float {
  free(p, t, g)?.let { return if (it.lifted) 0f else lerp(0f, REST_DARK, it.u) }
  val x = p - at
  return when {
    x >= 0f -> 0.22f * min(x, 2f)
    x > -1f -> lerp(0f, REST_DARK, -x)
    else -> min(REST_DARK + 0.03f * (-x - 1f), 0.55f)
  }
}

/** Which layer card [p] is drawn in; changes only when a card crosses from one to another. */
private fun Deck.layer(p: Int): Float {
  if (held == p) return 400f
  // flying over the pile, the latest above the earlier
  if (p in flights) return 300f
  val x = p - at
  return when {
    x >= 0f -> 200f - floor(x)
    x > -1f -> 300f
    // at the edges, under the pile, the most recent above the older
    else -> 100f - ceil(-x)
  }
}

/** The deck's measures for its box: room around the top card for the thrown ones' edges and above it for the pile. */
private fun Density.geo(w: Float, h: Float): Geo {
  val side = minOf(w * 0.74f, (h - PEEK.toPx() * 2.5f) * 0.8f, 420.dp.toPx()).coerceAtLeast(120.dp.toPx())
  return Geo(side, w, h)
}

/** The card under a finger at [at] (from the deck's centre): the top one, or a thrown one lying at the edge. */
private fun Density.pick(deck: Deck, s: PlayerUi, at: Offset, g: Geo): Int? {
  val top = deck.target
  val r = g.side / 2f
  val hasTop = s.deckTrack(top) != null
  if (hasTop && abs(at.x) <= r && abs(at.y) <= r) return top
  // the thrown ones, the most recent first (it lies above the older); one still flying isn't caught
  val half = g.side * REST_SCALE / 2f
  for (j in 1..AROUND) {
    val p = top - j
    val t = s.deckTrack(p) ?: break
    if (p in deck.flights) continue
    val rest = Rest(deck.angleOf(t), g, t, deck.age(p))
    val q = at - rest.center
    val a = -rest.rotation * PI.toFloat() / 180f
    val lx = q.x * cos(a) - q.y * sin(a)
    val ly = q.x * sin(a) + q.y * cos(a)
    if (abs(lx) <= half && abs(ly) <= half) return p
  }
  // the pile's edges peeking out above the top card
  if (hasTop && abs(at.x) <= r && at.y < -r && at.y >= -r - PEEK.toPx() * DEPTH) return top
  return null
}

/* ---------- letting go ---------- */

/**
 * The finger's speed as a let-go card's start on the spring that takes it [from] where it is home: toward
 * home no faster than the spring can stop it there (faster, it flies past and comes back like on a rubber
 * band), away from home and sideways only a little.
 */
private fun tame(from: Offset, v: Offset, spec: FiniteAnimationSpec<Offset>): Offset {
  val d = from.getDistance()
  if (d < 1f) return Offset.Zero
  val w = sqrt((spec as? SpringSpec<*>)?.stiffness ?: 380f)
  val home = Offset(-from.x / d, -from.y / d)
  val along = v.x * home.x + v.y * home.y
  val side = v - home * along
  val sideMax = w * d * 0.3f
  val s = side.getDistance()
  return home * along.coerceIn(-0.5f * w * d, w * d) + (if (s > sideMax) side * (sideMax / s) else side)
}

/** Card [p] flies home on its own spring, starting [from] where it is with the finger's speed [v]. */
private fun Deck.fly(p: Int, toTop: Boolean, from: Offset, v: Offset, spec: FiniteAnimationSpec<Offset>) {
  flights[p]?.job?.cancel()
  val f = Flight(toTop, from)
  flights[p] = f
  f.job = scope.launch {
    try {
      f.off.animateTo(Offset.Zero, spec, initialVelocity = tame(from, v, spec))
      // back on the rails only where the deck draws it the same, so it never jumps
      snapshotFlow { if (toTop) target != p || abs(at - p) < 0.02f else target <= p || at - p > 0.98f }.first { it }
    } finally {
      if (flights[p] === f) flights.remove(p)
    }
  }
}

/** The deck goes to its target from where it is drawn, right away (no frame with the rise lost). */
private fun Deck.settle(spec: AnimationSpec<Float>) {
  scope.launch(start = CoroutineStart.UNDISPATCHED) { glide(spec) }
}

/** The top card let go of: thrown on (the next track plays) or back on top. */
private fun Deck.letGoTop(s: PlayerUi, p: Int, t: Track, g: Geo, ended: Boolean, v: Offset) {
  val h = hand
  val aim = h + v * CARRY
  val go = ended && s.deckTrack(p)?.id == t.id && p < s.deckOrder().lastIndex && aim.getDistance() > g.side * 0.25f
  held = null
  throwing = false
  if (go) {
    // it lies on the side it was headed for, the finger's speed included
    val angle = atan2(aim.y, aim.x)
    angles[t.id] = angle
    target = p + 1
    asked = p + 1
    fly(p, toTop = false, from = h - Rest(angle, g, t, age(p)).center, v = v, spec = Motion.expressive.defaultSpatialSpec())
    settle(Motion.expressive.defaultSpatialSpec())
    PlayerConn.next()
  } else {
    fly(p, toTop = true, from = h, v = v, spec = Motion.expressive.fastSpatialSpec())
    settle(Motion.expressive.fastSpatialSpec())
  }
  dragging = false
}

/** A thrown card let go of: pulled in toward the pile, it is back on top (its song plays); otherwise back to its edge. */
private fun Deck.letGoPulled(s: PlayerUi, p: Int, t: Track, g: Geo, ended: Boolean, v: Offset) {
  val rest = Rest(angleOf(t), g, t, age(p))
  val h = hand
  // only a pull toward the pile counts, not a tug along the edge or further out
  val d = rest.center.getDistance().coerceAtLeast(1f)
  val aim = h + v * CARRY
  val inward = -(aim.x * rest.center.x + aim.y * rest.center.y) / d
  val index = s.deckOrder().getOrNull(p)
  val go = ended && index != null && s.deckTrack(p)?.id == t.id && inward > g.side * 0.1f
  held = null
  if (go) {
    target = p
    asked = p
    fly(p, toTop = true, from = rest.center + h, v = v, spec = Motion.expressive.defaultSpatialSpec())
    settle(Motion.expressive.defaultSpatialSpec())
    PlayerConn.seekToTrack(index!!)
  } else {
    fly(p, toTop = false, from = h, v = v, spec = Motion.expressive.fastSpatialSpec())
    // a flip the finger cut short goes on
    settle(Motion.expressive.defaultSpatialSpec())
  }
  dragging = false
}

@Composable
fun CoverStack(s: PlayerUi, deck: Deck, modifier: Modifier = Modifier, pauseScale: () -> Float = { 1f }) {
  val pos = s.deckPos()
  // the gesture reads the latest queue without restarting: a restart would drop the card from the finger
  val latest by rememberUpdatedState(s)

  BoxWithConstraints(
    // not clipped: the thrown cards reach past the area, under the player's other parts (which keep
    // their touches: only the area itself takes the deck's)
    modifier
      .graphicsLayer { val k = pauseScale(); scaleX = k; scaleY = k }
      .pointerInput(deck) {
        awaitEachGesture {
          val down = awaitFirstDown(requireUnconsumed = false)
          val now = latest
          val g = geo(size.width.toFloat(), size.height.toFloat())
          val center = Offset(size.width / 2f, size.height / 2f)
          val p = pick(deck, now, down.position - center, g) ?: return@awaitEachGesture
          val t = now.deckTrack(p) ?: return@awaitEachGesture
          val start = awaitTouchSlopOrCancellation(down.id) { change, _ -> change.consume() } ?: return@awaitEachGesture
          val throwing = p == deck.target
          // a card still on its way back on top is caught where it is
          val caught = if (deck.flights[p] != null) deck.free(p, t, g)?.at else null
          deck.flights.remove(p)?.job?.cancel()
          val tracker = VelocityTracker()
          tracker.addPointerInputChange(down)
          tracker.addPointerInputChange(start)
          deck.throwing = throwing
          deck.hand = (caught ?: Offset.Zero) + (start.position - down.position)
          deck.held = p
          deck.dragging = true
          var ended = false
          var v = Offset.Zero
          try {
            ended = drag(start.id) { change ->
              deck.hand += change.positionChange()
              change.consume()
              tracker.addPointerInputChange(change)
              if (throwing) {
                // the next card rises (and the colours follow) as far as the throw has come
                val h = deck.hand
                val angle = if (h.getDistance() < 0.5f) deck.angleOf(t) else atan2(h.y, h.x)
                deck.rise = RISE * (h.getDistance() / Rest(angle, g, t, 0f).center.getDistance().coerceAtLeast(1f)).coerceIn(0f, 1f)
              }
            }
            val velocity = tracker.calculateVelocity()
            v = Offset(velocity.x, velocity.y)
          } finally {
            // also when the gesture is cut short: the card never stays stuck in a hand that is gone
            if (throwing) deck.letGoTop(latest, p, t, g, ended, v) else deck.letGoPulled(latest, p, t, g, ended, v)
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
    // which cards exist right now; changes only when the deck passes a whole card
    val base by remember { derivedStateOf { floor(deck.at).toInt() } }
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
  val small by remember(p) { derivedStateOf { deck.held != p && p !in deck.flights && deck.at - p > FULL_AGE } }
  val density = LocalDensity.current
  Box(
    Modifier.zIndex(z).size(side)
      .then(if (top) Modifier.sharedCover("np:${t.id}") else Modifier)
      .graphicsLayer { place(deck, t, p, g) },
  ) {
    DeckCover(t.coverUrl, side, if (small) (g.side * REST_SCALE).toInt().coerceAtMost(with(density) { 220.dp.roundToPx() }) else null)
    // down the pile and around it, darker: a layer's alpha, so flipping never redraws the cover
    Box(Modifier.matchParentSize().graphicsLayer { alpha = deck.darkness(p, t, g) }.background(Color.Black))
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
