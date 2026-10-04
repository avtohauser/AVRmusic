// The alarm on Android: the system's alarm clock (shown in the status bar and the clock app) wakes the
// player service at the set time, which starts the music.
package space.avthsr.music.player

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import space.avthsr.music.Platform

actual object AlarmClock {
  /** the intent action PlaybackService starts the alarm's music on */
  const val ACTION_ALARM = "space.avthsr.music.ALARM"

  private fun operation(ctx: Context): PendingIntent {
    val i = Intent().setClassName(ctx, "space.avthsr.music.player.PlaybackService").setAction(ACTION_ALARM)
    val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    return if (Build.VERSION.SDK_INT >= 26) PendingIntent.getForegroundService(ctx, 8, i, flags) else PendingIntent.getService(ctx, 8, i, flags)
  }

  actual fun schedule(atMs: Long) {
    val ctx = Platform.context
    val am = ctx.getSystemService(AlarmManager::class.java) ?: return
    val open = (ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: Intent()).setPackage(ctx.packageName)
      .setAction("space.avthsr.music.OPEN_ROUTE").putExtra("route", "alarm")
    val show = PendingIntent.getActivity(ctx, 7, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    runCatching { am.setAlarmClock(AlarmManager.AlarmClockInfo(atMs, show), operation(ctx)) }
      .onFailure { runCatching { am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, operation(ctx)) } }
  }

  actual fun cancel() {
    val ctx = Platform.context
    ctx.getSystemService(AlarmManager::class.java)?.cancel(operation(ctx))
  }
}
