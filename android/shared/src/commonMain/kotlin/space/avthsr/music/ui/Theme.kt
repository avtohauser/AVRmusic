@file:OptIn(ExperimentalTextApi::class, ExperimentalMaterial3ExpressiveApi::class)

package space.avthsr.music.ui

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.MaterialExpressiveTheme
import androidx.compose.material3.MotionScheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import space.avthsr.music.Platform
import space.avthsr.music.api.Api
import space.avthsr.music.player.PlayerConn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/*
 * Type: Google Sans Flex, the Material 3 Expressive typeface, with all its flexible axes. It has no
 * Cyrillic, so every face is a chain: Google Sans Flex first, Roboto Flex (same axes but roundness)
 * for the letters it lacks — Russian text gets the same weight, width and optical size. Headlines are
 * set heavy, wide and fully rounded, body text plain, as in the expressive type scale.
 */

/** One face of the scale: weight, width, roundness, optical size. */
data class Face(val weight: Int, val width: Float = 100f, val round: Float = 0f, val opsz: Float = 18f)

fun Face.settings() = "'wght' $weight, 'wdth' $width, 'ROND' $round, 'opsz' $opsz"

/** The family of one face: Google Sans Flex chained with Roboto Flex for the letters it lacks. */
expect fun faceFamily(face: Face): FontFamily

/** Faces along the flowing-type wave (heavier, wider, rounder and back), built once; null where it can't be done. */
expect fun flowFamilies(): List<FontFamily>?

/** Material You colours from the wallpaper, where the system has them. */
expect fun systemScheme(dark: Boolean): ColorScheme?

/** Whatever the platform's text needs before the first line is drawn (iOS: the Cyrillic fallback faces). */
@Composable
expect fun PlatformFonts()

private fun TextStyle.with(face: Face) = copy(fontFamily = faceFamily(face), fontWeight = FontWeight(face.weight))

private fun typography(): Typography {
  val t = Typography()
  return Typography(
    displayLarge = t.displayLarge.with(Face(800, 118f, 100f, 48f)),
    displayMedium = t.displayMedium.with(Face(800, 116f, 100f, 44f)),
    displaySmall = t.displaySmall.with(Face(780, 114f, 100f, 36f)),
    headlineLarge = t.headlineLarge.with(Face(750, 112f, 100f, 32f)),
    headlineMedium = t.headlineMedium.with(Face(720, 110f, 100f, 28f)),
    headlineSmall = t.headlineSmall.with(Face(700, 108f, 100f, 24f)),
    titleLarge = t.titleLarge.with(Face(680, 106f, 80f, 22f)),
    titleMedium = t.titleMedium.with(Face(600, 102f, 40f, 16f)),
    titleSmall = t.titleSmall.with(Face(600, 100f, 30f, 14f)),
    bodyLarge = t.bodyLarge.with(Face(420, 100f, 0f, 16f)),
    bodyMedium = t.bodyMedium.with(Face(400, 100f, 0f, 14f)),
    bodySmall = t.bodySmall.with(Face(400, 100f, 0f, 12f)),
    labelLarge = t.labelLarge.with(Face(620, 100f, 50f, 14f)),
    labelMedium = t.labelMedium.with(Face(600, 100f, 50f, 12f)),
    labelSmall = t.labelSmall.with(Face(560, 100f, 50f, 12f)),
  )
}

private val Fallback = darkColorScheme(
  primary = Color(0xFFD0BCFF),
  onPrimary = Color(0xFF381E72),
  primaryContainer = Color(0xFF4F378B),
  onPrimaryContainer = Color(0xFFEADDFF),
  secondary = Color(0xFFCCC2DC),
  secondaryContainer = Color(0xFF4A4458),
  tertiary = Color(0xFFEFB8C8),
  tertiaryContainer = Color(0xFF633B48),
  background = Color(0xFF141218),
  surface = Color(0xFF141218),
  surfaceContainerLowest = Color(0xFF0F0D13),
  surfaceContainerLow = Color(0xFF1D1B20),
  surfaceContainer = Color(0xFF211F26),
  surfaceContainerHigh = Color(0xFF2B2930),
  surfaceContainerHighest = Color(0xFF36343B),
)

private val AvrShapes = Shapes(
  extraSmall = RoundedCornerShape(8.dp),
  small = RoundedCornerShape(12.dp),
  medium = RoundedCornerShape(18.dp),
  large = RoundedCornerShape(26.dp),
  extraLarge = RoundedCornerShape(34.dp),
)

@Composable
fun AvrTheme(content: @Composable () -> Unit) {
  val mode by Look.mode.collectAsState()
  val source by Look.source.collectAsState()
  val seed by Look.seed.collectAsState()
  val variant by Look.variant.collectAsState()
  val contrast by Look.contrast.collectAsState()
  val coverSeed by Look.coverSeed.collectAsState()
  // only the cover matters here: a play / pause must not recompose the whole app through the theme
  val cover by remember { PlayerConn.state.map { it.track?.coverUrl }.distinctUntilChanged() }.collectAsState(PlayerConn.state.value.track?.coverUrl)
  // the playing track's cover gives the colours when chosen so
  LaunchedEffect(source, cover) {
    if (source == "cover" && cover != null) Api.img(cover)?.let { url -> coverSeed(url)?.let { Look.coverSeed.value = it } }
  }
  val dark = when (mode) { "light" -> false; "dark" -> true; else -> isSystemInDarkTheme() }
  val target = remember(dark, source, seed, variant, contrast, coverSeed) {
    when {
      source == "system" && Platform.hasDynamicColors -> systemScheme(dark) ?: schemeFrom(seed, dark, variant, contrast)
      source == "cover" -> schemeFrom(coverSeed ?: seed, dark, variant, contrast)
      else -> schemeFrom(seed, dark, variant, contrast)
    }
  }
  val scheme = animated(target)
  val type = remember { typography() }
  MaterialExpressiveTheme(
    colorScheme = scheme,
    motionScheme = remember { MotionScheme.expressive() },
    shapes = AvrShapes,
    typography = type,
  ) {
    PlatformFonts()
    content()
  }
}

/** The edges the content must keep clear of: system bars when shown, the camera cutout always. */
val SafeBars: WindowInsets
  @Composable get() = WindowInsets.systemBars.union(WindowInsets.displayCutout)
