@file:OptIn(ExperimentalForeignApi::class)

// Sharing a picture through the system share sheet and recording from the microphone with AVAudioRecorder.
package space.avthsr.music.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asSkiaBitmap
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.suspendCancellableCoroutine
import org.jetbrains.skia.EncodedImageFormat
import org.jetbrains.skia.Image
import platform.AVFAudio.AVAudioQualityHigh
import platform.AVFAudio.AVAudioRecorder
import platform.AVFAudio.AVAudioSession
import platform.AVFAudio.AVAudioSessionCategoryPlayAndRecord
import platform.AVFAudio.AVAudioSessionCategoryOptionDefaultToSpeaker
import platform.AVFAudio.AVAudioSessionCategoryPlayback
import platform.AVFAudio.AVEncoderAudioQualityKey
import platform.AVFAudio.AVFormatIDKey
import platform.AVFAudio.AVNumberOfChannelsKey
import platform.AVFAudio.AVSampleRateKey
import platform.CoreAudioTypes.kAudioFormatMPEG4AAC
import platform.Foundation.NSFileManager
import platform.Foundation.NSNumber
import platform.Foundation.NSTemporaryDirectory
import platform.Foundation.NSURL
import platform.UIKit.UIActivityViewController
import platform.UIKit.UIImage
import platform.UIKit.popoverPresentationController
import space.avthsr.music.Platform
import space.avthsr.music.toByteArray
import space.avthsr.music.toNSData
import kotlin.coroutines.resume

actual fun shareImage(bitmap: ImageBitmap, title: String) {
  val png = Image.makeFromBitmap(bitmap.asSkiaBitmap()).encodeToData(EncodedImageFormat.PNG)?.bytes ?: return
  val image = UIImage(data = png.toNSData())
  val top = Platform.topController() ?: return
  val sheet = UIActivityViewController(activityItems = listOf(image), applicationActivities = null)
  sheet.popoverPresentationController?.sourceView = top.view
  top.presentViewController(sheet, animated = true, completion = null)
}

private class IosRecorder : Recorder {
  override suspend fun record(ms: Long, level: (Float) -> Unit): Recording? {
    val session = AVAudioSession.sharedInstance()
    val granted = suspendCancellableCoroutine { c -> session.requestRecordPermission { ok -> c.resume(ok) } }
    if (!granted) return null
    val path = NSTemporaryDirectory() + "recognize.m4a"
    val settings = mapOf<Any?, Any?>(
      AVFormatIDKey to NSNumber(unsignedInt = kAudioFormatMPEG4AAC),
      AVSampleRateKey to NSNumber(double = 44_100.0),
      AVNumberOfChannelsKey to NSNumber(int = 1),
      AVEncoderAudioQualityKey to NSNumber(long = AVAudioQualityHigh),
    )
    try {
      session.setCategory(AVAudioSessionCategoryPlayAndRecord, withOptions = AVAudioSessionCategoryOptionDefaultToSpeaker, error = null)
      session.setActive(true, error = null)
      val rec = AVAudioRecorder(uRL = NSURL.fileURLWithPath(path), settings = settings, error = null)
      rec.meteringEnabled = true
      if (!rec.record()) return null
      var left = ms
      while (left > 0) {
        delay(90)
        left -= 90
        rec.updateMeters()
        val db = rec.averagePowerForChannel(0u)
        level(((db + 50f) / 50f).coerceIn(0f, 1f))
      }
      rec.stop()
    } finally {
      // back to playing music in the background
      session.setCategory(AVAudioSessionCategoryPlayback, error = null)
    }
    val bytes = NSFileManager.defaultManager.contentsAtPath(path)?.toByteArray() ?: return null
    return Recording(bytes, "recognize.m4a", "audio/mp4")
  }
}

@Composable
actual fun rememberRecorder(): Recorder = remember { IosRecorder() }
