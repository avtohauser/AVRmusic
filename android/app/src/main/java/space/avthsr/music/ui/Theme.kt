@file:OptIn(ExperimentalTextApi::class)

package space.avthsr.music.ui

import android.os.Build
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import space.avthsr.music.R

// Roboto Flex (Latin + Cyrillic, variable): headings are set wide and heavy, body text plain —
// the same flexible type as the site.
private fun flex(weight: Int, width: Float = 100f) = Font(
  R.font.roboto_flex,
  weight = FontWeight(weight),
  variationSettings = FontVariation.Settings(FontVariation.weight(weight), FontVariation.width(width)),
)

private val Body = FontFamily(flex(400), flex(500), flex(600), flex(700), flex(800))
private val Wide = FontFamily(flex(400, 110f), flex(500, 112f), flex(600, 116f), flex(700, 120f), flex(800, 124f), flex(900, 128f))

private val AvrType = Typography().let { t ->
  Typography(
    displayLarge = t.displayLarge.copy(fontFamily = Wide, fontWeight = FontWeight.Black),
    displayMedium = t.displayMedium.copy(fontFamily = Wide, fontWeight = FontWeight.ExtraBold),
    displaySmall = t.displaySmall.copy(fontFamily = Wide, fontWeight = FontWeight.ExtraBold),
    headlineLarge = t.headlineLarge.copy(fontFamily = Wide, fontWeight = FontWeight.ExtraBold),
    headlineMedium = t.headlineMedium.copy(fontFamily = Wide, fontWeight = FontWeight.Bold),
    headlineSmall = t.headlineSmall.copy(fontFamily = Wide, fontWeight = FontWeight.Bold),
    titleLarge = t.titleLarge.copy(fontFamily = Wide, fontWeight = FontWeight.Bold),
    titleMedium = t.titleMedium.copy(fontFamily = Body, fontWeight = FontWeight.SemiBold),
    titleSmall = t.titleSmall.copy(fontFamily = Body, fontWeight = FontWeight.SemiBold),
    bodyLarge = t.bodyLarge.copy(fontFamily = Body),
    bodyMedium = t.bodyMedium.copy(fontFamily = Body),
    bodySmall = t.bodySmall.copy(fontFamily = Body),
    labelLarge = t.labelLarge.copy(fontFamily = Body, fontWeight = FontWeight.SemiBold),
    labelMedium = t.labelMedium.copy(fontFamily = Body, fontWeight = FontWeight.SemiBold),
    labelSmall = t.labelSmall.copy(fontFamily = Body, fontWeight = FontWeight.Medium),
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
  val scheme = if (Build.VERSION.SDK_INT >= 31) dynamicDarkColorScheme(LocalContext.current) else Fallback
  MaterialTheme(colorScheme = scheme, typography = AvrType, shapes = AvrShapes, content = content)
}

/** The edges the content must keep clear of: system bars when shown, the camera cutout always. */
val SafeBars: WindowInsets
  @Composable get() = WindowInsets.systemBars.union(WindowInsets.displayCutout)
