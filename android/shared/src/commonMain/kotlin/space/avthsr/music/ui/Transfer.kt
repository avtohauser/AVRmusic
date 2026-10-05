@file:OptIn(ExperimentalLayoutApi::class)

// Moving a library here: Spotify (sign in — liked songs, every playlist, followed artists), Yandex Music
// (a public profile — every playlist and "Мне нравится"), a link to one playlist, or a pasted list / CSV.
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
import androidx.compose.material3.LoadingIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.ToggleButton
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import kotlinx.io.readByteArray
import space.avthsr.music.App
import space.avthsr.music.Pick
import space.avthsr.music.Platform
import space.avthsr.music.api.Api
import space.avthsr.music.api.YandexProfile
import space.avthsr.music.api.listTransfer
import space.avthsr.music.api.spotifyStart
import space.avthsr.music.api.transferStatus
import space.avthsr.music.api.yandexProfile
import space.avthsr.music.api.yandexTransfer
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
      null -> LoadingIndicator(Modifier.size(32.dp))
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

/** Yandex Music: the public profile's playlists and "Мне нравится", picked and moved. */
@Composable
private fun YandexCard() {
  val nav = LocalNav.current
  val scope = rememberCoroutineScope()
  var user by remember { mutableStateOf("") }
  var profile by remember { mutableStateOf<YandexProfile?>(null) }
  var loading by remember { mutableStateOf(false) }
  var likes by remember { mutableStateOf(true) }
  val kinds = remember { mutableStateListOf<Int>() }
  Card(tr("Яндекс Музыка"), tr("По публичному профилю: «Мне нравится» и все открытые плейлисты"), Color(0xFFFFCC00)) {
    OutlinedTextField(user, { user = it }, label = { Text(tr("Ссылка на профиль или логин")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
    Spacer(Modifier.height(8.dp))
    Button(enabled = user.isNotBlank() && !loading, onClick = {
      loading = true
      scope.launch {
        runCatching { Api.yandexProfile(user) }
          .onSuccess { p -> profile = p; kinds.clear(); kinds.addAll(p.playlists.map { it.kind }); likes = (p.likes ?: 0) > 0 }
          .onFailure { App.say(it.message ?: tr("Не получилось")) }
        loading = false
      }
    }, shapes = ButtonDefaults.shapes()) { Text(if (loading) tr("Смотрю…") else tr("Показать плейлисты")) }
    Text(
      tr("Профиль должен быть публичным: Яндекс Музыка → Настройки → «Публичный профиль». Логин — в адресе страницы music.yandex.ru/users/ЛОГИН."),
      Modifier.padding(top = 6.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    val p = profile
    if (p != null) {
      Spacer(Modifier.height(10.dp))
      if (p.likes != null) PickRow(tr("Мне нравится · {}", tracksWord(p.likes)), likes) { likes = it }
      p.playlists.forEach { pl -> PickRow("${pl.title} · ${tracksWord(pl.count)}", pl.kind in kinds) { on -> if (on) kinds.add(pl.kind) else kinds.remove(pl.kind) } }
      Spacer(Modifier.height(8.dp))
      Button(enabled = likes || kinds.isNotEmpty(), onClick = {
        act(tr("Перенос начат — ход в «Загрузках на сервер»"), { nav.jobs() }) { Api.yandexTransfer(p.login, kinds.toList(), likes) }
      }, shapes = ButtonDefaults.shapes()) { Text(tr("Перенести выбранное")) }
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
