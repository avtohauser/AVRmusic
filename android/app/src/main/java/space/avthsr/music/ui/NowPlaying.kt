@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class, ExperimentalMaterial3ExpressiveApi::class)

package space.avthsr.music.ui

import space.avthsr.music.tr
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.TextButton
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.zIndex
import space.avthsr.music.App
import kotlin.math.roundToInt
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.basicMarquee
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.HorizontalFloatingToolbar
import androidx.compose.material3.LinearWavyProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.common.Player
import coil.compose.AsyncImage
import kotlinx.coroutines.delay
import space.avthsr.music.R
import space.avthsr.music.api.Api
import space.avthsr.music.api.Track
import space.avthsr.music.player.PlayerConn
import space.avthsr.music.player.PlayerUi
import space.avthsr.music.player.Queue
import kotlin.math.max

/** Set from a track's menu: the player opens straight on the lyrics. */
val showLyrics = kotlinx.coroutines.flow.MutableStateFlow(false)

@Composable
fun NowPlayingScreen(onClose: () -> Unit) {
  val s by PlayerConn.state.collectAsStateWithLifecycle()
  val context by Queue.context.collectAsStateWithLifecycle()
  val nav = LocalNav.current
  val cs = MaterialTheme.colorScheme
  val t = s.track
  var queueOpen by remember { mutableStateOf(false) }
  var sleepMenu by remember { mutableStateOf(false) }
  val speed by PlayerConn.speed.collectAsStateWithLifecycle()
  val sleepAt by PlayerConn.sleepAt.collectAsStateWithLifecycle()
  var lyricsOpen by remember { mutableStateOf(false) }
  val wantLyrics by showLyrics.collectAsStateWithLifecycle()
  LaunchedEffect(wantLyrics) { if (wantLyrics) { lyricsOpen = true; showLyrics.value = false } }
  var menu by remember { mutableStateOf(false) }
  var pos by remember { mutableLongStateOf(0L) }
  var drag by remember { mutableStateOf<Float?>(null) }
  var pull by remember { mutableFloatStateOf(0f) }
  LaunchedEffect(Unit) {
    while (true) { pos = PlayerConn.position(); delay(200) }
  }
  val inWave = context == Queue.WAVE
  val coverScale by animateFloatAsState(if (s.playing) 1f else 0.86f, MaterialTheme.motionScheme.slowSpatialSpec(), label = "cover")

  Box(
    Modifier.fillMaxSize()
      .graphicsLayer { translationY = pull }
      .background(cs.background)
      .pointerInput(Unit) {
        detectVerticalDragGestures(
          onDragEnd = { if (pull > 220f) onClose(); pull = 0f },
          onDragCancel = { pull = 0f },
        ) { change, dy -> change.consume(); pull = max(0f, pull + dy) }
      },
  ) {
    val canvas = t?.hasCanvas == true
    if (t != null && canvas) {
      TrackCanvas(t, s.playing, Modifier.fillMaxSize())
    } else if (t != null) {
      AsyncImage(
        model = Api.img(t.coverUrl), contentDescription = null, contentScale = ContentScale.Crop, alpha = 0.55f,
        modifier = Modifier.fillMaxSize().blur(90.dp),
      )
    }
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(if (canvas) listOf(cs.background.copy(alpha = 0.5f), Color.Transparent, cs.background.copy(alpha = 0.6f), cs.background) else listOf(cs.background.copy(alpha = 0.35f), cs.background.copy(alpha = 0.8f), cs.background))))

    Column(Modifier.fillMaxSize().windowInsetsPadding(SafeBars).padding(horizontal = 24.dp, vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
      Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onClose) { Ico(R.drawable.ic_expand_more, tr("Свернуть")) }
        Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
          Text(if (inWave) tr("Моя волна") else tr("Сейчас играет"), style = MaterialTheme.typography.labelLarge, color = cs.onSurfaceVariant)
          if (inWave) Text(Queue.modes.firstOrNull { it.id == Queue.waveMode.value }?.label ?: "", style = MaterialTheme.typography.labelSmall, color = cs.primary)
        }
        Box {
          IconButton(onClick = { menu = true }, enabled = t != null) { Ico(R.drawable.ic_more, tr("Ещё")) }
          if (t != null) TrackMenu(t, menu, { menu = false })
        }
      }

      Spacer(Modifier.weight(1f))
      if (canvas) Spacer(Modifier.widthIn(max = 420.dp).fillMaxWidth().aspectRatio(1f))
      else Crossfade(targetState = t?.coverUrl, label = "cover") { url ->
        Cover(
          url,
          Modifier.widthIn(max = 420.dp).fillMaxWidth().aspectRatio(1f)
            .graphicsLayer { scaleX = coverScale; scaleY = coverScale }
            .shadow(28.dp, RoundedCornerShape(32.dp)),
          RoundedCornerShape(32.dp),
        )
      }
      Spacer(Modifier.weight(1f))

      Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
          Text(t?.title ?: tr("Ничего не играет"), style = MaterialTheme.typography.headlineSmall, maxLines = 1, modifier = Modifier.basicMarquee())
          Text(
            t?.artists ?: "", style = MaterialTheme.typography.titleMedium, color = cs.primary, maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.clip(RoundedCornerShape(6.dp)).clickable(enabled = !t?.artist?.id.isNullOrEmpty()) {
              t?.let { onClose(); nav.artist(it.artist.id) }
            },
          )
        }
      }
      val reason = t?.reason
      if (inWave && reason != null) {
        Text("✦ $reason", Modifier.fillMaxWidth().padding(top = 6.dp), style = MaterialTheme.typography.labelLarge, color = cs.tertiary, maxLines = 2)
      }

      Spacer(Modifier.height(10.dp))
      val duration = max(1L, s.durationMs).toFloat()
      val value = (drag ?: pos.toFloat()).coerceIn(0f, duration)
      // the expressive media seek bar: a wavy track while playing, flat when paused
      Slider(
        value = value,
        onValueChange = { drag = it },
        onValueChangeFinished = { drag?.let { PlayerConn.seek(it.toLong()) }; drag = null },
        valueRange = 0f..duration,
        enabled = t != null,
        track = { _ ->
          LinearWavyProgressIndicator(
            progress = { value / duration },
            modifier = Modifier.fillMaxWidth(),
            amplitude = { if (s.playing && drag == null) 1f else 0f },
          )
        },
      )
      Row(Modifier.fillMaxWidth()) {
        Text(fmtTime(value.toLong()), style = MaterialTheme.typography.labelMedium, color = cs.onSurfaceVariant)
        Spacer(Modifier.weight(1f))
        Text(fmtTime(s.durationMs), style = MaterialTheme.typography.labelMedium, color = cs.onSurfaceVariant)
      }

      Spacer(Modifier.height(10.dp))
      Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = { PlayerConn.toggleShuffle() }, shapes = IconButtonDefaults.shapes()) {
          Ico(R.drawable.ic_shuffle, tr("Вперемешку"), tint = if (s.shuffle) cs.primary else cs.onSurfaceVariant)
        }
        FilledTonalIconButton(onClick = { PlayerConn.prev() }, modifier = Modifier.size(64.dp), shapes = IconButtonDefaults.shapes()) {
          Ico(R.drawable.ic_skip_prev, tr("Предыдущий"), Modifier.size(32.dp))
        }
        MorphPlayButton(s.playing, { PlayerConn.toggle() }, 96.dp)
        FilledTonalIconButton(onClick = { PlayerConn.next() }, modifier = Modifier.size(64.dp), shapes = IconButtonDefaults.shapes()) {
          Ico(R.drawable.ic_skip_next, tr("Следующий"), Modifier.size(32.dp))
        }
        IconButton(onClick = { PlayerConn.cycleRepeat() }, shapes = IconButtonDefaults.shapes()) {
          Ico(
            if (s.repeat == Player.REPEAT_MODE_ONE) R.drawable.ic_repeat_one else R.drawable.ic_repeat, tr("Повтор"),
            tint = if (s.repeat == Player.REPEAT_MODE_OFF) cs.onSurfaceVariant else cs.primary,
          )
        }
      }

      Spacer(Modifier.height(14.dp))
      HorizontalFloatingToolbar(expanded = true, modifier = Modifier.align(Alignment.CenterHorizontally)) {
        if (inWave && t != null) {
          IconButton(onClick = { PlayerConn.dislike(t) }, shapes = IconButtonDefaults.shapes()) { Ico(R.drawable.ic_thumb_down, tr("Не нравится")) }
        }
        if (t != null) LikeButton("track", t.id)
        IconButton(onClick = { lyricsOpen = true }, enabled = t?.hasLyrics == true, shapes = IconButtonDefaults.shapes()) { Ico(R.drawable.ic_lyrics, tr("Текст")) }
        IconButton(onClick = { queueOpen = true }, shapes = IconButtonDefaults.shapes()) { Ico(R.drawable.ic_queue, tr("Очередь")) }
        TextButton(onClick = { PlayerConn.cycleSpeed() }) { Text("${fmtSpeed(speed)}×", style = MaterialTheme.typography.labelLarge) }
        Box {
          IconButton(onClick = { sleepMenu = true }, shapes = IconButtonDefaults.shapes()) {
            Ico(R.drawable.ic_bedtime, tr("Таймер сна"), tint = if (sleepAt != null) cs.primary else LocalContentColor.current)
          }
          DropdownMenu(expanded = sleepMenu, onDismissRequest = { sleepMenu = false }) {
            sleepAt?.let { at ->
              Text(tr("Остановится в {}", (java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(java.util.Date(at)))), Modifier.padding(horizontal = 16.dp, vertical = 8.dp), style = MaterialTheme.typography.labelLarge, color = cs.primary)
            }
            listOf(15, 30, 45, 60, 90).forEach { m ->
              DropdownMenuItem(text = { Text(tr("Через {} мин", m)) }, onClick = { sleepMenu = false; PlayerConn.setSleep(m); App.say(tr("Музыка остановится через {} мин", m)) })
            }
            if (sleepAt != null) DropdownMenuItem(text = { Text(tr("Выключить таймер")) }, onClick = { sleepMenu = false; PlayerConn.setSleep(null) })
          }
        }
      }
    }
  }

  if (queueOpen) QueueSheet(s) { queueOpen = false }
  if (lyricsOpen && t != null) LyricsSheet(t, { pos }) { lyricsOpen = false }
}

