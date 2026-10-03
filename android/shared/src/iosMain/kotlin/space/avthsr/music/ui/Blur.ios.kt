package space.avthsr.music.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import coil3.compose.AsyncImage
import coil3.compose.LocalPlatformContext
import coil3.request.ImageRequest
import coil3.request.transformations
import coil3.size.Size
import coil3.transform.Transformation
import org.jetbrains.skia.Bitmap
import org.jetbrains.skia.Canvas
import org.jetbrains.skia.ColorAlphaType
import org.jetbrains.skia.ColorType
import org.jetbrains.skia.Image
import org.jetbrains.skia.ImageInfo
import org.jetbrains.skia.Rect
import org.jetbrains.skia.SamplingMode
import space.avthsr.music.api.Api
import kotlin.math.max
import kotlin.math.roundToInt

@Composable
actual fun BlurredCover(url: String?, modifier: Modifier, alpha: Float) {
  val context = LocalPlatformContext.current
  val src = Api.img(url) ?: return
  val request = remember(src) { ImageRequest.Builder(context).data(src).size(160).transformations(SoftBlur).build() }
  AsyncImage(model = request, contentDescription = null, contentScale = ContentScale.Crop, alpha = alpha, modifier = modifier)
}

/** RGBA bytes of a bitmap scaled to [w]×[h]. */
internal fun scaledRgba(input: Bitmap, w: Int, h: Int): ByteArray? {
  val info = ImageInfo(w, h, ColorType.RGBA_8888, ColorAlphaType.PREMUL)
  val small = Bitmap()
  if (!small.allocPixels(info)) return null
  Canvas(small).drawImageRect(
    Image.makeFromBitmap(input),
    Rect.makeWH(input.width.toFloat(), input.height.toFloat()),
    Rect.makeWH(w.toFloat(), h.toFloat()),
    SamplingMode.LINEAR, null, true,
  )
  return small.readPixels(info, w * 4, 0, 0)
}

private object SoftBlur : Transformation() {
  override val cacheKey = "soft-blur-1"

  override suspend fun transform(input: Bitmap, size: Size): Bitmap {
    val w = BLUR_WIDTH
    val h = max(1, (input.height * w.toFloat() / input.width).roundToInt())
    val rgba = scaledRgba(input, w, h) ?: return input
    val px = IntArray(w * h) { i ->
      val o = i * 4
      ((rgba[o + 3].toInt() and 255) shl 24) or ((rgba[o].toInt() and 255) shl 16) or ((rgba[o + 1].toInt() and 255) shl 8) or (rgba[o + 2].toInt() and 255)
    }
    softBlur(px, w, h)
    val out = ByteArray(w * h * 4)
    for (i in px.indices) {
      val c = px[i]
      val o = i * 4
      out[o] = (c shr 16).toByte(); out[o + 1] = (c shr 8).toByte(); out[o + 2] = c.toByte(); out[o + 3] = (c ushr 24).toByte()
    }
    val info = ImageInfo(w, h, ColorType.RGBA_8888, ColorAlphaType.PREMUL)
    val result = Bitmap()
    result.allocPixels(info)
    result.installPixels(info, out, w * 4)
    return result
  }
}
