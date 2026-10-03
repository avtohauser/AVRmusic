package space.avthsr.music.ui

import android.graphics.Bitmap
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import coil3.compose.AsyncImage
import coil3.compose.LocalPlatformContext
import coil3.request.ImageRequest
import coil3.request.allowHardware
import coil3.request.transformations
import coil3.size.Size
import coil3.transform.Transformation
import space.avthsr.music.api.Api
import kotlin.math.max
import kotlin.math.roundToInt

@Composable
actual fun BlurredCover(url: String?, modifier: Modifier, alpha: Float) {
  val context = LocalPlatformContext.current
  val src = Api.img(url) ?: return
  val request = remember(src) {
    ImageRequest.Builder(context).data(src).size(160).allowHardware(false).transformations(SoftBlur).build()
  }
  AsyncImage(model = request, contentDescription = null, contentScale = ContentScale.Crop, alpha = alpha, modifier = modifier)
}

private object SoftBlur : Transformation() {
  override val cacheKey = "soft-blur-1"

  override suspend fun transform(input: Bitmap, size: Size): Bitmap {
    val w = BLUR_WIDTH
    val h = max(1, (input.height * w.toFloat() / input.width).roundToInt())
    val small = Bitmap.createScaledBitmap(input, w, h, true)
    val px = IntArray(w * h)
    small.getPixels(px, 0, w, 0, 0, w, h)
    softBlur(px, w, h)
    return Bitmap.createBitmap(px, w, h, Bitmap.Config.ARGB_8888)
  }
}
