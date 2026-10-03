@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class, ExperimentalMaterial3ExpressiveApi::class)

package space.avthsr.music.ui

import space.avthsr.music.tr
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.slideInHorizontally
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.animation.core.animate
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.scaleOut
import space.avthsr.music.Platform
import space.avthsr.music.fmtClock
import space.avthsr.music.api.LyricLine
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.interaction.DragInteraction
import androidx.compose.animation.togetherWith
import androidx.compose.animation.scaleIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.fadeIn
import androidx.compose.animation.AnimatedContent
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
import space.avthsr.music.player.Repeat
import coil3.compose.AsyncImage
import kotlinx.coroutines.delay
import space.avthsr.music.res.*
import space.avthsr.music.api.Api
import space.avthsr.music.api.Track
import space.avthsr.music.player.PlayerConn
import space.avthsr.music.player.PlayerUi
import space.avthsr.music.player.Queue
import kotlin.math.abs
import kotlin.math.max

/** Set from a track's menu: the player opens straight on the lyrics. */
val showLyrics = kotlinx.coroutines.flow.MutableStateFlow(false)

@Composable
fun NowPlayingScreen(onClose: () -> Unit) {
  val s by PlayerConn.state.collectAsStateWithLifecycle()
  // the cover deck's place: the colours and the background follow a flip as far as it has come
  val deck = rememberDeck(s)
  FlipTheme(s, deck) { NowPlayingContent(deck, onClose) }
}

