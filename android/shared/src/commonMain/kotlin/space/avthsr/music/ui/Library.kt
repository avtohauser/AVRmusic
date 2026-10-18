@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package space.avthsr.music.ui

import androidx.compose.foundation.combinedClickable
import space.avthsr.music.tr
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.ButtonDefaults
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import space.avthsr.music.App
import space.avthsr.music.res.*
import space.avthsr.music.api.Api
import space.avthsr.music.api.refreshPlaylist
import space.avthsr.music.api.radar
import space.avthsr.music.api.albumCompleteness
import space.avthsr.music.api.Likes
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.material3.ToggleButton
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import space.avthsr.music.api.LikePrefs
import space.avthsr.music.api.Track
import space.avthsr.music.player.Offline
import space.avthsr.music.player.PlayerConn

/** Play / shuffle buttons for a list of tracks. */
@Composable
fun PlayButtons(tracks: List<Track>, context: String) {
  Button(shapes = ButtonDefaults.shapes(), onClick = { PlayerConn.play(tracks, 0, context) }, enabled = tracks.isNotEmpty()) {
    Ico(Res.drawable.ic_play, null, Modifier.size(20.dp)); Spacer(Modifier.width(6.dp)); Text(tr("Слушать"))
  }
  FilledTonalButton(shapes = ButtonDefaults.shapes(), onClick = { PlayerConn.play(tracks, 0, context, shuffle = true) }, enabled = tracks.isNotEmpty()) {
    Ico(Res.drawable.ic_shuffle, null, Modifier.size(20.dp)); Spacer(Modifier.width(6.dp)); Text(tr("Вперемешку"))
  }
}

