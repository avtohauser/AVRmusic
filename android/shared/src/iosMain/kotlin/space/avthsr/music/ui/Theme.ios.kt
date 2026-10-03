@file:OptIn(ExperimentalTextApi::class, ExperimentalForeignApi::class)

// Type on iOS: the same two variable fonts as on Android (bundled with the app), each face with its
// axes set. Skia draws a face's missing letters with the fonts registered for fallback, so the Roboto
// Flex faces (Cyrillic) are registered with the text system once, before the first screen.
package space.avthsr.music.ui

import androidx.compose.material3.ColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalFontFamilyResolver
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.platform.Font
import kotlinx.cinterop.ExperimentalForeignApi
import platform.Foundation.NSBundle
import platform.Foundation.NSData
import platform.Foundation.dataWithContentsOfFile
import space.avthsr.music.toByteArray

private object Fonts {
  private fun load(name: String): ByteArray? =
    NSBundle.mainBundle.pathForResource(name, ofType = "ttf")?.let { NSData.dataWithContentsOfFile(it)?.toByteArray() }

  val googleSans: ByteArray? by lazy { load("google_sans_flex") }
  val robotoFlex: ByteArray? by lazy { load("roboto_flex") }
  /** faces asked for so far: each gets a Roboto Flex twin for the letters Google Sans Flex lacks */
  val faces = LinkedHashSet<Face>()
}

private fun Face.variation() = FontVariation.Settings(
  FontVariation.weight(weight),
  FontVariation.width(width),
  FontVariation.Setting("ROND", round),
  FontVariation.Setting("opsz", opsz),
)

private fun Face.key() = "$weight-$width-$round-$opsz"

private fun family(face: Face): FontFamily? {
  val gsf = Fonts.googleSans ?: return null
  Fonts.faces += face
  return FontFamily(Font("gsf-${face.key()}", gsf, FontWeight(face.weight), FontStyle.Normal, face.variation()))
}

actual fun faceFamily(face: Face): FontFamily = family(face) ?: FontFamily.Default

private var flowFaces: List<FontFamily>? = null

actual fun flowFamilies(): List<FontFamily>? {
  flowFaces?.let { return it }
  val n = 16
  return (0 until n).map { i ->
    val k = i / (n - 1f)
    family(Face((560 + 340 * k).toInt(), 100f + 24f * k, 30f + 70f * k, 28f)) ?: return null
  }.also { flowFaces = it }
}

actual fun systemScheme(dark: Boolean): ColorScheme? = null

@Composable
actual fun PlatformFonts() {
  val resolver = LocalFontFamilyResolver.current
  remember(resolver) {
    val rf = Fonts.robotoFlex ?: return@remember Unit
    // the scale's faces plus a ladder of weights for the flowing headlines
    val faces = Fonts.faces.toList() + (400..900 step 100).map { Face(it, 112f, 60f, 28f) }
    faces.forEach { f ->
      val family = FontFamily(Font("rf-${f.key()}", rf, FontWeight(f.weight), FontStyle.Normal, FontVariation.Settings(
        FontVariation.weight(f.weight), FontVariation.width(f.width), FontVariation.Setting("opsz", f.opsz),
      )))
      runCatching { resolver.resolve(family, FontWeight(f.weight)) }
    }
  }
}
