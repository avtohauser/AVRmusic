@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalMaterial3ExpressiveApi::class)

package space.avthsr.music.ui

import space.avthsr.music.tr
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LoadingIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.ContainedLoadingIndicator
import androidx.compose.material3.MaterialShapes
import androidx.compose.material3.ToggleButton
import androidx.compose.material3.ToggleButtonDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.PullToRefreshDefaults
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import space.avthsr.music.App
import space.avthsr.music.R
import space.avthsr.music.api.AlbumSummary
import space.avthsr.music.api.Api
import space.avthsr.music.api.ArtistSummary
import space.avthsr.music.api.Genre
import space.avthsr.music.api.HomeSection
import space.avthsr.music.api.PlaylistSummary
import space.avthsr.music.api.Track
import space.avthsr.music.player.PlayerConn
import space.avthsr.music.player.Queue
import java.util.Calendar
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

private fun <T> JsonObject.decode(s: kotlinx.serialization.KSerializer<T>): T? = runCatching { Api.json.decodeFromJsonElement(s, this) }.getOrNull()

fun parseColor(hex: String, fallback: Color): Color = runCatching { Color(android.graphics.Color.parseColor(hex)) }.getOrDefault(fallback)

private fun localGreeting(): String = when (Calendar.getInstance().get(Calendar.HOUR_OF_DAY)) {
  in 5..11 -> tr("Доброе утро")
  in 12..17 -> tr("Добрый день")
  in 18..22 -> tr("Добрый вечер")
  else -> tr("Доброй ночи")
}

@Composable
fun HomeScreen() {
  val nav = LocalNav.current
  val loader = rememberLoad(Unit) { Api.home() }
  val user = Api.user
  val refresh = rememberPullToRefreshState()
  var refreshing by remember { mutableStateOf(false) }
  LaunchedEffect(loader.state) { if (loader.state !is Load.Loading) refreshing = false }
  PullToRefreshBox(
    isRefreshing = refreshing,
    onRefresh = { refreshing = true; loader.reload() },
    state = refresh,
    indicator = { PullToRefreshDefaults.LoadingIndicator(state = refresh, isRefreshing = refreshing, modifier = Modifier.align(Alignment.TopCenter).padding(top = LocalEdges.current.top)) },
  ) {
  LazyColumn(Modifier.fillMaxSize(), contentPadding = screenPadding(bottom = 24.dp)) {
    item {
      Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 12.dp, top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        val greeting = localGreeting()
        FlowText(greeting, MaterialTheme.typography.headlineMedium, Modifier.weight(1f))
        IconButton(onClick = { nav.profile() }) {
          Cover(user?.avatarUrl, Modifier.size(36.dp), AvatarShape, R.drawable.ic_person)
        }
      }
    }
    item { WaveCard() }
    item { DiscoverEntry { nav.discover() } }
    when (val s = loader.state) {
      is Load.Ok -> {
        val picks = s.data.quickPicks
        if (picks.isNotEmpty()) item { QuickPicks(picks) }
        s.data.sections.forEach { section(it) }
      }
      is Load.Err -> item {
        Column(Modifier.fillMaxWidth().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
          Text(s.message, color = MaterialTheme.colorScheme.onSurfaceVariant)
          TextButton(onClick = loader.reload) { Text(tr("Повторить")) }
        }
      }
      else -> item { Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) { LoadingIndicator() } }
    }
  }
  }
}

