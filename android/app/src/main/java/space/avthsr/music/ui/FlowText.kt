// Flowing type, as on the site: every letter of a heading drifts through Google Sans Flex's weight,
// width and roundness in a slow wave. The faces along the wave are built once and cached, so a frame
// only re-styles the letters. Static before Android 10 and when animations are switched off.
package space.avthsr.music.ui

import android.provider.Settings
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
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
  val context = LocalContext.current
  val faces = remember { flowFamilies(context) }
  val still = remember {
    runCatching { Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }.getOrDefault(false)
  }
  if (faces == null || still) {
    Text(text, modifier, color = color, style = style, textAlign = textAlign, maxLines = maxLines, overflow = TextOverflow.Ellipsis)
    return
  }
  val wave = rememberInfiniteTransition(label = "flow")
  val phase by wave.animateFloat(0f, 1f, infiniteRepeatable(tween((seconds * 1000).toInt(), easing = LinearEasing)), label = "phase")
  // 240 positions per turn, like the site: smooth, and every position reuses cached faces
  val step = (phase * 240).toInt()
  val styled = remember(text, step, faces) {
    val p = step / 240f
    buildAnnotatedString {
      text.forEachIndexed { i, ch ->
        val v = (sin(2 * PI * (p - i * 0.045)) + 1) / 2
        withStyle(SpanStyle(fontFamily = faces[(v * (faces.size - 1)).roundToInt()])) { append(ch) }
      }
    }
  }
  Text(styled, modifier, color = color, style = style, textAlign = textAlign, maxLines = maxLines, overflow = TextOverflow.Ellipsis)
}
