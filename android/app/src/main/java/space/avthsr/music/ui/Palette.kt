// Colours, as on the site: light / dark / system scheme; colours from Android (12+), from the cover of
// the playing track, or from a chosen seed colour; the Material palette variant and the contrast level.
// Schemes come from Material's colour science (MaterialKolor port of material-color-utilities).
@file:OptIn(androidx.compose.material3.ExperimentalMaterial3ExpressiveApi::class)

package space.avthsr.music.ui

import space.avthsr.music.tr
import android.content.Context
import android.graphics.Bitmap
import android.graphics.drawable.BitmapDrawable
import android.os.Build
import androidx.compose.animation.core.tween
import androidx.compose.animation.animateColorAsState
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import coil.imageLoader
import coil.request.ImageRequest
import com.materialkolor.dynamiccolor.DynamicColor
import com.materialkolor.dynamiccolor.MaterialDynamicColors
import com.materialkolor.hct.Hct
import com.materialkolor.quantize.QuantizerCelebi
import com.materialkolor.scheme.DynamicScheme
import com.materialkolor.scheme.SchemeContent
import com.materialkolor.scheme.SchemeExpressive
import com.materialkolor.scheme.SchemeFidelity
import com.materialkolor.scheme.SchemeFruitSalad
import com.materialkolor.scheme.SchemeMonochrome
import com.materialkolor.scheme.SchemeNeutral
import com.materialkolor.scheme.SchemeRainbow
import com.materialkolor.scheme.SchemeTonalSpot
import com.materialkolor.scheme.SchemeVibrant
import com.materialkolor.score.Score
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.withContext
import space.avthsr.music.api.Api

data class Choice(val id: String, val label: String)

object Look {
  val modes get() = listOf(Choice("auto", tr("Как в системе")), Choice("dark", tr("Тёмная")), Choice("light", tr("Светлая")))
  val sources get() = listOfNotNull(
    if (Build.VERSION.SDK_INT >= 31) Choice("system", tr("Цвета Android")) else null,
    Choice("cover", tr("Из обложки трека")),
    Choice("seed", tr("Свой цвет")),
  )
  val variants get() = listOf(
    Choice("expressive", tr("Выразительная")), Choice("tonal", tr("Тональная")), Choice("vibrant", tr("Яркая")),
    Choice("fidelity", tr("Точная")), Choice("content", tr("По контенту")), Choice("neutral", tr("Нейтральная")),
    Choice("monochrome", tr("Монохром")), Choice("rainbow", tr("Радуга")), Choice("fruit", tr("Фруктовый салат")),
  )
  val contrasts get() = listOf(Choice("standard", tr("Обычный")), Choice("medium", tr("Средний")), Choice("high", tr("Высокий")))
  val seeds = listOf(
    0xFF6750A4, 0xFF8E4585, 0xFFB3261E, 0xFFD9480F, 0xFFE8A317, 0xFF7C8F00,
    0xFF2E7D32, 0xFF00897B, 0xFF0277BD, 0xFF3F51B5, 0xFF5D4037, 0xFF546E7A,
  ).map { it.toInt() }

  val mode = MutableStateFlow("dark")
  val source = MutableStateFlow(if (Build.VERSION.SDK_INT >= 31) "system" else "seed")
  val seed = MutableStateFlow(0xFF6750A4.toInt())
  val variant = MutableStateFlow("expressive")
  val contrast = MutableStateFlow("standard")
  /** seed taken from the playing track's cover */
  val coverSeed = MutableStateFlow<Int?>(null)

  fun init() {
    val p = Api.prefs
    mode.value = p.getString("look.mode", mode.value) ?: mode.value
    source.value = (p.getString("look.source", source.value) ?: source.value).takeIf { s -> sources.any { it.id == s } } ?: "seed"
    seed.value = p.getInt("look.seed", seed.value)
    variant.value = p.getString("look.variant", variant.value) ?: variant.value
    contrast.value = p.getString("look.contrast", contrast.value) ?: contrast.value
  }

  fun set(mode: String? = null, source: String? = null, seed: Int? = null, variant: String? = null, contrast: String? = null) {
    val e = Api.prefs.edit()
    mode?.let { this.mode.value = it; e.putString("look.mode", it) }
    source?.let { this.source.value = it; e.putString("look.source", it) }
    seed?.let { this.seed.value = it; e.putInt("look.seed", it) }
    variant?.let { this.variant.value = it; e.putString("look.variant", it) }
    contrast?.let { this.contrast.value = it; e.putString("look.contrast", it) }
    e.apply()
  }
}

private fun contrastLevel(c: String) = when (c) { "medium" -> 0.5; "high" -> 1.0; else -> 0.0 }

