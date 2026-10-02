@file:OptIn(ExperimentalTextApi::class, ExperimentalMaterial3ExpressiveApi::class)

package space.avthsr.music.ui

import android.content.Context
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.MaterialExpressiveTheme
import androidx.compose.material3.MotionScheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import space.avthsr.music.R

/*
 * Type: Google Sans Flex, the Material 3 Expressive typeface, with all its flexible axes. It has no
 * Cyrillic, so every face is a chain: Google Sans Flex first, Roboto Flex (same axes but roundness)
 * for the letters it lacks — Russian text gets the same weight, width and optical size. Headlines are
 * set heavy, wide and fully rounded, body text plain, as in the expressive type scale.
 */

/** One face of the scale: weight, width, roundness, optical size. */
private data class Face(val weight: Int, val width: Float = 100f, val round: Float = 0f, val opsz: Float = 18f)

private fun Face.settings() = "'wght' $weight, 'wdth' $width, 'ROND' $round, 'opsz' $opsz"

@RequiresApi(29)
private fun chained(context: Context, face: Face): android.graphics.Typeface {
  fun font(res: Int) = android.graphics.fonts.Font.Builder(context.resources, res)
    .setWeight(face.weight)
    .setFontVariationSettings(face.settings())
    .build()
  val primary = android.graphics.fonts.FontFamily.Builder(font(R.font.google_sans_flex)).build()
  val cyrillic = android.graphics.fonts.FontFamily.Builder(font(R.font.roboto_flex)).build()
  return android.graphics.Typeface.CustomFallbackBuilder(primary)
    .addCustomFallback(cyrillic)
    .setStyle(android.graphics.fonts.FontStyle(face.weight, android.graphics.fonts.FontStyle.FONT_SLANT_UPRIGHT))
    .build()
}

private fun family(context: Context, face: Face): FontFamily = when {
  Build.VERSION.SDK_INT >= 29 -> runCatching { FontFamily(androidx.compose.ui.text.font.Typeface(chained(context, face))) }
    .getOrElse { robotoFlex(face) }
  else -> robotoFlex(face)
}

// before Android 10 there are no fallback chains: Roboto Flex has both alphabets
private fun robotoFlex(face: Face) = FontFamily(
  Font(
    R.font.roboto_flex,
    weight = FontWeight(face.weight),
    variationSettings = FontVariation.Settings(FontVariation.weight(face.weight), FontVariation.width(face.width), FontVariation.Setting("opsz", face.opsz)),
  ),
)

private fun TextStyle.with(context: Context, face: Face) = copy(fontFamily = family(context, face), fontWeight = FontWeight(face.weight))

private fun typography(context: Context): Typography {
  val t = Typography()
  return Typography(
    displayLarge = t.displayLarge.with(context, Face(800, 118f, 100f, 48f)),
    displayMedium = t.displayMedium.with(context, Face(800, 116f, 100f, 44f)),
    displaySmall = t.displaySmall.with(context, Face(780, 114f, 100f, 36f)),
    headlineLarge = t.headlineLarge.with(context, Face(750, 112f, 100f, 32f)),
    headlineMedium = t.headlineMedium.with(context, Face(720, 110f, 100f, 28f)),
    headlineSmall = t.headlineSmall.with(context, Face(700, 108f, 100f, 24f)),
    titleLarge = t.titleLarge.with(context, Face(680, 106f, 80f, 22f)),
    titleMedium = t.titleMedium.with(context, Face(600, 102f, 40f, 16f)),
    titleSmall = t.titleSmall.with(context, Face(600, 100f, 30f, 14f)),
    bodyLarge = t.bodyLarge.with(context, Face(420, 100f, 0f, 16f)),
    bodyMedium = t.bodyMedium.with(context, Face(400, 100f, 0f, 14f)),
    bodySmall = t.bodySmall.with(context, Face(400, 100f, 0f, 12f)),
    labelLarge = t.labelLarge.with(context, Face(620, 100f, 50f, 14f)),
    labelMedium = t.labelMedium.with(context, Face(600, 100f, 50f, 12f)),
    labelSmall = t.labelSmall.with(context, Face(560, 100f, 50f, 12f)),
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
  val context = LocalContext.current
  val scheme = if (Build.VERSION.SDK_INT >= 31) dynamicDarkColorScheme(context) else Fallback
  val type = remember { typography(context.applicationContext) }
  MaterialExpressiveTheme(
    colorScheme = scheme,
    motionScheme = MotionScheme.expressive(),
    shapes = AvrShapes,
    typography = type,
    content = content,
  )
}

/** The edges the content must keep clear of: system bars when shown, the camera cutout always. */
val SafeBars: WindowInsets
  @Composable get() = WindowInsets.systemBars.union(WindowInsets.displayCutout)
