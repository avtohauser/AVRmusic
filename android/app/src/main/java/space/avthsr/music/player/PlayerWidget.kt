// The home-screen player widget: the cover, title and artist of what plays, with previous, play / pause
// and next. The player service redraws it on every change; with nothing queued ▶ opens the app on
// "My Wave". Colours follow the wallpaper (Material You) on Android 12+.
package space.avthsr.music.player

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.widget.RemoteViews
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import space.avthsr.music.App
import space.avthsr.music.MainActivity
import space.avthsr.music.R
import space.avthsr.music.api.Api
import space.avthsr.music.api.Track
import java.net.URL

class PlayerWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    render(context.applicationContext)
  }

  companion object {
    const val ACTION_TOGGLE = "space.avthsr.music.widget.TOGGLE"
    const val ACTION_NEXT = "space.avthsr.music.widget.NEXT"
    const val ACTION_PREV = "space.avthsr.music.widget.PREV"
    /** MainActivity: open the player and start "My Wave" */
    const val EXTRA_START_WAVE = "startWave"

    private var track: Track? = null
    private var playing = false
    private var coverFor: String? = null
    private var cover: Bitmap? = null

    /** The service tells what plays; the widget is redrawn (and the cover fetched when it changed). */
    fun update(context: Context, t: Track?, isPlaying: Boolean) {
      val ctx = context.applicationContext
      val changed = t?.id != track?.id || isPlaying != playing
      track = t
      playing = isPlaying
      if (t != null && coverFor != t.id) {
        coverFor = t.id
        cover = null
        App.scope.launch {
          val bmp = withContext(Dispatchers.IO) { runCatching { loadCover(t) }.getOrNull() }
          if (coverFor == t.id) { cover = bmp; render(ctx) }
        }
      }
      if (changed) render(ctx)
    }

    private fun loadCover(t: Track): Bitmap? {
      val opts = BitmapFactory.Options().apply { inSampleSize = 1 }
      val raw = Offline.cover(t.id)?.let { BitmapFactory.decodeFile(it, opts) }
        ?: Api.img(t.coverUrl)?.let { url -> URL(url).openStream().use { BitmapFactory.decodeStream(it) } }
        ?: return null
      return rounded(raw, 300, 44f)
    }

    /** A square, rounded copy (RemoteViews can't clip on older Androids). */
    private fun rounded(src: Bitmap, size: Int, radius: Float): Bitmap {
      val side = minOf(src.width, src.height)
      val square = Bitmap.createBitmap(src, (src.width - side) / 2, (src.height - side) / 2, side, side)
      val scaled = Bitmap.createScaledBitmap(square, size, size, true)
      val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
      val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { shader = BitmapShader(scaled, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP) }
      Canvas(out).drawRoundRect(RectF(0f, 0f, size.toFloat(), size.toFloat()), radius, radius, paint)
      return out
    }

    private fun service(ctx: Context, action: String, code: Int): PendingIntent =
      PendingIntent.getService(ctx, code, Intent(ctx, PlaybackService::class.java).setAction(action), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

    private fun openApp(ctx: Context, startWave: Boolean): PendingIntent {
      val i = Intent(ctx, MainActivity::class.java).setAction(MainActivity.ACTION_OPEN_PLAYER)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        .putExtra(EXTRA_START_WAVE, startWave)
      return PendingIntent.getActivity(ctx, if (startWave) 31 else 30, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    fun render(ctx: Context) {
      val manager = AppWidgetManager.getInstance(ctx)
      val ids = manager.getAppWidgetIds(ComponentName(ctx, PlayerWidget::class.java))
      if (ids.isEmpty()) return
      val t = track
      val v = RemoteViews(ctx.packageName, R.layout.widget_player)
      v.setTextViewText(R.id.widget_title, t?.title ?: ctx.getString(R.string.widget_nothing))
      v.setTextViewText(R.id.widget_artist, t?.artists ?: ctx.getString(R.string.widget_hint))
      val bmp = cover
      if (t != null && bmp != null) v.setImageViewBitmap(R.id.widget_cover, bmp) else v.setImageViewResource(R.id.widget_cover, R.drawable.w_note)
      v.setImageViewResource(R.id.widget_play, if (playing) R.drawable.w_pause else R.drawable.w_play)
      v.setOnClickPendingIntent(R.id.widget_root, openApp(ctx, false))
      if (t == null) {
        v.setOnClickPendingIntent(R.id.widget_play, openApp(ctx, true))
        v.setOnClickPendingIntent(R.id.widget_next, openApp(ctx, true))
        v.setOnClickPendingIntent(R.id.widget_prev, openApp(ctx, false))
      } else {
        v.setOnClickPendingIntent(R.id.widget_play, service(ctx, ACTION_TOGGLE, 40))
        v.setOnClickPendingIntent(R.id.widget_next, service(ctx, ACTION_NEXT, 41))
        v.setOnClickPendingIntent(R.id.widget_prev, service(ctx, ACTION_PREV, 42))
      }
      manager.updateAppWidget(ids, v)
    }
  }
}
