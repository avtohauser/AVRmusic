// The shared app on Android: the application context, SharedPreferences, the system share sheet,
// clipboard and downloader, and the document pickers.
package space.avthsr.music

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.OpenableColumns
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import io.ktor.client.HttpClient
import io.ktor.client.HttpClientConfig
import io.ktor.client.engine.okhttp.OkHttp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.io.Source
import kotlinx.io.asInputStream
import kotlinx.io.asSource
import kotlinx.io.buffered
import java.util.Calendar

@SuppressLint("StaticFieldLeak") // the application context, which lives as long as the process
actual object Platform {
  lateinit var context: Context
    private set

  /** Called first thing in Application.onCreate. */
  fun attach(app: Context, versionName: String) {
    context = app.applicationContext
    appVersion = versionName
  }

  private var appVersion = ""

  actual val name: String = "Android"
  actual val version: String get() = appVersion
  actual val device: String
    get() = "${Build.MANUFACTURER} ${Build.MODEL}, Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})"
  actual val hasDynamicColors: Boolean = Build.VERSION.SDK_INT >= 31
  actual val dataDir: String get() = context.filesDir.absolutePath

  actual fun nowMs(): Long = System.currentTimeMillis()

  actual fun animationsOff(): Boolean =
    runCatching { Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f }.getOrDefault(false)

  actual fun share(text: String, title: String) {
    val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
    context.startActivity(Intent.createChooser(send, title).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
  }

  actual fun copy(text: String) {
    val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    cm.setPrimaryClip(ClipData.newPlainText("AVRmusic", text))
  }

  actual fun openUrl(url: String) {
    runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
  }

  /** Downloads/AVRmusic through the system downloader (Android 10+ needs no permission for it). */
  actual fun download(url: String, fileName: String, onError: (String) -> Unit) {
    runCatching {
      val name = "AVRmusic/$fileName"
      val req = DownloadManager.Request(Uri.parse(url))
        .setTitle(fileName)
        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
      if (Build.VERSION.SDK_INT >= 29) req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
      else req.setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, name)
      (context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(req)
    }.onFailure { onError(it.message ?: it.toString()) }
  }
}

actual fun localTime(epochMs: Long): LocalTime {
  val c = Calendar.getInstance().apply { timeInMillis = epochMs }
  return LocalTime(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH), c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE))
}

actual fun keyValues(name: String): KeyValues = object : KeyValues {
  private val p = Platform.context.getSharedPreferences(name, Context.MODE_PRIVATE)
  private inline fun <T> read(key: String, get: () -> T): T? = if (p.contains(key)) runCatching(get).getOrNull() else null
  override fun string(key: String) = read(key) { p.getString(key, null) }
  override fun bool(key: String) = read(key) { p.getBoolean(key, false) }
  override fun int(key: String) = read(key) { p.getInt(key, 0) }
  override fun float(key: String) = read(key) { p.getFloat(key, 0f) }
  override fun write(changes: Map<String, Any?>) {
    val e = p.edit()
    changes.forEach { (k, v) ->
      when (v) {
        null -> e.remove(k)
        is String -> e.putString(k, v)
        is Boolean -> e.putBoolean(k, v)
        is Int -> e.putInt(k, v)
        is Float -> e.putFloat(k, v)
        is Long -> e.putLong(k, v)
        else -> e.putString(k, v.toString())
      }
    }
    e.apply()
  }
}

actual fun httpClient(config: HttpClientConfig<*>.() -> Unit): HttpClient = HttpClient(OkHttp, config)

private fun picked(context: Context, uri: Uri): PickedFile {
  val cr = context.contentResolver
  var name: String? = null
  var size = -1L
  runCatching {
    cr.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
      if (c.moveToFirst()) {
        name = c.getString(0)
        if (!c.isNull(1)) size = c.getLong(1)
      }
    }
  }
  if (size < 0) size = runCatching { cr.openAssetFileDescriptor(uri, "r")?.use { it.length } ?: -1L }.getOrDefault(-1L)
  return PickedFile(
    name = name ?: uri.lastPathSegment?.substringAfterLast('/') ?: "file",
    mime = cr.getType(uri),
    size = size,
    open = { (cr.openInputStream(uri) ?: error(tr("Не удалось открыть файл"))).asSource().buffered() },
  )
}

@Composable
actual fun rememberPicker(kind: Pick, onPicked: (List<PickedFile>) -> Unit): () -> Unit {
  val context = LocalContext.current
  val done = rememberUpdatedState(onPicked)
  val open: () -> Unit
  when (kind) {
    Pick.AUDIO_FILES -> {
      val l = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { list ->
        if (list.isNotEmpty()) done.value(list.map { picked(context, it) })
      }
      open = { l.launch("audio/*") }
    }
    Pick.IMAGE, Pick.VIDEO -> {
      val l = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) done.value(listOf(picked(context, uri)))
      }
      val type = if (kind == Pick.IMAGE) "image/*" else "video/*"
      open = { l.launch(type) }
    }
    Pick.TEXT_FILE, Pick.LYRICS_FILE -> {
      val l = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) done.value(listOf(picked(context, uri)))
      }
      val types = if (kind == Pick.TEXT_FILE) arrayOf("text/plain", "text/*", "application/octet-stream", "*/*")
      else arrayOf("text/*", "application/octet-stream", "*/*")
      open = { l.launch(types) }
    }
  }
  return open
}

actual suspend fun squareJpeg(file: PickedFile, size: Int): ByteArray = withContext(Dispatchers.Default) {
  val src = file.open().asInputStream().use { android.graphics.BitmapFactory.decodeStream(it) } ?: error(tr("Не удалось открыть фото"))
  val side = minOf(src.width, src.height)
  val square = android.graphics.Bitmap.createBitmap(src, (src.width - side) / 2, (src.height - side) / 2, side, side)
  val scaled = android.graphics.Bitmap.createScaledBitmap(square, minOf(size, side), minOf(size, side), true)
  java.io.ByteArrayOutputStream().use { out -> scaled.compress(android.graphics.Bitmap.CompressFormat.JPEG, 90, out); out.toByteArray() }
}
