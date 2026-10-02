package space.avthsr.music.ui

import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.webkit.CookieManager
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import org.json.JSONObject
import space.avthsr.music.App
import space.avthsr.music.BuildConfig
import space.avthsr.music.R
import space.avthsr.music.api.Api
import space.avthsr.music.api.Likes
import space.avthsr.music.player.PlayerConn

@Composable
fun ProfileScreen() {
  val nav = LocalNav.current
  val session by Api.session.collectAsStateWithLifecycle()
  val u = session?.user ?: return
  val cs = MaterialTheme.colorScheme
  Page {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(start = 20.dp, end = 20.dp, top = 64.dp, bottom = 24.dp)) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        Cover(u.avatarUrl, Modifier.size(80.dp), CircleShape, R.drawable.ic_person)
        Spacer(Modifier.width(16.dp))
        Column {
          Text(u.displayName.ifBlank { u.username }, style = MaterialTheme.typography.headlineSmall)
          Text("@${u.username}" + if (u.isAdmin) " · администратор" else "", color = cs.onSurfaceVariant)
        }
      }
      Spacer(Modifier.height(24.dp))
      if (u.isAdmin) ProfileItem(R.drawable.ic_settings, "Админ-панель", "Пользователи, приглашения, статистика, загрузка файлов") { nav.web("/admin") }
      ProfileItem(R.drawable.ic_sparkle, "Предложка", "Новая музыка для вас") { nav.discover() }
      ProfileItem(R.drawable.ic_download, "Загрузки на сервер", "Что сейчас качается и кто в очереди") { nav.jobs() }
      ProfileItem(R.drawable.ic_person, "Профиль на сайте", "Имя, аватар, пароль, история") { nav.web("/profile") }
      ProfileItem(R.drawable.ic_web, "Веб-версия", "Сайт целиком внутри приложения") { nav.web("/") }
      ProfileItem(R.drawable.ic_logout, "Выйти", "") {
        App.scope.launch {
          PlayerConn.stop()
          Api.logout()
          Likes.clear()
        }
      }
      Spacer(Modifier.height(24.dp))
      Text("AVRmusic для Android ${BuildConfig.VERSION_NAME}", style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant)
    }
  }
}

@Composable
private fun ProfileItem(icon: Int, title: String, subtitle: String, onClick: () -> Unit) {
  val cs = MaterialTheme.colorScheme
  Row(
    Modifier.fillMaxWidth().padding(vertical = 4.dp).clip(RoundedCornerShape(20.dp)).background(cs.surfaceContainer).clickable(onClick = onClick).padding(16.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Box(Modifier.size(40.dp).clip(RoundedCornerShape(14.dp)).background(cs.secondaryContainer), contentAlignment = Alignment.Center) {
      Ico(icon, null, Modifier.size(22.dp), cs.onSecondaryContainer)
    }
    Spacer(Modifier.width(14.dp))
    Column(Modifier.weight(1f)) {
      Text(title, style = MaterialTheme.typography.titleMedium)
      if (subtitle.isNotEmpty()) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant)
    }
  }
}

/**
 * A page of the site inside the app (the admin panel, uploads, profile). It gets its own session from
 * the server, put where the site keeps it, so it opens signed in.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun WebScreen(path: String) {
  val nav = LocalNav.current
  var view by remember { mutableStateOf<WebView?>(null) }
  var auth by remember { mutableStateOf<String?>(null) }
  var failed by remember { mutableStateOf(false) }
  var fileCallback by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }
  val picker = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
    fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(r.resultCode, r.data))
    fileCallback = null
  }
  LaunchedEffect(Unit) {
    auth = try { Api.forkSession() } catch (e: Exception) { failed = true; "" }
  }
  BackHandler {
    val v = view
    if (v != null && v.canGoBack()) v.goBack() else nav.back()
  }
  DisposableEffect(Unit) { onDispose { view?.destroy() } }

  val session = auth
  if (session == null) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
    return
  }
  Box(Modifier.fillMaxSize()) {
    AndroidView(
      modifier = Modifier.fillMaxSize(),
      factory = { ctx ->
        WebView(ctx).apply {
          settings.javaScriptEnabled = true
          settings.domStorageEnabled = true
          settings.mediaPlaybackRequiresUserGesture = true
          setBackgroundColor(android.graphics.Color.parseColor("#141218"))
          var injected = session.isEmpty()
          webViewClient = object : WebViewClient() {
            override fun onPageFinished(v: WebView, url: String?) {
              if (injected) return
              injected = true
              // the site keeps its session in localStorage['avr.auth']: hand it ours once and reload
              val js = "(function(){if(localStorage.getItem('avr.auth'))return 0;localStorage.setItem('avr.auth'," +
                JSONObject.quote(session) + ");return 1})()"
              v.evaluateJavascript(js) { r -> if (r == "1") v.reload() }
            }
          }
          webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(w: WebView, cb: ValueCallback<Array<Uri>>, params: WebChromeClient.FileChooserParams): Boolean {
              fileCallback?.onReceiveValue(null)
              fileCallback = cb
              return try {
                picker.launch(params.createIntent())
                true
              } catch (e: Exception) {
                fileCallback = null
                false
              }
            }
          }
          setDownloadListener { url, userAgent, disposition, mime, _ ->
            runCatching {
              val name = URLUtil.guessFileName(url, disposition, mime)
              val req = DownloadManager.Request(Uri.parse(url))
                .setMimeType(mime)
                .addRequestHeader("User-Agent", userAgent)
                .addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url) ?: "")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
              (ctx.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(req)
              App.say("Загрузка началась: $name")
            }.onFailure { App.say("Не удалось скачать файл") }
          }
          loadUrl(Api.BASE + path)
          view = this
        }
      },
    )
    if (failed) Text("Не удалось открыть сессию — войдите на сайте", Modifier.align(Alignment.BottomCenter).padding(16.dp), color = MaterialTheme.colorScheme.error)
  }
}
