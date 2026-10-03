@file:OptIn(ExperimentalTextApi::class)

// Type on Android: from Android 10 each face is a real fallback chain (Google Sans Flex, then Roboto
// Flex for Cyrillic) with the variable axes set; before that Roboto Flex alone, which has both alphabets.
package space.avthsr.music.ui

import android.os.Build
import androidx.annotation.RequiresApi
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import space.avthsr.music.Platform
import space.avthsr.music.shared.R

@RequiresApi(29)
private fun chained(face: Face): android.graphics.Typeface {
  fun font(res: Int) = android.graphics.fonts.Font.Builder(Platform.context.resources, res)
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

actual fun faceFamily(face: Face): FontFamily = when {
  Build.VERSION.SDK_INT >= 29 -> runCatching { FontFamily(androidx.compose.ui.text.font.Typeface(chained(face))) }
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

/** Faces along the flowing-type wave (heavier, wider, rounder and back), built once; null before Android 10. */
private var flowFaces: List<FontFamily>? = null

actual fun flowFamilies(): List<FontFamily>? {
  if (Build.VERSION.SDK_INT < 29) return null
  flowFaces?.let { return it }
  val n = 16
  return runCatching {
    (0 until n).map { i ->
      val k = i / (n - 1f)
      FontFamily(androidx.compose.ui.text.font.Typeface(chained(Face((560 + 340 * k).toInt(), 100f + 24f * k, 30f + 70f * k, 28f))))
    }
  }.getOrNull()?.also { flowFaces = it }
}

actual fun systemScheme(dark: Boolean): ColorScheme? =
  if (Build.VERSION.SDK_INT >= 31) (if (dark) dynamicDarkColorScheme(Platform.context) else dynamicLightColorScheme(Platform.context)) else null
