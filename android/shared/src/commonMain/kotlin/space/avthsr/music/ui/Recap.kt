// The listener's month or year in music, as stories: big animated numbers, the track and artists of the
// period, genres, the hours music plays, discoveries and a "personality" — each card can be shared as a
// picture. Pages turn by themselves; a tap on the left or right edge goes back or on, a hold pauses.
package space.avthsr.music.ui

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
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
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialShapes
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.ToggleButton
import androidx.compose.material3.toShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.layer.GraphicsLayer
import androidx.compose.ui.graphics.layer.drawLayer
import androidx.compose.ui.graphics.rememberGraphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.graphics.shapes.Morph
import androidx.graphics.shapes.RoundedPolygon
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import space.avthsr.music.Lang
import space.avthsr.music.api.Api
import space.avthsr.music.api.Recap
import space.avthsr.music.api.recap
import space.avthsr.music.player.PlayerConn
import space.avthsr.music.res.*
import space.avthsr.music.tr
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

private val MONTHS_RU = listOf("январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь")
private val MONTHS_EN = listOf("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December")

/** "март 2026" / "2026" from the recap's label. */
private fun periodName(r: Recap): String {
  val parts = r.label.split('-')
  if (r.period == "year" || parts.size < 2) return r.label
  val m = (parts[1].toIntOrNull() ?: 1) - 1
  val name = (if (Lang.code == "en") MONTHS_EN else MONTHS_RU).getOrElse(m) { "" }
  return "$name ${parts[0]}"
}

/** 12345 → "12 345" */
private fun grouped(n: Int): String = n.toString().reversed().chunked(3).joinToString(" ").reversed()

private data class Personality(val title: String, val text: String, val shape: RoundedPolygon)

private fun personality(r: Recap): Personality {
  val top = r.topArtists.firstOrNull()?.artist?.name ?: ""
  return when (r.personality) {
    "explorer" -> Personality(tr("Исследователь"), tr("Вы всё время ищете новое: {} новых исполнителей за период.", r.newArtists), MaterialShapes.Burst)
    "fan" -> Personality(tr("Преданный фанат"), tr("{} — больше чем музыка: на него приходится львиная доля времени.", top), MaterialShapes.Heart)
    "repeat" -> Personality(tr("Король повторов"), tr("Нашли любимое — и слушаете по кругу. И это прекрасно."), MaterialShapes.Clover8Leaf)
    "night" -> Personality(tr("Ночная птица"), tr("Лучшая музыка звучит после полуночи."), MaterialShapes.Ghostish)
    "chameleon" -> Personality(tr("Хамелеон"), tr("{} жанров — вам нравится всё, что хорошо звучит.", r.genres), MaterialShapes.Flower)
    "connoisseur" -> Personality(tr("Ценитель"), tr("Свой вкус и своё звучание — без случайных треков."), MaterialShapes.Gem)
    else -> Personality(tr("Тишина"), tr("В этот период музыки не было."), MaterialShapes.Circle)
  }
}

@Composable
fun RecapScreen() {
  var period by rememberSaveable { mutableStateOf("month") }
  var offset by rememberSaveable { mutableIntStateOf(0) }
  val loader = rememberLoad(period, offset) { Api.recap(period, offset) }
  val cs = MaterialTheme.colorScheme
  Page {
    Column(Modifier.fillMaxSize().background(cs.background).padding(top = LocalEdges.current.top + 52.dp, bottom = LocalEdges.current.bottom)) {
      Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = { offset++ }, enabled = offset < 20) { Ico(Res.drawable.ic_skip_prev, tr("Раньше")) }
        Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally)) {
          ToggleButton(checked = period == "month", onCheckedChange = { period = "month"; offset = 0 }) { Text(tr("Месяц")) }
          ToggleButton(checked = period == "year", onCheckedChange = { period = "year"; offset = 0 }) { Text(tr("Год")) }
        }
        IconButton(onClick = { offset-- }, enabled = offset > 0) { Ico(Res.drawable.ic_skip_next, tr("Позже")) }
      }
      Spacer(Modifier.height(8.dp))
      Box(Modifier.weight(1f).fillMaxWidth()) {
        Loaded(loader) { r ->
          if (r.minutes == 0) Column(Modifier.fillMaxSize().padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Ico(Res.drawable.ic_chart, null, Modifier.size(72.dp), cs.outline)
            Spacer(Modifier.height(12.dp))
            Text(tr("За {} музыки пока не было", periodName(r)), style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
            Text(tr("Слушайте — итоги соберутся сами"), color = cs.onSurfaceVariant, textAlign = TextAlign.Center)
          } else Stories(r)
        }
      }
    }
  }
}