@Composable
private fun ListRow(
  cover: String?,
  title: String,
  subtitle: String,
  circle: Boolean = false,
  menu: (@Composable (expanded: Boolean, close: () -> Unit) -> Unit)? = null,
  share: String? = null,
  onClick: () -> Unit,
) {
  var open by remember { mutableStateOf(false) }
  val token = rememberSaveable { uniqueToken() }
  Row(
    Modifier.fillMaxWidth().combinedClickable(onClick = { if (share != null) SharedCover.tap(token, share, cover, title, circle); onClick() }, onLongClick = menu?.let { { open = true } })
      .padding(start = 16.dp, end = if (menu != null) 4.dp else 16.dp, top = 8.dp, bottom = 8.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Cover(cover, Modifier.size(56.dp).sharedCover(share, token), if (circle) ArtistShape else RoundedCornerShape(14.dp), if (circle) Res.drawable.ic_person else Res.drawable.ic_album)
    Spacer(Modifier.width(14.dp))
    Column(Modifier.weight(1f)) {
      Text(title, Modifier.sharedTitle(share, token), style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
      if (subtitle.isNotEmpty()) Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
    if (menu != null) Box {
      IconButton(shapes = IconButtonDefaults.shapes(), onClick = { open = true }) { Ico(Res.drawable.ic_more, tr("Ещё"), tint = MaterialTheme.colorScheme.onSurfaceVariant) }
      menu(open) { open = false }
    }
  }
}

@Composable
fun LibraryScreen() {
  val nav = LocalNav.current
  var tab by rememberSaveable { mutableIntStateOf(0) }
  var create by remember { mutableStateOf(false) }
  var blend by remember { mutableStateOf(false) }
  var smart by remember { mutableStateOf(false) }
  val playlists = rememberLoad(Unit) { Api.playlists() }
  val albumIds by Likes.of("album").collectAsStateWithLifecycle()
  val artistIds by Likes.of("artist").collectAsStateWithLifecycle()
  val albums = rememberLoad(albumIds.size) { Api.likedAlbums() }
  val artists = rememberLoad(artistIds.size) { Api.likedArtists() }
  val liked by Likes.tracks.collectAsStateWithLifecycle()
  // the whole library (not only what was liked), sorted as chosen
  var scope by rememberSaveable { mutableIntStateOf(0) } // 0 liked, 1 everything on the server
  var albumSort by rememberSaveable { mutableStateOf("recent") }
  var artistSort by rememberSaveable { mutableStateOf("popular") }
  val allAlbums = rememberLoad(albumSort, tab == 1 && scope == 1) { if (tab == 1 && scope == 1) Api.allAlbums(albumSort) else emptyList() }
  val allArtists = rememberLoad(artistSort, tab == 2 && scope == 1) { if (tab == 2 && scope == 1) Api.allArtists(artistSort) else emptyList() }
  val community = rememberLoad(tab == 3) { if (tab == 3) Api.publicPlaylists() else emptyList() }

  LazyColumn(Modifier.fillMaxSize(), contentPadding = screenPadding(bottom = 24.dp)) {
    item {
      Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        FlowText(tr("Медиатека"), MaterialTheme.typography.headlineMedium, Modifier.weight(1f), maxLines = 1)
        IconButton(shapes = IconButtonDefaults.shapes(), onClick = { nav.route("transfer") }) { Ico(Res.drawable.ic_import, tr("Перенести музыку")) }
        IconButton(shapes = IconButtonDefaults.shapes(), onClick = { create = true }) { Ico(Res.drawable.ic_add, tr("Новый плейлист")) }
      }
    }
    item {
      val supers by Likes.supers.collectAsStateWithLifecycle()
      val superOn by LikePrefs.superOn.collectAsStateWithLifecycle()
      val superFirst by LikePrefs.superFirst.collectAsStateWithLifecycle()
      Row(Modifier.padding(16.dp).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        val likedTile = @Composable { LikeTile(tr("Любимые треки"), tracksWord(liked.size), starred = false, Modifier.weight(1f)) { nav.liked() } }
        val superTile = @Composable { LikeTile(tr("Суперлайки"), tracksWord(supers.size), starred = true, Modifier.weight(1f)) { nav.superliked() } }
        when {
          !superOn -> likedTile()
          superFirst -> { superTile(); likedTile() }
          else -> { likedTile(); superTile() }
        }
      }
    }
    item {
      val saved by Offline.entries.collectAsStateWithLifecycle()
      Row(
        Modifier.padding(start = 16.dp, end = 16.dp, bottom = 12.dp).fillMaxWidth().clip(RoundedCornerShape(24.dp))
          .background(MaterialTheme.colorScheme.surfaceContainerHigh).clickable { nav.downloads() }.padding(16.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Ico(Res.drawable.ic_offline, null, Modifier.size(28.dp), MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
          Text(tr("Скачанные"), style = MaterialTheme.typography.titleMedium)
          Text(tr("{} · играют без интернета", (tracksWord(saved.size))), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
      }
    }
    item {
      Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf(tr("Плейлисты"), tr("Альбомы"), tr("Исполнители"), tr("Сообщество")).forEachIndexed { i, label ->
          ToggleButton(checked = tab == i, onCheckedChange = { tab = i }) { Text(label) }
        }
      }
    }
    if (tab == 1 || tab == 2) item {
      Row(Modifier.horizontalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf(tr("Любимые"), tr("Все на сервере")).forEachIndexed { i, l -> ToggleButton(checked = scope == i, onCheckedChange = { scope = i }) { Text(l) } }
        if (scope == 1) {
          val sorts = if (tab == 1) listOf("recent" to tr("Новые"), "popular" to tr("Популярные"), "title" to tr("По названию"), "year" to tr("По году"))
          else listOf("popular" to tr("Популярные"), "name" to tr("По имени"), "new" to tr("Новые"))
          sorts.forEach { (id, l) ->
            val on = if (tab == 1) albumSort == id else artistSort == id
            ToggleButton(checked = on, onCheckedChange = { if (tab == 1) albumSort = id else artistSort = id }) { Text(l) }
          }
        }
      }
    }
    when (tab) {
      0 -> {
        // playlists the server fills: the release radar and blends with friends
        item {
          Row(Modifier.padding(horizontal = 16.dp, vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            AutoTile(tr("Радар новинок"), tr("Свежее от ваших исполнителей"), Res.drawable.ic_sparkle, Modifier.weight(1f)) {
              act { val r = Api.radar(); nav.playlist(r.id) }
            }
            AutoTile(tr("Блендер"), tr("Смесь вкусов с друзьями"), Res.drawable.ic_group, Modifier.weight(1f)) { blend = true }
            AutoTile(tr("Умный"), tr("Собирается сам по правилам"), Res.drawable.ic_tune, Modifier.weight(1f)) { smart = true }
          }
        }
        val list = playlists.data.orEmpty()
        if (list.isEmpty()) item { Hint(if (playlists.state is Load.Loading) tr("Загрузка…") else tr("Плейлистов пока нет — создайте первый кнопкой +")) }
        items(list, key = { "p:" + it.id }) { p -> Box(Modifier.animateItem(Motion.expressive.defaultEffectsSpec(), Motion.expressive.defaultSpatialSpec(), Motion.expressive.fastEffectsSpec())) { ListRow(p.coverUrl ?: p.mosaic.firstOrNull(), p.title, listOfNotNull(p.owner?.displayName, tracksWord(p.trackCount)).joinToString(" · "), menu = { e, c -> PlaylistMenu(p, e, c) }, share = "playlist:${p.id}") { nav.playlist(p.id) } } }
      }
      1 -> {
        val list = (if (scope == 0) albums.data else allAlbums.data).orEmpty()
        if (list.isEmpty()) item { Hint(if (scope == 0) tr("Лайкните альбом — он появится здесь") else tr("Загрузка…")) }
        items(list, key = { "a:" + it.id }) { a -> Box(Modifier.animateItem(Motion.expressive.defaultEffectsSpec(), Motion.expressive.defaultSpatialSpec(), Motion.expressive.fastEffectsSpec())) { ListRow(a.coverUrl, a.title, listOfNotNull(a.artist.name, a.year?.toString()).joinToString(" · "), menu = { e, c -> AlbumMenu(a.id, a.title, a.artist.id, a.artist.name, e, c) }, share = "album:${a.id}") { nav.album(a.id) } } }
      }
      2 -> {
        val list = (if (scope == 0) artists.data else allArtists.data).orEmpty()
        if (list.isEmpty()) item { Hint(if (scope == 0) tr("Лайкните исполнителя — он появится здесь") else tr("Загрузка…")) }
        items(list, key = { "r:" + it.id }) { a -> Box(Modifier.animateItem(Motion.expressive.defaultEffectsSpec(), Motion.expressive.defaultSpatialSpec(), Motion.expressive.fastEffectsSpec())) { ListRow(a.imageUrl, a.name, "", circle = true, share = "artist:${a.id}") { nav.artist(a.id) } } }
      }
      else -> {
        val list = community.data.orEmpty()
        if (list.isEmpty()) item { Hint(if (community.state is Load.Loading) tr("Загрузка…") else tr("Публичных плейлистов пока нет")) }
        items(list, key = { "p:" + it.id }) { p -> Box(Modifier.animateItem(Motion.expressive.defaultEffectsSpec(), Motion.expressive.defaultSpatialSpec(), Motion.expressive.fastEffectsSpec())) { ListRow(p.coverUrl ?: p.mosaic.firstOrNull(), p.title, listOfNotNull(p.owner?.displayName, tracksWord(p.trackCount)).joinToString(" · "), menu = { e, c -> PlaylistMenu(p, e, c) }, share = "playlist:${p.id}") { nav.playlist(p.id) } } }
      }
    }
  }

  if (blend) BlendDialog(onCreated = { playlists.reload(); nav.playlist(it) }) { blend = false }
  if (smart) SmartEditor(null, null, onDismiss = { smart = false }) { id -> smart = false; playlists.reload(); nav.playlist(id) }

  if (create) {
    var title by remember { mutableStateOf("") }
    AlertDialog(modifier = Modifier.growIn(),
      onDismissRequest = { create = false },
      title = { Text(tr("Новый плейлист")) },
      text = { OutlinedTextField(title, { title = it }, label = { Text(tr("Название")) }, singleLine = true) },
      confirmButton = {
        TextButton(shapes = ButtonDefaults.shapes(), enabled = title.isNotBlank(), onClick = {
          val name = title
          create = false
          App.scope.launch {
            runCatching { Api.createPlaylist(name) }.onSuccess { playlists.reload(); nav.playlist(it.id) }.onFailure { App.say(it.message ?: tr("Не получилось")) }
          }
        }) { Text(tr("Создать")) }
      },
      dismissButton = { TextButton(shapes = ButtonDefaults.shapes(), onClick = { create = false }) { Text(tr("Отмена")) } },
    )
  }
}

@Composable
private fun AutoTile(title: String, subtitle: String, icon: org.jetbrains.compose.resources.DrawableResource, modifier: Modifier, onClick: () -> Unit) {
  val cs = MaterialTheme.colorScheme
  Column(modifier.clip(RoundedCornerShape(24.dp)).background(cs.tertiaryContainer).clickable(onClick = onClick).padding(14.dp)) {
    Box(Modifier.size(36.dp).clip(LogoShape).background(cs.tertiary), contentAlignment = Alignment.Center) { Ico(icon, null, Modifier.size(20.dp), cs.onTertiary) }
    Spacer(Modifier.height(8.dp))
    Text(title, style = MaterialTheme.typography.titleSmall, color = cs.onTertiaryContainer, maxLines = 1)
    Text(subtitle, style = MaterialTheme.typography.bodySmall, color = cs.onTertiaryContainer.copy(alpha = 0.8f), maxLines = 2)
  }
}

@Composable
fun Hint(text: String) {
  Text(text, Modifier.fillMaxWidth().padding(24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
}

/** The keys a liked tile shares with the page it opens: the tile turns into the header, its mark and title fly over. */
fun likesKey(starred: Boolean, part: String) = "likes:${if (starred) "super" else "all"}:$part"

/** Liked songs, or Superlikes; a teal tile with the star for the superliked ones. */
@Composable
private fun LikeTile(title: String, subtitle: String, starred: Boolean, modifier: Modifier, onClick: () -> Unit) {
  val cs = MaterialTheme.colorScheme
  val bg = if (starred) Brush.linearGradient(listOf(Brand.Teal, Color(0xFF1D5D63))) else Brush.linearGradient(listOf(cs.primary, cs.tertiary))
  val fg = if (starred) Brand.Mist else cs.onPrimary
  val shape = RoundedCornerShape(28.dp)
  Column(modifier.height(112.dp).sharedBox(likesKey(starred, "box"), shape).clip(shape).background(bg).clickable(onClick = onClick).padding(18.dp)) {
    Box(Modifier.size(32.dp).sharedCover(likesKey(starred, "mark"))) {
      if (starred) SuperStar(Modifier.fillMaxSize()) else Ico(Res.drawable.ic_heart_filled, null, Modifier.fillMaxSize(), fg)
    }
    Spacer(Modifier.weight(1f))
    Text(title, Modifier.sharedBox(likesKey(starred, "title"), RoundedCornerShape(4.dp)), style = MaterialTheme.typography.titleMedium, color = fg, maxLines = 1, overflow = TextOverflow.Ellipsis)
    RollText(subtitle, style = MaterialTheme.typography.bodySmall, color = fg.copy(alpha = 0.8f))
  }
}

private val LIKED_SORTS = listOf("recent", "oldest", "title", "artist", "album")

/** The list as the listener wants it: matching the search (title, artists, album), in the chosen order. */
private fun arrange(list: List<Track>, query: String, sort: String): List<Track> {
  val q = query.trim().lowercase()
  val found = if (q.isEmpty()) list else list.filter { t -> listOf(t.title, t.artists, t.album?.title.orEmpty()).any { it.lowercase().contains(q) } }
  return when (sort) {
    "oldest" -> found.reversed()
    "title" -> found.sortedBy { it.title.lowercase() }
    "artist" -> found.sortedWith(compareBy({ it.artist.name.lowercase() }, { it.title.lowercase() }))
    "album" -> found.sortedWith(compareBy({ it.album?.title?.lowercase() ?: "\uffff" }, { it.title.lowercase() }))
    else -> found
  }
}

/**
 * Liked songs, or only the superliked ones ([starred]). The header is there at once (it grew out of the
 * tile that opened the page); a long list is searched — the search grows out of its button — and sorted,
 * and the rows glide into the new order.
 */
@Composable
fun LikedScreen(starred: Boolean = false) {
  val liked by Likes.tracks.collectAsStateWithLifecycle()
  val supers by Likes.supers.collectAsStateWithLifecycle()
  val loader = rememberLoad(starred, if (starred) supers.size else liked.size) { if (starred) Api.superTracks() else Api.likedTracks() }
  val sortKey = if (starred) "liked.sort.super" else "liked.sort.all"
  var query by rememberSaveable { mutableStateOf("") }
  var searching by rememberSaveable { mutableStateOf(false) }
  var sort by remember { mutableStateOf(runCatching { Api.prefs.getString(sortKey, null) }.getOrNull()?.takeIf { it in LIKED_SORTS } ?: "recent") }
  val ctx = if (starred) "superliked" else "liked"
  val cs = MaterialTheme.colorScheme
  val all = loader.data.orEmpty()
  val tracks = remember(all, query, sort) { arrange(all, query, sort) }
  val count = if (starred) supers.size else liked.size
  Page {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = screenPadding(bottom = 24.dp, hero = true)) {
      item {
        Column(Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 64.dp + LocalEdges.current.top, bottom = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
          val shape = RoundedCornerShape(36.dp)
          Box(
            Modifier.size(180.dp).sharedBox(likesKey(starred, "box"), shape).clip(shape)
              .background(if (starred) Brush.linearGradient(listOf(Brand.Teal, Color(0xFF1D5D63))) else Brush.linearGradient(listOf(cs.primary, cs.tertiary))),
            contentAlignment = Alignment.Center,
          ) {
            Box(Modifier.size(if (starred) 96.dp else 72.dp).sharedCover(likesKey(starred, "mark"))) {
              if (starred) SuperStar(Modifier.fillMaxSize()) else Ico(Res.drawable.ic_heart_filled, null, Modifier.fillMaxSize(), cs.onPrimary)
            }
          }
          Spacer(Modifier.height(16.dp))
          FlowText(if (starred) tr("Суперлайки") else tr("Любимые треки"), MaterialTheme.typography.headlineMedium, Modifier.sharedBox(likesKey(starred, "title"), RoundedCornerShape(4.dp)), maxLines = 1)
          RollText(tracksWord(count), color = cs.onSurfaceVariant)
          Spacer(Modifier.height(14.dp))
          Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) { PlayButtons(tracks, ctx); OfflineButton(all) }
        }
      }
      if (all.size > 8) item {
        LikedControls(query, { query = it }, searching, { searching = it }, sort) { id ->
          sort = id
          runCatching { Api.prefs.edit().putString(sortKey, id).apply() }
        }
      }
      when (val st = loader.state) {
        is Load.Loading -> item { Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { LoadingMark() } }
        is Load.Err -> item { Hint(st.message) }
        is Load.Ok -> when {
          all.isEmpty() -> item { Hint(if (starred) tr("Суперлайков пока нет. Зажмите сердце у трека — он получит звезду и попадёт сюда, а в «Любимых» останется.") else tr("Лайкните трек — он появится здесь")) }
          tracks.isEmpty() -> item { Hint(tr("Ничего не нашлось")) }
          else -> itemsIndexed(tracks, key = { _, t -> t.id }) { i, t ->
            Box(Modifier.animateItem(Motion.expressive.defaultEffectsSpec(), Motion.expressive.defaultSpatialSpec(), Motion.expressive.fastEffectsSpec())) {
              TrackRow(t, onClick = { PlayerConn.play(tracks, i, ctx) })
            }
          }
        }
      }
    }
  }
}

/**
 * Search and order of a long liked list. The search button grows into the field (and shrinks back), the
 * order is a row of expressive toggle buttons whose shape changes as they are chosen.
 */
@Composable
private fun LikedControls(query: String, onQuery: (String) -> Unit, searching: Boolean, onSearching: (Boolean) -> Unit, sort: String, onSort: (String) -> Unit) {
  val open = searching || query.isNotEmpty()
  val names = mapOf("recent" to tr("Сначала новые"), "oldest" to tr("Сначала старые"), "title" to tr("По названию"), "artist" to tr("По исполнителю"), "album" to tr("По альбому"))
  val sorts: @Composable () -> Unit = {
    LIKED_SORTS.forEach { id ->
      ToggleButton(checked = sort == id, onCheckedChange = { onSort(id) }) { Text(names.getValue(id)) }
    }
  }
  Column(Modifier.padding(horizontal = 16.dp, vertical = 6.dp)) {
    SharedTransitionLayout {
      AnimatedContent(
        targetState = open,
        transitionSpec = { fadeIn(Motion.expressive.defaultEffectsSpec()).togetherWith(fadeOut(Motion.expressive.fastEffectsSpec())).using(SizeTransform(clip = false)) },
        label = "search",
      ) { isOpen ->
        val grow = Modifier.sharedBounds(rememberSharedContentState("liked-search"), this@AnimatedContent, boundsTransform = Motion.coverBounds, clipInOverlayDuringTransition = OverlayClip(RoundedCornerShape(28.dp)))
        if (isOpen) {
          val focus = remember { FocusRequester() }
          LaunchedEffect(Unit) { if (query.isEmpty()) runCatching { focus.requestFocus() } }
          OutlinedTextField(
            query, onQuery, grow.fillMaxWidth().focusRequester(focus),
            placeholder = { Text(tr("Найти в списке")) },
            leadingIcon = { Ico(Res.drawable.ic_search, null) },
            trailingIcon = { IconButton(shapes = IconButtonDefaults.shapes(), onClick = { onQuery(""); onSearching(false) }) { Ico(Res.drawable.ic_close, tr("Закрыть поиск")) } },
            singleLine = true, shape = RoundedCornerShape(28.dp),
          )
        } else {
          Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            FilledTonalIconButton(onClick = { onSearching(true) }, shapes = IconButtonDefaults.shapes(), modifier = grow) { Ico(Res.drawable.ic_search, tr("Найти в списке")) }
            sorts()
          }
        }
      }
    }
    // while searching the order stays at hand, under the field
    AnimatedVisibility(open, enter = expandVertically(Motion.expressive.defaultSpatialSpec()) + fadeIn(), exit = shrinkVertically(Motion.expressive.defaultSpatialSpec()) + fadeOut()) {
      Row(Modifier.horizontalScroll(rememberScrollState()).padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) { sorts() }
    }
  }
}

@Composable
fun AlbumScreen(id: String) {
  val nav = LocalNav.current
  val loader = rememberLoad(id) { Api.album(id) }
  Page {
    LoadedPage(loader, "album:$id") { a ->
      LazyColumn(Modifier.fillMaxSize(), contentPadding = screenPadding(bottom = 24.dp, hero = true)) {
        item {
          Header(
            share = "album:${a.id}",
            cover = a.coverUrl, title = a.title, subtitle = a.artist.name, onSubtitle = { nav.artist(a.artist.id) },
            meta = listOfNotNull(albumType(a.type), a.year?.toString(), tracksWord(a.tracks.size), fmtTime(a.tracks.sumOf { it.durationMs })).joinToString(" · "),
          ) {
            PlayButtons(a.tracks, "album:${a.id}")
          }
          Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            LikeButton("album", a.id)
            OfflineButton(a.tracks)
            IconButton(shapes = IconButtonDefaults.shapes(), onClick = { downloadToDevice("/api/download/album/${a.id}", "${a.artist.name} - ${a.title}.zip") }) { Ico(Res.drawable.ic_folder, tr("Скачать на устройство (ZIP)")) }
            IconButton(shapes = IconButtonDefaults.shapes(), onClick = { share("/album/${a.id}", "${a.artist.name} — ${a.title}") }) { Ico(Res.drawable.ic_share, tr("Поделиться")) }
            if (Api.user?.isAdmin == true) AlbumAdminMenu(a) { loader.reload() }
          }
          AlbumCheck(a.id) { loader.reload() }
        }
        itemsIndexed(a.tracks) { i, t -> Glide {
          TrackRow(
            t, onClick = { PlayerConn.play(a.tracks, i, "album:${a.id}") }, index = t.trackNo ?: (i + 1), showCover = false,
            subtitle = if (t.featuring.isEmpty() && t.artist.id == a.artist.id) fmtTime(t.durationMs) else t.artists,
          ) }
        }
        if (a.label != null) item { Text("℗ ${a.label}", Modifier.padding(20.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
      }
    }
  }
}

@Composable
fun ArtistScreen(id: String) {
  val nav = LocalNav.current
  val loader = rememberLoad(id) { Api.artist(id) }
  // the whole discography: "Слушать" plays all of it, a popular track goes on into the rest
  val discography = rememberLoad("tracks", id) { Api.artistTracks(id) }
  var showAll by rememberSaveable { mutableStateOf(false) }
  Page {
    LoadedPage(loader, "artist:$id") { a ->
      val all = discography.data ?: a.topTracks
      // the popular ones first, then everything else of the artist
      val fromTop = a.topTracks + all.filter { t -> a.topTracks.none { it.id == t.id } }
      LazyColumn(Modifier.fillMaxSize(), contentPadding = screenPadding(bottom = 24.dp, hero = true)) {
        item {
          Header(
            share = "artist:${a.id}",
            cover = a.imageUrl ?: a.headerUrl, title = a.name, circle = true,
            meta = listOfNotNull(
              tracksWord(all.size).takeIf { all.isNotEmpty() },
              tr("{} слушателей за месяц", a.monthlyListeners).takeIf { a.monthlyListeners > 0 },
            ).joinToString(" · "),
          ) {
            PlayButtons(all, "artist:${a.id}")
          }
          Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            LikeButton("artist", a.id)
            // what of the artist is not on the server yet (or failed before) is fetched; the rest is skipped
            a.deezerId?.let { did ->
              if (Api.user?.canAcquire != false) IconButton(shapes = IconButtonDefaults.shapes(), onClick = { acquire("artist", did, tr("Дискография {}", a.name)) }) { Ico(Res.drawable.ic_download, tr("Докачать дискографию")) }
              IconButton(shapes = IconButtonDefaults.shapes(), onClick = { nav.catalogArtist(did) }) { Ico(Res.drawable.ic_explore, tr("Всё в каталоге")) }
            }
            IconButton(shapes = IconButtonDefaults.shapes(), onClick = { share("/artist/${a.id}", a.name) }) { Ico(Res.drawable.ic_share, tr("Поделиться")) }
            if (Api.user?.isAdmin == true) ArtistAdminMenu(a) { loader.reload() }
          }
        }
        if (a.topTracks.isNotEmpty()) {
          item { SectionTitle(tr("Популярные треки")) }
          itemsIndexed(a.topTracks.take(10)) { i, t -> Glide { TrackRow(t, onClick = { PlayerConn.play(fromTop, i, "artist:${a.id}") }) } }
        }
        if (all.size > a.topTracks.size) {
          item {
            SectionTitle(tr("Все треки"), tracksWord(all.size)) {
              TextButton(shapes = ButtonDefaults.shapes(), onClick = { showAll = !showAll }) { Text(if (showAll) tr("Свернуть") else tr("Показать")) }
            }
          }
          if (showAll) itemsIndexed(all, key = { _, t -> "all:" + t.id }) { i, t -> Glide {
            TrackRow(t, onClick = { PlayerConn.play(all, i, "artist:${a.id}") }, subtitle = listOfNotNull(t.artists, t.album?.title).joinToString(" · ")) }
          }
        }
        if (a.albums.isNotEmpty()) item {
          SectionTitle(tr("Альбомы и синглы"))
          CardRow(a.albums) { al -> MediaCard(al.title, listOfNotNull(albumType(al.type), al.year?.toString()).joinToString(" · "), al.coverUrl, { nav.album(al.id) }, share = "album:${al.id}", menu = { e, c -> AlbumMenu(al.id, al.title, al.artist.id, al.artist.name, e, c) }) }
        }
        if (a.appearsOn.isNotEmpty()) item {
          SectionTitle(tr("Участвует"))
          CardRow(a.appearsOn) { al -> MediaCard(al.title, al.artist.name, al.coverUrl, { nav.album(al.id) }, share = "album:${al.id}", menu = { e, c -> AlbumMenu(al.id, al.title, al.artist.id, al.artist.name, e, c) }) }
        }
        if (a.related.isNotEmpty()) item {
          SectionTitle(tr("Похожие исполнители"))
          CardRow(a.related) { r -> MediaCard(r.name, "", r.imageUrl, { nav.artist(r.id) }, share = "artist:${r.id}", circle = true, width = 124.dp) }
        }
        if (!a.bio.isNullOrBlank()) item {
          SectionTitle(tr("Об исполнителе"))
          Text(a.bio, Modifier.padding(horizontal = 20.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
      }
    }
  }
}

@Composable
fun PlaylistScreen(id: String) {
  val loader = rememberLoad(id) { Api.playlist(id) }
  Page {
    LoadedPage(loader, "playlist:$id") { p ->
      val own = p.isOwner == true || p.owner?.id == Api.user?.id
      val canEdit = p.canEdit ?: own
      val shared = p.members.isNotEmpty()
      var members by remember { mutableStateOf(false) }
      var rules by remember { mutableStateOf(false) }
      if (members) MembersDialog(p, onChanged = { loader.reload() }) { members = false }
      if (rules) SmartEditor(p.id, p.autoRules, onDismiss = { rules = false }) { rules = false; loader.reload() }
      LazyColumn(Modifier.fillMaxSize(), contentPadding = screenPadding(bottom = 24.dp, hero = true)) {
        item {
          Header(
            share = "playlist:${p.id}",
            cover = p.coverUrl ?: p.mosaic.firstOrNull(), title = p.title,
            // a playlist of several owners names them all
            subtitle = if (p.owners.size > 1) ownersLine(p.owners.map { it.displayName }) else p.owner?.displayName,
            meta = listOfNotNull(
              when (p.autoKind) {
                "blend" -> tr("Блендер · обновляется каждый день"); "radar" -> tr("Обновляется каждую неделю")
                "mix" -> tr("Микс дня · обновляется каждый день"); "smart" -> tr("Умный · собирается по правилам"); else -> null
              },
              p.description?.takeIf { it.isNotBlank() && p.autoKind == null }, tracksWord(p.tracks.size),
            ).joinToString(" · "),
          ) {
            PlayButtons(p.tracks, "playlist:${p.id}")
          }
          Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            if (!own) LikeButton("playlist", p.id) else PlaylistOwnerMenu(p) { loader.reload() }
            if (p.autoKind == "smart" && canEdit) IconButton(shapes = IconButtonDefaults.shapes(), onClick = { rules = true }) { Ico(Res.drawable.ic_tune, tr("Правила")) }
            if (p.autoKind != null && canEdit) IconButton(shapes = IconButtonDefaults.shapes(), onClick = { act(tr("Обновлено"), { loader.reload() }) { Api.refreshPlaylist(p.id) } }) { Ico(Res.drawable.ic_refresh, tr("Обновить подборку")) }
            // a playlist kept together with friends: their faces, a tap shows / invites them
            if (own || shared) MemberFaces(p) { members = true }
            OfflineButton(p.tracks)
            IconButton(shapes = IconButtonDefaults.shapes(), onClick = { downloadToDevice("/api/download/playlist/${p.id}", "${p.title}.zip") }) { Ico(Res.drawable.ic_folder, tr("Скачать на устройство (ZIP)")) }
            IconButton(shapes = IconButtonDefaults.shapes(), onClick = { share("/playlist/${p.id}", p.title) }) { Ico(Res.drawable.ic_share, tr("Поделиться")) }
          }
        }
        if (p.tracks.isEmpty()) item { Hint(tr("Плейлист пуст. Добавляйте треки через меню ⋮ у любого трека.")) }
        val keys = p.tracks.rowKeys()
        itemsIndexed(p.tracks, key = { i, _ -> keys[i] }) { i, t -> Glide {
          TrackRow(t, onClick = { PlayerConn.play(p.tracks, i, "playlist:${p.id}") },
            subtitle = t.addedBy?.takeIf { shared }?.let { if (p.autoKind == "blend") tr("{} · вкус: {}", t.artists, it.displayName) else tr("{} · добавил(а) {}", t.artists, it.displayName) },
            menuExtra = { close ->
            if (canEdit) DropdownMenuItem(text = { Text(tr("Убрать из плейлиста")) }, leadingIcon = { Ico(Res.drawable.ic_close) }, onClick = {
              close()
              App.scope.launch { runCatching { Api.removeFromPlaylist(p.id, t.id) }.onSuccess { loader.reload() }.onFailure { App.say(it.message ?: tr("Не получилось")) } }
            })
          }) }
        }
      }
    }
  }
}

@Composable
fun GenreScreen(slug: String) {
  val nav = LocalNav.current
  val loader = rememberLoad(slug) { Api.genre(slug) }
  // the header is there at once (it grew out of the genre's tile), the rest follows when it loads
  val genre = loader.data?.genre ?: GenresSeen[slug]
  val color = parseColor(genre?.color ?: "", MaterialTheme.colorScheme.primaryContainer)
  Page {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = screenPadding(bottom = 24.dp, hero = true)) {
      item {
        Column(
          Modifier.fillMaxWidth().sharedBox("genre:$slug", RoundedCornerShape(28.dp)).background(Brush.verticalGradient(listOf(color, Color.Transparent)))
            .padding(start = 20.dp, end = 20.dp, top = 72.dp + LocalEdges.current.top, bottom = 16.dp),
        ) {
          Text(genre?.name ?: "", Modifier.sharedBox("genre:$slug:name", RoundedCornerShape(4.dp)), style = MaterialTheme.typography.displaySmall)
          Text(tracksWord(genre?.trackCount ?: 0), color = MaterialTheme.colorScheme.onSurfaceVariant)
          Spacer(Modifier.height(14.dp))
          val g = loader.data
          Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { PlayButtons(g?.tracks.orEmpty(), "genre:$slug") }
        }
      }
      when (val st = loader.state) {
        is Load.Loading -> item { Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { LoadingMark() } }
        is Load.Err -> item { Hint(st.message) }
        is Load.Ok -> {
          val g = st.data
          if (g.artists.isNotEmpty()) item {
            SectionTitle(tr("Исполнители"))
            CardRow(g.artists) { a -> MediaCard(a.name, "", a.imageUrl, { nav.artist(a.id) }, share = "artist:${a.id}", circle = true, width = 124.dp) }
          }
          if (g.albums.isNotEmpty()) item {
            SectionTitle(tr("Альбомы"))
            CardRow(g.albums) { a -> MediaCard(a.title, a.artist.name, a.coverUrl, { nav.album(a.id) }, share = "album:${a.id}", menu = { e, c -> AlbumMenu(a.id, a.title, a.artist.id, a.artist.name, e, c) }) }
          }
          if (g.tracks.isNotEmpty()) {
            item { SectionTitle(tr("Треки")) }
            itemsIndexed(g.tracks, key = { i, t -> "$i:${t.id}" }) { i, t ->
              Box(Modifier.animateItem(Motion.expressive.defaultEffectsSpec(), Motion.expressive.defaultSpatialSpec(), Motion.expressive.fastEffectsSpec())) {
                TrackRow(t, onClick = { PlayerConn.play(g.tracks, i, "genre:$slug") })
              }
            }
          }
        }
      }
    }
  }
}

/** "Петя, Вася и Стёпа" */
fun ownersLine(names: List<String>): String = when (names.size) {
  0 -> ""
  1 -> names[0]
  else -> names.dropLast(1).joinToString(", ") + tr(" и ") + names.last()
}

/** Is the album whole on the server? A card with what is missing and a button to fetch it, or a check button. */
@Composable
private fun AlbumCheck(albumId: String, onFetched: () -> Unit) {
  var checked by remember(albumId) { mutableStateOf<space.avthsr.music.api.Completeness?>(null) }
  var busy by remember { mutableStateOf(false) }
  // looked at once by itself: an incomplete album says so without being asked
  LaunchedEffect(albumId) { checked = runCatching { Api.albumCompleteness(albumId) }.getOrNull() }
  val c = checked
  val cs = MaterialTheme.colorScheme
  if (c == null || !c.checkable) return
  if (c.missing.isEmpty()) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
      TextButton(shapes = ButtonDefaults.shapes(), enabled = !busy, onClick = {
        busy = true
        App.scope.launch {
          runCatching { Api.albumCompleteness(albumId) }
            .onSuccess { checked = it; App.say(if (it.missing.isEmpty()) tr("Альбом целый: все {} на месте", tracksWord(it.total)) else tr("Не хватает: {}", tracksWord(it.missing.size))) }
            .onFailure { App.say(space.avthsr.music.api.friendlyError(it)) }
          busy = false
        }
      }) { Ico(Res.drawable.ic_check, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(tr("Проверить целостность")) }
    }
    return
  }
  Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp).fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(cs.errorContainer).padding(16.dp)) {
    Text(tr("На сервере {} из {} треков", c.have, c.total), style = MaterialTheme.typography.titleMedium, color = cs.onErrorContainer)
    Text(
      tr("Не хватает: {}", c.missing.take(6).joinToString(", ") { it.title } + if (c.missing.size > 6) "…" else ""),
      style = MaterialTheme.typography.bodySmall, color = cs.onErrorContainer.copy(alpha = 0.85f), maxLines = 3,
    )
    Spacer(Modifier.height(10.dp))
    c.deezerId?.let { did ->
      Button(onClick = { acquire("album", did, tr("Недостающие треки")) { ok -> if (ok) onFetched() } }, shapes = ButtonDefaults.shapes()) {
        Ico(Res.drawable.ic_download, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(tr("Докачать альбом"))
      }
    }
  }
}
