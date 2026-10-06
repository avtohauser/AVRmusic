@file:OptIn(ExperimentalLayoutApi::class)

// A smart playlist's rules: genres, years, liked only, not played for a while, played often … — the
// server keeps the playlist matching them and refills it every few hours.
package space.avthsr.music.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import space.avthsr.music.App
import space.avthsr.music.api.Api
import space.avthsr.music.api.SmartRules
import space.avthsr.music.api.createSmart
import space.avthsr.music.api.setSmartRules
import space.avthsr.music.res.*
import space.avthsr.music.tr

/** Creates a smart playlist ([playlistId] null) or changes the rules of one; [onDone] gets its id. */
@Composable
fun SmartEditor(playlistId: String?, initial: SmartRules?, onDismiss: () -> Unit, onDone: (String) -> Unit) {
  val cs = MaterialTheme.colorScheme
  var title by remember { mutableStateOf("") }
  var r by remember { mutableStateOf(initial ?: SmartRules()) }
  var busy by remember { mutableStateOf(false) }
  val genres = rememberLoad { Api.genres() }
  ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 28.dp)) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        Ico(Res.drawable.ic_tune, null, Modifier.size(28.dp), cs.primary)
        Spacer(Modifier.size(12.dp))
        Column {
          Text(if (playlistId == null) tr("Умный плейлист") else tr("Правила плейлиста"), style = MaterialTheme.typography.titleLarge)
          Text(tr("Собирается сам и обновляется каждые несколько часов"), style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant)
        }
      }
      Spacer(Modifier.height(16.dp))
      if (playlistId == null) {
        OutlinedTextField(title, { title = it }, label = { Text(tr("Название")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(14.dp))
      }

      Label(tr("Жанры"), if (r.genres.isEmpty()) tr("любые") else null)
      val list = genres.data.orEmpty()
      FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        list.take(40).forEach { g ->
          val on = g.name in r.genres
          FilterChip(selected = on, onClick = { r = r.copy(genres = if (on) r.genres - g.name else r.genres + g.name) }, label = { Text(g.name) })
        }
        if (list.isEmpty()) Text(tr("Загрузка…"), color = cs.onSurfaceVariant)
      }

      Label(tr("Годы выпуска"))
      Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        YearField(tr("С"), r.yearFrom, Modifier.weight(1f)) { r = r.copy(yearFrom = it) }
        YearField(tr("По"), r.yearTo, Modifier.weight(1f)) { r = r.copy(yearTo = it) }
      }

      Label(tr("Что брать"))
      CheckRow(tr("Только любимые треки"), r.liked) { r = r.copy(liked = it) }
      CheckRow(tr("Без пометки explicit"), r.noExplicit) { r = r.copy(noExplicit = it) }

      Label(tr("Добавлены на сервер"))
      Choice(listOf(null to tr("Когда угодно"), 7 to tr("За неделю"), 30 to tr("За месяц"), 90 to tr("За 3 месяца"), 365 to tr("За год")), r.addedDays) { r = r.copy(addedDays = it) }
      Label(tr("Давно не слушал(а)"))
      Choice(listOf(null to tr("Неважно"), 30 to tr("Месяц"), 90 to tr("3 месяца"), 180 to tr("Полгода")), r.notPlayedDays) { r = r.copy(notPlayedDays = it) }
      Label(tr("Слушал(а) хотя бы"))
      Choice(listOf(null to tr("Неважно"), 1 to tr("1 раз"), 3 to tr("3 раза"), 10 to tr("10 раз")), r.minPlays) { r = r.copy(minPlays = it) }

      Label(tr("Порядок"))
      Choice(
        listOf("random" to tr("Случайно"), "recent" to tr("Недавно добавленные"), "newest" to tr("Свежие релизы"), "popular" to tr("Популярные"), "mostPlayed" to tr("Мои частые")),
        r.sort,
      ) { r = r.copy(sort = it) }
      Label(tr("Сколько треков"))
      Choice(listOf(25 to "25", 50 to "50", 100 to "100", 200 to "200", 500 to "500"), r.limit) { r = r.copy(limit = it) }

      Spacer(Modifier.height(20.dp))
      Button(
        onClick = {
          busy = true
          App.scope.launch {
            runCatching { if (playlistId == null) Api.createSmart(title.ifBlank { tr("Умный плейлист") }, r) else Api.setSmartRules(playlistId, r) }
              .onSuccess { onDone(it.id) }
              .onFailure { App.say(it.message ?: tr("Не получилось")) }
            busy = false
          }
        },
        enabled = !busy, shapes = ButtonDefaults.shapes(), modifier = Modifier.fillMaxWidth().height(52.dp),
      ) { Text(if (playlistId == null) tr("Создать") else tr("Сохранить")) }
    }
  }
}

@Composable
private fun Label(text: String, hint: String? = null) {
  Spacer(Modifier.height(14.dp))
  Row(verticalAlignment = Alignment.Bottom) {
    Text(text, style = MaterialTheme.typography.titleSmall)
    hint?.let { Text("  $it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
  }
  Spacer(Modifier.height(6.dp))
}

@Composable
private fun <T> Choice(options: List<Pair<T, String>>, value: T, onPick: (T) -> Unit) {
  FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
    options.forEach { (v, label) -> FilterChip(selected = v == value, onClick = { onPick(v) }, label = { Text(label) }) }
  }
}

@Composable
private fun YearField(label: String, value: Int?, modifier: Modifier, onChange: (Int?) -> Unit) {
  var text by remember { mutableStateOf(value?.toString().orEmpty()) }
  OutlinedTextField(
    text,
    { v -> text = v.filter { it.isDigit() }.take(4); onChange(text.toIntOrNull()?.takeIf { it in 1900..2100 }) },
    label = { Text(label) }, singleLine = true, modifier = modifier,
    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
  )
}