/** A full Material colour scheme from a seed colour. */
fun schemeFrom(seed: Int, dark: Boolean, variant: String, contrast: String): ColorScheme {
  val hct = Hct.fromInt(seed)
  val level = contrastLevel(contrast)
  val s: DynamicScheme = when (variant) {
    "tonal" -> SchemeTonalSpot(hct, dark, level)
    "vibrant" -> SchemeVibrant(hct, dark, level)
    "fidelity" -> SchemeFidelity(hct, dark, level)
    "content" -> SchemeContent(hct, dark, level)
    "neutral" -> SchemeNeutral(hct, dark, level)
    "monochrome" -> SchemeMonochrome(hct, dark, level)
    "rainbow" -> SchemeRainbow(hct, dark, level)
    "fruit" -> SchemeFruitSalad(hct, dark, level)
    else -> SchemeExpressive(hct, dark, level)
  }
  val m = MaterialDynamicColors()
  fun c(d: DynamicColor) = Color(s.getArgb(d))
  val base = if (dark) darkColorScheme() else lightColorScheme()
  return base.copy(
    primary = c(m.primary()), onPrimary = c(m.onPrimary()), primaryContainer = c(m.primaryContainer()), onPrimaryContainer = c(m.onPrimaryContainer()),
    inversePrimary = c(m.inversePrimary()),
    secondary = c(m.secondary()), onSecondary = c(m.onSecondary()), secondaryContainer = c(m.secondaryContainer()), onSecondaryContainer = c(m.onSecondaryContainer()),
    tertiary = c(m.tertiary()), onTertiary = c(m.onTertiary()), tertiaryContainer = c(m.tertiaryContainer()), onTertiaryContainer = c(m.onTertiaryContainer()),
    background = c(m.background()), onBackground = c(m.onBackground()), surface = c(m.surface()), onSurface = c(m.onSurface()),
    surfaceVariant = c(m.surfaceVariant()), onSurfaceVariant = c(m.onSurfaceVariant()), surfaceTint = c(m.surfaceTint()),
    inverseSurface = c(m.inverseSurface()), inverseOnSurface = c(m.inverseOnSurface()),
    error = c(m.error()), onError = c(m.onError()), errorContainer = c(m.errorContainer()), onErrorContainer = c(m.onErrorContainer()),
    outline = c(m.outline()), outlineVariant = c(m.outlineVariant()), scrim = c(m.scrim()),
    surfaceBright = c(m.surfaceBright()), surfaceDim = c(m.surfaceDim()),
    surfaceContainerLowest = c(m.surfaceContainerLowest()), surfaceContainerLow = c(m.surfaceContainerLow()), surfaceContainer = c(m.surfaceContainer()),
    surfaceContainerHigh = c(m.surfaceContainerHigh()), surfaceContainerHighest = c(m.surfaceContainerHighest()),
  )
}

/** The most suitable theme colour of a cover (Material's quantizer and scoring, as Android does for wallpapers). */
suspend fun coverSeed(context: Context, url: String): Int? = withContext(Dispatchers.Default) {
  runCatching {
    val req = ImageRequest.Builder(context).data(url).size(112).allowHardware(false).build()
    val bmp: Bitmap = (context.imageLoader.execute(req).drawable as? BitmapDrawable)?.bitmap ?: return@runCatching null
    val pixels = IntArray(bmp.width * bmp.height)
    bmp.getPixels(pixels, 0, bmp.width, 0, 0, bmp.width, bmp.height)
    Score.score(QuantizerCelebi.quantize(pixels, 128)).firstOrNull()
  }.getOrNull()
}

/** The scheme with each colour sliding to its new value (the cover changes with every track). */
@Composable
private fun slide(c: Color): Color = animateColorAsState(c, Motion.expressive.slowEffectsSpec(), label = "scheme").value

@Composable
fun animated(s: ColorScheme): ColorScheme {
  val c = listOf(
    s.primary, s.onPrimary, s.primaryContainer, s.onPrimaryContainer,
    s.secondary, s.onSecondary, s.secondaryContainer, s.onSecondaryContainer,
    s.tertiary, s.onTertiary, s.tertiaryContainer, s.onTertiaryContainer,
    s.background, s.surface, s.onSurface, s.onSurfaceVariant,
    s.surfaceContainerLowest, s.surfaceContainerLow, s.surfaceContainer, s.surfaceContainerHigh, s.surfaceContainerHighest,
  ).map { slide(it) }
  // the theme hands the scheme down as a static local: a new instance recomposes every screen,
  // so the same instance is kept for as long as the colours stand still
  return remember(s, c) {
    s.copy(
      primary = c[0], onPrimary = c[1], primaryContainer = c[2], onPrimaryContainer = c[3],
      secondary = c[4], onSecondary = c[5], secondaryContainer = c[6], onSecondaryContainer = c[7],
      tertiary = c[8], onTertiary = c[9], tertiaryContainer = c[10], onTertiaryContainer = c[11],
      background = c[12], surface = c[13], onSurface = c[14], onSurfaceVariant = c[15],
      surfaceContainerLowest = c[16], surfaceContainerLow = c[17], surfaceContainer = c[18], surfaceContainerHigh = c[19], surfaceContainerHighest = c[20],
    )
  }
}
