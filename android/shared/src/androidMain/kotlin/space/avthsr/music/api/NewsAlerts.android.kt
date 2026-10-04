// News on Android: WorkManager checks every 15 minutes (with a network) and each news becomes a
// notification that opens the news screen.
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
import space.avthsr.music.Platform
import space.avthsr.music.shared.R
import space.avthsr.music.tr
import java.util.concurrent.TimeUnit

actual object NewsAlerts {
  private const val CHANNEL = "news"
  private const val FRIENDS = "friends"
  /** the intent action that opens the news screen (MainActivity handles it) */
  const val ACTION_OPEN_NEWS = "space.avthsr.music.OPEN_NEWS"
  /** the intent action that opens the screen in the "route" extra */
  const val ACTION_OPEN_ROUTE = "space.avthsr.music.OPEN_ROUTE"

  actual fun start() {
    val context = Platform.context
    if (Build.VERSION.SDK_INT >= 26) {
      val nm = context.getSystemService(NotificationManager::class.java)
      nm.createNotificationChannel(NotificationChannel(CHANNEL, tr("Новости"), NotificationManager.IMPORTANCE_DEFAULT))
      nm.createNotificationChannel(NotificationChannel(FRIENDS, tr("Друзья"), NotificationManager.IMPORTANCE_HIGH))
    }
    WorkManager.getInstance(context).enqueueUniquePeriodicWork(
      "news",
      ExistingPeriodicWorkPolicy.KEEP,
      PeriodicWorkRequestBuilder<NewsWorker>(15, TimeUnit.MINUTES)
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .build(),
    )
  }

  actual fun show(n: NewsItem) {
    val context = Platform.context
    if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
    val open = (context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent())
      .setPackage(context.packageName)
      .setAction(ACTION_OPEN_NEWS)
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

  actual fun notify(key: String, title: String, body: String, route: String) {
    val context = Platform.context
    if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
    val open = (context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent())
      .setPackage(context.packageName)
      .setAction(ACTION_OPEN_ROUTE)
      .putExtra("route", route)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val pi = PendingIntent.getActivity(context, key.hashCode(), open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val note = NotificationCompat.Builder(context, FRIENDS)
      .setSmallIcon(R.drawable.ic_campaign)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setContentIntent(pi)
      .setAutoCancel(true)
      .build()
    context.getSystemService(NotificationManager::class.java)?.notify(key.hashCode(), note)
  }
}

class NewsWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
  override suspend fun doWork(): Result = if (News.check()) Result.success() else Result.retry()
}
