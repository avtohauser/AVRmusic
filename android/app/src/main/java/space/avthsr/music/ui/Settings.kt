@file:OptIn(ExperimentalMaterial3ExpressiveApi::class, ExperimentalLayoutApi::class)

package space.avthsr.music.ui

import space.avthsr.music.tr
import space.avthsr.music.Lang
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.ToggleButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import space.avthsr.music.R
import space.avthsr.music.player.PlayerConn

/** Look and playback settings, like the site's settings. */
@Composable
fun SettingsScreen() {
  val mode by Look.mode.collectAsStateWithLifecycle()
  val source by Look.source.collectAsStateWithLifecycle()
  val seed by Look.seed.collectAsStateWithLifecycle()
  val variant by Look.variant.collectAsStateWithLifecycle()
  val contrast by Look.contrast.collectAsStateWithLifecycle()
  val speed by PlayerConn.speed.collectAsStateWithLifecycle()
  Page {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(start = 20.dp, end = 20.dp, top = 60.dp, bottom = 32.dp)) {
      FlowText(tr("Оформление"), MaterialTheme.typography.headlineMedium, maxLines = 1)
      Group(tr("Язык")) { Choices(Lang.choices, Lang.code) { Lang.set(it) } }
      Group(tr("Тема")) { Choices(Look.modes, mode) { Look.set(mode = it) } }
      Group(tr("Цвета")) { Choices(Look.sources, source) { Look.set(source = it) } }
      if (source == "seed") Group(tr("Основной цвет")) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
          Look.seeds.forEach { c ->
            val on = c == seed
            Box(
              Modifier.size(44.dp).clip(CircleShape).background(Color(c))
                .then(if (on) Modifier.border(3.dp, MaterialTheme.colorScheme.onSurface, CircleShape) else Modifier)
                .clickable { Look.set(seed = c) },
              contentAlignment = Alignment.Center,
            ) { if (on) Ico(R.drawable.ic_check, null, Modifier.size(20.dp), Color.White) }
          }
        }
      }
      if (source != "system") {
        Group(tr("Вариант палитры")) { Choices(Look.variants, variant) { Look.set(variant = it) } }
        Group(tr("Контраст")) { Choices(Look.contrasts, contrast) { Look.set(contrast = it) } }
      }
      Spacer(Modifier.height(12.dp))
      Text(tr("Воспроизведение"), style = MaterialTheme.typography.headlineSmall)
      Group(tr("Скорость")) {
        Choices(PlayerConn.speeds.map { Choice(it.toString(), "${if (it % 1f == 0f) it.toInt() else it}×") }, speed.toString()) { PlayerConn.setSpeed(it.toFloat()) }
      }
    }
  }
}

@Composable
private fun Group(title: String, content: @Composable () -> Unit) {
  Spacer(Modifier.height(18.dp))
  Text(title, style = MaterialTheme.typography.titleMedium)
  Spacer(Modifier.height(8.dp))
  content()
}

/** Expressive toggle buttons that wrap onto new lines. */
@Composable
private fun Choices(options: List<Choice>, selected: String, onSelect: (String) -> Unit) {
  FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
    options.forEach { o -> ToggleButton(checked = o.id == selected, onCheckedChange = { onSelect(o.id) }) { Text(o.label) } }
  }
}
