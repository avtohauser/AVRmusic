// "What's playing?": ten seconds from the microphone go to the server, which recognises the song and
// finds it in the catalogue — to play it if it is already here, or fetch it to the server.
package space.avthsr.music.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialShapes
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.toShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import space.avthsr.music.App
import space.avthsr.music.api.Api
import space.avthsr.music.api.CatalogTrack
import space.avthsr.music.api.Recognized
import space.avthsr.music.api.recognize
import space.avthsr.music.player.PlayerConn
import space.avthsr.music.res.*
import space.avthsr.music.tr

private sealed interface Hearing {
  data object Idle : Hearing
  data object Listening : Hearing
  data object Searching : Hearing
  data class Found(val r: Recognized) : Hearing
  data class Failed(val message: String) : Hearing
}

@Composable
fun RecognizeScreen() {
  val cs = MaterialTheme.colorScheme
  val recorder = rememberRecorder()
  val scope = rememberCoroutineScope()
  var state by remember { mutableStateOf<Hearing>(Hearing.Idle) }
  var level by remember { mutableFloatStateOf(0f) }
  val lvl by animateFloatAsState(level, tween(120), label = "level")
  fun listen() {
    if (state == Hearing.Listening || state == Hearing.Searching) return
    // our own music would be heard instead of the song around
    if (PlayerConn.state.value.playing) PlayerConn.toggle()
    state = Hearing.Listening
    scope.launch {
      val rec = recorder.record(10_000) { level = it }
      level = 0f
      if (rec == null) { state = Hearing.Failed(tr("Нет доступа к микрофону")); return@launch }
      state = Hearing.Searching
      state = runCatching { Api.recognize(rec.bytes, rec.fileName, rec.mime) }
        .fold({ Hearing.Found(it) }, { Hearing.Failed(it.message ?: tr("Не получилось")) })
    }
  }
  Page {
    Column(
      Modifier.fillMaxSize().padding(screenPadding(top = 60.dp, bottom = 16.dp)).padding(horizontal = 20.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
    ) {
      FlowText(tr("Что это играет?"), MaterialTheme.typography.headlineMedium, maxLines = 1)
      Spacer(Modifier.height(24.dp))
      val busy = state == Hearing.Listening || state == Hearing.Searching
      val pulse = rememberInfiniteTransition(label = "pulse")
      val wave by pulse.animateFloat(0f, 1f, infiniteRepeatable(tween(1600, easing = LinearEasing)), label = "wave")
      val turn by pulse.animateFloat(0f, 360f, infiniteRepeatable(tween(6000, easing = LinearEasing)), label = "turn")
      Box(Modifier.size(240.dp), contentAlignment = Alignment.Center) {
        // rings spreading from the button while listening, wider the louder it is
        if (busy) repeat(3) { i ->
          val k = (wave + i / 3f) % 1f
          Box(
            Modifier.size(140.dp).graphicsLayer {
              val sc = 1f + k * (0.6f + lvl * 0.8f)
              scaleX = sc; scaleY = sc; alpha = (1f - k) * 0.5f
              rotationZ = turn * (if (i % 2 == 0) 1 else -1)
            }.clip(MaterialShapes.Cookie9Sided.toShape()).background(cs.primary),
          )
        }
        Box(
          Modifier.size(140.dp).graphicsLayer { rotationZ = if (busy) turn / 3 else 0f; val sc = 1f + lvl * 0.12f; scaleX = sc; scaleY = sc }
            .clip(MaterialShapes.Cookie12Sided.toShape()).background(if (busy) cs.primary else cs.primaryContainer)
            .clickable(enabled = !busy) { listen() },
          contentAlignment = Alignment.Center,
        ) { Ico(Res.drawable.ic_mic, tr("Слушать"), Modifier.size(56.dp), if (busy) cs.onPrimary else cs.onPrimaryContainer) }
      }
      Spacer(Modifier.height(16.dp))
      AnimatedContent(
        targetState = state,
        transitionSpec = { (fadeIn(tween(300)) + scaleIn(initialScale = 0.94f)).togetherWith(fadeOut(tween(150))) },
        label = "hearing",
        contentKey = { it::class },
      ) { s ->
        when (s) {
          Hearing.Idle -> HearHint(tr("Нажмите и поднесите телефон к музыке — нужно секунд десять"))
          Hearing.Listening -> HearHint(tr("Слушаю…"))
          Hearing.Searching -> HearHint(tr("Узнаю песню…"))
          is Hearing.Failed -> Column(horizontalAlignment = Alignment.CenterHorizontally) {
            HearHint(s.message)
            FilledTonalButton(onClick = { listen() }, shapes = ButtonDefaults.shapes()) { Text(tr("Ещё раз")) }
          }
          is Hearing.Found -> Result(s.r) { listen() }
        }
      }
    }
  }
}

@Composable
private fun HearHint(text: String) {
  Text(text, Modifier.fillMaxWidth().padding(8.dp), style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
}

@Composable
private fun Result(r: Recognized, again: () -> Unit) {
  val cs = MaterialTheme.colorScheme
  Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(cs.secondaryContainer).padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
      Cover(r.coverUrl ?: r.catalog.firstOrNull()?.album?.coverUrl, Modifier.size(84.dp), RoundedCornerShape(20.dp))
      Spacer(Modifier.width(14.dp))
      Column(Modifier.weight(1f)) {
        Text(tr("Это"), style = MaterialTheme.typography.labelLarge, color = cs.onSecondaryContainer.copy(alpha = 0.7f))
        Text(r.title, style = MaterialTheme.typography.titleLarge, color = cs.onSecondaryContainer, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text(r.artist, style = MaterialTheme.typography.titleSmall, color = cs.onSecondaryContainer, maxLines = 1, overflow = TextOverflow.Ellipsis)
      }
    }
    Spacer(Modifier.height(12.dp))
    if (r.catalog.isEmpty()) HearHint(tr("В каталоге не нашлось — попробуйте поиск"))
    LazyColumn(Modifier.weight(1f, fill = false), verticalArrangement = Arrangement.spacedBy(4.dp)) {
      items(r.catalog.take(5), key = { it.id }) { t -> CatalogHit(t) }
    }
    Spacer(Modifier.height(8.dp))
    FilledTonalButton(onClick = again, shapes = ButtonDefaults.shapes()) { Ico(Res.drawable.ic_mic, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(tr("Узнать другую")) }
  }
}

/** A catalogue match: plays at once when it is in the library, otherwise can be fetched to the server. */
@Composable
private fun CatalogHit(t: CatalogTrack) {
  val nav = LocalNav.current
  val scope = rememberCoroutineScope()
  Row(
    Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).clickable { t.album?.let { nav.catalogAlbum(it.id) } }.padding(8.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Cover(t.album?.coverUrl, Modifier.size(48.dp), RoundedCornerShape(12.dp))
    Spacer(Modifier.width(12.dp))
    Column(Modifier.weight(1f)) {
      Text(t.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis)
      Text(listOfNotNull(t.artists, t.album?.title).joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
    val lib = t.libraryTrackId
    if (lib != null) Button(onClick = { scope.launch { runCatching { PlayerConn.playId(lib) }.onFailure { App.say(it.message ?: tr("Не получилось")) } } }, shapes = ButtonDefaults.shapes()) {
      Ico(Res.drawable.ic_play, null, Modifier.size(18.dp))
    } else FilledTonalButton(onClick = { act(tr("Скачиваю на сервер — трек появится в медиатеке")) { Api.acquire("track", t.id) } }, shapes = ButtonDefaults.shapes()) {
      Ico(Res.drawable.ic_download, null, Modifier.size(18.dp))
    }
  }
}
