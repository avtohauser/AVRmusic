package space.avthsr.music.ui

import coil3.SingletonImageLoader
import coil3.request.ImageRequest
import coil3.request.SuccessResult
import coil3.toBitmap
import space.avthsr.music.api.Api

actual suspend fun coverPixels(url: String, size: Int): IntArray? = runCatching {
  val loader = SingletonImageLoader.get(coil3.PlatformContext.INSTANCE)
  val r = loader.execute(ImageRequest.Builder(coil3.PlatformContext.INSTANCE).data(url).size(size).build()) as? SuccessResult ?: return@runCatching null
  val bmp = r.image.toBitmap()
  val w = bmp.width
  val h = bmp.height
  val rgba = scaledRgba(bmp, w, h) ?: return@runCatching null
  IntArray(w * h) { i ->
    val o = i * 4
    (255 shl 24) or ((rgba[o].toInt() and 255) shl 16) or ((rgba[o + 1].toInt() and 255) shl 8) or (rgba[o + 2].toInt() and 255)
  }
}.getOrNull()