private enum class Story { INTRO, TRACK, ARTISTS, GENRES, TIME, DISCOVER, PERSONA, SUMMARY }

@Composable
private fun Stories(r: Recap) {
  val pages = buildList {
    add(Story.INTRO)
    if (r.topTracks.isNotEmpty()) add(Story.TRACK)
    if (r.topArtists.isNotEmpty()) add(Story.ARTISTS)
    if (r.topGenres.isNotEmpty()) add(Story.GENRES)
    if (r.hours.any { it > 0 }) add(Story.TIME)
    add(Story.DISCOVER)
    add(Story.PERSONA)
    add(Story.SUMMARY)
  }
  val pager = rememberPagerState { pages.size }
  val scope = rememberCoroutineScope()
  var paused by remember { mutableStateOf(false) }
  val progress = remember { Animatable(0f) }
  // each page runs for a few seconds, then the next one comes
  LaunchedEffect(pager.currentPage, paused) {
    if (paused) return@LaunchedEffect
    progress.animateTo(1f, tween(((1f - progress.value) * 8000).roundToInt().coerceAtLeast(1), easing = LinearEasing))
    if (pager.currentPage < pages.size - 1) pager.animateScrollToPage(pager.currentPage + 1)
  }
  LaunchedEffect(pager.currentPage) { progress.snapTo(0f) }
  val layers = pages.map { rememberGraphicsLayer() }
  Column(Modifier.fillMaxSize()) {
    // the stories' progress segments
    Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 6.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
      pages.indices.forEach { i ->
        val f = when { i < pager.currentPage -> 1f; i == pager.currentPage -> progress.value; else -> 0f }
        Box(Modifier.weight(1f).height(4.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceContainerHighest)) {
          Box(Modifier.fillMaxHeight().fillMaxWidth(f).background(MaterialTheme.colorScheme.primary))
        }
      }
    }
    HorizontalPager(
      pager, Modifier.weight(1f).fillMaxWidth(), beyondViewportPageCount = 1,
    ) { i ->
      Box(
        Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 8.dp)
          .pointerInput(i) {
            detectTapGestures(
              onPress = { paused = true; tryAwaitRelease(); paused = false },
              onTap = { o ->
                scope.launch {
                  if (o.x < size.width * 0.3f) pager.animateScrollToPage((pager.currentPage - 1).coerceAtLeast(0))
                  else if (pager.currentPage < pages.size - 1) pager.animateScrollToPage(pager.currentPage + 1)
                }
              },
            )
          },
        contentAlignment = Alignment.Center,
      ) {
        StoryCard(pages[i], r, active = pager.currentPage == i, layer = layers[i])
      }
    }
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally)) {
      FilledTonalButton(shapes = ButtonDefaults.shapes(), onClick = {
        val layer = layers[pager.currentPage]
        scope.launch { runCatching { shareImage(layer.toImageBitmap(), tr("Мои итоги в AVRmusic")) } }
      }) { Ico(Res.drawable.ic_share, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(tr("Поделиться карточкой")) }
      r.topTracks.firstOrNull()?.let { _ ->
        Button(shapes = ButtonDefaults.shapes(), onClick = { PlayerConn.play(r.topTracks.map { it.track }, 0, "recap:${r.label}") }) {
          Ico(Res.drawable.ic_play, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(tr("Топ-треки"))
        }
      }
    }
  }
}