/** "My Wave": one tap starts an endless stream picked for the listener; the chips change its mood. */
@Composable
fun WaveCard() {
  val player by PlayerConn.state.collectAsStateWithLifecycle()
  val context by Queue.context.collectAsStateWithLifecycle()
  val mode by Queue.waveMode.collectAsStateWithLifecycle()
  val inWave = context == Queue.WAVE && player.track != null
  var busy by remember { mutableStateOf(false) }
  val scope = rememberCoroutineScope()
  fun start(m: String) {
    if (busy) return
    busy = true
    scope.launch {
      try { PlayerConn.startWave(m) } catch (e: Exception) { App.say(e.message ?: tr("Не получилось")) } finally { busy = false }
    }
  }
  val cs = MaterialTheme.colorScheme
  val transition = rememberInfiniteTransition(label = "wave")
  val phase by transition.animateFloat(0f, 1f, infiniteRepeatable(tween(12_000, easing = LinearEasing)), label = "phase")
  Box(
    Modifier.padding(horizontal = 16.dp, vertical = 12.dp).fillMaxWidth().clip(RoundedCornerShape(34.dp))
      .drawBehind {
        drawRect(cs.primaryContainer)
        val a = phase * 2f * PI.toFloat()
        val r = size.maxDimension * 0.75f
        val c1 = Offset(size.width * (0.2f + 0.25f * cos(a)), size.height * (0.3f + 0.35f * sin(a)))
        val c2 = Offset(size.width * (0.8f - 0.25f * cos(a * 2f)), size.height * (0.7f - 0.35f * sin(a)))
        drawCircle(Brush.radialGradient(listOf(cs.tertiary.copy(alpha = 0.55f), Color.Transparent), c1, r), r, c1)
        drawCircle(Brush.radialGradient(listOf(cs.secondary.copy(alpha = 0.45f), Color.Transparent), c2, r), r, c2)
      }
      .clickable { if (inWave) PlayerConn.toggle() else start(mode) }
      .padding(22.dp),
  ) {
    Column {
      Row(verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
          FlowText(tr("Моя волна"), MaterialTheme.typography.displaySmall, color = cs.onPrimaryContainer, maxLines = 1)
          Spacer(Modifier.height(4.dp))
          val line = if (inWave) player.track?.reason ?: player.track?.let { "${it.title} · ${it.artists}" } ?: ""
          else Queue.modes.firstOrNull { it.id == mode }?.hint ?: ""
          Text(line, style = MaterialTheme.typography.bodyMedium, color = cs.onPrimaryContainer.copy(alpha = 0.85f), maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        Spacer(Modifier.width(12.dp))
        if (busy) ContainedLoadingIndicator(Modifier.size(72.dp), containerColor = cs.onPrimaryContainer, indicatorColor = cs.primaryContainer)
        else MorphPlayButton(
          playing = inWave && player.playing,
          onClick = { if (inWave) PlayerConn.toggle() else start(mode) },
          size = 72.dp,
          container = cs.onPrimaryContainer,
          content = cs.primaryContainer,
          paused = MaterialShapes.Sunny,
        )
      }
      Spacer(Modifier.height(16.dp))
      Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Queue.modes.forEach { m ->
          val selected = m.id == mode
          ToggleButton(
            checked = selected,
            onCheckedChange = { start(m.id) },
            colors = ToggleButtonDefaults.toggleButtonColors(
              containerColor = cs.surface.copy(alpha = 0.35f),
              contentColor = cs.onPrimaryContainer,
              checkedContainerColor = cs.onPrimaryContainer,
              checkedContentColor = cs.primaryContainer,
            ),
          ) {
            Ico(m.icon, null, Modifier.size(18.dp))
            Spacer(Modifier.width(6.dp))
            Text(m.label)
          }
        }
      }
    }
  }
}

@Composable
private fun DiscoverEntry(onClick: () -> Unit) {
  val cs = MaterialTheme.colorScheme
  Row(
    Modifier.padding(horizontal = 16.dp, vertical = 4.dp).fillMaxWidth().clip(RoundedCornerShape(24.dp))
      .background(cs.surfaceContainerHigh).clickable(onClick = onClick).padding(16.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Box(Modifier.size(48.dp).clip(RoundedCornerShape(16.dp)).background(cs.tertiaryContainer), contentAlignment = Alignment.Center) {
      Ico(R.drawable.ic_sparkle, null, tint = cs.onTertiaryContainer)
    }
    Spacer(Modifier.width(14.dp))
    Column(Modifier.weight(1f)) {
      Text(tr("Предложка"), style = MaterialTheme.typography.titleLarge)
      Text(tr("Новая музыка для вас — добавьте на сервер в одно касание"), style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant)
    }
  }
}

@Composable
private fun QuickPicks(picks: List<JsonObject>) {
  val nav = LocalNav.current
  Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
    picks.take(6).chunked(2).forEach { row ->
      Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        row.forEach { o ->
          val kind = (o["kind"] as? kotlinx.serialization.json.JsonPrimitive)?.content
          val isPlaylist = o.containsKey("owner")
          val album = if (kind == null && !isPlaylist) o.decode(AlbumSummary.serializer()) else null
          val playlist = if (isPlaylist) o.decode(PlaylistSummary.serializer()) else null
          val title = album?.title ?: playlist?.title ?: tr("Любимые треки")
          val cover = album?.coverUrl ?: playlist?.let { it.coverUrl ?: it.mosaic.firstOrNull() }
          Row(
            Modifier.weight(1f).height(60.dp).clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surfaceContainerHigh)
              .clickable {
                when {
                  album != null -> nav.album(album.id)
                  playlist != null -> nav.playlist(playlist.id)
                  else -> nav.liked()
                }
              },
            verticalAlignment = Alignment.CenterVertically,
          ) {
            if (kind == "liked") {
              Box(Modifier.size(60.dp).background(MaterialTheme.colorScheme.primary), contentAlignment = Alignment.Center) {
                Ico(R.drawable.ic_heart_filled, null, tint = MaterialTheme.colorScheme.onPrimary)
              }
            } else Cover(cover, Modifier.size(60.dp), RoundedCornerShape(0.dp))
            Text(title, Modifier.padding(horizontal = 10.dp), style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
          }
        }
        if (row.size == 1) Spacer(Modifier.weight(1f))
      }
    }
  }
}

