// Reports of wrong tracks ("не та версия", "плохой звук", "обрезан"): any listener sends one from the
// track's menu, the admin sees them in the admin panel and fetches the track again in one tap. Also the
// admin's Spotify app for moving libraries here.
package space.avthsr.music.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import space.avthsr.music.api.Api
import space.avthsr.music.api.Track
import space.avthsr.music.api.dismissReport
import space.avthsr.music.api.refetchReport
import space.avthsr.music.api.report
import space.avthsr.music.api.reports
import space.avthsr.music.api.saveSpotify
import space.avthsr.music.api.spotifySettings
import space.avthsr.music.player.PlayerConn
import space.avthsr.music.tr

private val reasons get() = listOf("wrong" to tr("Не та версия или другая песня"), "quality" to tr("Плохой звук"), "cut" to tr("Обрезан или с паузами"), "other" to tr("Другое"))

fun reportReason(id: String) = reasons.firstOrNull { it.first == id }?.second ?: id

/** "Что не так с треком?" — the admin gets it and can fetch the track again. */
@Composable
fun ReportDialog(t: Track, onDone: () -> Unit) {
  var reason by remember { mutableStateOf("wrong") }
  var note by remember { mutableStateOf("") }
  AlertDialog(
    onDismissRequest = onDone,
    title = { Text(tr("Что не так с треком?")) },
    text = {
      Column {
        Text("${t.artists} — ${t.title}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Spacer(Modifier.height(8.dp))
        reasons.forEach { (id, label) ->
          Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { reason = id }, verticalAlignment = Alignment.CenterVertically) {
            RadioButton(selected = reason == id, onClick = { reason = id })
            Text(label, style = MaterialTheme.typography.bodyLarge)
          }
        }
        OutlinedTextField(note, { note = it.take(500) }, label = { Text(tr("Подробнее (необязательно)")) }, modifier = Modifier.fillMaxWidth(), maxLines = 3)
      }
    },
    confirmButton = {
      TextButton(onClick = {
        val r = reason
        val n = note
        onDone()
        act(tr("Спасибо! Администратор посмотрит")) { Api.report(t.id, r, n) }
      }) { Text(tr("Отправить")) }
    },
    dismissButton = { TextButton(onClick = onDone) { Text(tr("Отмена")) } },
  )
}

/** The admin's list of reports: listen, fetch again, or close. */
@Composable
fun AdminReports() {
  val loader = rememberLoad(Unit) { Api.reports() }
  LazyColumn(Modifier.fillMaxSize(), contentPadding = screenPadding(top = 8.dp, bottom = 24.dp, hero = true)) {
    item { SpotifySetup() }
    item { SectionTitle(tr("Жалобы на треки")) }
    val list = loader.data.orEmpty()
    if (loader.data != null && list.isEmpty()) item { Text(tr("Жалоб нет — всё звучит как надо"), Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
    items(list, key = { it.id }) { r ->
      Column(Modifier.padding(horizontal = 16.dp, vertical = 6.dp).fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(MaterialTheme.colorScheme.surfaceContainer).padding(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
          Cover(r.track.coverUrl, Modifier.size(52.dp), RoundedCornerShape(14.dp))
          Spacer(Modifier.width(12.dp))
          Column(Modifier.weight(1f)) {
            Text(r.track.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(r.track.artists, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
          }
          MorphPlayButton(false, { PlayerConn.play(listOf(r.track), 0, "report") }, 44.dp)
        }
        Spacer(Modifier.height(8.dp))
        Text(reportReason(r.reason), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.error)
        if (r.note.isNotBlank()) Text(r.note, style = MaterialTheme.typography.bodyMedium)
        Text(listOfNotNull(r.reporter, fmtAgo(r.createdAt)).joinToString(" · "), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          Button(onClick = { act(tr("Перекачиваю — смотрите «Загрузки»"), { loader.reload() }) { Api.refetchReport(r.id) } }, shapes = ButtonDefaults.shapes()) { Text(tr("Перекачать")) }
          OutlinedButton(onClick = { act(null, { loader.reload() }) { Api.dismissReport(r.id) } }, shapes = ButtonDefaults.shapes()) { Text(tr("Всё в порядке")) }
        }
      }
    }
  }
}

/** The admin's Spotify app: once set up, everyone can move their Spotify library here. */
@Composable
private fun SpotifySetup() {
  val s = rememberLoad(Unit) { Api.spotifySettings() }
  var id by remember(s.data) { mutableStateOf(s.data?.clientId.orEmpty()) }
  var secret by remember { mutableStateOf("") }
  val cs = MaterialTheme.colorScheme
  Column(Modifier.padding(16.dp).fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(cs.secondaryContainer).padding(16.dp)) {
    Text(tr("Spotify для переноса медиатек"), style = MaterialTheme.typography.titleMedium, color = cs.onSecondaryContainer)
    Spacer(Modifier.height(6.dp))
    Text(
      tr("1) developer.spotify.com → Dashboard → Create app. 2) В Redirect URI добавьте адрес ниже, отметьте Web API. 3) В User Management добавьте email-ы друзей. 4) Вставьте сюда Client ID и Client Secret."),
      style = MaterialTheme.typography.bodySmall, color = cs.onSecondaryContainer,
    )
    s.data?.redirectUri?.let { uri ->
      Text(uri, Modifier.padding(vertical = 6.dp).clip(RoundedCornerShape(10.dp)).clickable { space.avthsr.music.Platform.copy(uri); space.avthsr.music.App.say(tr("Адрес скопирован")) }.padding(6.dp), style = MaterialTheme.typography.labelLarge, color = cs.primary)
    }
    OutlinedTextField(id, { id = it }, label = { Text("Client ID") }, singleLine = true, modifier = Modifier.fillMaxWidth())
    OutlinedTextField(secret, { secret = it }, label = { Text(if (s.data?.hasSecret == true) tr("Client Secret (сохранён — можно не вводить)") else "Client Secret") }, singleLine = true, modifier = Modifier.fillMaxWidth())
    Spacer(Modifier.height(8.dp))
    Button(enabled = id.length >= 10 && (secret.isNotBlank() || s.data?.hasSecret == true), onClick = { act(tr("Spotify подключён"), { secret = ""; s.reload() }) { Api.saveSpotify(id, secret) } }, shapes = ButtonDefaults.shapes()) { Text(tr("Сохранить")) }
  }
}
