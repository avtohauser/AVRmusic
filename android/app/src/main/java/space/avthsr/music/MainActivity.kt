package space.avthsr.music

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import space.avthsr.music.api.NewsAlerts
import space.avthsr.music.player.AndroidEngine
import space.avthsr.music.player.Jam
import space.avthsr.music.ui.AvrTheme
import space.avthsr.music.ui.Root

/** The whole app is one full-screen activity: no status or navigation bar (a swipe from the edge shows them). */
class MainActivity : ComponentActivity() {
  companion object {
    const val ACTION_OPEN_PLAYER = "space.avthsr.music.OPEN_PLAYER"
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
    )
    super.onCreate(savedInstanceState)
    if (Build.VERSION.SDK_INT >= 28) {
      window.attributes = window.attributes.also { it.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES }
    }
    hideSystemBars()
    handle(intent)
    setContent { AvrTheme { Root() } }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    handle(intent)
  }

  override fun onStart() {
    super.onStart()
    AndroidEngine.connect(this)
  }

  override fun onStop() {
    super.onStop()
    // listening together, the app keeps following the session with the screen off
    if (!Jam.active) AndroidEngine.release()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) hideSystemBars()
  }

  private fun hideSystemBars() {
    val c = WindowCompat.getInsetsController(window, window.decorView)
    c.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    c.hide(WindowInsetsCompat.Type.systemBars())
  }

  private fun handle(intent: Intent?) {
    if (intent == null) return
    if (intent.action == ACTION_OPEN_PLAYER) Links.openPlayer.value = true
    if (intent.action == NewsAlerts.ACTION_OPEN_NEWS) { Links.deepLink.value = "news"; return }
    if (intent.action == NewsAlerts.ACTION_OPEN_ROUTE) { intent.getStringExtra("route")?.let { Links.deepLink.value = it }; return }
    val data = intent.data ?: return
    val path = data.path ?: return
    val query = runCatching { data.queryParameterNames.associateWith { data.getQueryParameter(it).orEmpty() } }.getOrDefault(emptyMap())
    Links.open(path, query)
  }
}
