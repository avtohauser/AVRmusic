// Files picked on the phone (audio, images, cookies.txt) streamed to the server without loading them
// into memory.
package space.avthsr.music.api

import space.avthsr.music.tr
import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import okhttp3.MediaType
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okio.BufferedSink
import okio.source

class UriBody(private val context: Context, private val uri: Uri) : RequestBody() {
  override fun contentType(): MediaType? = context.contentResolver.getType(uri)?.toMediaTypeOrNull()
  override fun contentLength(): Long =
    runCatching { context.contentResolver.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: -1L }.getOrDefault(-1L)
  override fun writeTo(sink: BufferedSink) {
    val input = context.contentResolver.openInputStream(uri) ?: error(tr("Не удалось открыть файл"))
    input.source().use { sink.writeAll(it) }
  }
}

/** The file's name as the phone shows it. */
fun displayName(context: Context, uri: Uri): String =
  runCatching {
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
      if (c.moveToFirst()) c.getString(0) else null
    }
  }.getOrNull() ?: uri.lastPathSegment?.substringAfterLast('/') ?: "file"

fun MultipartBody.Builder.addFile(context: Context, uri: Uri, field: String = "file"): MultipartBody.Builder =
  addFormDataPart(field, displayName(context, uri), UriBody(context, uri))

/** Reads an image, crops the centre square and scales it to [size] px, as JPEG. */
fun squareJpeg(context: Context, uri: Uri, size: Int): ByteArray {
  val src = context.contentResolver.openInputStream(uri)?.use { android.graphics.BitmapFactory.decodeStream(it) } ?: error(tr("Не удалось открыть фото"))
  val side = minOf(src.width, src.height)
  val square = android.graphics.Bitmap.createBitmap(src, (src.width - side) / 2, (src.height - side) / 2, side, side)
  val scaled = android.graphics.Bitmap.createScaledBitmap(square, minOf(size, side), minOf(size, side), true)
  return java.io.ByteArrayOutputStream().use { out -> scaled.compress(android.graphics.Bitmap.CompressFormat.JPEG, 90, out); out.toByteArray() }
}
