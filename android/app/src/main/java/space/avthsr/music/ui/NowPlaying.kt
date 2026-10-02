@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)

package space.avthsr.music.ui

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
import androidx.compose.material3.FilledIconButton
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
import androidx.compose.runtime.mutableFloatStateOf
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
import space.avthsr.music.data.Api
import space.avthsr.music.data.Track
import space.avthsr.music.player.PlayerConn
import space.avthsr.music.player.PlayerUi
import space.avthsr.music.player.Queue
import kotlin.math.max

@Composable
fun NowPlayingScreen(onClose: () -> Unit) {
  val s by PlayerConn.state.collectAsStateWithLifecycle()
  val context by Queue.context.collectAsStateWithLifecycle()
  val nav = LocalNav.current
  val cs = MaterialTheme.colorScheme
  val t = s.track
  var queueOpen by remember { mutableStateOf(false) }
  var lyricsOpen by remember { mutableStateOf(false) }
  var menu by remember { mutableStateOf(false) }
  var pos by remember { mutableLongStateOf(0L) }
  var drag by remember { mutableStateOf<Float?>(null) }
  var pull by remember { mutableFloatStateOf(0f) }
  LaunchedEffect(Unit) {
    while (true) { pos = PlayerConn.position(); delay(200) }
  }
  val inWave = context == Queue.WAVE
  val coverScale by animateFloatAsState(if (s.playing) 1f else 0.86f, spring(dampingRatio = 0.6f, stiffness = 300f), label = "cover")
  val playCorner by animateDpAsState(if (s.playing) 26.dp else 44.dp, spring(dampingRatio = 0.55f, stiffness = 400f), label = "play")

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
    if (t != null) {
      AsyncImage(
        model = Api.img(t.coverUrl), contentDescription = null, contentScale = ContentScale.Crop, alpha = 0.55f,
        modifier = Modifier.fillMaxSize().blur(90.dp),
      )
    }
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(cs.background.copy(alpha = 0.35f), cs.background.copy(alpha = 0.8f), cs.background))))

    Column(Modifier.fillMaxSize().windowInsetsPadding(SafeBars).padding(horizontal = 24.dp, vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
      Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onClose) { Ico(R.drawable.ic_expand_more, "Свернуть") }
        Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
          Text(if (inWave) "Моя волна" else "Сейчас играет", style = MaterialTheme.typography.labelLarge, color = cs.onSurfaceVariant)
          if (inWave) Text(Queue.modes.firstOrNull { it.id == Queue.waveMode.value }?.label ?: "", style = MaterialTheme.typography.labelSmall, color = cs.primary)
        }
        Box {
          IconButton(onClick = { menu = true }, enabled = t != null) { Ico(R.drawable.ic_more, "Ещё") }
          if (t != null) TrackMenu(t, menu, { menu = false })
        }
      }

      Spacer(Modifier.weight(1f))
      Crossfade(targetState = t?.coverUrl, label = "cover") { url ->
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
          Text(t?.title ?: "Ничего не играет", style = MaterialTheme.typography.headlineSmall, maxLines = 1, modifier = Modifier.basicMarquee())
          Text(
            t?.artists ?: "", style = MaterialTheme.typography.titleMedium, color = cs.primary, maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.clip(RoundedCornerShape(6.dp)).clickable(enabled = !t?.artist?.id.isNullOrEmpty()) {
              t?.let { onClose(); nav.artist(it.artist.id) }
            },
          )
        }
        if (t != null) LikeButton("track", t.id)
      }
      val reason = t?.reason
      if (inWave && reason != null) {
        Text("✦ $reason", Modifier.fillMaxWidth().padding(top = 6.dp), style = MaterialTheme.typography.labelLarge, color = cs.tertiary, maxLines = 2)
      }

      Spacer(Modifier.height(10.dp))
      val duration = max(1L, s.durationMs).toFloat()
      Slider(
        value = (drag ?: pos.toFloat()).coerceIn(0f, duration),
        onValueChange = { drag = it },
        onValueChangeFinished = { drag?.let { PlayerConn.seek(it.toLong()) }; drag = null },
        valueRange = 0f..duration,
        enabled = t != null,
      )
      Row(Modifier.fillMaxWidth()) {
        Text(fmtTime((drag ?: pos.toFloat()).toLong()), style = MaterialTheme.typography.labelMedium, color = cs.onSurfaceVariant)
        Spacer(Modifier.weight(1f))
        Text(fmtTime(s.durationMs), style = MaterialTheme.typography.labelMedium, color = cs.onSurfaceVariant)
      }

      Spacer(Modifier.height(8.dp))
      Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = { PlayerConn.toggleShuffle() }) {
          Ico(R.drawable.ic_shuffle, "Вперемешку", tint = if (s.shuffle) cs.primary else cs.onSurfaceVariant)
        }
        IconButton(onClick = { PlayerConn.prev() }, modifier = Modifier.size(56.dp)) { Ico(R.drawable.ic_skip_prev, "Предыдущий", Modifier.size(36.dp)) }
        FilledIconButton(
          onClick = { PlayerConn.toggle() },
          modifier = Modifier.size(88.dp),
          shape = RoundedCornerShape(playCorner),
          colors = IconButtonDefaults.filledIconButtonColors(containerColor = cs.primary, contentColor = cs.onPrimary),
        ) {
          Ico(if (s.playing) R.drawable.ic_pause else R.drawable.ic_play, if (s.playing) "Пауза" else "Играть", Modifier.size(44.dp))
        }
        IconButton(onClick = { PlayerConn.next() }, modifier = Modifier.size(56.dp)) { Ico(R.drawable.ic_skip_next, "Следующий", Modifier.size(36.dp)) }
        IconButton(onClick = { PlayerConn.cycleRepeat() }) {
          Ico(
            if (s.repeat == Player.REPEAT_MODE_ONE) R.drawable.ic_repeat_one else R.drawable.ic_repeat, "Повтор",
            tint = if (s.repeat == Player.REPEAT_MODE_OFF) cs.onSurfaceVariant else cs.primary,
          )
        }
      }

      Spacer(Modifier.height(8.dp))
      Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        if (inWave && t != null) {
          IconButton(onClick = { PlayerConn.dislike(t) }) { Ico(R.drawable.ic_thumb_down, "Не нравится", tint = cs.onSurfaceVariant) }
        } else Spacer(Modifier.size(48.dp))
        IconButton(onClick = { lyricsOpen = true }, enabled = t?.hasLyrics == true) { Ico(R.drawable.ic_lyrics, "Текст") }
        IconButton(onClick = { queueOpen = true }) { Ico(R.drawable.ic_queue, "Очередь") }
      }
    }
  }

  if (queueOpen) QueueSheet(s) { queueOpen = false }
  if (lyricsOpen && t != null) LyricsSheet(t, { pos }) { lyricsOpen = false }
}

