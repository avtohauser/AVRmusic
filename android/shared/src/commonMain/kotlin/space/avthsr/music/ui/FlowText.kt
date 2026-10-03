// Flowing type, as on the site: every letter of a heading drifts through Google Sans Flex's weight,
// width and roundness in a slow wave. The faces along the wave are built once and cached, so a frame
// only re-styles the letters, and only while drawing. Static before Android 10 and when animations are switched off.
package space.avthsr.music.ui

import space.avthsr.music.Platform

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.material3.LocalContentColor
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.takeOrElse
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.text
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.constrainHeight
import androidx.compose.ui.unit.constrainWidth
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import kotlin.math.PI
import kotlin.math.roundToInt
import kotlin.math.sin

@Composable
fun FlowText(
  text: String,
  style: TextStyle,
  modifier: Modifier = Modifier,
  color: Color = Color.Unspecified,
  textAlign: TextAlign? = null,
  maxLines: Int = 2,
  seconds: Float = 5.4f,
) {
  val faces = remember { flowFamilies() }
  val still = remember { Platform.animationsOff() }
  if (faces == null || still) {
    Text(text, modifier, color = color, style = style, textAlign = textAlign, maxLines = maxLines, overflow = TextOverflow.Ellipsis)
    return
  }
  val ink = color.takeOrElse { style.color.takeOrElse { LocalContentColor.current } }
  val merged = style.merge(TextStyle(color = ink, textAlign = textAlign ?: TextAlign.Unspecified))
  val measurer = rememberTextMeasurer(cacheSize = 0)
  val wave = rememberInfiniteTransition(label = "flow")
  // read only while drawing: the wave never recomposes or re-measures the screen around it
  val phase = wave.animateFloat(0f, 1f, infiniteRepeatable(tween((seconds * 1000).toInt(), easing = LinearEasing)), label = "phase")
  val frame = remember(text, merged, maxLines) { FlowFrame() }
  Layout(
    modifier = modifier
      .semantics { this.text = AnnotatedString(text) }
      .drawBehind {
        // 240 positions per turn, like the site; one paragraph per position, laid out when it comes up
        val step = (phase.value * STEPS).toInt() % STEPS
        val laid = frame.layout?.takeIf { frame.step == step && frame.width == size.width.toInt() } ?: measurer.measure(
          flowing(text, step / STEPS.toFloat(), faces), merged, TextOverflow.Ellipsis, true, maxLines,
          constraints = Constraints.fixedWidth(size.width.toInt()),
        ).also { frame.layout = it; frame.step = step; frame.width = size.width.toInt() }
        drawText(laid)
      },
  ) { _, constraints ->
    // the box fits the text in its widest face, so no position of the wave ever needs more room
    val widest = measurer.measure(
      AnnotatedString(text), merged.copy(fontFamily = faces.last()), TextOverflow.Ellipsis, true, maxLines,
      constraints = Constraints(maxWidth = constraints.maxWidth, maxHeight = constraints.maxHeight),
    )
    layout(constraints.constrainWidth(widest.size.width), constraints.constrainHeight(widest.size.height)) {}
  }
}

private const val STEPS = 240

private class FlowFrame {
  var step = -1
  var width = -1
  var layout: TextLayoutResult? = null
}

private fun flowing(text: String, p: Float, faces: List<FontFamily>) = buildAnnotatedString {
  text.forEachIndexed { i, ch ->
    val v = (sin(2 * PI * (p - i * 0.045)) + 1) / 2
    withStyle(SpanStyle(fontFamily = faces[(v * (faces.size - 1)).roundToInt()])) { append(ch) }
  }
}
