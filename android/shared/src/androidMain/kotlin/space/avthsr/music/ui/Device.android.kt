// Sharing a picture through a FileProvider and recording from the microphone with MediaRecorder.
package space.avthsr.music.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.media.MediaRecorder
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import space.avthsr.music.Platform
import java.io.File

actual fun shareImage(bitmap: ImageBitmap, title: String) {
  val ctx = Platform.context
  val dir = File(ctx.cacheDir, "shared").apply { mkdirs() }
  dir.listFiles()?.forEach { it.delete() }
  val f = File(dir, "avrmusic-${System.currentTimeMillis()}.png")
  f.outputStream().use { bitmap.asAndroidBitmap().compress(Bitmap.CompressFormat.PNG, 100, it) }
  val uri = FileProvider.getUriForFile(ctx, ctx.packageName + ".files", f)
  val send = Intent(Intent.ACTION_SEND).setType("image/png").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
  ctx.startActivity(Intent.createChooser(send, title).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION))
}

@Composable
actual fun rememberRecorder(): Recorder {
  val context = LocalContext.current
  val waiting = remember { arrayOfNulls<CompletableDeferred<Boolean>>(1) }
  val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { ok -> waiting[0]?.complete(ok) }
  val ask by rememberUpdatedState(launcher)
  return remember {
    object : Recorder {
      override suspend fun record(ms: Long, level: (Float) -> Unit): Recording? {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
          val d = CompletableDeferred<Boolean>()
          waiting[0] = d
          ask.launch(Manifest.permission.RECORD_AUDIO)
          if (!d.await()) return null
        }
        val file = File(context.cacheDir, "recognize.m4a")
        @Suppress("DEPRECATION")
        val rec = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(context) else MediaRecorder()
        try {
          rec.setAudioSource(MediaRecorder.AudioSource.MIC)
          rec.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
          rec.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
          rec.setAudioSamplingRate(44_100)
          rec.setAudioEncodingBitRate(128_000)
          rec.setAudioChannels(1)
          rec.setOutputFile(file.absolutePath)
          rec.prepare()
          rec.start()
          val until = System.currentTimeMillis() + ms
          while (System.currentTimeMillis() < until) {
            delay(90)
            level((rec.maxAmplitude / 20_000f).coerceIn(0f, 1f))
          }
          rec.stop()
        } catch (e: Exception) {
          return null
        } finally {
          rec.release()
        }
        val bytes = withContext(Dispatchers.IO) { file.readBytes() }
        return Recording(bytes, "recognize.m4a", "audio/mp4")
      }
    }
  }
}