/** A card: theme colours in moving blobs behind big type; recorded into [layer] for sharing. */
@Composable
private fun StoryCard(story: Story, r: Recap, active: Boolean, layer: GraphicsLayer) {
  val cs = MaterialTheme.colorScheme
  val palette = when (story.ordinal % 4) {
    0 -> Triple(cs.primaryContainer, cs.tertiary, cs.secondary)
    1 -> Triple(cs.tertiaryContainer, cs.primary, cs.secondary)
    2 -> Triple(cs.secondaryContainer, cs.tertiary, cs.primary)
    else -> Triple(cs.surfaceContainerHighest, cs.primary, cs.tertiary)
  }
  val onColor = when (story.ordinal % 4) {
    0 -> cs.onPrimaryContainer
    1 -> cs.onTertiaryContainer
    2 -> cs.onSecondaryContainer
    else -> cs.onSurface
  }
  val moving = rememberInfiniteTransition(label = "blobs")
  val phase by moving.animateFloat(0f, 1f, infiniteRepeatable(tween(14_000, easing = LinearEasing)), label = "phase")
  Box(
    Modifier.widthIn(max = 460.dp).aspectRatio(9f / 16f, matchHeightConstraintsFirst = true)
      .drawWithContent {
        layer.record { this@drawWithContent.drawContent() }
        drawLayer(layer)
      }
      .clip(RoundedCornerShape(36.dp))
      .drawBehind {
        drawRect(palette.first)
        val a = phase * 2f * PI.toFloat()
        val rad = size.maxDimension * 0.6f
        val c1 = Offset(size.width * (0.25f + 0.2f * cos(a)), size.height * (0.25f + 0.15f * sin(a)))
        val c2 = Offset(size.width * (0.75f - 0.2f * cos(a * 2f)), size.height * (0.75f - 0.15f * sin(a)))
        drawCircle(Brush.radialGradient(listOf(palette.second.copy(alpha = 0.55f), Color.Transparent), c1, rad), rad, c1)
        drawCircle(Brush.radialGradient(listOf(palette.third.copy(alpha = 0.45f), Color.Transparent), c2, rad), rad, c2)
      }
      .padding(26.dp),
  ) {
    androidx.compose.runtime.CompositionLocalProvider(androidx.compose.material3.LocalContentColor provides onColor) {
      when (story) {
        Story.INTRO -> IntroStory(r, active)
        Story.TRACK -> TrackStory(r, active)
        Story.ARTISTS -> ArtistsStory(r, active)
        Story.GENRES -> GenresStory(r, active)
        Story.TIME -> TimeStory(r, active)
        Story.DISCOVER -> DiscoverStory(r, active)
        Story.PERSONA -> PersonaStory(r, active)
        Story.SUMMARY -> SummaryStory(r)
      }
      Text("AVRmusic", Modifier.align(Alignment.BottomEnd), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
    }
  }
}

/** A number counting up when its card comes. */
@Composable
private fun CountUp(target: Int, active: Boolean, size: Int = 88) {
  val a = remember { Animatable(0f) }
  LaunchedEffect(active, target) {
    if (active) { a.snapTo(0f); a.animateTo(target.toFloat(), tween(1700, easing = FastOutSlowInEasing)) }
  }
  Text(grouped(a.value.roundToInt()), style = MaterialTheme.typography.displayLarge.copy(fontSize = size.sp, lineHeight = (size * 1.05f).sp), fontWeight = FontWeight.Black, maxLines = 1)
}

/** Rises in when the card comes. */
@Composable
private fun Modifier.rise(active: Boolean, order: Int): Modifier {
  val a = remember { Animatable(0f) }
  LaunchedEffect(active) {
    if (active) { a.snapTo(0f); delay(120L * order); a.animateTo(1f, tween(600, easing = FastOutSlowInEasing)) }
  }
  return graphicsLayer { alpha = a.value; translationY = (1f - a.value) * 40.dp.toPx() }
}

@Composable
private fun Label(text: String, active: Boolean, order: Int = 0) {
  Text(text.uppercase(), Modifier.rise(active, order), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
}

@Composable
private fun BoxScope.IntroStory(r: Recap, active: Boolean) {
  Column(Modifier.align(Alignment.CenterStart)) {
    Label(if (r.period == "year") tr("Ваш год в музыке") else tr("Ваш месяц в музыке"), active)
    Spacer(Modifier.height(6.dp))
    FlowText(periodName(r), MaterialTheme.typography.displaySmall, Modifier.rise(active, 1), maxLines = 1)
    Spacer(Modifier.height(28.dp))
    CountUp(r.minutes, active)
    Text(tr("минут музыки"), Modifier.rise(active, 2), style = MaterialTheme.typography.headlineSmall)
    Spacer(Modifier.height(18.dp))
    if (r.previousMinutes > 0) {
      val delta = ((r.minutes - r.previousMinutes) * 100f / r.previousMinutes).roundToInt()
      Text(
        if (delta >= 0) tr("+{}% к прошлому периоду", delta) else tr("{}% к прошлому периоду", delta),
        Modifier.rise(active, 3), style = MaterialTheme.typography.titleMedium,
      )
    }
    Text(tr("{} треков · {} исполнителей", r.distinctTracks, r.distinctArtists), Modifier.rise(active, 4), style = MaterialTheme.typography.titleMedium)
  }
}

@Composable
private fun BoxScope.TrackStory(r: Recap, active: Boolean) {
  val top = r.topTracks.first()
  val spin = rememberInfiniteTransition(label = "disc")
  val angle by spin.animateFloat(0f, 360f, infiniteRepeatable(tween(16_000, easing = LinearEasing)), label = "angle")
  Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
    Label(if (r.period == "year") tr("Трек года") else tr("Трек месяца"), active)
    Spacer(Modifier.height(22.dp))
    Box(Modifier.rise(active, 1).fillMaxWidth(0.78f).aspectRatio(1f), contentAlignment = Alignment.Center) {
      Cover(top.track.coverUrl, Modifier.fillMaxSize().graphicsLayer { rotationZ = angle }, MaterialShapes.Cookie12Sided.toShape())
    }
    Spacer(Modifier.height(22.dp))
    FlowText(top.track.title, MaterialTheme.typography.headlineMedium, Modifier.rise(active, 2), textAlign = TextAlign.Center, maxLines = 2)
    Text(top.track.artists, Modifier.rise(active, 3), style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
    Spacer(Modifier.height(10.dp))
    Text(tr("{} прослушиваний · {} мин", top.plays, top.minutes), Modifier.rise(active, 4), style = MaterialTheme.typography.titleSmall)
  }
}

@Composable
private fun BoxScope.ArtistsStory(r: Recap, active: Boolean) {
  Column(Modifier.align(Alignment.TopStart)) {
    Label(tr("Ваши исполнители"), active)
    Spacer(Modifier.height(18.dp))
    val first = r.topArtists.first()
    Row(Modifier.rise(active, 1), verticalAlignment = Alignment.CenterVertically) {
      Cover(first.artist.imageUrl, Modifier.size(120.dp), ArtistShape, Res.drawable.ic_person)
      Spacer(Modifier.width(14.dp))
      Column {
        Text("#1", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Black)
        Text(first.artist.name, style = MaterialTheme.typography.headlineSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text(tr("{} мин", first.minutes), style = MaterialTheme.typography.titleSmall)
      }
    }
    Spacer(Modifier.height(18.dp))
    r.topArtists.drop(1).forEachIndexed { i, a ->
      Row(Modifier.rise(active, i + 2).padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Text("${i + 2}", Modifier.width(34.dp), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Cover(a.artist.imageUrl, Modifier.size(52.dp), CircleShape, Res.drawable.ic_person)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
          Text(a.artist.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
          Text(tr("{} мин", a.minutes), style = MaterialTheme.typography.bodySmall)
        }
      }
    }
  }
}

@Composable
private fun BoxScope.GenresStory(r: Recap, active: Boolean) {
  val cs = MaterialTheme.colorScheme
  Column(Modifier.align(Alignment.CenterStart).fillMaxWidth()) {
    Label(tr("Жанры"), active)
    Spacer(Modifier.height(8.dp))
    FlowText(r.topGenres.first().name, MaterialTheme.typography.displayMedium, Modifier.rise(active, 1), maxLines = 2)
    Spacer(Modifier.height(24.dp))
    r.topGenres.forEachIndexed { i, g ->
      val fill = remember { Animatable(0f) }
      LaunchedEffect(active) { if (active) { fill.snapTo(0f); delay(300L + 150L * i); fill.animateTo(g.share / 100f, tween(1100, easing = FastOutSlowInEasing)) } }
      Column(Modifier.padding(vertical = 8.dp)) {
        Row {
          Text(g.name, Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
          Text("${(fill.value * 100).roundToInt()}%", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(6.dp))
        Box(Modifier.fillMaxWidth().height(14.dp).clip(CircleShape).background(cs.surface.copy(alpha = 0.4f))) {
          Box(Modifier.fillMaxHeight().fillMaxWidth(fill.value).clip(CircleShape).background(if (i == 0) cs.primary else cs.tertiary))
        }
      }
    }
    Spacer(Modifier.height(12.dp))
    Text(tr("Всего жанров: {}", r.genres), Modifier.rise(active, 5), style = MaterialTheme.typography.titleSmall)
  }
}

@Composable
private fun BoxScope.TimeStory(r: Recap, active: Boolean) {
  val cs = MaterialTheme.colorScheme
  Column(Modifier.align(Alignment.CenterStart).fillMaxWidth()) {
    Label(tr("Когда вы слушаете"), active)
    Spacer(Modifier.height(8.dp))
    r.peakHour?.let { h -> FlowText(tr("Пик — в {}:00", h.toString().padStart(2, '0')), MaterialTheme.typography.displaySmall, Modifier.rise(active, 1), maxLines = 2) }
    Spacer(Modifier.height(24.dp))
    val grow = remember { Animatable(0f) }
    LaunchedEffect(active) { if (active) { grow.snapTo(0f); delay(250); grow.animateTo(1f, tween(1200, easing = FastOutSlowInEasing)) } }
    val max = (r.hours.maxOrNull() ?: 1).coerceAtLeast(1)
    Row(Modifier.fillMaxWidth().height(170.dp), horizontalArrangement = Arrangement.spacedBy(3.dp), verticalAlignment = Alignment.Bottom) {
      r.hours.forEachIndexed { h, v ->
        val k = v.toFloat() / max
        Box(
          Modifier.weight(1f).fillMaxHeight((k * grow.value).coerceAtLeast(0.02f)).clip(RoundedCornerShape(topStart = 6.dp, topEnd = 6.dp))
            .background(if (h == r.peakHour) cs.primary else LocalContentColorOr(0.35f)),
        )
      }
    }
    Row(Modifier.fillMaxWidth().padding(top = 4.dp)) {
      listOf("0", "6", "12", "18", "23").forEachIndexed { i, s ->
        Text(s, Modifier.weight(1f), style = MaterialTheme.typography.labelSmall, textAlign = if (i == 4) TextAlign.End else if (i == 0) TextAlign.Start else TextAlign.Center)
      }
    }
    Spacer(Modifier.height(20.dp))
    r.busiestDay?.let { d ->
      val parts = d.date.split('-')
      val day = if (parts.size == 3) "${parts[2].trimStart('0')}.${parts[1]}" else d.date
      Text(tr("Самый музыкальный день — {}: {} мин", day, d.minutes), Modifier.rise(active, 3), style = MaterialTheme.typography.titleMedium)
    }
    Text(tr("Дней с музыкой: {}", r.activeDays), Modifier.rise(active, 4), style = MaterialTheme.typography.titleMedium)
  }
}

@Composable
private fun LocalContentColorOr(alpha: Float): Color = androidx.compose.material3.LocalContentColor.current.copy(alpha = alpha)

@Composable
private fun BoxScope.DiscoverStory(r: Recap, active: Boolean) {
  Column(Modifier.align(Alignment.CenterStart), verticalArrangement = Arrangement.spacedBy(18.dp)) {
    Label(tr("Открытия"), active)
    Stat(r.newArtists, tr("новых исполнителей"), active, 1)
    Stat(r.discoveries, tr("треков впервые"), active, 2)
    Stat(r.streakDays, tr("дней подряд с музыкой"), active, 3)
    r.firstTrack?.let { t ->
      Column(Modifier.rise(active, 4)) {
        Text(tr("А началось всё с"), style = MaterialTheme.typography.labelLarge)
        Text("${t.title} · ${t.artists}", style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
      }
    }
  }
}

@Composable
private fun ColumnScope.Stat(n: Int, caption: String, active: Boolean, order: Int) {
  Column(Modifier.rise(active, order)) {
    CountUp(n, active, size = 64)
    Text(caption, style = MaterialTheme.typography.titleLarge)
  }
}

@Composable
private fun BoxScope.PersonaStory(r: Recap, active: Boolean) {
  val p = personality(r)
  val cs = MaterialTheme.colorScheme
  val morph = remember(p) { Morph(MaterialShapes.Circle, p.shape) }
  val m = remember { Animatable(0f) }
  val spec = MaterialTheme.motionScheme.slowSpatialSpec<Float>()
  LaunchedEffect(active) { if (active) { m.snapTo(0f); m.animateTo(1f, spec) } }
  val spin = rememberInfiniteTransition(label = "persona")
  val angle by spin.animateFloat(0f, 360f, infiniteRepeatable(tween(20_000, easing = LinearEasing)), label = "angle")
  Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
    Label(tr("Ваш музыкальный характер"), active)
    Spacer(Modifier.height(26.dp))
    Box(
      Modifier.fillMaxWidth(0.62f).aspectRatio(1f).graphicsLayer { rotationZ = angle }
        .clip(MorphShape(morph, m.value)).background(Brush.linearGradient(listOf(cs.primary, cs.tertiary))),
    )
    Spacer(Modifier.height(26.dp))
    FlowText(p.title, MaterialTheme.typography.displaySmall, Modifier.rise(active, 1), textAlign = TextAlign.Center, maxLines = 2)
    Spacer(Modifier.height(8.dp))
    Text(p.text, Modifier.rise(active, 2), style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center)
  }
}

@Composable
private fun BoxScope.SummaryStory(r: Recap) {
  val p = personality(r)
  Column(Modifier.align(Alignment.TopStart).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
    Text(tr("Итоги · {}", periodName(r)).uppercase(), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
    r.topTracks.firstOrNull()?.let { Cover(it.track.coverUrl, Modifier.fillMaxWidth(0.5f).aspectRatio(1f), RoundedCornerShape(24.dp)) }
    SummaryLine(tr("Минут музыки"), grouped(r.minutes))
    r.topArtists.firstOrNull()?.let { SummaryLine(tr("Исполнитель"), it.artist.name) }
    r.topTracks.firstOrNull()?.let { SummaryLine(tr("Трек"), it.track.title) }
    r.topGenres.firstOrNull()?.let { SummaryLine(tr("Жанр"), it.name) }
    SummaryLine(tr("Характер"), p.title)
  }
}

@Composable
private fun SummaryLine(label: String, value: String) {
  Column {
    Text(label, style = MaterialTheme.typography.labelMedium)
    Text(value, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
  }
}
