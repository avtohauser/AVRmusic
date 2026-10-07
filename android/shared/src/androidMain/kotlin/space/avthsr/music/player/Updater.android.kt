// Updates on Android: the new APK is downloaded into the app's cache and handed to the system's package
// installer as an update of this app. Android asks to confirm the first time (and to allow installing
// from avr music); once the app has installed itself, later updates go through quietly (Android 12+).
package space.avthsr.music.player

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import space.avthsr.music.App
import space.avthsr.music.Platform
import space.avthsr.music.shared.R
import space.avthsr.music.tr
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

actual object Updater {
  private const val ACTION_STATUS = "space.avthsr.music.UPDATE_STATUS"
  private const val CHANNEL = "friends"
  actual val supported: Boolean = true
  private val _progress = MutableStateFlow<Float?>(null)
  actual val progress: StateFlow<Float?> = _progress.asStateFlow()
  private val lock = Mutex()
  private var listening = false

  actual suspend fun install(rel: AppRelease, background: Boolean) = lock.withLock {
    val ctx = Platform.context
    // in the background only on Wi-Fi; the notification already offers it otherwise
    if (background && !Net.unmetered.value) return@withLock
    if (Build.VERSION.SDK_INT >= 26 && !ctx.packageManager.canRequestPackageInstalls()) {
      val allow = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${ctx.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      if (background || !App.visible) notifyTap(allow, tr("Разрешите avr music ставить обновления"), tr("Один раз — дальше приложение будет обновляться само"))
      else { ctx.startActivity(allow); App.say(tr("Разрешите установку обновлений и нажмите «Обновить» ещё раз")) }
      return@withLock
    }
    val file = try { download(rel) } catch (e: Exception) {
      _progress.value = null
      if (!background) App.say(tr("Не удалось скачать обновление: {}", e.message ?: ""))
      return@withLock
    }
    withContext(Dispatchers.IO) { commit(ctx, file) }
  }

  private suspend fun download(rel: AppRelease): File = withContext(Dispatchers.IO) {
    val dir = File(Platform.context.cacheDir, "update").apply { mkdirs() }
    val file = File(dir, "avr-music-${rel.version}.apk")
    dir.listFiles()?.filter { it.name != file.name }?.forEach { it.delete() }
    if (file.exists() && rel.size > 0 && file.length() == rel.size) return@withContext file
    val part = File(dir, "${file.name}.part")
    _progress.value = 0f
    val c = URL(rel.url).openConnection() as HttpURLConnection
    c.connectTimeout = 20_000
    c.readTimeout = 60_000
    c.instanceFollowRedirects = true
    try {
      if (c.responseCode !in 200..299) throw IllegalStateException("HTTP ${c.responseCode}")
      val total = c.getHeaderField("Content-Length")?.toLongOrNull()?.takeIf { it > 0 } ?: rel.size
      c.inputStream.use { input ->
        part.outputStream().use { out ->
          val buf = ByteArray(64 * 1024)
          var done = 0L
          while (true) {
            val n = input.read(buf)
            if (n < 0) break
            out.write(buf, 0, n)
            done += n
            if (total > 0) _progress.value = (done.toFloat() / total).coerceIn(0f, 1f)
          }
        }
      }
    } finally { c.disconnect() }
    if (!part.renameTo(file)) throw IllegalStateException("cannot save the update")
    _progress.value = null
    file
  }

  /** Hands the APK to the system as an update of this app; its answer comes to [onStatus]. */
  private fun commit(ctx: Context, file: File) {
    listen(ctx)
    val installer = ctx.packageManager.packageInstaller
    val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
      setAppPackageName(ctx.packageName)
      if (Build.VERSION.SDK_INT >= 31) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
    }
    val id = installer.createSession(params)
    installer.openSession(id).use { s ->
      s.openWrite("base.apk", 0, file.length()).use { out -> file.inputStream().use { it.copyTo(out) }; s.fsync(out) }
      val flags = PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
      val status = PendingIntent.getBroadcast(ctx, id, Intent(ACTION_STATUS).setPackage(ctx.packageName), flags)
      s.commit(status.intentSender)
    }
  }

  private fun listen(ctx: Context) {
    if (listening) return
    listening = true
    ContextCompat.registerReceiver(ctx.applicationContext, object : BroadcastReceiver() {
      override fun onReceive(c: Context, intent: Intent) = onStatus(c, intent)
    }, IntentFilter(ACTION_STATUS), ContextCompat.RECEIVER_NOT_EXPORTED)
  }

  private fun onStatus(ctx: Context, intent: Intent) {
    when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
      PackageInstaller.STATUS_PENDING_USER_ACTION -> {
        @Suppress("DEPRECATION")
        val confirm = (if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java) else intent.getParcelableExtra(Intent.EXTRA_INTENT)) ?: return
        confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (App.visible) runCatching { ctx.startActivity(confirm) }.onFailure { notifyTap(confirm, tr("Обновление скачано"), tr("Нажмите, чтобы установить")) }
        else notifyTap(confirm, tr("Обновление avr music скачано"), tr("Нажмите, чтобы установить"))
      }
      PackageInstaller.STATUS_SUCCESS -> {}
      PackageInstaller.STATUS_FAILURE_ABORTED -> {}
      else -> {
        val msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE).orEmpty()
        if (App.visible) App.say(tr("Обновление не установилось: {}", msg))
      }
    }
  }

  private fun notifyTap(target: Intent, title: String, body: String) {
    val ctx = Platform.context
    val pi = PendingIntent.getActivity(ctx, 7301, target, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val note = NotificationCompat.Builder(ctx, CHANNEL)
      .setSmallIcon(R.drawable.ic_campaign)
      .setContentTitle(title)
      .setContentText(body)
      .setContentIntent(pi)
      .setAutoCancel(true)
      .build()
    runCatching { ctx.getSystemService(NotificationManager::class.java)?.notify(7301, note) }
  }
}
