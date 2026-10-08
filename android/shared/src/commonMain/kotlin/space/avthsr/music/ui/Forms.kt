// Small building blocks for the profile and admin screens: form dialogs, confirmations, pickers,
// formatting of sizes / durations / dates, and a bar chart.
package space.avthsr.music.ui

import space.avthsr.music.tr
import space.avthsr.music.Lang
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import space.avthsr.music.App
import space.avthsr.music.Platform
import space.avthsr.music.fmtClock
import space.avthsr.music.fmtDate
import space.avthsr.music.fmtNumber
import space.avthsr.music.parseTime

/** Runs server work outside the screen; says [ok] when it worked and the error when not. */
fun act(ok: String? = null, then: () -> Unit = {}, work: suspend () -> Unit) {
  App.scope.launch {
    runCatching { work() }
      .onSuccess { ok?.let { App.say(it) }; then() }
      .onFailure { App.say(space.avthsr.music.api.friendlyError(it)) }
  }
}

data class Field(
  val label: String,
  val initial: String = "",
  val password: Boolean = false,
  val number: Boolean = false,
  val lines: Int = 1,
)

/** A dialog with text fields; [onConfirm] gets the values in the same order. */
@Composable
fun FormDialog(title: String, fields: List<Field>, confirm: String = tr("Сохранить"), onDismiss: () -> Unit, onConfirm: (List<String>) -> Unit) {
  val values = remember { mutableStateListOf(*fields.map { it.initial }.toTypedArray()) }
  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text(title) },
    text = {
      Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        fields.forEachIndexed { i, f ->
          OutlinedTextField(
            value = values[i],
            onValueChange = { values[i] = it },
            label = { Text(f.label) },
            singleLine = f.lines == 1,
            minLines = f.lines,
            visualTransformation = if (f.password) PasswordVisualTransformation() else VisualTransformation.None,
            keyboardOptions = KeyboardOptions(keyboardType = if (f.password) KeyboardType.Password else if (f.number) KeyboardType.Number else KeyboardType.Text),
            modifier = Modifier.fillMaxWidth(),
          )
        }
      }
    },
    confirmButton = { TextButton(onClick = { onDismiss(); onConfirm(values.toList()) }) { Text(confirm) } },
    dismissButton = { TextButton(onClick = onDismiss) { Text(tr("Отмена")) } },
  )
}

@Composable
fun ConfirmDialog(title: String, text: String, confirm: String, onDismiss: () -> Unit, onConfirm: () -> Unit) {
  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text(title) },
    text = { Text(text) },
    confirmButton = { TextButton(onClick = { onDismiss(); onConfirm() }) { Text(confirm, color = MaterialTheme.colorScheme.error) } },
    dismissButton = { TextButton(onClick = onDismiss) { Text(tr("Отмена")) } },
  )
}

/** A row with a checkbox. */
@Composable
fun CheckRow(text: String, checked: Boolean, onChange: (Boolean) -> Unit) {
  Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable { onChange(!checked) }.padding(vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
    Checkbox(checked = checked, onCheckedChange = onChange)
    Text(text, style = MaterialTheme.typography.bodyLarge)
  }
}

/** A big number with a caption. */
@Composable
fun StatTile(value: String, caption: String, modifier: Modifier = Modifier) {
  Column(modifier.clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.surfaceContainer).padding(14.dp)) {
    Text(value, style = MaterialTheme.typography.headlineSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
    Text(caption, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
  }
}

/** Tiles two per row. */
@Composable
fun StatGrid(items: List<Pair<String, String>>) {
  Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
    items.chunked(2).forEach { row ->
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        row.forEach { (v, c) -> StatTile(v, c, Modifier.weight(1f)) }
        if (row.size == 1) Spacer(Modifier.weight(1f))
      }
    }
  }
}

/** Bars, one per value (e.g. plays per day). */
@Composable
fun Bars(values: List<Float>, caption: String) {
  val color = MaterialTheme.colorScheme.primary
  val track = MaterialTheme.colorScheme.surfaceContainerHighest
  Column(Modifier.padding(horizontal = 16.dp)) {
    Canvas(Modifier.fillMaxWidth().height(110.dp)) {
      if (values.isEmpty()) return@Canvas
      val max = values.max().coerceAtLeast(1f)
      val gap = 3.dp.toPx()
      val w = (size.width - gap * (values.size - 1)) / values.size
      values.forEachIndexed { i, v ->
        val x = i * (w + gap)
        drawRoundRect(track, Offset(x, 0f), Size(w, size.height), CornerRadius(w / 3))
        val h = size.height * (v / max)
        drawRoundRect(color, Offset(x, size.height - h), Size(w, h), CornerRadius(w / 3))
      }
    }
    Text(caption, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
  }
}

/** A labelled value line in a card. */
@Composable
fun InfoLine(label: String, value: String) {
  Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
    Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.width(150.dp))
    Text(value, style = MaterialTheme.typography.bodyMedium)
  }
}

@Composable
fun Dot(on: Boolean) {
  Box(Modifier.size(8.dp).clip(RoundedCornerShape(4.dp)).background(if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline))
}

fun fmtBytes(b: Long): String = when {
  b >= 1L shl 30 -> tr("{} ГБ", fmtNumber(b / (1L shl 30).toDouble(), 1))
  b >= 1L shl 20 -> tr("{} МБ", fmtNumber(b / (1L shl 20).toDouble(), 0))
  b >= 1L shl 10 -> tr("{} КБ", fmtNumber(b / 1024.0, 0))
  else -> tr("{} Б", b)
}

/** "12 ч 5 мин" */
fun fmtListened(ms: Long): String {
  val min = ms / 60_000
  return if (min >= 60) tr("{} ч {} мин", (min / 60), (min % 60)) else tr("{} мин", min)
}

/** "5 мин назад", "вчера" … in the app's language */
fun fmtAgo(s: String?): String {
  val t = parseTime(s) ?: return "—"
  val min = (Platform.nowMs() - t) / 60_000
  return when {
    min < 1 -> tr("только что")
    min < 60 -> tr("{} мин назад", min)
    min < 24 * 60 -> tr("{} ч назад", (min / 60))
    min < 48 * 60 -> tr("вчера")
    min < 7 * 24 * 60 -> tr("{} дн назад", (min / (24 * 60)))
    else -> fmtDate(t)
  }
}

fun fmtDateTime(s: String?): String {
  val t = parseTime(s) ?: return "—"
  return "${fmtDate(t)}, ${fmtClock(t)}"
}
