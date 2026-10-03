@file:OptIn(ExperimentalForeignApi::class, BetaInteropApi::class)

// The shared app on iOS: NSUserDefaults, the share sheet and pasteboard, Files for downloads, the photo
// and document pickers.
package space.avthsr.music

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import io.ktor.client.HttpClient
import io.ktor.client.HttpClientConfig
import io.ktor.client.engine.darwin.Darwin
import io.ktor.client.request.prepareGet
import io.ktor.client.statement.bodyAsChannel
import io.ktor.http.isSuccess
import io.ktor.utils.io.readAvailable
import kotlinx.cinterop.BetaInteropApi
import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.alloc
import kotlinx.cinterop.memScoped
import kotlinx.cinterop.ptr
import kotlinx.cinterop.toKString
import kotlinx.cinterop.useContents
import kotlinx.cinterop.usePinned
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.io.buffered
import kotlinx.io.files.Path
import kotlinx.io.files.SystemFileSystem
import kotlinx.io.readByteArray
import platform.CoreGraphics.CGRectMake
import platform.CoreGraphics.CGSizeMake
import platform.Foundation.NSBundle
import platform.Foundation.NSCalendar
import platform.Foundation.NSCalendarUnitDay
import platform.Foundation.NSCalendarUnitHour
import platform.Foundation.NSCalendarUnitMinute
import platform.Foundation.NSCalendarUnitMonth
import platform.Foundation.NSCalendarUnitYear
import platform.Foundation.NSData
import platform.Foundation.NSDate
import platform.Foundation.NSFileManager
import platform.Foundation.NSFileSize
import platform.Foundation.NSNumber
import platform.Foundation.NSSearchPathForDirectoriesInDomains
import platform.Foundation.NSApplicationSupportDirectory
import platform.Foundation.NSDocumentDirectory
import platform.Foundation.NSTemporaryDirectory
import platform.Foundation.NSURL
import platform.Foundation.NSUUID
import platform.Foundation.NSUserDefaults
import platform.Foundation.NSUserDomainMask
import platform.Foundation.create
import platform.Foundation.dateWithTimeIntervalSince1970
import platform.Foundation.timeIntervalSince1970
import platform.Foundation.writeToFile
import platform.UIKit.UIAccessibilityIsReduceMotionEnabled
import platform.UIKit.UIActivityViewController
import platform.UIKit.UIApplication
import platform.UIKit.UIDevice
import platform.UIKit.UIDocumentPickerDelegateProtocol
import platform.UIKit.UIDocumentPickerViewController
import platform.UIKit.UIGraphicsImageRenderer
import platform.UIKit.UIGraphicsImageRendererFormat
import platform.UIKit.UIImage
import platform.UIKit.UIImageJPEGRepresentation
import platform.UIKit.UIImagePickerController
import platform.UIKit.UIImagePickerControllerDelegateProtocol
import platform.UIKit.UIImagePickerControllerImageURL
import platform.UIKit.UIImagePickerControllerMediaURL
import platform.UIKit.UIImagePickerControllerOriginalImage
import platform.UIKit.UIImagePickerControllerSourceType
import platform.UIKit.UINavigationControllerDelegateProtocol
import platform.UIKit.UIPasteboard
import platform.UIKit.UIViewController
import platform.UIKit.popoverPresentationController
import platform.UniformTypeIdentifiers.UTTypeAudio
import platform.UniformTypeIdentifiers.UTTypeData
import platform.UniformTypeIdentifiers.UTTypeItem
import platform.UniformTypeIdentifiers.UTTypePlainText
import platform.UniformTypeIdentifiers.UTTypeText
import platform.darwin.NSObject
import platform.posix.memcpy
import platform.posix.uname
import platform.posix.utsname
import space.avthsr.music.api.Api

