@file:OptIn(ExperimentalLayoutApi::class)

// Moving a library here: Spotify (sign in — liked songs, every playlist, followed artists), Yandex Music
// (sign in with a code — the phone reads the library), a link to one playlist, or a pasted list / CSV.
package space.avthsr.music.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.ToggleButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.time.Duration.Companion.seconds
import kotlinx.io.readByteArray
import space.avthsr.music.App
import space.avthsr.music.Pick
import space.avthsr.music.Platform
import space.avthsr.music.api.Api
import space.avthsr.music.api.Yandex
import space.avthsr.music.api.YandexLogin
import space.avthsr.music.api.YandexOverview
import space.avthsr.music.api.importLibrary
import space.avthsr.music.api.yandexLoginStart
import space.avthsr.music.api.yandexLoginState
import space.avthsr.music.api.listTransfer
import space.avthsr.music.api.spotifyStart
import space.avthsr.music.api.transferStatus
import space.avthsr.music.rememberPicker
import space.avthsr.music.res.*
import space.avthsr.music.tr

@Composable
fun TransferScreen() {
  val status = rememberLoad(Unit) { Api.transferStatus() }
  var linkDialog by remember { mutableStateOf(false) }
  Page {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(screenPadding(start = 16.dp, end = 16.dp, top = 60.dp, bottom = 32.dp))) {
      FlowText(tr("Перенести музыку"), MaterialTheme.typography.headlineMedium, Modifier.padding(horizontal = 4.dp), maxLines = 1)
      Text(
        tr("Любимые треки станут лайками, плейлисты — плейлистами, исполнители — подписками на новинки. Чего нет на сервере — скачается само."),
        Modifier.padding(horizontal = 4.dp, vertical = 8.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
      SpotifyCard(status.data?.spotify)
      YandexCard()
      Card(tr("Один плейлист по ссылке"), tr("Ссылка на плейлист или альбом Spotify / Яндекс Музыки"), Color(0xFF7D5260)) {
        FilledTonalButton(onClick = { linkDialog = true }, shapes = ButtonDefaults.shapes()) { Ico(Res.drawable.ic_link, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(tr("Вставить ссылку")) }
      }
      ListCard()
    }
  }
  if (linkDialog) ImportLinkDialog { linkDialog = false }
}

@Composable
private fun Card(title: String, subtitle: String, accent: Color, content: @Composable ColumnScope.() -> Unit) {
  val cs = MaterialTheme.colorScheme
  Column(Modifier.padding(vertical = 8.dp).fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(cs.surfaceContainer).padding(18.dp)) {
    Row(verticalAlignment = Alignment.CenterVertically) {
      Box(Modifier.size(40.dp).clip(LogoShape).background(accent), contentAlignment = Alignment.Center) { Ico(Res.drawable.ic_import, null, Modifier.size(22.dp), Color.White) }
      Spacer(Modifier.width(12.dp))
      Column {
        Text(title, style = MaterialTheme.typography.titleMedium)
        Text(subtitle, style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant)
      }
    }
    Spacer(Modifier.height(12.dp))
    content()
  }
}

/** Spotify: sign in in the browser; everything comes over by itself. */
@Composable
private fun SpotifyCard(ready: Boolean?) {
  val nav = LocalNav.current
  Card("Spotify", tr("Любимые треки, все плейлисты, исполнители — треки находятся точно по ISRC"), Color(0xFF1DB954)) {
    when (ready) {
      null -> LoadingMark(Modifier.size(32.dp))
      true -> Button(onClick = {
        act { Platform.openUrl(Api.spotifyStart().url) }
        App.say(tr("Войдите в Spotify в браузере — перенос начнётся сам"))
      }, shapes = ButtonDefaults.shapes()) { Text(tr("Войти в Spotify и перенести всё")) }
      false -> {
        Text(tr("Администратор ещё не подключил Spotify. Пока можно перенести плейлисты по ссылкам или списком."), style = MaterialTheme.typography.bodyMedium)
        if (Api.user?.isAdmin == true) FilledTonalButton(onClick = { nav.route("admin") }, shapes = ButtonDefaults.shapes(), modifier = Modifier.padding(top = 8.dp)) { Text(tr("Подключить в админке")) }
      }
    }
  }
}

/** Yandex Music: sign in with a code at ya.ru/device; the phone reads the library and sends the lists. */
@Composable
private fun YandexCard() {
  val nav = LocalNav.current
  val scope = rememberCoroutineScope()
  val clipboard = LocalClipboardManager.current
  var login by remember { mutableStateOf<YandexLogin?>(null) }
  var token by remember { mutableStateOf<String?>(null) }
  var overview by remember { mutableStateOf<YandexOverview?>(null) }
  var busy by remember { mutableStateOf<String?>(null) }
  var likes by remember { mutableStateOf(true) }
  var withArtists by remember { mutableStateOf(true) }
  var withAlbums by remember { mutableStateOf(true) }
  val kinds = remember { mutableStateListOf<Int>() }
  val fail = { e: Throwable -> App.say(e.message ?: tr("Не получилось")); busy = null }

  // waiting for the code to be confirmed, then reading what there is to move
  val l = login
  LaunchedEffect(l?.id) {
    if (l == null) return@LaunchedEffect
    val until = kotlin.time.TimeSource.Monotonic.markNow() + l.expiresIn.seconds
    while (until.hasNotPassedNow()) {
      delay(l.interval.coerceAtLeast(3).seconds)
      val st = runCatching { Api.yandexLoginState(l.id) }.getOrNull() ?: continue
      when (st.status) {
        "ready" -> {
          login = null; token = st.token; busy = tr("Читаю вашу библиотеку…")
          runCatching { Yandex.overview(st.token!!) }
            .onSuccess { o -> overview = o; kinds.clear(); kinds.addAll(o.playlists.map { it.first }); likes = o.likedIds.isNotEmpty(); busy = null }
            .onFailure(fail)
          return@LaunchedEffect
        }
        "pending" -> continue
        else -> { login = null; App.say(st.message ?: tr("Код устарел — начните заново")); return@LaunchedEffect }
      }
    }
    login = null; App.say(tr("Код устарел — начните заново"))
  }

  Card(tr("Яндекс Музыка"), tr("«Мне нравится», все плейлисты (и закрытые), исполнители и альбомы"), Color(0xFFFFCC00)) {
    val o = overview
    val code = login
    when {
      busy != null -> Row(verticalAlignment = Alignment.CenterVertically) { LoadingMark(Modifier.size(32.dp)); Spacer(Modifier.width(10.dp)); Text(busy!!, style = MaterialTheme.typography.bodyLarge) }
      code != null -> {
        Text(tr("Откройте ya.ru/device, войдите в свой Яндекс и введите код:"), style = MaterialTheme.typography.bodyMedium)
        Text(
          code.userCode, style = MaterialTheme.typography.displaySmall, color = MaterialTheme.colorScheme.primary,
          modifier = Modifier.padding(vertical = 10.dp).clip(RoundedCornerShape(16.dp)).clickable { clipboard.setText(AnnotatedString(code.userCode)); App.say(tr("Код скопирован")) }.padding(horizontal = 8.dp),
        )
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          Button(onClick = { clipboard.setText(AnnotatedString(code.userCode)); Platform.openUrl(code.url) }, shapes = ButtonDefaults.shapes()) { Text(tr("Скопировать и открыть ya.ru/device")) }
          TextButton(onClick = { login = null }) { Text(tr("Отмена")) }
        }
        Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
          LoadingMark(Modifier.size(24.dp)); Spacer(Modifier.width(8.dp))
          Text(tr("Жду подтверждения… Яндекс спросит доступ для «Яндекс Музыки» — это нормально, читаем только вашу музыку."), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
      }
      o == null -> {
        Button(onClick = {
          busy = tr("Получаю код…")
          scope.launch { runCatching { Api.yandexLoginStart() }.onSuccess { login = it; busy = null }.onFailure(fail) }
        }, shapes = ButtonDefaults.shapes()) { Text(tr("Войти через Яндекс")) }
        Text(
          tr("Пароль сюда не попадает: вход подтверждается на сайте Яндекса кодом. Музыку читает ваш телефон, доступ не сохраняется."),
          Modifier.padding(top = 6.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
      }
      else -> {
        Text(tr("Вход: {}", o.login), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(6.dp))
        if (o.likedIds.isNotEmpty()) PickRow(tr("Мне нравится · {}", tracksWord(o.likedIds.size)), likes) { likes = it }
        o.playlists.forEach { (kind, title, count) -> PickRow("$title · ${tracksWord(count)}", kind in kinds) { on -> if (on) kinds.add(kind) else kinds.remove(kind) } }
        if (o.artists.isNotEmpty()) PickRow(tr("Исполнители · {} — новинки будут приходить", o.artists.size), withArtists) { withArtists = it }
        if (o.albums.isNotEmpty()) PickRow(tr("Альбомы · {}", o.albums.size), withAlbums) { withAlbums = it }
        Spacer(Modifier.height(8.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          Button(enabled = likes || kinds.isNotEmpty() || withArtists || withAlbums, onClick = {
            scope.launch {
              val t = token ?: return@launch
              runCatching {
                busy = tr("Собираю треки…")
                val liked = if (likes) Yandex.likedSongs(t, o) else emptyList()
                val lists = o.playlists.filter { it.first in kinds }.mapIndexed { i, (kind, title, _) ->
                  busy = tr("Плейлист {} из {}: {}", i + 1, kinds.size, title)
                  Yandex.playlist(t, o.uid, kind.toString())
                }
                busy = tr("Отправляю на сервер…")
                Api.importLibrary(liked, lists, if (withArtists) o.artists else emptyList(), if (withAlbums) o.albums else emptyList())
              }.onSuccess {
                busy = null; overview = null; token = null
                App.say(tr("Перенос начат — ход в «Загрузках на сервер»")); nav.jobs()
              }.onFailure(fail)
            }
          }, shapes = ButtonDefaults.shapes()) { Text(tr("Перенести выбранное")) }
          TextButton(onClick = { overview = null; token = null }) { Text(tr("Выйти")) }
        }
      }
    }
  }
}

@Composable
private fun PickRow(text: String, on: Boolean, onChange: (Boolean) -> Unit) {
  Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { onChange(!on) }, verticalAlignment = Alignment.CenterVertically) {
    Checkbox(checked = on, onCheckedChange = onChange)
    Text(text, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
  }
}

/** Any service: lines "Исполнитель — Название", or a CSV export (Exportify and the like). */
@Composable
private fun ListCard() {
  val nav = LocalNav.current
  var text by remember { mutableStateOf("") }
  var target by remember { mutableStateOf("playlist") }
  var title by remember { mutableStateOf("") }
  val pick = rememberPicker(Pick.TEXT_FILE) { files ->
    files.firstOrNull()?.let { f -> runCatching { f.open().readByteArray().decodeToString() }.onSuccess { text = it; if (title.isBlank()) title = f.name.substringBeforeLast('.') } }
  }
  Card(tr("Списком или файлом"), tr("Строки «Исполнитель — Название» или CSV-выгрузка из любого сервиса"), Color(0xFF6750A4)) {
    OutlinedTextField(text, { text = it }, label = { Text(tr("Список треков")) }, modifier = Modifier.fillMaxWidth().height(140.dp))
    Spacer(Modifier.height(6.dp))
    FilledTonalButton(onClick = pick, shapes = ButtonDefaults.shapes()) { Ico(Res.drawable.ic_folder, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(tr("Выбрать файл (CSV, TXT)")) }
    Spacer(Modifier.height(10.dp))
    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      ToggleButton(checked = target == "playlist", onCheckedChange = { target = "playlist" }) { Text(tr("Новый плейлист")) }
      ToggleButton(checked = target == "likes", onCheckedChange = { target = "likes" }) { Text(tr("В любимые")) }
    }
    if (target == "playlist") OutlinedTextField(title, { title = it }, label = { Text(tr("Название плейлиста")) }, singleLine = true, modifier = Modifier.fillMaxWidth().padding(top = 6.dp))
    Spacer(Modifier.height(8.dp))
    Button(enabled = text.isNotBlank(), onClick = {
      act(tr("Перенос начат — ход в «Загрузках на сервер»"), { nav.jobs() }) { Api.listTransfer(text, target, title.ifBlank { tr("Перенесённый плейлист") }) }
    }, shapes = ButtonDefaults.shapes()) { Text(tr("Перенести")) }
  }
}
