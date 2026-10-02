package space.avthsr.music

import android.content.Intent
import android.net.Uri
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
import kotlinx.coroutines.flow.MutableStateFlow
import space.avthsr.music.player.PlayerConn
import space.avthsr.music.ui.AvrTheme
import space.avthsr.music.ui.Root

/** The whole app is one full-screen activity: no status or navigation bar (a swipe from the edge shows them). */
class MainActivity : ComponentActivity() {
  companion object {
    const val ACTION_OPEN_PLAYER = "space.avthsr.music.OPEN_PLAYER"

    /** the shade player was tapped */
    val openPlayer = MutableStateFlow(false)

    /** a link to the site (or a launcher shortcut) asks for this screen */
    val deepLink = MutableStateFlow<String?>(null)

    /** an invite link was opened: registration with this code */
    val invite = MutableStateFlow<String?>(null)
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
    PlayerConn.connect(this)
  }

  override fun onStop() {
    super.onStop()
    PlayerConn.release()
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
    if (intent.action == ACTION_OPEN_PLAYER) openPlayer.value = true
    val path = intent.data?.path ?: return
    val s = path.trim('/').split('/')
    deepLink.value = when {
      s.size >= 2 && s[0] in setOf("album", "artist", "playlist", "genre") -> "${s[0]}/${Uri.encode(s[1])}"
      s.size >= 3 && s[0] == "catalog" && s[1] == "album" -> "calbum/${s[2]}"
      s.size >= 3 && s[0] == "catalog" && s[1] == "artist" -> "cartist/${s[2]}"
      s[0] in setOf("search", "library", "liked", "discover", "profile") -> s[0]
      s[0] == "admin" -> "admin"
      s[0] == "history" -> "history"
      s[0] == "downloads" -> "downloads"
      s[0] == "register" -> { intent.data?.getQueryParameter("invite")?.let { invite.value = it }; null }
      else -> null
    }
  }
}
