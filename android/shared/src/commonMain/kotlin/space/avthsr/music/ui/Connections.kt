// The outside services a listener connects: the Telegram bot (songs by name or link, what friends send),
// Last.fm (every play scrobbled), and their city — for concerts of the artists they love.
package space.avthsr.music.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import org.jetbrains.compose.resources.DrawableResource
import space.avthsr.music.Platform
import space.avthsr.music.api.Api
import space.avthsr.music.api.Concert
import space.avthsr.music.api.cities
import space.avthsr.music.api.concerts
import space.avthsr.music.api.integrations
import space.avthsr.music.api.lastfmStart
import space.avthsr.music.api.lastfmUnlink
import space.avthsr.music.api.setCity
import space.avthsr.music.api.telegramLink
import space.avthsr.music.api.telegramUnlink
import space.avthsr.music.res.*
import space.avthsr.music.tr

@Composable
fun ConnectionsScreen() {
  val loader = rememberLoad(Unit) { Api.integrations() }
  Page {
    Loaded(loader) { s ->
      Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(screenPadding(top = 60.dp, bottom = 24.dp)).padding(horizontal = 16.dp)) {
        FlowText(tr("Сервисы"), MaterialTheme.typography.headlineMedium, Modifier.padding(horizontal = 4.dp), maxLines = 1)
        Spacer(Modifier.height(14.dp))
        Service(
          Res.drawable.ic_send, "Telegram",
          when {
            !s.telegram.available -> tr("Администратор ещё не подключил бота")
            s.telegram.linked != null -> tr("Привязан{}. Пишите боту название песни или ссылку — он скачает её; сюда же придёт то, что присылают друзья.", s.telegram.linked.username?.let { " (@$it)" } ?: "")
            else -> tr("Бот скачивает песни по названию или ссылке, присылает новинки, итоги недели и то, что отправили друзья.")
          },
        ) {
          if (s.telegram.linked != null) OutlinedButton(onClick = { act(tr("Бот отвязан"), { loader.reload() }) { Api.telegramUnlink() } }, shapes = ButtonDefaults.shapes()) { Text(tr("Отвязать")) }
          else Button(
            enabled = s.telegram.available, shapes = ButtonDefaults.shapes(),
            onClick = { act { Platform.openUrl(Api.telegramLink()) } },
          ) { Text(tr("Привязать")) }
          if (s.telegram.linked == null && s.telegram.available) TextButton(onClick = { loader.reload() }) { Text(tr("Я привязал(а)")) }
        }
        Service(
          Res.drawable.ic_chart, "Last.fm",
          when {
            !s.lastfm.available -> tr("Администратор ещё не подключил Last.fm")
            s.lastfm.linked != null -> tr("Скробблинг включён: {}", s.lastfm.linked.username.orEmpty())
            else -> tr("Всё, что вы слушаете здесь, будет попадать в ваш профиль Last.fm.")
          },
        ) {
          if (s.lastfm.linked != null) OutlinedButton(onClick = { act(tr("Last.fm отключён"), { loader.reload() }) { Api.lastfmUnlink() } }, shapes = ButtonDefaults.shapes()) { Text(tr("Отключить")) }
          else Button(enabled = s.lastfm.available, shapes = ButtonDefaults.shapes(), onClick = { act { Platform.openUrl(Api.lastfmStart()) } }) { Text(tr("Подключить")) }
          if (s.lastfm.linked == null && s.lastfm.available) TextButton(onClick = { loader.reload() }) { Text(tr("Я подключил(а)")) }
        }
        val nav = LocalNav.current
        Service(Res.drawable.ic_event, tr("Концерты"), tr("Концерты ваших исполнителей в вашем городе — раз в неделю приходят во «Входящие».")) {
          Button(onClick = { nav.route("concerts") }, shapes = ButtonDefaults.shapes()) { Text(tr("Открыть")) }
        }
      }
    }
  }
}