@Composable
private fun QueueSheet(s: PlayerUi, onDismiss: () -> Unit) {
  val cs = MaterialTheme.colorScheme
  val rowPx = with(LocalDensity.current) { 62.dp.toPx() }
  var dragging by remember { mutableStateOf<Int?>(null) }
  var offset by remember { mutableFloatStateOf(0f) }
  ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
    Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
      Text(tr("Очередь · {}", s.queue.size), style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
      TextButton(onClick = { PlayerConn.clearQueue() }, enabled = s.queue.size > 1) { Ico(R.drawable.ic_clear_all, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(tr("Очистить")) }
    }
    Text(
      tr("Перетаскивайте за ≡, чтобы поменять порядок"), Modifier.padding(horizontal = 20.dp),
      style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant,
    )
    val list = rememberLazyListState(initialFirstVisibleItemIndex = max(0, s.index - 1))
    LazyColumn(state = list, modifier = Modifier.fillMaxHeight(0.85f)) {
      itemsIndexed(s.queue) { i, t ->
        val current = i == s.index
        val lifted = dragging == i
        Row(
          Modifier.fillMaxWidth().height(62.dp)
            .zIndex(if (lifted) 1f else 0f)
            .graphicsLayer { if (lifted) { translationY = offset; shadowElevation = 12f } }
            .background(if (current || lifted) cs.secondaryContainer else cs.surfaceContainerLow)
            .clickable { PlayerConn.skipTo(i) }
            .padding(start = 8.dp, end = 4.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Box(
            Modifier.size(44.dp).pointerInput(i, s.queue.size) {
              detectDragGestures(
                onDragStart = { dragging = i; offset = 0f },
                onDragEnd = {
                  val to = (i + (offset / rowPx).roundToInt()).coerceIn(0, s.queue.size - 1)
                  PlayerConn.move(i, to)
                  dragging = null; offset = 0f
                },
                onDragCancel = { dragging = null; offset = 0f },
              ) { change, amount -> change.consume(); offset += amount.y }
            },
            contentAlignment = Alignment.Center,
          ) { Ico(R.drawable.ic_drag, tr("Перетащить"), tint = cs.onSurfaceVariant) }
          Cover(t.coverUrl, Modifier.size(46.dp), RoundedCornerShape(12.dp))
          Spacer(Modifier.width(12.dp))
          Column(Modifier.weight(1f)) {
            Text(t.title, maxLines = 1, overflow = TextOverflow.Ellipsis, color = if (current) cs.primary else cs.onSurface, style = MaterialTheme.typography.titleSmall)
            Text(t.artists, maxLines = 1, overflow = TextOverflow.Ellipsis, color = cs.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
          }
          if (!current) IconButton(onClick = { PlayerConn.removeAt(i) }) { Ico(R.drawable.ic_close, tr("Убрать"), tint = cs.onSurfaceVariant) }
        }
      }
    }
  }
}

private fun fmtSpeed(v: Float) = if (v % 1f == 0f) v.toInt().toString() else v.toString().trimEnd('0')

@Composable
private fun LyricsSheet(t: Track, position: () -> Long, onDismiss: () -> Unit) {
  val cs = MaterialTheme.colorScheme
  val loader = rememberLoad(t.id) { Api.lyrics(t.id) }
  ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
    Text(t.title, Modifier.padding(horizontal = 24.dp), style = MaterialTheme.typography.titleLarge)
    Text(t.artists, Modifier.padding(horizontal = 24.dp), color = cs.onSurfaceVariant)
    Box(Modifier.fillMaxWidth().fillMaxHeight(0.85f)) {
      Loaded(loader) { l ->
        val synced = l.synced
        if (!synced.isNullOrEmpty()) {
          val p = position()
          val cur = synced.indexOfLast { it.timeMs <= p }
          val list = rememberLazyListState()
          LaunchedEffect(cur) { if (cur >= 0) list.animateScrollToItem(max(0, cur - 2)) }
          LazyColumn(state = list, modifier = Modifier.fillMaxSize()) {
            itemsIndexed(synced) { i, line ->
              Text(
                line.text.ifBlank { "♪" },
                Modifier.fillMaxWidth().clickable { PlayerConn.seek(line.timeMs) }.padding(horizontal = 24.dp, vertical = 8.dp),
                style = MaterialTheme.typography.headlineSmall,
                color = when {
                  i == cur -> cs.onSurface
                  i < cur -> cs.onSurfaceVariant.copy(alpha = 0.5f)
                  else -> cs.onSurfaceVariant
                },
              )
            }
          }
        } else {
          Text(
            l.plain?.takeIf { it.isNotBlank() } ?: tr("Текста пока нет"),
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
            style = MaterialTheme.typography.bodyLarge, textAlign = TextAlign.Start,
          )
        }
      }
    }
  }
}
