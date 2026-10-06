@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

// avr music, the brand: a four-point star glowing from pink to violet with two sound waves beside it,
// the wordmark "avr" + "music" in Outfit, the deep teal ground with light-teal text. Here: the brand's
// colour schemes (the default look), the sign and the wordmark, the loader and the intro — all drawn,
// so they stay sharp at any size.
package space.avthsr.music.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.LoadingIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import org.jetbrains.compose.resources.Font
import space.avthsr.music.player.PlayerConn
import space.avthsr.music.res.*
import kotlin.math.PI
import kotlin.math.sin

object Brand {
  val Teal = Color(0xFF0B4248)
  val TealDeep = Color(0xFF08353A)
  val Mist = Color(0xFFD3E3E4)
  val MistDim = Color(0xFFA9C4C6)
  val Pink = Color(0xFFF2A5C3)
  val Violet = Color(0xFF5A4FC8)
  val Paper = Color(0xFFE9EFEF)
}

/* ---------- the brand's colours, as Material roles ---------- */

val BrandDark: ColorScheme = darkColorScheme(
  primary = Brand.Pink, onPrimary = Color(0xFF3B0D26),
  primaryContainer = Brand.Violet, onPrimaryContainer = Color(0xFFF1EEFF),
  inversePrimary = Brand.Violet,
  secondary = Brand.MistDim, onSecondary = Color(0xFF0B3236),
  secondaryContainer = Color(0xFF1E5B62), onSecondaryContainer = Brand.Mist,
  tertiary = Color(0xFFC4BCFF), onTertiary = Color(0xFF251A7A),
  tertiaryContainer = Color(0xFF3F3591), onTertiaryContainer = Color(0xFFE4DFFF),
  background = Brand.Teal, onBackground = Brand.Mist,
  surface = Brand.Teal, onSurface = Brand.Mist,
  surfaceVariant = Color(0xFF1E5B62), onSurfaceVariant = Brand.MistDim,
  surfaceTint = Brand.Pink,
  inverseSurface = Brand.Mist, inverseOnSurface = Brand.Teal,
  error = Color(0xFFFFB4AB), onError = Color(0xFF690005),
  errorContainer = Color(0xFF93000A), onErrorContainer = Color(0xFFFFDAD6),
  outline = Color(0xFF6F9497), outlineVariant = Color(0xFF2A6168),
  scrim = Color.Black,
  surfaceBright = Color(0xFF1E6C74), surfaceDim = Brand.TealDeep,
  surfaceContainerLowest = Color(0xFF062E33), surfaceContainerLow = Color(0xFF0E4A50),
  surfaceContainer = Color(0xFF115158), surfaceContainerHigh = Color(0xFF155A62),
  surfaceContainerHighest = Color(0xFF1A646C),
)

val BrandLight: ColorScheme = lightColorScheme(
  primary = Brand.Violet, onPrimary = Color.White,
  primaryContainer = Color(0xFFE4E0FF), onPrimaryContainer = Color(0xFF1E1478),
  inversePrimary = Brand.Pink,
  secondary = Brand.Teal, onSecondary = Color.White,
  secondaryContainer = Color(0xFFCDE2E3), onSecondaryContainer = Color(0xFF062E33),
  tertiary = Color(0xFFA23F6E), onTertiary = Color.White,
  tertiaryContainer = Color(0xFFFFD9E6), onTertiaryContainer = Color(0xFF3B0D26),
  background = Brand.Paper, onBackground = Brand.Teal,
  surface = Color(0xFFEEF3F3), onSurface = Brand.Teal,
  surfaceVariant = Color(0xFFD6E3E4), onSurfaceVariant = Color(0xFF3E5F63),
  surfaceTint = Brand.Violet,
  inverseSurface = Brand.Teal, inverseOnSurface = Brand.Mist,
  error = Color(0xFFBA1A1A), onError = Color.White,
  errorContainer = Color(0xFFFFDAD6), onErrorContainer = Color(0xFF410002),
  outline = Color(0xFF6F8C8F), outlineVariant = Color(0xFFBCCFD1),
  scrim = Color.Black,
  surfaceBright = Color(0xFFF7FAFA), surfaceDim = Color(0xFFD3DEDF),
  surfaceContainerLowest = Color.White, surfaceContainerLow = Color(0xFFF3F7F7),
  surfaceContainer = Color(0xFFEAF1F1), surfaceContainerHigh = Color(0xFFE2EBEC),
  surfaceContainerHighest = Color(0xFFD9E5E6),
)

