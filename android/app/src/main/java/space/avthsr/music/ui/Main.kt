@file:OptIn(ExperimentalFoundationApi::class, ExperimentalMaterial3ExpressiveApi::class)

package space.avthsr.music.ui

import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.animate
import androidx.compose.ui.unit.Velocity
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.material3.Surface
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.layout.Arrangement
import space.avthsr.music.tr
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.basicMarquee
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.IconButton
import androidx.compose.material3.TextButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ShortNavigationBar
import androidx.compose.material3.ShortNavigationBarItem
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.LinearWavyProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import space.avthsr.music.App
import space.avthsr.music.MainActivity
import space.avthsr.music.R
import space.avthsr.music.api.Api
import space.avthsr.music.player.Net
import space.avthsr.music.player.PlayerConn

@Composable
fun Root() {
  val session by Api.session.collectAsStateWithLifecycle()
  if (session == null) LoginScreen() else Main()
  val crash by App.lastCrash.collectAsStateWithLifecycle()
  crash?.let { text ->
    AlertDialog(
      onDismissRequest = { App.lastCrash.value = null },
      title = { Text(tr("Приложение закрылось с ошибкой")) },
      text = {
        Column(Modifier.heightIn(max = 360.dp).verticalScroll(rememberScrollState())) {
          Text(tr("Отчёт уже отправлен на сервер. Вот что случилось:"), style = MaterialTheme.typography.bodyMedium)
          Spacer(Modifier.height(8.dp))
          SelectionContainer { Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        }
      },
      confirmButton = { TextButton(onClick = { App.lastCrash.value = null }) { Text(tr("Понятно")) } },
    )
  }
}

@Composable
private fun Main() {
  val controller = rememberNavController()
  var playerOpen by rememberSaveable { mutableStateOf(false) }
  val nav = remember(controller) { Nav(controller) { playerOpen = true } }
  val snack = remember { SnackbarHostState() }

  LaunchedEffect(Unit) {
    App.messages.collect { text ->
      snack.currentSnackbarData?.dismiss()
      launch { snack.showSnackbar(text) }
    }
  }
  val open by MainActivity.openPlayer.collectAsStateWithLifecycle()
  LaunchedEffect(open) {
    if (open) { playerOpen = true; MainActivity.openPlayer.value = false }
  }
  val link by MainActivity.deepLink.collectAsStateWithLifecycle()
  LaunchedEffect(link) {
    link?.let { MainActivity.deepLink.value = null; playerOpen = false; nav.route(it) }
  }

  // edge to edge: the content runs under the camera cutout and under the floating bars; screens pad by LocalEdges
  val density = LocalDensity.current
  val cutout = with(density) { SafeBars.getTop(density).toDp() }
  var barsPx by remember { mutableIntStateOf(0) }
  var islandPx by remember { mutableIntStateOf(0) }
  val edges = Edges(top = cutout, bottom = with(density) { barsPx.toDp() } + 8.dp)

  // like an M3 Expressive floating toolbar: the island slides away while the content scrolls down and comes
  // back on the way up; the mini player drops into its place
  val hide = remember { mutableFloatStateOf(0f) }
  val hideOnScroll = remember {
    object : NestedScrollConnection {
      override fun onPostScroll(consumed: Offset, available: Offset, source: NestedScrollSource): Offset {
        hide.floatValue = (hide.floatValue - consumed.y).coerceIn(0f, islandPx.toFloat())
        return Offset.Zero
      }

      override suspend fun onPostFling(consumed: Velocity, available: Velocity): Velocity {
        val from = hide.floatValue
        val to = if (from > islandPx / 2f) islandPx.toFloat() else 0f
        if (from != to) animate(from, to, animationSpec = spring(stiffness = Spring.StiffnessMediumLow)) { v, _ -> hide.floatValue = v }
        return Velocity.Zero
      }
    }
  }
  val entry by controller.currentBackStackEntryAsState()
  LaunchedEffect(entry?.destination?.route) { hide.floatValue = 0f }

  CompositionLocalProvider(LocalNav provides nav, LocalEdges provides edges) {
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
      NavHost(
        controller,
        startDestination = "home",
        modifier = Modifier.fillMaxSize().nestedScroll(hideOnScroll).windowInsetsPadding(SafeBars.only(WindowInsetsSides.Horizontal)),
        enterTransition = { fadeIn(tween(220)) },
        exitTransition = { fadeOut(tween(160)) },
      ) {
          composable("home") { HomeScreen() }
          composable("search") { SearchScreen() }
          composable("library") { LibraryScreen() }
          composable("liked") { LikedScreen() }
          composable("discover") { DiscoverScreen() }
          composable("profile") { ProfileScreen() }
          composable("jobs") { JobsScreen() }
          composable("album/{id}") { AlbumScreen(it.arguments?.getString("id").orEmpty()) }
          composable("artist/{id}") { ArtistScreen(it.arguments?.getString("id").orEmpty()) }
          composable("playlist/{id}") { PlaylistScreen(it.arguments?.getString("id").orEmpty()) }
          composable("genre/{id}") { GenreScreen(it.arguments?.getString("id").orEmpty()) }
          composable("calbum/{id}") { CatalogAlbumScreen(it.arguments?.getString("id")?.toLongOrNull() ?: 0L) }
          composable("cartist/{id}") { CatalogArtistScreen(it.arguments?.getString("id")?.toLongOrNull() ?: 0L) }
          composable("history") { HistoryScreen() }
          composable("downloads") { DownloadsScreen() }
          composable("settings") { SettingsScreen() }
          composable("admin") { AdminScreen() }
          composable("admin/user/{id}") { AdminUserScreen(it.arguments?.getString("id").orEmpty()) }
          composable("admin/track/{id}") { AdminTrackScreen(it.arguments?.getString("id").orEmpty()) }
      }
      // a soft protection under the camera: text scrolling up there fades out instead of running into it
      if (cutout > 0.dp) {
        val bg = MaterialTheme.colorScheme.background
        Box(Modifier.fillMaxWidth().height(cutout).background(Brush.verticalGradient(listOf(bg.copy(alpha = 0.9f), bg.copy(alpha = 0f)))))
      }

      // the floating stack: offline note, mini player, navigation island
      Column(
        Modifier.align(Alignment.BottomCenter).fillMaxWidth()
          .onSizeChanged { barsPx = it.height }
          .graphicsLayer { translationY = hide.floatValue }
          .windowInsetsPadding(SafeBars.only(WindowInsetsSides.Bottom + WindowInsetsSides.Horizontal))
          .padding(bottom = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(8.dp),
      ) {
        val online by Net.online.collectAsStateWithLifecycle()
        if (!online) OfflineBanner { nav.downloads() }
        MiniPlayer(onOpen = { playerOpen = true })
        NavIsland(controller, Modifier.onSizeChanged { islandPx = it.height + with(density) { 12.dp.roundToPx() } })
      }

      AnimatedVisibility(
        visible = playerOpen,
        enter = slideInVertically(tween(320)) { it } + fadeIn(tween(200)),
        exit = slideOutVertically(tween(260)) { it } + fadeOut(tween(200)),
      ) {
        NowPlayingScreen(onClose = { playerOpen = false })
      }
      SnackbarHost(snack, Modifier.align(Alignment.BottomCenter).padding(bottom = if (playerOpen) 104.dp else edges.bottom))
    }
    BackHandler(enabled = playerOpen) { playerOpen = false }
  }
}

private data class Tab(val route: String, val label: String, val icon: Int)

private val tabs get() = listOf(
  Tab("home", tr("Главная"), R.drawable.ic_home),
  Tab("search", tr("Поиск"), R.drawable.ic_search),
  Tab("library", tr("Медиатека"), R.drawable.ic_library),
)

/** Navigation as a floating island (a full-rounded M3 Expressive container), not a bar across the screen. */
@Composable
private fun NavIsland(c: NavController, modifier: Modifier = Modifier) {
  val entry by c.currentBackStackEntryAsState()
  val route = entry?.destination?.route
  Surface(modifier, shape = CircleShape, color = MaterialTheme.colorScheme.surfaceContainer, shadowElevation = 6.dp) {
    Row(Modifier.height(64.dp).padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
      tabs.forEach { tab ->
        ShortNavigationBarItem(
          selected = route == tab.route,
          onClick = {
            c.navigate(tab.route) {
              popUpTo(c.graph.findStartDestination().id) { saveState = true }
              launchSingleTop = true
              restoreState = true
            }
          },
          icon = { Ico(tab.icon, tab.label) },
          label = { Text(tab.label, maxLines = 1) },
          modifier = Modifier.width(92.dp),
        )
      }
    }
  }
}

/** The mini player: wavy progress while playing (flat when paused), a morphing play button. */
@Composable
private fun MiniPlayer(onOpen: () -> Unit) {
  val s by PlayerConn.state.collectAsStateWithLifecycle()
  val t = s.track ?: return
  // the position is read while drawing: the bar moves without recomposing the row
  val pos = remember { mutableLongStateOf(0L) }
  LaunchedEffect(t.id, s.playing) {
    while (true) { pos.longValue = PlayerConn.position(); delay(if (s.playing) 250 else 1000) }
  }
  val dur = s.durationMs
  val interaction = remember { MutableInteractionSource() }
  Column(
    Modifier.fillMaxWidth().padding(horizontal = 12.dp).pressSquash(interaction, 0.97f)
      .shadow(6.dp, RoundedCornerShape(28.dp)).clip(RoundedCornerShape(28.dp))
      .background(MaterialTheme.colorScheme.surfaceContainerHigh)
      .clickable(interactionSource = interaction, indication = LocalIndication.current, onClick = onOpen),
  ) {
    Row(Modifier.padding(start = 8.dp, top = 8.dp, bottom = 6.dp, end = 6.dp), verticalAlignment = Alignment.CenterVertically) {
      Cover(t.coverUrl, Modifier.size(48.dp), RoundedCornerShape(16.dp))
      Spacer(Modifier.width(12.dp))
      Column(Modifier.weight(1f)) {
        Text(t.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, modifier = Modifier.basicMarquee())
        Text(t.artists, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
      }
      LikeButton("track", t.id)
      MorphPlayButton(s.playing, { PlayerConn.toggle() }, 44.dp)
      IconButton(onClick = { PlayerConn.next() }, shapes = IconButtonDefaults.shapes()) { Ico(R.drawable.ic_skip_next, tr("Следующий")) }
    }
    LinearWavyProgressIndicator(
      progress = { if (dur > 0) (pos.longValue.toFloat() / dur).coerceIn(0f, 1f) else 0f },
      modifier = Modifier.fillMaxWidth().padding(start = 14.dp, end = 14.dp, bottom = 8.dp),
      amplitude = { if (s.playing) 1f else 0f },
    )
  }
}
