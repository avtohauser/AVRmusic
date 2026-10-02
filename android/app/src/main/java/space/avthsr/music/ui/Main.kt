@file:OptIn(ExperimentalFoundationApi::class)

package space.avthsr.music.ui

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
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
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
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import space.avthsr.music.App
import space.avthsr.music.MainActivity
import space.avthsr.music.R
import space.avthsr.music.api.Api
import space.avthsr.music.player.PlayerConn

@Composable
fun Root() {
  val session by Api.session.collectAsStateWithLifecycle()
  if (session == null) LoginScreen() else Main()
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

  CompositionLocalProvider(LocalNav provides nav) {
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
      Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        snackbarHost = { SnackbarHost(snack) },
        bottomBar = {
          Column {
            MiniPlayer(onOpen = { playerOpen = true })
            BottomBar(controller)
          }
        },
      ) { pad ->
        NavHost(
          controller,
          startDestination = "home",
          modifier = Modifier.padding(pad).windowInsetsPadding(SafeBars.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal)),
          enterTransition = { fadeIn(tween(220)) },
          exitTransition = { fadeOut(tween(160)) },
        ) {
          composable("home") { HomeScreen() }
          composable("search") { SearchScreen() }
          composable("library") { LibraryScreen() }
          composable("liked") { LikedScreen() }
          composable("discover") { DiscoverScreen() }
          composable("profile") { ProfileScreen() }
          composable("album/{id}") { AlbumScreen(it.arguments?.getString("id").orEmpty()) }
          composable("artist/{id}") { ArtistScreen(it.arguments?.getString("id").orEmpty()) }
          composable("playlist/{id}") { PlaylistScreen(it.arguments?.getString("id").orEmpty()) }
          composable("genre/{id}") { GenreScreen(it.arguments?.getString("id").orEmpty()) }
          composable("calbum/{id}") { CatalogAlbumScreen(it.arguments?.getString("id")?.toLongOrNull() ?: 0L) }
          composable("cartist/{id}") { CatalogArtistScreen(it.arguments?.getString("id")?.toLongOrNull() ?: 0L) }
          composable("web?path={path}", arguments = listOf(navArgument("path") { type = NavType.StringType; defaultValue = "/" })) {
            WebScreen(it.arguments?.getString("path") ?: "/")
          }
        }
      }
      AnimatedVisibility(
        visible = playerOpen,
        enter = slideInVertically(tween(320)) { it } + fadeIn(tween(200)),
        exit = slideOutVertically(tween(260)) { it } + fadeOut(tween(200)),
      ) {
        NowPlayingScreen(onClose = { playerOpen = false })
      }
    }
    BackHandler(enabled = playerOpen) { playerOpen = false }
  }
}

private data class Tab(val route: String, val label: String, val icon: Int)

private val tabs = listOf(
  Tab("home", "Главная", R.drawable.ic_home),
  Tab("search", "Поиск", R.drawable.ic_search),
  Tab("library", "Медиатека", R.drawable.ic_library),
)

@Composable
private fun BottomBar(c: NavController) {
  val entry by c.currentBackStackEntryAsState()
  val route = entry?.destination?.route
  NavigationBar(
    containerColor = MaterialTheme.colorScheme.surfaceContainer,
    windowInsets = SafeBars.only(WindowInsetsSides.Bottom + WindowInsetsSides.Horizontal),
  ) {
    tabs.forEach { tab ->
      NavigationBarItem(
        selected = route == tab.route,
        onClick = {
          c.navigate(tab.route) {
            popUpTo(c.graph.findStartDestination().id) { saveState = true }
            launchSingleTop = true
            restoreState = true
          }
        },
        icon = { Ico(tab.icon, tab.label) },
        label = { Text(tab.label) },
      )
    }
  }
}

@Composable
private fun MiniPlayer(onOpen: () -> Unit) {
  val s by PlayerConn.state.collectAsStateWithLifecycle()
  val t = s.track ?: return
  var pos by remember { mutableLongStateOf(0L) }
  LaunchedEffect(t.id, s.playing) {
    while (true) { pos = PlayerConn.position(); delay(500) }
  }
  val progress = if (s.durationMs > 0) (pos.toFloat() / s.durationMs).coerceIn(0f, 1f) else 0f
  Column(
    Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp).clip(RoundedCornerShape(22.dp))
      .background(MaterialTheme.colorScheme.surfaceContainerHigh).clickable(onClick = onOpen),
  ) {
    Row(Modifier.padding(start = 8.dp, top = 8.dp, bottom = 8.dp, end = 2.dp), verticalAlignment = Alignment.CenterVertically) {
      Cover(t.coverUrl, Modifier.size(46.dp), RoundedCornerShape(14.dp))
      Spacer(Modifier.width(12.dp))
      Column(Modifier.weight(1f)) {
        Text(t.title, style = MaterialTheme.typography.titleSmall, maxLines = 1, modifier = Modifier.basicMarquee())
        Text(t.artists, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
      }
      LikeButton("track", t.id)
      IconButton(onClick = { PlayerConn.toggle() }) { Ico(if (s.playing) R.drawable.ic_pause else R.drawable.ic_play, if (s.playing) "Пауза" else "Играть") }
      IconButton(onClick = { PlayerConn.next() }) { Ico(R.drawable.ic_skip_next, "Следующий") }
    }
    Box(Modifier.fillMaxWidth().padding(horizontal = 14.dp).height(2.dp).clip(RoundedCornerShape(1.dp)).background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.12f))) {
      Box(Modifier.fillMaxWidth(progress).height(2.dp).background(MaterialTheme.colorScheme.primary))
    }
    Spacer(Modifier.height(4.dp))
  }
}