@Composable
fun isDarkScheme(): Boolean = MaterialTheme.colorScheme.background.luminance() < 0.4f

/* ---------- the sign: the star and its two waves ---------- */

// the design's coordinates: the star in a 100×100 box, the waves beside it (140×100 in all)
private val starPath by lazy { PathParser().parsePathString("M50 2 C53 30 70 47 98 50 C70 53 53 70 50 98 C47 70 30 53 2 50 C30 47 47 30 50 2Z").toPath() }
private val starBrush = Brush.linearGradient(listOf(Brand.Pink, Brand.Violet), start = Offset(2f, 98f), end = Offset(98f, 2f))

/**
 * The star with its two sound waves. For motion: [wave1] / [wave2] how strongly each wave shows (0…1),
 * [spin] the star's turn in degrees, [grow] its scale.
 */
@Composable
fun BrandMark(
  modifier: Modifier = Modifier,
  waves: Boolean = true,
  wave1: Float = 1f,
  wave2: Float = 1f,
  spin: Float = 0f,
  grow: Float = 1f,
) {
  Canvas(modifier) {
    val w = if (waves) 140f else 100f
    val k = minOf(size.width / w, size.height / 100f)
    translate((size.width - w * k) / 2f, (size.height - 100f * k) / 2f) {
      scale(k, k, pivot = Offset.Zero) {
        rotate(spin, pivot = Offset(50f, 50f)) {
          scale(grow, grow, pivot = Offset(50f, 50f)) { drawPath(starPath, starBrush) }
        }
        if (waves) {
          if (wave1 > 0f) drawArc(Brand.Pink, -45.6f, 91.2f, false, Offset(60.4f, 22f), Size(56f, 56f), alpha = wave1.coerceAtMost(1f), style = Stroke(6f, cap = StrokeCap.Round))
          if (wave2 > 0f) drawArc(Brand.Violet, -46.6f, 93.2f, false, Offset(47.8f, 6f), Size(88f, 88f), alpha = wave2.coerceAtMost(1f), style = Stroke(6f, cap = StrokeCap.Round))
        }
      }
    }
  }
}

/** "avr music" in Outfit: "avr" medium, "music" light in the accent (pink on dark, violet on light). */
@Composable
fun Wordmark(size: TextUnit, modifier: Modifier = Modifier, dark: Boolean = isDarkScheme()) {
  val medium = FontFamily(Font(Res.font.outfit_medium, FontWeight.Medium))
  val light = FontFamily(Font(Res.font.outfit_light, FontWeight.Light))
  val text = remember(dark, medium, light) {
    buildAnnotatedString {
      withStyle(SpanStyle(fontFamily = medium, fontWeight = FontWeight.Medium, color = if (dark) Brand.Mist else Brand.Teal)) { append("avr") }
      withStyle(SpanStyle(letterSpacing = (-0.1).em)) { append(" ") }
      withStyle(SpanStyle(fontFamily = light, fontWeight = FontWeight.Light, color = if (dark) Brand.Pink else Brand.Violet)) { append("music") }
    }
  }
  Text(text, modifier, fontSize = size, letterSpacing = (-0.026).em, maxLines = 1, softWrap = false)
}

/* ---------- motion ---------- */

