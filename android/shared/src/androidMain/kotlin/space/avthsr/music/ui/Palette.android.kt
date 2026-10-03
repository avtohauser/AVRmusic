package space.avthsr.music.ui

import coil3.SingletonImageLoader
import coil3.request.ImageRequest
import coil3.request.SuccessResult
import coil3.request.allowHardware
import coil3.toBitmap
import space.avthsr.music.Platform

actual suspend fun coverPixels(url: String, size: Int): IntArray? = runCatching {
  val context = Platform.context
  val req = ImageRequest.Builder(context).data(url).size(size).allowHardware(false).build()
  val r = SingletonImageLoader.get(context).execute(req) as? SuccessResult ?: return@runCatching null
  val bmp = r.image.toBitmap()
  val pixels = IntArray(bmp.width * bmp.height)
  bmp.getPixels(pixels, 0, bmp.width, 0, 0, bmp.width, bmp.height)
  pixels
}.getOrNull()
