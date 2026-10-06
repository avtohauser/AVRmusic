// The listener's other devices, from the player: what each plays, its buttons, and moving the music
// between this one and them.
package space.avthsr.music.ui

import androidx.compose.foundation.background
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import space.avthsr.music.api.DeviceInfo
import space.avthsr.music.player.Devices
import space.avthsr.music.player.PlayerConn
import space.avthsr.music.res.*
import space.avthsr.music.tr

@Composable
fun DevicesSheet(onDismiss: () -> Unit) {
  val cs = MaterialTheme.colorScheme
  val list by Devices.list.collectAsStateWithLifecycle()
  val player by PlayerConn.state.collectAsStateWithLifecycle()
  LaunchedEffect(Unit) { while (true) { Devices.report(); delay(4000) } }
  ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 28.dp)) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        Ico(Res.drawable.ic_devices, null, Modifier.size(28.dp), cs.primary)
        Spacer(Modifier.width(12.dp))
        Column {
          Text(tr("Устройства"), style = MaterialTheme.typography.titleLarge)
          Text(tr("Где вы вошли в avr music: управляйте ими и переносите музыку"), style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant)
        }
      }
      Spacer(Modifier.height(14.dp))
      val others = list.filter { !it.current && it.id != Devices.id }
      if (others.isEmpty()) Text(
        tr("Других устройств сейчас нет. Откройте avr music на другом телефоне или на сайте — оно появится здесь."),
        style = MaterialTheme.typography.bodyMedium, color = cs.onSurfaceVariant,
      )
      others.forEach { d -> DeviceCard(d, canSend = player.track != null) }
    }
  }
}

@Composable
private fun DeviceCard(d: DeviceInfo, canSend: Boolean) {
  val cs = MaterialTheme.colorScheme
  Column(Modifier.padding(vertical = 6.dp).fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(if (d.playing) cs.primaryContainer else cs.surfaceContainerHigh).padding(14.dp)) {
    val on = if (d.playing) cs.onPrimaryContainer else cs.onSurface
    Row(verticalAlignment = Alignment.CenterVertically) {
      Ico(if (d.kind == "web") Res.drawable.ic_web else Res.drawable.ic_phone, null, Modifier.size(24.dp), on)
      Spacer(Modifier.width(10.dp))
      Column(Modifier.weight(1f)) {
        Text(d.name, style = MaterialTheme.typography.titleMedium, color = on, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(
          d.track?.let { (if (d.playing) "♪ " else "❚❚ ") + "${it.title} · ${it.artists}" } ?: tr("Ничего не играет"),
          style = MaterialTheme.typography.bodySmall, color = on.copy(alpha = 0.8f), maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
      }
    }
    if (d.track != null) Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
      IconButton(onClick = { Devices.command(d.id, "prev") }) { Ico(Res.drawable.ic_skip_prev, tr("Предыдущий"), tint = on) }
      IconButton(onClick = { Devices.command(d.id, if (d.playing) "pause" else "play") }) {
        Ico(if (d.playing) Res.drawable.ic_pause else Res.drawable.ic_play, if (d.playing) tr("Пауза") else tr("Играть"), Modifier.size(32.dp), on)
      }
      IconButton(onClick = { Devices.command(d.id, "next") }) { Ico(Res.drawable.ic_skip_next, tr("Следующий"), tint = on) }
    }
    if (d.kind == "web") Row(verticalAlignment = Alignment.CenterVertically) {
      Ico(Res.drawable.ic_volume, null, Modifier.size(20.dp), on)
      var vol by remember(d.id) { mutableFloatStateOf(d.volume) }
      Slider(vol, { vol = it }, onValueChangeFinished = { Devices.command(d.id, "volume", volume = vol) }, modifier = Modifier.weight(1f).padding(start = 8.dp))
    }
    Spacer(Modifier.height(4.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
      if (canSend) FilledTonalButton(onClick = { Devices.sendTo(d) }, shapes = ButtonDefaults.shapes(), modifier = Modifier.weight(1f)) {
        Ico(Res.drawable.ic_send_to, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(tr("Играть там"), maxLines = 1)
      }
      if (d.track != null) OutlinedButton(onClick = { Devices.takeFrom(d) }, shapes = ButtonDefaults.shapes(), modifier = Modifier.weight(1f)) {
        Ico(Res.drawable.ic_download, null, Modifier.size(18.dp), on); Spacer(Modifier.width(6.dp)); Text(tr("Забрать сюда"), maxLines = 1, color = on)
      }
    }
  }
}

/** The devices button for the player's top bar: lit when another device plays. */
@Composable
fun DevicesButton(onClick: () -> Unit) {
  val list by Devices.list.collectAsStateWithLifecycle()
  val others = list.filter { !it.current && it.id != Devices.id }
  if (others.isEmpty()) return
  Box {
    IconButton(onClick = onClick) {
      Ico(Res.drawable.ic_devices, tr("Устройства"), tint = if (others.any { it.playing }) MaterialTheme.colorScheme.primary else androidx.compose.material3.LocalContentColor.current)
    }
  }
}