@Composable
private fun NowPlayingContent(deck: Deck, onClose: () -> Unit) {
  val s by PlayerConn.state.collectAsStateWithLifecycle()
  val context by Queue.context.collectAsStateWithLifecycle()
  val nav = LocalNav.current
  val cs = MaterialTheme.colorScheme
  val t = s.track
  var queueOpen by remember { mutableStateOf(false) }
  var sleepMenu by remember { mutableStateOf(false) }
  val speed by PlayerConn.speed.collectAsStateWithLifecycle()
  val sleepAt by PlayerConn.sleepAt.collectAsStateWithLifecycle()
  // lyrics take the cover's place; the choice holds for the next tracks too
  var lyricsMode by rememberSaveable { mutableStateOf(false) }
  val wantLyrics by showLyrics.collectAsStateWithLifecycle()
  LaunchedEffect(wantLyrics) { if (wantLyrics) { lyricsMode = true; showLyrics.value = false } }
  val lyricsShown = lyricsMode && t?.hasLyrics == true
  var menu by remember { mutableStateOf(false) }
  var pull by remember { mutableFloatStateOf(0f) }
  val scope = rememberCoroutineScope()
  fun settle() {
    scope.launch { animate(pull, 0f, animationSpec = Motion.expressive.fastSpatialSpec()) { v, _ -> pull = v } }
  }
  val inWave = context == Queue.WAVE
  val coverScale by animateFloatAsState(if (s.playing) 1f else 0.86f, MaterialTheme.motionScheme.slowSpatialSpec(), label = "cover")
  val veil by animateFloatAsState(if (lyricsShown) 1f else 0f, MaterialTheme.motionScheme.defaultEffectsSpec(), label = "veil")

  Box(
    Modifier.fillMaxSize()
      .graphicsLayer { translationY = pull }
      .background(cs.background)
      .pointerInput(Unit) {
        detectVerticalDragGestures(
          onDragEnd = { if (pull > 220f) onClose() else settle() },
          onDragCancel = { settle() },
        ) { change, dy -> change.consume(); pull = max(0f, pull + dy) }
      },
  ) {
    val canvasOn by Look.canvas.collectAsStateWithLifecycle()
    val canvas = canvasOn && t?.hasCanvas == true
    if (t != null && canvas) {
      Crossfade(targetState = t, modifier = Modifier.fillMaxSize(), animationSpec = Motion.expressive.slowEffectsSpec(), label = "canvas") { x ->
        TrackCanvas(x, s.playing, Modifier.fillMaxSize())
      }
    } else if (t != null) {
      // flipping the deck slides the background toward the next (or previous) cover as far as the card has come
      val pos = s.deckPos()
      BlurredCover(t.coverUrl, Modifier.fillMaxSize().graphicsLayer { alpha = 1f - abs(deck.cursor.value - pos).coerceIn(0f, 1f) }, alpha = 0.6f)
      s.deckTrack(pos + 1)?.let { n ->
        BlurredCover(n.coverUrl, Modifier.fillMaxSize().graphicsLayer { alpha = (deck.cursor.value - pos).coerceIn(0f, 1f) }, alpha = 0.6f)
      }
      s.deckTrack(pos - 1)?.let { p ->
        BlurredCover(p.coverUrl, Modifier.fillMaxSize().graphicsLayer { alpha = (pos - deck.cursor.value).coerceIn(0f, 1f) }, alpha = 0.6f)
      }
    }
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(if (canvas) listOf(cs.background.copy(alpha = 0.5f), Color.Transparent, cs.background.copy(alpha = 0.6f), cs.background) else listOf(cs.background.copy(alpha = 0.35f), cs.background.copy(alpha = 0.8f), cs.background))))
    // with lyrics up, a veil over the canvas or cover so every line reads
    Box(Modifier.fillMaxSize().graphicsLayer { alpha = veil }.background(cs.background.copy(alpha = if (canvas) 0.5f else 0.25f)))

    Column(Modifier.fillMaxSize().windowInsetsPadding(SafeBars).padding(horizontal = 24.dp, vertical = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
      Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = onClose) { Ico(Res.drawable.ic_expand_more, tr("Свернуть")) }
        Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
          Text(if (inWave) tr("Моя волна") else tr("Сейчас играет"), style = MaterialTheme.typography.labelLarge, color = cs.onSurfaceVariant)
          if (inWave) Text(Queue.modes.firstOrNull { it.id == Queue.waveMode.value }?.label ?: "", style = MaterialTheme.typography.labelSmall, color = cs.primary)
        }
        Box {
          IconButton(onClick = { menu = true }, enabled = t != null) { Ico(Res.drawable.ic_more, tr("Ещё")) }
          if (t != null) TrackMenu(t, menu, { menu = false }) { close ->
            // canvases on / off right from the player
            DropdownMenuItem(
              text = { Text(if (canvasOn) tr("Выключить канвасы") else tr("Включить канвасы")) },
              leadingIcon = { Ico(Res.drawable.ic_movie) },
              onClick = { close(); Look.setCanvas(!canvasOn) },
            )
          }
        }
      }

      // the cover, or the lyrics in its place
      // over a canvas the empty area swipes between tracks (the cover deck has its own flip); not the lyrics, they scroll
      val swipe = rememberTrackSwipe()
      Box(Modifier.weight(1f).fillMaxWidth().trackSwipe(swipe, scope, enabled = canvas && !lyricsShown).padding(vertical = 12.dp), contentAlignment = Alignment.Center) {
        val motion = MaterialTheme.motionScheme
        AnimatedContent(
          targetState = lyricsShown,
          transitionSpec = {
            (fadeIn(motion.defaultEffectsSpec()) + scaleIn(motion.defaultSpatialSpec(), initialScale = 0.92f))
              .togetherWith(fadeOut(motion.fastEffectsSpec()))
          },
          modifier = Modifier.fillMaxSize(),
          contentAlignment = Alignment.Center,
          label = "art",
        ) { lyrics ->
          when {
            lyrics && t != null -> LyricsPane(t, Modifier.fillMaxSize())
            canvas -> Spacer(Modifier.fillMaxSize())
            // the covers as a deck you flip through (see CoverStack); the top card flows from the
            // mini player when the player opens and back when it closes
            else -> CoverStack(s, deck, Modifier.fillMaxSize(), pauseScale = { coverScale })
          }
        }
      }

      Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        AnimatedContent(
          targetState = t,
          contentKey = { it?.id },
          transitionSpec = {
            (slideInVertically(Motion.expressive.defaultSpatialSpec()) { it / 3 } + fadeIn(Motion.expressive.defaultEffectsSpec()))
              .togetherWith(slideOutVertically(Motion.expressive.fastSpatialSpec()) { -it / 3 } + fadeOut(Motion.expressive.fastEffectsSpec()))
          },
          modifier = Modifier.weight(1f),
          label = "title",
        ) { x ->
        Column {
          Text(x?.title ?: tr("Ничего не играет"), style = MaterialTheme.typography.headlineSmall, maxLines = 1, modifier = Modifier.basicMarquee())
          Text(
            x?.artists ?: "", style = MaterialTheme.typography.titleMedium, color = cs.primary, maxLines = 1, overflow = TextOverflow.Ellipsis,
            modifier = Modifier.clip(RoundedCornerShape(6.dp)).clickable(enabled = !x?.artist?.id.isNullOrEmpty()) {
              x?.let { onClose(); nav.artist(it.artist.id) }
            },
          )
        }
        }
      }
      val reason = t?.reason
      if (inWave && reason != null && !lyricsShown) {
        Text("✦ $reason", Modifier.fillMaxWidth().padding(top = 6.dp), style = MaterialTheme.typography.labelLarge, color = cs.tertiary, maxLines = 2)
      }

      Spacer(Modifier.height(10.dp))
      SeekBar(s)

      Spacer(Modifier.height(10.dp))
      Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = { PlayerConn.toggleShuffle() }, shapes = IconButtonDefaults.shapes()) {
          Ico(Res.drawable.ic_shuffle, tr("Вперемешку"), tint = if (s.shuffle) cs.primary else cs.onSurfaceVariant)
        }
        FilledTonalIconButton(onClick = { PlayerConn.prev() }, modifier = Modifier.size(64.dp), shapes = IconButtonDefaults.shapes()) {
          Ico(Res.drawable.ic_skip_prev, tr("Предыдущий"), Modifier.size(32.dp))
        }
        MorphPlayButton(s.playing, { PlayerConn.toggle() }, 96.dp)
        FilledTonalIconButton(onClick = { PlayerConn.next() }, modifier = Modifier.size(64.dp), shapes = IconButtonDefaults.shapes()) {
          Ico(Res.drawable.ic_skip_next, tr("Следующий"), Modifier.size(32.dp))
        }
        IconButton(onClick = { PlayerConn.cycleRepeat() }, shapes = IconButtonDefaults.shapes()) {
          Ico(
            if (s.repeat == Repeat.ONE) Res.drawable.ic_repeat_one else Res.drawable.ic_repeat, tr("Повтор"),
            tint = if (s.repeat == Repeat.OFF) cs.onSurfaceVariant else cs.primary,
          )
        }
      }

      Spacer(Modifier.height(14.dp))
      HorizontalFloatingToolbar(expanded = true, modifier = Modifier.align(Alignment.CenterHorizontally)) {
        if (inWave && t != null) {
          IconButton(onClick = { PlayerConn.dislike(t) }, shapes = IconButtonDefaults.shapes()) { Ico(Res.drawable.ic_thumb_down, tr("Не нравится")) }
        }
        if (t != null) LikeButton("track", t.id)
        IconButton(onClick = { lyricsMode = !lyricsShown }, enabled = t?.hasLyrics == true, shapes = IconButtonDefaults.shapes()) {
          Ico(Res.drawable.ic_lyrics, tr("Текст"), tint = if (lyricsShown) cs.primary else LocalContentColor.current)
        }
        IconButton(onClick = { queueOpen = true }, shapes = IconButtonDefaults.shapes()) { Ico(Res.drawable.ic_queue, tr("Очередь")) }
        TextButton(onClick = { PlayerConn.cycleSpeed() }) { Text("${fmtSpeed(speed)}×", style = MaterialTheme.typography.labelLarge) }
        Box {
          IconButton(onClick = { sleepMenu = true }, shapes = IconButtonDefaults.shapes()) {
            Ico(Res.drawable.ic_bedtime, tr("Таймер сна"), tint = if (sleepAt != null) cs.primary else LocalContentColor.current)
          }
          DropdownMenu(expanded = sleepMenu, onDismissRequest = { sleepMenu = false }) {
            sleepAt?.let { at ->
              Text(tr("Остановится в {}", fmtClock(at)), Modifier.padding(horizontal = 16.dp, vertical = 8.dp), style = MaterialTheme.typography.labelLarge, color = cs.primary)
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
}

/** The seek bar with its times; the only part of the player that follows the position. */
@Composable
private fun SeekBar(s: PlayerUi) {
  val cs = MaterialTheme.colorScheme
  var pos by remember { mutableLongStateOf(PlayerConn.position()) }
  var drag by remember { mutableStateOf<Float?>(null) }
  LaunchedEffect(s.track?.id, s.playing) {
    while (true) { pos = PlayerConn.position(); delay(if (s.playing) 200 else 1000) }
  }
  val duration = max(1L, s.durationMs).toFloat()
  val value = (drag ?: pos.toFloat()).coerceIn(0f, duration)
  // the expressive media seek bar: a wavy track while playing, flat when paused
  Slider(
    value = value,
    onValueChange = { drag = it },
    onValueChangeFinished = { drag?.let { PlayerConn.seek(it.toLong()) }; drag = null },
    valueRange = 0f..duration,
    enabled = s.track != null,
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
      TextButton(onClick = { PlayerConn.clearQueue() }, enabled = s.queue.size > 1) { Ico(Res.drawable.ic_clear_all, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(tr("Очистить")) }
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
          ) { Ico(Res.drawable.ic_drag, tr("Перетащить"), tint = cs.onSurfaceVariant) }
          Cover(t.coverUrl, Modifier.size(46.dp), RoundedCornerShape(12.dp))
          Spacer(Modifier.width(12.dp))
          Column(Modifier.weight(1f)) {
            Text(t.title, maxLines = 1, overflow = TextOverflow.Ellipsis, color = if (current) cs.primary else cs.onSurface, style = MaterialTheme.typography.titleSmall)
            Text(t.artists, maxLines = 1, overflow = TextOverflow.Ellipsis, color = cs.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
          }
          if (!current) IconButton(onClick = { PlayerConn.removeAt(i) }) { Ico(Res.drawable.ic_close, tr("Убрать"), tint = cs.onSurfaceVariant) }
        }
      }
    }
  }
}

private fun fmtSpeed(v: Float) = if (v % 1f == 0f) v.toInt().toString() else v.toString().trimEnd('0')

/** Lyrics in the cover's place: synced lines follow the music, a tap on a line jumps to it. */
@Composable
private fun LyricsPane(t: Track, modifier: Modifier) {
  val loader = rememberLoad(t.id) { Api.lyrics(t.id) }
  Box(modifier, contentAlignment = Alignment.Center) {
    Loaded(loader) { l ->
      val synced = l.synced
      if (!synced.isNullOrEmpty()) SyncedLyrics(synced)
      else Text(
        l.plain?.takeIf { it.isNotBlank() } ?: tr("Текста пока нет"),
        Modifier.fillMaxSize().fadingEdges().verticalScroll(rememberScrollState()).padding(vertical = 32.dp),
        style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onSurface,
      )
    }
  }
}

@Composable
private fun SyncedLyrics(lines: List<LyricLine>) {
  val cs = MaterialTheme.colorScheme
  var cur by remember(lines) { mutableIntStateOf(-1) }
  LaunchedEffect(lines) {
    while (true) {
      // a hair early: the eye reads ahead of the voice
      val p = PlayerConn.position() + 150
      val i = lines.indexOfLast { it.timeMs <= p }
      if (i != cur) cur = i
      delay(100)
    }
  }
  val list = rememberLazyListState()
  // the listener's own scrolling pauses the follow for a few seconds
  var touchedAt by remember { mutableLongStateOf(0L) }
  LaunchedEffect(list) {
    list.interactionSource.interactions.collect { if (it is DragInteraction.Start || it is DragInteraction.Stop) touchedAt = Platform.nowMs() }
  }
  LaunchedEffect(cur) {
    if (cur >= 0 && Platform.nowMs() - touchedAt > 3500) list.animateScrollToItem(cur)
  }
  BoxWithConstraints(Modifier.fillMaxSize()) {
    // the current line rides a third of the way down, with room to scroll the last one up to it
    LazyColumn(
      state = list,
      modifier = Modifier.fillMaxSize().fadingEdges(),
      contentPadding = PaddingValues(top = maxHeight * 0.3f, bottom = maxHeight * 0.6f),
    ) {
      itemsIndexed(lines) { i, line ->
        val k by animateFloatAsState(if (i == cur) 1f else 0f, MaterialTheme.motionScheme.defaultEffectsSpec(), label = "line")
        Text(
          line.text.ifBlank { "♪" },
          Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).clickable { PlayerConn.seek(line.timeMs) }
            .graphicsLayer {
              val base = if (i < cur) 0.32f else 0.5f
              alpha = base + (1f - base) * k
              val sc = 0.94f + 0.06f * k
              scaleX = sc; scaleY = sc
              transformOrigin = TransformOrigin(0f, 0.5f)
            }
            .padding(horizontal = 6.dp, vertical = 10.dp),
          style = MaterialTheme.typography.headlineSmall,
          color = cs.onSurface,
        )
      }
    }
  }
}

/** Fades the top and bottom edges of scrolling content out. */
private fun Modifier.fadingEdges() = graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
  .drawWithContent {
    drawContent()
    val f = (40.dp.toPx() / size.height).coerceIn(0f, 0.3f)
    drawRect(Brush.verticalGradient(0f to Color.Transparent, f to Color.Black, 1f - f to Color.Black, 1f to Color.Transparent), blendMode = BlendMode.DstIn)
  }