actual object Platform {
  actual val name: String = "iOS"
  /** "0.1.0.36": the marketing version and the build number, as the Android app shows it */
  actual val version: String
    get() {
      val short = NSBundle.mainBundle.objectForInfoDictionaryKey("CFBundleShortVersionString") as? String ?: ""
      val build = NSBundle.mainBundle.objectForInfoDictionaryKey("CFBundleVersion") as? String ?: ""
      return if (build.isEmpty() || build == "1") short else "$short.$build"
    }
  actual val device: String
    get() {
      val machine = memScoped { val u = alloc<utsname>(); uname(u.ptr); u.machine.toKString() }
      return "Apple $machine, iOS ${UIDevice.currentDevice.systemVersion}"
    }
  actual val hasDynamicColors: Boolean = false
  actual val dataDir: String by lazy {
    val dir = NSSearchPathForDirectoriesInDomains(NSApplicationSupportDirectory, NSUserDomainMask, true).first() as String
    NSFileManager.defaultManager.createDirectoryAtPath(dir, true, null, null)
    dir
  }

  actual fun nowMs(): Long = (NSDate().timeIntervalSince1970 * 1000).toLong()

  actual fun animationsOff(): Boolean = UIAccessibilityIsReduceMotionEnabled()

  actual fun share(text: String, title: String) {
    val top = topController() ?: return
    val sheet = UIActivityViewController(activityItems = listOf(text), applicationActivities = null)
    sheet.popoverPresentationController?.sourceView = top.view
    top.presentViewController(sheet, animated = true, completion = null)
  }

  actual fun copy(text: String) {
    UIPasteboard.generalPasteboard.string = text
  }

  /** Into the app's Documents/AVRmusic folder, which the Files app shows ("On My iPhone → AVRmusic"). */
  actual fun download(url: String, fileName: String, onError: (String) -> Unit) {
    val docs = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, true).first() as String
    val dir = "$docs/AVRmusic"
    NSFileManager.defaultManager.createDirectoryAtPath(dir, true, null, null)
    App.scope.launch {
      runCatching {
        withContext(Dispatchers.IO) {
          Api.http.prepareGet(url).execute { r ->
            if (!r.status.isSuccess()) error("HTTP ${r.status.value}")
            val input = r.bodyAsChannel()
            SystemFileSystem.sink(Path("$dir/$fileName")).buffered().use { out ->
              val buf = ByteArray(64 * 1024)
              while (true) {
                val n = input.readAvailable(buf, 0, buf.size)
                if (n < 0) break
                if (n == 0) { if (input.isClosedForRead) break else continue }
                out.write(buf, 0, n)
              }
            }
          }
        }
      }.onSuccess { App.say(tr("Сохранено в «Файлы» → AVRmusic: {}", fileName)) }
        .onFailure { App.say(tr("Не удалось скачать: {}", it.message)) }
    }
  }

  fun topController(): UIViewController? {
    var c = UIApplication.sharedApplication.keyWindow?.rootViewController
    while (c?.presentedViewController != null) c = c.presentedViewController
    return c
  }
}

actual fun localTime(epochMs: Long): LocalTime {
  val date = NSDate.dateWithTimeIntervalSince1970(epochMs / 1000.0)
  val units = NSCalendarUnitYear or NSCalendarUnitMonth or NSCalendarUnitDay or NSCalendarUnitHour or NSCalendarUnitMinute
  val c = NSCalendar.currentCalendar.components(units, fromDate = date)
  return LocalTime(c.year.toInt(), c.month.toInt(), c.day.toInt(), c.hour.toInt(), c.minute.toInt())
}

actual fun keyValues(name: String): KeyValues = object : KeyValues {
  private val d = NSUserDefaults.standardUserDefaults
  private fun k(key: String) = "$name.$key"
  override fun string(key: String) = d.stringForKey(k(key))
  override fun bool(key: String) = (d.objectForKey(k(key)) as? NSNumber)?.boolValue
  override fun int(key: String) = (d.objectForKey(k(key)) as? NSNumber)?.intValue
  override fun float(key: String) = (d.objectForKey(k(key)) as? NSNumber)?.floatValue
  override fun write(changes: Map<String, Any?>) {
    changes.forEach { (key, v) ->
      when (v) {
        null -> d.removeObjectForKey(k(key))
        is String -> d.setObject(v, k(key))
        is Boolean -> d.setBool(v, k(key))
        is Int -> d.setInteger(v.toLong(), k(key))
        is Long -> d.setInteger(v, k(key))
        is Float -> d.setFloat(v, k(key))
        else -> d.setObject(v.toString(), k(key))
      }
    }
  }
}

actual fun httpClient(config: HttpClientConfig<*>.() -> Unit): HttpClient = HttpClient(Darwin, config)

/* ---------- files ---------- */

fun ByteArray.toNSData(): NSData = usePinned { NSData.create(bytes = it.addressOf(0), length = size.toULong()) }

fun NSData.toByteArray(): ByteArray {
  val out = ByteArray(length.toInt())
  if (out.isNotEmpty()) out.usePinned { memcpy(it.addressOf(0), bytes, length) }
  return out
}

private val MIME = mapOf(
  "mp3" to "audio/mpeg", "m4a" to "audio/mp4", "aac" to "audio/aac", "flac" to "audio/flac", "wav" to "audio/wav",
  "ogg" to "audio/ogg", "opus" to "audio/ogg", "aiff" to "audio/aiff", "aif" to "audio/aiff",
  "jpg" to "image/jpeg", "jpeg" to "image/jpeg", "png" to "image/png", "heic" to "image/heic", "gif" to "image/gif", "webp" to "image/webp",
  "mp4" to "video/mp4", "mov" to "video/quicktime", "m4v" to "video/mp4", "webm" to "video/webm",
  "txt" to "text/plain", "lrc" to "text/plain",
)

