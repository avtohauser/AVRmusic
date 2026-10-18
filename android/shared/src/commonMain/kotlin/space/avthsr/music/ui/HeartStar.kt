// The heart of a like and the avr star of a superlike drawn as the same four curves — top, right, bottom,
// left — so one flows into the other: the heart's dip rises into the star's top point, its lobes into the
// side points, its tip into the bottom one; halfway it is a soft diamond. The site draws the same shapes.
package space.avthsr.music.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.unit.dp
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

private val HEART = floatArrayOf(50f, 28f, 58f, 8f, 94f, 6f, 94f, 38f, 94f, 62f, 62f, 78f, 50f, 94f, 38f, 78f, 6f, 62f, 6f, 38f, 6f, 6f, 42f, 8f, 50f, 28f)
private val STAR = floatArrayOf(50f, 2f, 53f, 30f, 70f, 47f, 98f, 50f, 70f, 53f, 53f, 70f, 50f, 98f, 47f, 70f, 30f, 53f, 2f, 50f, 30f, 47f, 47f, 30f, 50f, 2f)

/** The outline [k] of the way from the heart (0) to the star (1) in a 100×100 box; a spring may take it a little past either. */
fun heartStarPath(k: Float, into: Path = Path()): Path {
  fun v(i: Int) = HEART[i] + (STAR[i] - HEART[i]) * k
  into.reset()
  into.moveTo(v(0), v(1))
  for (s in 0 until 4) {
    val b = 2 + s * 6
    into.cubicTo(v(b), v(b + 1), v(b + 2), v(b + 3), v(b + 4), v(b + 5))
  }
  into.close()
  return into
}

private val starBrush = Brush.linearGradient(listOf(Brand.Pink, Brand.Violet), start = Offset(2f, 98f), end = Offset(98f, 2f))

/**
 * The heart of a like, the same shape flowing into the avr star for a superlike. [filled] — liked (an empty
 * heart fills in), [star] — superliked (the full heart turns into the star, its colour into the star's
 * gradient, and small stars burst out of it). Nothing clips it, so the burst flies past its bounds.
 */
@Composable
fun HeartStar(
  filled: Boolean,
  star: Boolean,
  modifier: Modifier = Modifier,
  outline: Color = LocalContentColor.current,
  fill: Color = MaterialTheme.colorScheme.primary,
) {
  val k by animateFloatAsState(if (star) 1f else 0f, Motion.expressive.defaultSpatialSpec(), label = "star")
  // the fill springs a little past full: the heart pops as it fills
  val f by animateFloatAsState(if (filled || star) 1f else 0f, Motion.expressive.fastSpatialSpec(), label = "fill")
  val burst = remember { Animatable(1f) }
  var was by remember { mutableStateOf(star) }
  LaunchedEffect(star) {
    // the burst only when the star is given, not when a list first shows it
    if (star && !was) {
      burst.snapTo(0f)
      burst.animateTo(1f, tween(720, easing = FastOutSlowInEasing))
    }
    was = star
  }
  val path = remember { Path() }
  val spark = remember { heartStarPath(1f) }
  Canvas(modifier) {
    val unit = size.minDimension / 100f * (0.84f + 0.16f * k) * (0.86f + 0.14f * f)
    val solid = f.coerceIn(0f, 1f)
    val toStar = k.coerceIn(0f, 1f)
    heartStarPath(k, path)
    translate(size.width / 2f, size.height / 2f) {
      scale(unit, unit, pivot = Offset.Zero) {
        translate(-50f, -50f) {
          if (solid < 1f) drawPath(path, outline, alpha = 1f - solid, style = Stroke(width = 2.dp.toPx() / unit, join = StrokeJoin.Round))
          if (solid > 0f && toStar < 1f) drawPath(path, fill, alpha = solid * (1f - toStar))
          if (solid > 0f && toStar > 0f) drawPath(path, starBrush, alpha = solid * toStar)
        }
      }
    }
    if (burst.value < 1f) sparks(spark, burst.value)
  }
}

/** Eight small stars flying out of the middle and fading, [p] 0…1 of the way. */
private fun DrawScope.sparks(spark: Path, p: Float) {
  val box = size.minDimension
  val out = 1f - (1f - p) * (1f - p)
  for (i in 0 until 8) {
    val a = (i / 8f) * 2f * PI.toFloat() + 0.35f
    val dist = box * (0.3f + 0.75f * out) * (if (i % 2 == 0) 1f else 0.8f)
    val s = box * 0.22f * (1f - p) / 100f
    if (s <= 0f) continue
    translate(size.width / 2f + cos(a) * dist, size.height / 2f + sin(a) * dist) {
      scale(s, s, pivot = Offset.Zero) {
        translate(-50f, -50f) { drawPath(spark, if (i % 2 == 0) Brand.Pink else Brand.Violet, alpha = 1f - p * p) }
      }
    }
  }
}
