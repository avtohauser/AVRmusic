// Soft backdrops behind the player and album pages. The cover is decoded tiny, blurred once on the CPU
// and cached, and the GPU's filtering scales it up smooth — instead of a full-screen blur that is
// redrawn on every frame.
package space.avthsr.music.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

@Composable
expect fun BlurredCover(url: String?, modifier: Modifier = Modifier, alpha: Float = 1f)

/** The blurred image's width in pixels. */
const val BLUR_WIDTH = 40

/** Blurs ARGB pixels in place: three box passes each way come close to a gaussian. */
fun softBlur(px: IntArray, w: Int, h: Int) {
  val tmp = IntArray(px.size)
  repeat(3) {
    pass(px, tmp, w, h, 3, horizontal = true)
    pass(tmp, px, w, h, 3, horizontal = false)
  }
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