@Composable
private fun Service(icon: DrawableResource, title: String, text: String, actions: @Composable () -> Unit) {
  val cs = MaterialTheme.colorScheme
  Column(Modifier.padding(vertical = 6.dp).fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(cs.surfaceContainer).padding(16.dp)) {
    Row(verticalAlignment = Alignment.CenterVertically) {
      Box(Modifier.size(40.dp).clip(LogoShape).background(cs.primaryContainer), contentAlignment = Alignment.Center) { Ico(icon, null, Modifier.size(22.dp), cs.onPrimaryContainer) }
      Spacer(Modifier.width(12.dp))
      Text(title, style = MaterialTheme.typography.titleMedium)
    }
    Spacer(Modifier.height(8.dp))
    Text(text, style = MaterialTheme.typography.bodyMedium, color = cs.onSurfaceVariant)
    Spacer(Modifier.height(10.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) { actions() }
  }
}

@Composable
fun ConcertsScreen() {
  val loader = rememberLoad(Unit) { Api.concerts() }
  var pick by remember { mutableStateOf(false) }
  Page {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = screenPadding(top = 60.dp, bottom = 24.dp)) {
      item { FlowText(tr("Концерты"), MaterialTheme.typography.headlineMedium, Modifier.padding(horizontal = 20.dp), maxLines = 1) }
      val c = loader.data
      item {
        Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
          Text(
            if (c?.city == null) tr("Выберите город — и мы найдём концерты ваших исполнителей") else tr("Ваших исполнителей ищем в афише города"),
            Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
          )
          TextButton(onClick = { pick = true }) { Text(if (c?.city == null) tr("Выбрать город") else tr("Сменить город")) }
        }
      }
      val list = c?.concerts.orEmpty()
      if (c?.city != null && list.isEmpty()) item {
        Hint(if (c.checkedAt == null) tr("Ищем в афише… загляните через минуту") else tr("Пока ничего — как только ваши исполнители приедут, концерт появится здесь и во «Входящих»"))
      }
      items(list, key = { it.id }) { ConcertRow(it) }
    }
  }
  if (pick) CityDialog(onDismiss = { pick = false }) { pick = false; loader.reload() }
}

@Composable
private fun ConcertRow(c: Concert) {
  val cs = MaterialTheme.colorScheme
  Row(
    Modifier.fillMaxWidth().clickable { c.url?.let { Platform.openUrl(it) } }.padding(horizontal = 16.dp, vertical = 8.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Cover(c.imageUrl, Modifier.size(64.dp), RoundedCornerShape(16.dp), Res.drawable.ic_event)
    Spacer(Modifier.width(14.dp))
    Column(Modifier.weight(1f)) {
      Text(c.artist, style = MaterialTheme.typography.labelLarge, color = cs.primary)
      Text(c.title, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
      Text(listOfNotNull(c.date, c.place).joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant, maxLines = 2)
    }
  }
}

@Composable
fun CityDialog(onDismiss: () -> Unit, onDone: () -> Unit) {
  val cities = rememberLoad(Unit) { Api.cities() }
  var q by remember { mutableStateOf("") }
  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text(tr("Ваш город")) },
    text = {
      Column {
        OutlinedTextField(q, { q = it }, label = { Text(tr("Поиск")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        LazyColumn(Modifier.heightIn(max = 360.dp)) {
          items(cities.data.orEmpty().filter { q.isBlank() || it.name.contains(q.trim(), ignoreCase = true) }, key = { it.slug }) { c ->
            Text(
              c.name,
              Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { act(tr("Город сохранён"), onDone) { Api.setCity(c.slug) } }.padding(12.dp),
              style = MaterialTheme.typography.bodyLarge,
            )
          }
        }
      }
    },
    confirmButton = { TextButton(onClick = { act(tr("Город убран"), onDone) { Api.setCity(null) } }) { Text(tr("Не искать")) } },
    dismissButton = { TextButton(onClick = onDismiss) { Text(tr("Отмена")) } },
  )
}
