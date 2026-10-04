@file:OptIn(ExperimentalLayoutApi::class)

package space.avthsr.music.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TimeInput
import androidx.compose.material3.ToggleButton
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import space.avthsr.music.Platform
import space.avthsr.music.fmtClock
import space.avthsr.music.player.Alarm
import space.avthsr.music.player.AlarmSetting
import space.avthsr.music.player.Queue
import space.avthsr.music.res.*
import space.avthsr.music.tr

/** "Завтра в 7:30" / "выключен" for the profile's line. */
@Composable
fun alarmLine(): String {
  val next by Alarm.next.collectAsStateWithLifecycle()
  val at = next ?: return tr("Выключен — проснуться под свою музыку")
  return tr("Зазвонит в {} · через {}", fmtClock(at), fmtIn(at - Platform.nowMs()))
}

private fun fmtIn(ms: Long): String {
  val min = (ms / 60_000).coerceAtLeast(0)
  return if (min >= 60) tr("{} ч {} мин", min / 60, min % 60) else tr("{} мин", min)
}

private val dayNames get() = listOf(tr("Пн"), tr("Вт"), tr("Ср"), tr("Чт"), tr("Пт"), tr("Сб"), tr("Вс"))

@Composable
fun AlarmScreen() {
  val cs = MaterialTheme.colorScheme
  val saved by Alarm.setting.collectAsStateWithLifecycle()
  var draft by remember { mutableStateOf(saved) }
  val time = rememberTimePickerState(initialHour = saved.hour, initialMinute = saved.minute, is24Hour = true)
  LaunchedEffect(time.hour, time.minute) { draft = draft.copy(hour = time.hour, minute = time.minute) }
  Page {
    Column(
      Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(screenPadding(start = 20.dp, end = 20.dp, top = 60.dp, bottom = 32.dp)),
    ) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        FlowText(tr("Будильник"), MaterialTheme.typography.headlineMedium, Modifier.weight(1f), maxLines = 1)
        Switch(checked = draft.on, onCheckedChange = { draft = draft.copy(on = it) })
      }
      Text(tr("Музыка начнётся сама и за минуту поднимется от шёпота до полной громкости"), style = MaterialTheme.typography.bodyMedium, color = cs.onSurfaceVariant)
      Spacer(Modifier.height(20.dp))
      Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) { TimeInput(state = time) }
      Spacer(Modifier.height(12.dp))
      Text(tr("Дни"), style = MaterialTheme.typography.titleMedium)
      Spacer(Modifier.height(8.dp))
      FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        dayNames.forEachIndexed { i, name ->
          val d = i + 1
          ToggleButton(checked = d in draft.days, onCheckedChange = { on -> draft = draft.copy(days = if (on) draft.days + d else draft.days - d) }) { Text(name) }
        }
      }
      Text(
        if (draft.days.isEmpty()) tr("Один раз") else if (draft.days.size == 7) tr("Каждый день") else tr("По выбранным дням"),
        Modifier.padding(top = 6.dp), style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant,
      )
      Spacer(Modifier.height(18.dp))
      Text(tr("Что играет"), style = MaterialTheme.typography.titleMedium)
      Spacer(Modifier.height(8.dp))
      FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        (listOf("liked" to tr("Избранное")) + Queue.modes.map { it.id to tr("Волна: {}", it.label) }).forEach { (id, label) ->
          ToggleButton(checked = draft.source == id, onCheckedChange = { draft = draft.copy(source = id) }) { Text(label) }
        }
      }
      Spacer(Modifier.height(24.dp))
      val changed = draft != saved
      Button(
        onClick = { Alarm.save(draft) }, enabled = changed, shapes = ButtonDefaults.shapes(),
        modifier = Modifier.fillMaxWidth().height(56.dp),
      ) {
        Ico(Res.drawable.ic_alarm, null, Modifier.size(20.dp)); Spacer(Modifier.width(8.dp)); Text(tr("Сохранить"))
      }
      Spacer(Modifier.height(12.dp))
      val line = alarmLine()
      Text(line, Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(cs.surfaceContainer).padding(14.dp), style = MaterialTheme.typography.bodyMedium)
      if (Platform.name == "iOS") Text(
        tr("На iPhone будильник приходит уведомлением: нажмите на него — и музыка включится. Если приложение открыто, музыка включится сама."),
        Modifier.padding(top = 10.dp), style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant,
      )
    }
  }
}

