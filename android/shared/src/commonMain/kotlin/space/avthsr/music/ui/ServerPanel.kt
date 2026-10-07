// The servers at a glance for the admin: disks (the main server's and the music storage's), processor and
// memory, people online and listening, downloads — and the last day as small charts, to see how far it
// all can grow.
package space.avthsr.music.ui

import androidx.compose.foundation.Canvas
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
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import space.avthsr.music.api.Api
import space.avthsr.music.api.ServerStats
import space.avthsr.music.api.serverStats
import space.avthsr.music.tr
import kotlin.math.roundToInt

@Composable
internal fun AdminServer() {
  val loader = rememberLoad(Unit) { Api.serverStats() }
  LaunchedEffect(Unit) { while (true) { delay(30_000); loader.reload() } }
  Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp).padding(bottom = 80.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
    val s = loader.data
    if (s == null) { Text(tr("Загрузка…"), color = MaterialTheme.colorScheme.onSurfaceVariant); return@Column }
    Card(tr("Люди")) {
      Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        StatTile(s.people.online.toString(), tr("онлайн"), Modifier.weight(1f))
        StatTile(s.people.listening.toString(), tr("слушают"), Modifier.weight(1f))
        StatTile(s.people.today.toString(), tr("за сутки"), Modifier.weight(1f))
      }
      Text(tr("Открытых приложений и вкладок: {}", s.people.devices), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
      Spark(s.history.map { it.online.toFloat() }, tr("онлайн за сутки (пик {})", s.history.maxOfOrNull { it.online } ?: 0), MaterialTheme.colorScheme.primary)
    }
    Card(tr("Диски")) {
      s.disks.forEach { d ->
        val part = if (d.total > 0) d.used.toFloat() / d.total else 0f
        Text(d.name, style = MaterialTheme.typography.titleSmall)
        LinearProgressIndicator(progress = { part }, modifier = Modifier.fillMaxWidth().height(8.dp), color = if (part > 0.9f) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary, strokeCap = StrokeCap.Round)
        Text(tr("Свободно {} из {}", fmtBytes(d.free), fmtBytes(d.total)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(4.dp))
      }
      val room = s.disks.lastOrNull()?.free ?: 0
      if (s.music.avgTrackBytes > 0) Text(
        tr("Музыка: {} в {} — места ещё примерно на {} треков", fmtBytes(s.music.bytes), tracksWord(s.music.tracks), (room / s.music.avgTrackBytes).toString()),
        style = MaterialTheme.typography.bodyMedium,
      )
    }
    Card(tr("Процессор и память")) {
      val cpu = (s.cpu.busy * 100).roundToInt()
      val memUsed = if (s.memory.total > 0) 1f - s.memory.free.toFloat() / s.memory.total else 0f
      Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        StatTile("$cpu%", tr("процессор · {} ядер", s.cpu.cores), Modifier.weight(1f))
        StatTile("${(memUsed * 100).roundToInt()}%", tr("память · {}", fmtBytes(s.memory.total)), Modifier.weight(1f))
      }
      Text(
        tr("Нагрузка (1/5/15 мин): {} · приложение занимает {} · сервер работает {}", s.cpu.load.joinToString(" / ") { ((it * 100).roundToInt() / 100.0).toString() }, fmtBytes(s.memory.app), uptime(s.uptime.server)),
        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
      Spark(s.history.map { it.load }, tr("нагрузка за сутки"), MaterialTheme.colorScheme.tertiary)
    }
    Card(tr("Загрузки")) {
      Text(
        tr("Сейчас качается: {}, в очереди: {}. Одновременно — до {} (аккаунтов YouTube: {}, серверов-выходов: {}).", s.downloads.running, s.downloads.queued, s.downloads.slots, s.downloads.accounts, s.downloads.exits),
        style = MaterialTheme.typography.bodyMedium,
      )
    }
    Text(capacityHint(s), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
  }
}

/** A rough word on how many more people the setup takes. */
private fun capacityHint(s: ServerStats): String {
  val cpu = s.cpu.busy
  val peak = s.history.maxOfOrNull { it.listening } ?: s.people.listening
  return when {
    cpu > 0.8f -> tr("Процессор почти занят — больше людей лучше не звать, пока не станет свободнее.")
    peak == 0 -> tr("Слушают немного: прослушивание почти не нагружает сервер — главное, чтобы хватало места и интернета.")
    else -> tr("Один слушатель — это около 0,3 Мбит/с; при нагрузке {}% на {} слушателей запас на десятки человек.", (cpu * 100).roundToInt(), peak)
  }
}

private fun uptime(sec: Double): String {
  val h = (sec / 3600).toInt()
  return if (h >= 48) tr("{} дн.", h / 24) else tr("{} ч", h)
}

@Composable
private fun Card(title: String, content: @Composable () -> Unit) {
  Column(
    Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(MaterialTheme.colorScheme.surfaceContainer).padding(16.dp),
    verticalArrangement = Arrangement.spacedBy(8.dp),
  ) {
    Text(title, style = MaterialTheme.typography.titleMedium)
    content()
  }
}

/** A small line chart of the last day. */
@Composable
private fun Spark(values: List<Float>, caption: String, color: Color) {
  if (values.size < 2) return
  val max = (values.maxOrNull() ?: 0f).coerceAtLeast(0.0001f)
  Canvas(Modifier.fillMaxWidth().height(48.dp)) {
    val step = size.width / (values.size - 1)
    val path = Path()
    values.forEachIndexed { i, v ->
      val p = Offset(i * step, size.height - (v / max) * size.height * 0.9f - 2f)
      if (i == 0) path.moveTo(p.x, p.y) else path.lineTo(p.x, p.y)
    }
    drawPath(path, color, style = Stroke(2.dp.toPx(), cap = StrokeCap.Round))
  }
  Text(caption, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}
