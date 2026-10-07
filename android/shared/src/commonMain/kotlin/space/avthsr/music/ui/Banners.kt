// Cards over everything: an invitation that just came (to play "guess the melody", to listen together)
// and a newer version of the app, with the update dialog.
package space.avthsr.music.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearWavyProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import space.avthsr.music.App
import space.avthsr.music.Platform
import space.avthsr.music.api.Api
import space.avthsr.music.api.Share
import space.avthsr.music.player.AppUpdate
import space.avthsr.music.player.Jam
import space.avthsr.music.player.Updater
import space.avthsr.music.res.*
import space.avthsr.music.tr

/** "Петя зовёт в «Угадай мелодию»" with a button to go there; gone by itself after a minute. */
@Composable
fun InviteBanner(s: Share, onOpen: () -> Unit, onClose: () -> Unit) {
  val nav = LocalNav.current
  val cs = MaterialTheme.colorScheme
  LaunchedEffect(s.id) { delay(60_000); onClose() }
  val game = s.kind == "game"
  Row(
    Modifier.widthIn(max = 560.dp).fillMaxWidth().shadow(8.dp, RoundedCornerShape(24.dp)).clip(RoundedCornerShape(24.dp))
      .background(cs.tertiaryContainer).padding(start = 14.dp, end = 4.dp, top = 10.dp, bottom = 10.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Ico(if (game) Res.drawable.ic_quiz else Res.drawable.ic_headphones, null, Modifier.size(26.dp), cs.onTertiaryContainer)
    Spacer(Modifier.width(10.dp))
    Text(
      if (game) tr("{} зовёт в «Угадай мелодию»", s.from?.displayName ?: tr("Друг")) else tr("{} зовёт слушать вместе", s.from?.displayName ?: tr("Друг")),
      Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = cs.onTertiaryContainer, maxLines = 2, overflow = TextOverflow.Ellipsis,
    )
    Button(onClick = {
      onOpen()
      if (game) nav.route("game/${s.refId}") else act(tr("Вы слушаете вместе")) { Jam.join(s.refId) }
    }, shapes = ButtonDefaults.shapes()) { Text(if (game) tr("Играть") else tr("Войти")) }
    IconButton(onClick = onClose) { Ico(Res.drawable.ic_close, tr("Закрыть"), tint = cs.onTertiaryContainer) }
  }
  Spacer(Modifier.height(8.dp))
}

/** A newer version: a card until it is updated or put off; the dialog after a tap on its notification. */
@Composable
fun UpdateBanner() {
  val rel by AppUpdate.available.collectAsStateWithLifecycle()
  val prompt by AppUpdate.prompt.collectAsStateWithLifecycle()
  val progress by Updater.progress.collectAsStateWithLifecycle()
  var later by remember { mutableStateOf(Api.prefs.getString("update.later", null)) }
  val r = rel ?: return
  val cs = MaterialTheme.colorScheme
  val start = { App.scope.launch { runCatching { Updater.install(r, background = false) } } }
  AnimatedVisibility(later != r.version || progress != null) {
    Column(
      Modifier.widthIn(max = 560.dp).fillMaxWidth().shadow(8.dp, RoundedCornerShape(24.dp)).clip(RoundedCornerShape(24.dp))
        .background(cs.primaryContainer).padding(start = 14.dp, end = 4.dp, top = 10.dp, bottom = 10.dp),
    ) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        Ico(Res.drawable.ic_download, null, Modifier.size(24.dp), cs.onPrimaryContainer)
        Spacer(Modifier.width(10.dp))
        Text(
          if (progress != null) tr("Скачиваю обновление {}…", r.version) else tr("Вышла версия {}", r.version),
          Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, color = cs.onPrimaryContainer,
        )
        if (progress == null) {
          Button(onClick = { start() }, shapes = ButtonDefaults.shapes()) { Text(tr("Обновить")) }
          IconButton(onClick = { Api.prefs.edit().putString("update.later", r.version).apply(); later = r.version }) { Ico(Res.drawable.ic_close, tr("Позже"), tint = cs.onPrimaryContainer) }
        }
      }
      progress?.let { p -> LinearWavyProgressIndicator(progress = { p }, modifier = Modifier.fillMaxWidth().padding(top = 8.dp, end = 10.dp)) }
    }
  }
  if (prompt) AlertDialog(
    onDismissRequest = { AppUpdate.prompt.value = false },
    title = { Text(tr("Обновление {}", r.version)) },
    text = {
      Text(
        tr("Сейчас у вас {}. Новая версия скачается и встанет поверх — всё сохранится.", Platform.version) +
          if (r.size > 0) "\n" + tr("Размер: {}", fmtBytes(r.size)) else "",
      )
    },
    confirmButton = { TextButton(onClick = { AppUpdate.prompt.value = false; start() }) { Text(tr("Обновить")) } },
    dismissButton = { TextButton(onClick = { AppUpdate.prompt.value = false }) { Text(tr("Позже")) } },
  )
}
