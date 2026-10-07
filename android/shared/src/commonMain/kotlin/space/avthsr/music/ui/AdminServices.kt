// The admin's outside services: the Telegram bot's token, the Last.fm app, nightly copies of the database.
package space.avthsr.music.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import space.avthsr.music.api.Api
import space.avthsr.music.api.backupNow
import space.avthsr.music.api.autofetch
import space.avthsr.music.api.backups
import space.avthsr.music.api.setAutofetch
import space.avthsr.music.api.setTgApp
import space.avthsr.music.api.tgAppAdmin
import space.avthsr.music.api.lastfmAdmin
import space.avthsr.music.api.setLastfmApp
import space.avthsr.music.api.setTelegramToken
import space.avthsr.music.api.telegramAdmin
import space.avthsr.music.tr

@Composable
internal fun AdminServices() {
  val tg = rememberLoad(Unit) { Api.telegramAdmin() }
  val lf = rememberLoad(Unit) { Api.lastfmAdmin() }
  val bk = rememberLoad(Unit) { Api.backups() }
  Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp).padding(bottom = 80.dp)) {
    Block(tr("Telegram-бот")) {
      Text(
        tg.data?.bot?.let { tr("Подключён: @{}. Пользователи привязывают его в Профиль → Сервисы.", it) }
          ?: tr("Создайте бота у @BotFather (/newbot) и вставьте его токен. Токен хранится только на сервере."),
        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
      var token by remember { mutableStateOf("") }
      OutlinedTextField(token, { token = it.trim() }, label = { Text(tr("Токен бота")) }, singleLine = true, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth())
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(enabled = token.isNotBlank(), onClick = { act(tr("Бот подключён"), { token = ""; tg.reload() }) { Api.setTelegramToken(token) } }, shapes = ButtonDefaults.shapes()) { Text(tr("Сохранить")) }
        if (tg.data?.configured == true) OutlinedButton(onClick = { act(tr("Бот отключён"), { tg.reload() }) { Api.setTelegramToken(null) } }, shapes = ButtonDefaults.shapes()) { Text(tr("Отключить")) }
      }
      Text(tr("Сторож на сервере-хранилище тоже пишет через этого бота — всем админам, кто его привязал."), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    Block("Last.fm") {
      Text(
        if (lf.data?.hasSecret == true) tr("Подключён — пользователи включают скробблинг в Профиль → Сервисы.")
        else tr("Создайте API-аккаунт на last.fm/api/account/create и вставьте API key и Shared secret."),
        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
      var key by remember(lf.data) { mutableStateOf(lf.data?.key.orEmpty()) }
      var secret by remember { mutableStateOf("") }
      OutlinedTextField(key, { key = it.trim() }, label = { Text("API key") }, singleLine = true, modifier = Modifier.fillMaxWidth())
      OutlinedTextField(
        secret, { secret = it.trim() }, label = { Text(if (lf.data?.hasSecret == true) tr("Shared secret (оставьте пустым, чтобы не менять)") else "Shared secret") },
        singleLine = true, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth(),
      )
      Button(enabled = key.length == 32, onClick = { act(tr("Сохранено"), { secret = ""; lf.reload() }) { Api.setLastfmApp(key, secret) } }, shapes = ButtonDefaults.shapes()) { Text(tr("Сохранить")) }
    }
    Block(tr("Статус в Telegram")) {
      val app = rememberLoad(Unit) { Api.tgAppAdmin() }
      Text(
        tr("Чтобы друзья могли показывать в профиле Telegram, что сейчас играет, нужен API ID и API hash: my.telegram.org → API development tools (создать приложение). Хранятся только на сервере."),
        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
      var id by remember(app.data) { mutableStateOf(app.data?.apiId?.toString().orEmpty()) }
      var hash by remember { mutableStateOf("") }
      OutlinedTextField(id, { id = it.filter { c -> c.isDigit() } }, label = { Text("API ID") }, singleLine = true, modifier = Modifier.fillMaxWidth())
      OutlinedTextField(
        hash, { hash = it.trim() }, label = { Text(if (app.data?.hasHash == true) tr("API hash (пусто — не менять)") else "API hash") },
        singleLine = true, visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth(),
      )
      Button(enabled = id.isNotBlank(), onClick = { act(tr("Сохранено"), { hash = ""; app.reload() }) { Api.setTgApp(id.toLong(), hash) } }, shapes = ButtonDefaults.shapes()) { Text(tr("Сохранить")) }
    }
    Block(tr("Дискографии любимых исполнителей")) {
      val af = rememberLoad(Unit) { Api.autofetch() }
      Text(
        tr("Сервер сам докачивает дискографии тех, кого лайкают, на кого подписаны и кого много слушают — по одной за раз, после ваших загрузок."),
        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
      af.data?.let { a ->
        Row(verticalAlignment = Alignment.CenterVertically) {
          Text(if (a.on) tr("Включено") else tr("Выключено"), Modifier.weight(1f), style = MaterialTheme.typography.titleSmall)
          Switch(checked = a.on, onCheckedChange = { on -> act(null, { af.reload() }) { Api.setAutofetch(on) } })
        }
        if (a.on && a.next.isNotEmpty()) Text(tr("Следующие: {}", a.next.joinToString(", ")), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
      }
    }
    Block(tr("Резервные копии")) {
      val b = bk.data
      Text(
        tr("Каждую ночь база (и входы YouTube) копируется на сервер-хранилище, хранятся последние 14 копий.") +
          (b?.last?.let { "\n" + tr("Последняя: {}", fmtDateTime(it)) } ?: ""),
        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
      b?.files?.take(5)?.forEach { f -> Text("${f.name} · ${fmtBytes(f.size)}", style = MaterialTheme.typography.bodySmall) }
      Button(onClick = { act(tr("Копия сделана"), { bk.reload() }) { Api.backupNow() } }, shapes = ButtonDefaults.shapes()) { Text(tr("Сделать копию сейчас")) }
    }
  }
}

@Composable
private fun Block(title: String, content: @Composable () -> Unit) {
  Column(
    Modifier.padding(vertical = 6.dp).fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(MaterialTheme.colorScheme.surfaceContainer).padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(10.dp),
  ) {
    Text(title, style = MaterialTheme.typography.titleMedium)
    content()
  }
}
