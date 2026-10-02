// News from the admin: kept here for the screens (what is unread), checked in the background every
// 15 minutes and shown as a notification, like a message from the app.
package space.avthsr.music.api

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import space.avthsr.music.MainActivity
import space.avthsr.music.R
import space.avthsr.music.tr
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.concurrent.TimeUnit

suspend fun Api.news(after: String? = null): List<NewsItem> = get("/api/news" + (after?.let { "?after=${enc(it)}" } ?: ""))

suspend fun Api.postNews(title: String, body: String): NewsItem =
  json.decodeFromString(NewsItem.serializer(), call("POST", "/api/admin/news", buildJsonObject { put("title", title.trim()); put("body", body.trim()) }.toString()))

suspend fun Api.deleteNews(id: String) { call("DELETE", "/api/admin/news/${enc(id)}") }

object News {
  private const val CHANNEL = "news"
  val items = MutableStateFlow<List<NewsItem>>(emptyList())
  /** the newest news the listener has seen in the app (an ISO time) */
  val seen = MutableStateFlow("")

  fun init(context: Context) {
    seen.value = Api.prefs.getString("news.seen", "") ?: ""
    if (Build.VERSION.SDK_INT >= 26) {
      val nm = context.getSystemService(NotificationManager::class.java)
      nm.createNotificationChannel(NotificationChannel(CHANNEL, tr("Новости"), NotificationManager.IMPORTANCE_DEFAULT))
    }
    WorkManager.getInstance(context).enqueueUniquePeriodicWork(
      "news",
      ExistingPeriodicWorkPolicy.KEEP,
      PeriodicWorkRequestBuilder<NewsWorker>(15, TimeUnit.MINUTES)
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .build(),
    )
  }

  fun unread(list: List<NewsItem>, seen: String) = list.filter { it.createdAt > seen }

  suspend fun refresh() {
    if (Api.session.value == null) return
    runCatching { Api.news() }.onSuccess { items.value = it }
  }

  /** Everything up to the newest news counts as read (and needs no notification any more). */
  fun markRead() {
    val newest = items.value.firstOrNull()?.createdAt ?: return
    if (newest <= seen.value) return
    seen.value = newest
    val e = Api.prefs.edit().putString("news.seen", newest)
    if (newest > (Api.prefs.getString("news.notified", "") ?: "")) e.putString("news.notified", newest)
    e.apply()
  }

  /** The admin's own news needs no notification on this phone. */
  fun published(n: NewsItem) {
    items.value = listOf(n) + items.value.filter { it.id != n.id }
    Api.prefs.edit().putString("news.notified", n.createdAt).apply()
    markRead()
  }

  fun notify(context: Context, n: NewsItem) {
    if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
    val open = Intent(context, MainActivity::class.java).setAction(MainActivity.ACTION_OPEN_NEWS)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val pi = PendingIntent.getActivity(context, n.id.hashCode(), open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val note = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(R.drawable.ic_campaign)
      .setContentTitle(n.title)
      .setContentText(n.body.ifBlank { tr("Новое от администратора") })
      .setStyle(NotificationCompat.BigTextStyle().bigText(n.body.ifBlank { tr("Новое от администратора") }))
      .setContentIntent(pi)
      .setAutoCancel(true)
      .build()
    context.getSystemService(NotificationManager::class.java)?.notify(n.id.hashCode(), note)
  }

  fun nowIso(): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date())
}

/** Every 15 minutes (with a network): news since the last notified one become notifications. */
class NewsWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
  override suspend fun doWork(): Result {
    if (Api.session.value == null) return Result.success()
    val p = Api.prefs
    val since = p.getString("news.notified", null)
    if (since == null) {
      // the first run only sets the mark: what was there before installing is not news
      p.edit().putString("news.notified", News.nowIso()).apply()
      return Result.success()
    }
    val fresh = runCatching { Api.news(since) }.getOrElse { return Result.retry() }
    if (fresh.isEmpty()) return Result.success()
    fresh.asReversed().forEach { News.notify(applicationContext, it) }
    p.edit().putString("news.notified", fresh.first().createdAt).apply()
    News.items.value = (fresh + News.items.value).distinctBy { it.id }
    return Result.success()
  }
}