private fun LazyListScope.section(s: HomeSection) {
  when (s.kind) {
    "tracks" -> {
      val tracks = s.items.mapNotNull { it.decode(Track.serializer()) }
      if (tracks.isEmpty()) return
      item { SectionTitle(tr(s.title), s.subtitle?.let { tr(it) }) }
      items(tracks.take(6)) { t -> TrackRow(t, onClick = { PlayerConn.play(tracks, tracks.indexOf(t), "home:${s.id}") }) }
    }
    "albums" -> item {
      val nav = LocalNav.current
      val list = s.items.mapNotNull { it.decode(AlbumSummary.serializer()) }
      SectionTitle(tr(s.title), s.subtitle?.let { tr(it) })
      CardRow(list) { a -> MediaCard(a.title, listOfNotNull(a.artist.name, a.year?.toString()).joinToString(" · "), a.coverUrl, { nav.album(a.id) }, share = "album:${a.id}", menu = { e, c -> AlbumMenu(a.id, a.title, a.artist.id, a.artist.name, e, c) }) }
    }
    "artists" -> item {
      val nav = LocalNav.current
      val list = s.items.mapNotNull { it.decode(ArtistSummary.serializer()) }
      SectionTitle(tr(s.title), s.subtitle?.let { tr(it) })
      CardRow(list) { a -> MediaCard(a.name, "", a.imageUrl, { nav.artist(a.id) }, share = "artist:${a.id}", circle = true, width = 124.dp) }
    }
    "playlists" -> item {
      val nav = LocalNav.current
      val list = s.items.mapNotNull { it.decode(PlaylistSummary.serializer()) }
      SectionTitle(tr(s.title), s.subtitle?.let { tr(it) })
      CardRow(list) { p -> MediaCard(p.title, p.owner?.displayName ?: "", p.coverUrl ?: p.mosaic.firstOrNull(), { nav.playlist(p.id) }, share = "playlist:${p.id}", menu = { e, c -> PlaylistMenu(p, e, c) }) }
    }
    "genres" -> item {
      val list = s.items.mapNotNull { it.decode(Genre.serializer()) }
      SectionTitle(tr(s.title), s.subtitle?.let { tr(it) })
      GenreRow(list)
    }
  }
}

@Composable
fun GenreRow(list: List<Genre>) {
  val nav = LocalNav.current
  LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
    items(list) { g -> GenreTile(g, Modifier.width(150.dp)) { nav.genre(g.slug) } }
  }
}

@Composable
fun GenreTile(g: Genre, modifier: Modifier = Modifier, onClick: () -> Unit) {
  val color = parseColor(g.color, MaterialTheme.colorScheme.primaryContainer)
  Box(
    modifier.height(84.dp).clip(RoundedCornerShape(20.dp))
      .background(Brush.linearGradient(listOf(color, color.copy(alpha = 0.55f))))
      .clickable(onClick = onClick).padding(14.dp),
  ) {
    Text(g.name, style = MaterialTheme.typography.titleMedium, color = Color.White, maxLines = 2, overflow = TextOverflow.Ellipsis)
  }
}