@Composable
private fun QueueSheet(s: PlayerUi, onDismiss: () -> Unit) {
  val cs = MaterialTheme.colorScheme
  ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
    Text("Очередь", Modifier.padding(horizontal = 20.dp, vertical = 8.dp), style = MaterialTheme.typography.titleLarge)
    val list = rememberLazyListState(initialFirstVisibleItemIndex = max(0, s.index - 1))
    LazyColumn(state = list, modifier = Modifier.fillMaxHeight(0.85f)) {
      itemsIndexed(s.queue) { i, t ->
        val current = i == s.index
        Row(
          Modifier.fillMaxWidth().clickable { PlayerConn.skipTo(i) }
            .background(if (current) cs.secondaryContainer.copy(alpha = 0.5f) else cs.surface.copy(alpha = 0f))
            .padding(start = 20.dp, end = 4.dp, top = 6.dp, bottom = 6.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          Cover(t.coverUrl, Modifier.size(46.dp), RoundedCornerShape(12.dp))
          Spacer(Modifier.width(14.dp))
          Column(Modifier.weight(1f)) {
            Text(t.title, maxLines = 1, overflow = TextOverflow.Ellipsis, color = if (current) cs.primary else cs.onSurface, style = MaterialTheme.typography.bodyLarge)
            Text(t.artists, maxLines = 1, overflow = TextOverflow.Ellipsis, color = cs.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
          }
          if (!current) IconButton(onClick = { PlayerConn.removeAt(i) }) { Ico(R.drawable.ic_close, "Убрать", tint = cs.onSurfaceVariant) }
        }
      }
    }
  }
}

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
            l.plain?.takeIf { it.isNotBlank() } ?: "Текста пока нет",
            Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
            style = MaterialTheme.typography.bodyLarge, textAlign = TextAlign.Start,
          )
        }
      }
    }
  }
}
