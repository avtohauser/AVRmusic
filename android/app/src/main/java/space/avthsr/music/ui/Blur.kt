// Soft backdrops behind the player and album pages. The cover is decoded tiny, blurred once on the CPU
// and cached, and the GPU's filtering scales it up smooth — instead of a full-screen RenderEffect blur
// that is redrawn on every frame (and does nothing before Android 12).
package space.avthsr.music.ui

import android.graphics.Bitmap
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import coil.compose.AsyncImage
import coil.request.ImageRequest
import coil.size.Size
import coil.transform.Transformation
import space.avthsr.music.api.Api
import kotlin.math.max
import kotlin.math.roundToInt

@Composable
fun BlurredCover(url: String?, modifier: Modifier = Modifier, alpha: Float = 1f) {
  val context = LocalContext.current
  val src = Api.img(url) ?: return
  val request = remember(src) {
    ImageRequest.Builder(context).data(src).size(160).allowHardware(false).transformations(SoftBlur).build()
  }
  AsyncImage(model = request, contentDescription = null, contentScale = ContentScale.Crop, alpha = alpha, modifier = modifier)
}

private object SoftBlur : Transformation {
  override val cacheKey = "soft-blur-1"

  override suspend fun transform(input: Bitmap, size: Size): Bitmap {
    val w = 40
    val h = max(1, (input.height * w.toFloat() / input.width).roundToInt())
    val small = Bitmap.createScaledBitmap(input, w, h, true)
    val px = IntArray(w * h)
    small.getPixels(px, 0, w, 0, 0, w, h)
    val tmp = IntArray(px.size)
    // three box passes each way come close to a gaussian
    repeat(3) {
      pass(px, tmp, w, h, 3, horizontal = true)
      pass(tmp, px, w, h, 3, horizontal = false)
    }
    return Bitmap.createBitmap(px, w, h, Bitmap.Config.ARGB_8888)
  }

  private fun pass(src: IntArray, dst: IntArray, w: Int, h: Int, r: Int, horizontal: Boolean) {
    val n = if (horizontal) w else h
    val lines = if (horizontal) h else w
    val win = 2 * r + 1
    for (l in 0 until lines) {
      fun at(i: Int): Int {
        val c = i.coerceIn(0, n - 1)
        return if (horizontal) src[l * w + c] else src[c * w + l]
      }
      var a = 0; var red = 0; var g = 0; var b = 0
      for (i in -r..r) {
        val c = at(i)
        a += c ushr 24; red += (c shr 16) and 255; g += (c shr 8) and 255; b += c and 255
      }
      for (i in 0 until n) {
        dst[if (horizontal) l * w + i else i * w + l] = ((a / win) shl 24) or ((red / win) shl 16) or ((g / win) shl 8) or (b / win)
        val add = at(i + r + 1)
        val sub = at(i - r)
        a += (add ushr 24) - (sub ushr 24)
        red += ((add shr 16) and 255) - ((sub shr 16) and 255)
        g += ((add shr 8) and 255) - ((sub shr 8) and 255)
        b += (add and 255) - (sub and 255)
      }
    }
  }
}
