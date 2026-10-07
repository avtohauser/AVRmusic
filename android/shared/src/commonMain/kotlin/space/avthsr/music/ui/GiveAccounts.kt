// "Помочь с загрузками": a friend gives a spare YouTube account (its cookies.txt) — every account adds
// downloads at the same time, on each of the servers. Theirs to see and take back; kept only on the server.
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import space.avthsr.music.Pick
import space.avthsr.music.api.Api
import space.avthsr.music.api.giveAccount
import space.avthsr.music.api.givenAccounts
import space.avthsr.music.api.takeAccount
import space.avthsr.music.rememberPicker
import space.avthsr.music.res.*
import space.avthsr.music.tr

@Composable
fun GiveAccountsScreen() {
  val loader = rememberLoad(Unit) { Api.givenAccounts() }
  val pick = rememberPicker(Pick.TEXT_FILE) { f -> f.firstOrNull()?.let { file -> act(tr("Спасибо! Аккаунт уже помогает качать"), { loader.reload() }) { Api.giveAccount(file) } } }
  val cs = MaterialTheme.colorScheme
  Page {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(screenPadding(top = 60.dp, bottom = 24.dp)).padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
      FlowText(tr("Помочь с загрузками"), MaterialTheme.typography.headlineMedium, maxLines = 2)
      Text(
        tr("Треки качаются с YouTube. Каждый аккаунт — это ещё две загрузки одновременно на каждом сервере, и меньше «докажите, что вы не робот». Дайте запасной (не основной!) аккаунт Google — его cookies хранятся только на сервере, и забрать его можно в любой момент."),
        style = MaterialTheme.typography.bodyLarge, color = cs.onSurfaceVariant,
      )
      Text(tr("Как получить cookies.txt"), style = MaterialTheme.typography.titleMedium)
      Text(
        tr("1. В браузере на компьютере войдите в запасной аккаунт на youtube.com.\n2. Поставьте расширение «Get cookies.txt LOCALLY».\n3. На youtube.com нажмите его и сохраните файл.\n4. Выберите этот файл здесь. Из браузера потом можно просто выйти — не нажимайте «выйти из всех устройств»."),
        style = MaterialTheme.typography.bodyMedium,
      )
      val g = loader.data
      Button(
        onClick = pick, enabled = g == null || g.accounts.size < g.max, shapes = ButtonDefaults.shapes(), modifier = Modifier.fillMaxWidth().height(52.dp),
      ) { Ico(Res.drawable.ic_add, null, Modifier.size(20.dp)); Spacer(Modifier.width(8.dp)); Text(tr("Выбрать cookies.txt")) }
      g?.accounts?.forEach { a ->
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(cs.surfaceContainer).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
          Column(Modifier.weight(1f)) {
            Text(a.label, style = MaterialTheme.typography.titleMedium)
            Text(
              (if (a.loggedIn) tr("вход есть") else tr("входа нет — пересохраните cookies")) + tr(" · скачано {}, ошибок {}", a.ok, a.failed) +
                (a.coolingUntil?.let { tr(" · отдыхает") } ?: ""),
              style = MaterialTheme.typography.bodySmall, color = if (a.loggedIn) cs.onSurfaceVariant else cs.error,
            )
          }
          TextButton(onClick = { act(tr("Аккаунт забран"), { loader.reload() }) { Api.takeAccount(a.id) } }) { Text(tr("Забрать")) }
        }
      }
      if (g != null) Text(tr("Можно дать до {} аккаунтов.", g.max), style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant)
    }
  }
}