/** How strongly a wave shows at [p] of the loop: it rises, holds, fades, rests — later by [delay]. */
private fun wave(p: Float, delay: Float): Float {
  val x = ((p - delay) % 1f + 1f) % 1f
  return when {
    x < 0.25f -> x / 0.25f
    x < 0.55f -> 1f
    x < 0.8f -> 1f - (x - 0.55f) / 0.25f
    else -> 0f
  }.coerceIn(0.12f, 1f)
}

/** The brand's loader: the star breathes and sways, the waves go out one after the other. */
@Composable
fun BrandLoader(modifier: Modifier = Modifier) {
  val t = rememberInfiniteTransition(label = "loader")
  val p by t.animateFloat(0f, 1f, infiniteRepeatable(tween(1500, easing = LinearEasing), RepeatMode.Restart), label = "loop")
  val a = (p * 2 * PI).toFloat()
  BrandMark(modifier.size(48.dp), spin = sin(a) * 12f, grow = 0.9f + 0.1f * sin(a * 2f), wave1 = wave(p, 0f), wave2 = wave(p, 0.18f))
}

/** Something is loading: the brand's loader in the brand's look, Material's shape-morphing one otherwise. */
@Composable
fun LoadingMark(modifier: Modifier = Modifier) {
  val source by Look.source.collectAsState()
  if (source == "brand") BrandLoader(modifier) else LoadingIndicator(modifier)
}

/** The sign beside the greeting: its waves pulse while music plays. */
@Composable
fun LiveMark(modifier: Modifier = Modifier) {
  val playing by remember { PlayerConn.state.map { it.playing }.distinctUntilChanged() }.collectAsState(PlayerConn.state.value.playing)
  if (!playing) { BrandMark(modifier); return }
  val t = rememberInfiniteTransition(label = "live")
  val p by t.animateFloat(0f, 1f, infiniteRepeatable(tween(1100, easing = LinearEasing), RepeatMode.Restart), label = "beat")
  BrandMark(modifier, wave1 = wave(p, 0f), wave2 = wave(p, 0.2f), grow = 0.94f + 0.06f * sin((p * 2 * PI).toFloat()))
}

private var introShown = false

/** The first moment of the app: the star turns in, the waves go out, the name comes up — then it all fades into the app. */
@Composable
fun BrandIntro() {
  var show by remember { mutableStateOf(!introShown) }
  if (!show) return
  val p = remember { Animatable(0f) }
  val fade = remember { Animatable(1f) }
  LaunchedEffect(Unit) {
    introShown = true
    p.animateTo(1f, tween(1100, easing = FastOutSlowInEasing))
    delay(150)
    fade.animateTo(0f, tween(380))
    show = false
  }
  val v = p.value
  val star = (v / 0.5f).coerceIn(0f, 1f)
  Box(Modifier.fillMaxSize().graphicsLayer { alpha = fade.value }.background(Brand.Teal), contentAlignment = Alignment.Center) {
    Canvas(Modifier.fillMaxSize()) {
      listOf(150f to 0.10f, 220f to 0.07f, 290f to 0.04f).forEach { (r, a) ->
        drawCircle(Brand.Mist, radius = r.dp.toPx() * (0.85f + 0.15f * v), alpha = a * v, style = Stroke(1.5.dp.toPx()))
      }
    }
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
      BrandMark(
        Modifier.size(126.dp, 90.dp),
        spin = (1f - star) * -120f, grow = 0.2f + 0.8f * star,
        wave1 = ((v - 0.35f) / 0.25f).coerceIn(0f, 1f), wave2 = ((v - 0.5f) / 0.25f).coerceIn(0f, 1f),
      )
      val word = ((v - 0.45f) / 0.4f).coerceIn(0f, 1f)
      Wordmark(44.sp, Modifier.graphicsLayer { alpha = word; translationY = (1f - word) * 16.dp.toPx() }, dark = true)
    }
  }
}
