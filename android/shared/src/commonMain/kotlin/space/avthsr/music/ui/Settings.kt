@file:OptIn(ExperimentalMaterial3ExpressiveApi::class, ExperimentalLayoutApi::class)

package space.avthsr.music.ui

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Switch
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
import space.avthsr.music.res.*
import space.avthsr.music.player.PlayerConn
import space.avthsr.music.player.AutoOffline
import space.avthsr.music.player.EQ_FREQS
import space.avthsr.music.player.Gain
import space.avthsr.music.player.NowReport
import space.avthsr.music.Platform
import androidx.compose.material3.Slider
import androidx.compose.foundation.layout.requiredWidth
import androidx.compose.foundation.layout.width
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlin.math.roundToInt

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
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(screenPadding(start = 20.dp, end = 20.dp, top = 60.dp, bottom = 32.dp))) {
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
            ) { if (on) Ico(Res.drawable.ic_check, null, Modifier.size(20.dp), Color.White) }
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
      val canvasOn by Look.canvas.collectAsStateWithLifecycle()
      Row(
        Modifier.fillMaxWidth().padding(top = 16.dp).clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.surfaceContainer)
          .clickable { Look.setCanvas(!canvasOn) }.padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Column(Modifier.weight(1f)) {
          Text(tr("Канвасы"), style = MaterialTheme.typography.titleMedium)
          Text(tr("Короткие видео за плеером вместо обложки"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(checked = canvasOn, onCheckedChange = { Look.setCanvas(it) })
      }

      Spacer(Modifier.height(24.dp))
      Text(tr("Звук"), style = MaterialTheme.typography.headlineSmall)
      val fade by Gain.fadeMs.collectAsStateWithLifecycle()
      Group(tr("Плавные переходы между треками")) { Choices(Gain.fades, fade.toString()) { Gain.setFade(it.toInt()) } }
      val norm by Gain.normalize.collectAsStateWithLifecycle()
      SwitchRow(tr("Выравнивание громкости"), tr("Все треки звучат одинаково громко — без скачков между ними"), norm) { Gain.setNormalize(it) }
      if (Platform.name == "Android") Equalizer()

      Spacer(Modifier.height(24.dp))
      Text(tr("Друзья и офлайн"), style = MaterialTheme.typography.headlineSmall)
      var showNow by remember { mutableStateOf(NowReport.enabled()) }
      SwitchRow(tr("Показывать друзьям, что я слушаю"), tr("Друзья видят трек на главной и могут присоединиться"), showNow) { showNow = it; NowReport.setEnabled(it) }
      val auto by AutoOffline.enabled.collectAsStateWithLifecycle()
      SwitchRow(tr("Скачивать избранное по Wi-Fi"), tr("Всё, что вы лайкнули, само сохраняется на телефон"), auto) { AutoOffline.set(it) }
    }
  }
}

@Composable
private fun SwitchRow(title: String, subtitle: String, checked: Boolean, onChange: (Boolean) -> Unit) {
  Row(
    Modifier.fillMaxWidth().padding(top = 12.dp).clip(RoundedCornerShape(20.dp)).background(MaterialTheme.colorScheme.surfaceContainer)
      .clickable { onChange(!checked) }.padding(horizontal = 16.dp, vertical = 12.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Column(Modifier.weight(1f)) {
      Text(title, style = MaterialTheme.typography.titleMedium)
      Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    Switch(checked = checked, onCheckedChange = onChange)
  }
}

/** The equalizer: presets and five bands, applied on the player's audio (Android). */
@Composable
private fun Equalizer() {
  val on by Gain.eqOn.collectAsStateWithLifecycle()
  val preset by Gain.eqPreset.collectAsStateWithLifecycle()
  val bands by Gain.eqBands.collectAsStateWithLifecycle()
  SwitchRow(tr("Эквалайзер"), tr("Басы, голос, высокие — под ваши наушники"), on) { Gain.setEqOn(it) }
  if (!on) return
  Group(tr("Пресет")) { Choices(Gain.presets.map { Choice(it.id, it.label) }, preset) { Gain.setPreset(it) } }
  Spacer(Modifier.height(10.dp))
  Row(
    Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(MaterialTheme.colorScheme.surfaceContainer).padding(vertical = 14.dp, horizontal = 6.dp),
    horizontalArrangement = Arrangement.SpaceEvenly,
  ) {
    EQ_FREQS.forEachIndexed { i, hz ->
      Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.weight(1f)) {
        val db = bands.getOrElse(i) { 0f }
        Text((if (db > 0) "+" else "") + db.roundToInt(), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
        // a vertical slider: the horizontal one turned a quarter
        Box(Modifier.height(170.dp).width(48.dp), contentAlignment = Alignment.Center) {
          Slider(
            value = db, onValueChange = { Gain.setBand(i, it) }, valueRange = -12f..12f,
            modifier = Modifier.requiredWidth(170.dp).graphicsLayer { rotationZ = -90f },
          )
        }
        Text(if (hz >= 1000) tr("{} кГц", hz / 1000) else tr("{} Гц", hz), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
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