private fun pickedFile(path: String): PickedFile {
  val name = path.substringAfterLast('/')
  val size = (NSFileManager.defaultManager.attributesOfItemAtPath(path, null)?.get(NSFileSize) as? NSNumber)?.longLongValue ?: -1L
  return PickedFile(name, MIME[name.substringAfterLast('.', "").lowercase()], size) { SystemFileSystem.source(Path(path)).buffered() }
}

/** Holds the picker's delegate (UIKit keeps delegates weakly) and presents the pickers. */
private class Pickers {
  private var delegate: NSObject? = null

  fun open(kind: Pick, done: (List<PickedFile>) -> Unit) {
    val top = Platform.topController() ?: return
    when (kind) {
      Pick.IMAGE, Pick.VIDEO -> {
        val d = MediaDelegate { delegate = null; done(it) }
        delegate = d
        val picker = UIImagePickerController()
        picker.sourceType = UIImagePickerControllerSourceType.UIImagePickerControllerSourceTypePhotoLibrary
        picker.mediaTypes = listOf(if (kind == Pick.IMAGE) "public.image" else "public.movie")
        picker.delegate = d
        top.presentViewController(picker, animated = true, completion = null)
      }
      else -> {
        val types = when (kind) {
          Pick.AUDIO_FILES -> listOf(UTTypeAudio)
          Pick.TEXT_FILE -> listOf(UTTypePlainText, UTTypeText, UTTypeData)
          else -> listOf(UTTypeText, UTTypeData, UTTypeItem)
        }
        val d = DocumentDelegate { delegate = null; done(it) }
        delegate = d
        val picker = UIDocumentPickerViewController(forOpeningContentTypes = types, asCopy = true)
        picker.allowsMultipleSelection = kind == Pick.AUDIO_FILES
        picker.delegate = d
        top.presentViewController(picker, animated = true, completion = null)
      }
    }
  }
}

private class DocumentDelegate(private val done: (List<PickedFile>) -> Unit) : NSObject(), UIDocumentPickerDelegateProtocol {
  override fun documentPicker(controller: UIDocumentPickerViewController, didPickDocumentsAtURLs: List<*>) {
    done(didPickDocumentsAtURLs.mapNotNull { (it as? NSURL)?.path?.let(::pickedFile) })
  }

  override fun documentPickerWasCancelled(controller: UIDocumentPickerViewController) = done(emptyList())
}

private class MediaDelegate(private val done: (List<PickedFile>) -> Unit) : NSObject(), UIImagePickerControllerDelegateProtocol, UINavigationControllerDelegateProtocol {
  override fun imagePickerController(picker: UIImagePickerController, didFinishPickingMediaWithInfo: Map<Any?, *>) {
    picker.dismissViewControllerAnimated(true, null)
    val url = (didFinishPickingMediaWithInfo[UIImagePickerControllerImageURL] ?: didFinishPickingMediaWithInfo[UIImagePickerControllerMediaURL]) as? NSURL
    val path = url?.path ?: (didFinishPickingMediaWithInfo[UIImagePickerControllerOriginalImage] as? UIImage)?.let { img ->
      val p = NSTemporaryDirectory() + NSUUID().UUIDString + ".jpg"
      UIImageJPEGRepresentation(img, 0.95)?.writeToFile(p, true)
      p
    }
    done(listOfNotNull(path?.let(::pickedFile)))
  }

  override fun imagePickerControllerDidCancel(picker: UIImagePickerController) {
    picker.dismissViewControllerAnimated(true, null)
    done(emptyList())
  }
}

@Composable
actual fun rememberPicker(kind: Pick, onPicked: (List<PickedFile>) -> Unit): () -> Unit {
  val done = rememberUpdatedState(onPicked)
  val pickers = remember { Pickers() }
  return remember(kind) { { pickers.open(kind) { list -> if (list.isNotEmpty()) done.value(list) } } }
}

actual suspend fun squareJpeg(file: PickedFile, size: Int): ByteArray {
  val bytes = withContext(Dispatchers.IO) { file.open().use { it.readByteArray() } }
  val img = UIImage(data = bytes.toNSData())
  val (w, h) = img.size.useContents { width to height }
  if (w <= 0.0 || h <= 0.0) error(tr("Не удалось открыть фото"))
  val side = minOf(w, h)
  val target = minOf(size.toDouble(), side)
  val format = UIGraphicsImageRendererFormat()
  format.scale = 1.0
  val renderer = UIGraphicsImageRenderer(size = CGSizeMake(target, target), format = format)
  val out = renderer.imageWithActions { _ ->
    val k = target / side
    img.drawInRect(CGRectMake((target - w * k) / 2, (target - h * k) / 2, w * k, h * k))
  }
  return UIImageJPEGRepresentation(out, 0.9)?.toByteArray() ?: error(tr("Не удалось открыть фото"))
}
