@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package space.avthsr.music.ui

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
import space.avthsr.music.R
import space.avthsr.music.api.Api
import space.avthsr.music.api.Likes
import space.avthsr.music.api.Track
import space.avthsr.music.player.Offline
import space.avthsr.music.player.PlayerConn

/** Play / shuffle buttons for a list of tracks. */
@Composable
fun PlayButtons(tracks: List<Track>, context: String) {
  Button(shapes = ButtonDefaults.shapes(), onClick = { PlayerConn.play(tracks, 0, context) }, enabled = tracks.isNotEmpty()) {
    Ico(R.drawable.ic_play, null, Modifier.size(20.dp)); Spacer(Modifier.width(6.dp)); Text("Слушать")
  }
  FilledTonalButton(shapes = ButtonDefaults.shapes(), onClick = { PlayerConn.play(tracks, 0, context, shuffle = true) }, enabled = tracks.isNotEmpty()) {
    Ico(R.drawable.ic_shuffle, null, Modifier.size(20.dp)); Spacer(Modifier.width(6.dp)); Text("Вперемешку")
  }
}

@Composable
private fun ListRow(cover: String?, title: String, subtitle: String, circle: Boolean = false, onClick: () -> Unit) {
  Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
    Cover(cover, Modifier.size(56.dp), if (circle) ArtistShape else RoundedCornerShape(14.dp), if (circle) R.drawable.ic_person else R.drawable.ic_album)
    Spacer(Modifier.width(14.dp))
    Column(Modifier.weight(1f)) {
      Text(title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
      if (subtitle.isNotEmpty()) Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
  }
}

@Composable
fun LibraryScreen() {
  val nav = LocalNav.current
  var tab by rememberSaveable { mutableIntStateOf(0) }
  var create by remember { mutableStateOf(false) }
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

  LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
    item {
      Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        FlowText("Медиатека", MaterialTheme.typography.headlineMedium, Modifier.weight(1f), maxLines = 1)
        IconButton(onClick = { create = true }) { Ico(R.drawable.ic_add, "Новый плейлист") }
        IconButton(onClick = { nav.profile() }) { Ico(R.drawable.ic_person, "Профиль") }
      }
    }
    item {
      Row(
        Modifier.padding(16.dp).fillMaxWidth().height(96.dp).clip(RoundedCornerShape(28.dp))
          .background(Brush.linearGradient(listOf(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.tertiary)))
          .clickable { nav.liked() }.padding(20.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Ico(R.drawable.ic_heart_filled, null, Modifier.size(36.dp), MaterialTheme.colorScheme.onPrimary)
        Spacer(Modifier.width(16.dp))
        Column {
          Text("Любимые треки", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onPrimary)
          Text(tracksWord(liked.size), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.8f))
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
        Ico(R.drawable.ic_offline, null, Modifier.size(28.dp), MaterialTheme.colorScheme.primary)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
          Text("Скачанные", style = MaterialTheme.typography.titleMedium)
          Text("${tracksWord(saved.size)} · играют без интернета", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
      }
    }
    item {
      Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf("Плейлисты", "Альбомы", "Исполнители", "Сообщество").forEachIndexed { i, label ->
          FilterChip(selected = tab == i, onClick = { tab = i }, label = { Text(label) })
        }
      }
    }
    if (tab == 1 || tab == 2) item {
      Row(Modifier.horizontalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf("Любимые", "Все на сервере").forEachIndexed { i, l -> FilterChip(selected = scope == i, onClick = { scope = i }, label = { Text(l) }) }
        if (scope == 1) {
          val sorts = if (tab == 1) listOf("recent" to "Новые", "popular" to "Популярные", "title" to "По названию", "year" to "По году")
          else listOf("popular" to "Популярные", "name" to "По имени", "new" to "Новые")
          sorts.forEach { (id, l) ->
            val on = if (tab == 1) albumSort == id else artistSort == id
            FilterChip(selected = on, onClick = { if (tab == 1) albumSort = id else artistSort = id }, label = { Text(l) }, leadingIcon = { if (on) Ico(R.drawable.ic_sort, null, Modifier.size(16.dp)) })
          }
        }
      }
    }
    when (tab) {
      0 -> {
        val list = playlists.data.orEmpty()
        if (list.isEmpty()) item { Hint(if (playlists.state is Load.Loading) "Загрузка…" else "Плейлистов пока нет — создайте первый кнопкой +") }
        items(list) { p -> ListRow(p.coverUrl ?: p.mosaic.firstOrNull(), p.title, listOfNotNull(p.owner?.displayName, tracksWord(p.trackCount)).joinToString(" · ")) { nav.playlist(p.id) } }
      }
      1 -> {
        val list = (if (scope == 0) albums.data else allAlbums.data).orEmpty()
        if (list.isEmpty()) item { Hint(if (scope == 0) "Лайкните альбом — он появится здесь" else "Загрузка…") }
        items(list) { a -> ListRow(a.coverUrl, a.title, listOfNotNull(a.artist.name, a.year?.toString()).joinToString(" · ")) { nav.album(a.id) } }
      }
      2 -> {
        val list = (if (scope == 0) artists.data else allArtists.data).orEmpty()
        if (list.isEmpty()) item { Hint(if (scope == 0) "Лайкните исполнителя — он появится здесь" else "Загрузка…") }
        items(list) { a -> ListRow(a.imageUrl, a.name, "", circle = true) { nav.artist(a.id) } }
      }
      else -> {
        val list = community.data.orEmpty()
        if (list.isEmpty()) item { Hint(if (community.state is Load.Loading) "Загрузка…" else "Публичных плейлистов пока нет") }
        items(list) { p -> ListRow(p.coverUrl ?: p.mosaic.firstOrNull(), p.title, listOfNotNull(p.owner?.displayName, tracksWord(p.trackCount)).joinToString(" · ")) { nav.playlist(p.id) } }
      }
    }
  }

  if (create) {
    var title by remember { mutableStateOf("") }
    AlertDialog(
      onDismissRequest = { create = false },
      title = { Text("Новый плейлист") },
      text = { OutlinedTextField(title, { title = it }, label = { Text("Название") }, singleLine = true) },
      confirmButton = {
        TextButton(enabled = title.isNotBlank(), onClick = {
          val name = title
          create = false
          App.scope.launch {
            runCatching { Api.createPlaylist(name) }.onSuccess { playlists.reload(); nav.playlist(it.id) }.onFailure { App.say(it.message ?: "Не получилось") }
          }
        }) { Text("Создать") }
      },
      dismissButton = { TextButton(onClick = { create = false }) { Text("Отмена") } },
    )
  }
}

@Composable
private fun Hint(text: String) {
  Text(text, Modifier.fillMaxWidth().padding(24.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
}

@Composable
fun LikedScreen() {
  val liked by Likes.tracks.collectAsStateWithLifecycle()
  val loader = rememberLoad(liked.size) { Api.likedTracks() }
  Page {
    Loaded(loader) { tracks ->
      LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
        item {
          Column(Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 64.dp, bottom = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Box(
              Modifier.size(180.dp).clip(RoundedCornerShape(36.dp))
                .background(Brush.linearGradient(listOf(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.tertiary))),
              contentAlignment = Alignment.Center,
            ) { Ico(R.drawable.ic_heart_filled, null, Modifier.size(72.dp), MaterialTheme.colorScheme.onPrimary) }
            Spacer(Modifier.height(16.dp))
            FlowText("Любимые треки", MaterialTheme.typography.headlineMedium, maxLines = 1)
            Text(tracksWord(tracks.size), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) { PlayButtons(tracks, "liked"); OfflineButton(tracks) }
          }
        }
        itemsIndexed(tracks) { i, t -> TrackRow(t, onClick = { PlayerConn.play(tracks, i, "liked") }) }
      }
    }
  }
}

@Composable
fun AlbumScreen(id: String) {
  val context = androidx.compose.ui.platform.LocalContext.current
  val nav = LocalNav.current
  val loader = rememberLoad(id) { Api.album(id) }
  Page {
    Loaded(loader) { a ->
      LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
        item {
          Header(
            cover = a.coverUrl, title = a.title, subtitle = a.artist.name, onSubtitle = { nav.artist(a.artist.id) },
            meta = listOfNotNull(albumType(a.type), a.year?.toString(), tracksWord(a.tracks.size), fmtTime(a.tracks.sumOf { it.durationMs })).joinToString(" · "),
          ) {
            PlayButtons(a.tracks, "album:${a.id}")
          }
          Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            LikeButton("album", a.id)
            OfflineButton(a.tracks)
            IconButton(onClick = { downloadToDevice(context, "/api/download/album/${a.id}", "${a.artist.name} - ${a.title}.zip") }) { Ico(R.drawable.ic_folder, "Скачать на устройство (ZIP)") }
            IconButton(onClick = { share(context, "/album/${a.id}", "${a.artist.name} — ${a.title}") }) { Ico(R.drawable.ic_share, "Поделиться") }
            if (Api.user?.isAdmin == true) AlbumAdminMenu(a) { loader.reload() }
          }
        }
        itemsIndexed(a.tracks) { i, t ->
          TrackRow(
            t, onClick = { PlayerConn.play(a.tracks, i, "album:${a.id}") }, index = t.trackNo ?: (i + 1), showCover = false,
            subtitle = if (t.featuring.isEmpty() && t.artist.id == a.artist.id) fmtTime(t.durationMs) else t.artists,
          )
        }
        if (a.label != null) item { Text("℗ ${a.label}", Modifier.padding(20.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
      }
    }
  }
}

@Composable
fun ArtistScreen(id: String) {
  val context = androidx.compose.ui.platform.LocalContext.current
  val nav = LocalNav.current
  val loader = rememberLoad(id) { Api.artist(id) }
  Page {
    Loaded(loader) { a ->
      LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
        item {
          Header(
            cover = a.imageUrl ?: a.headerUrl, title = a.name, circle = true,
            meta = if (a.monthlyListeners > 0) "${a.monthlyListeners} слушателей за месяц" else "",
          ) {
            PlayButtons(a.topTracks, "artist:${a.id}")
          }
          Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            LikeButton("artist", a.id)
            IconButton(onClick = { share(context, "/artist/${a.id}", a.name) }) { Ico(R.drawable.ic_share, "Поделиться") }
            if (Api.user?.isAdmin == true) ArtistAdminMenu(a) { loader.reload() }
          }
        }
        if (a.topTracks.isNotEmpty()) {
          item { SectionTitle("Популярные треки") }
          itemsIndexed(a.topTracks.take(10)) { i, t -> TrackRow(t, onClick = { PlayerConn.play(a.topTracks, i, "artist:${a.id}") }) }
        }
        if (a.albums.isNotEmpty()) item {
          SectionTitle("Альбомы и синглы")
          CardRow(a.albums) { al -> MediaCard(al.title, listOfNotNull(albumType(al.type), al.year?.toString()).joinToString(" · "), al.coverUrl, { nav.album(al.id) }) }
        }
        if (a.appearsOn.isNotEmpty()) item {
          SectionTitle("Участвует")
          CardRow(a.appearsOn) { al -> MediaCard(al.title, al.artist.name, al.coverUrl, { nav.album(al.id) }) }
        }
        if (a.related.isNotEmpty()) item {
          SectionTitle("Похожие исполнители")
          CardRow(a.related) { r -> MediaCard(r.name, "", r.imageUrl, { nav.artist(r.id) }, circle = true, width = 124.dp) }
        }
        if (!a.bio.isNullOrBlank()) item {
          SectionTitle("Об исполнителе")
          Text(a.bio, Modifier.padding(horizontal = 20.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
      }
    }
  }
}

@Composable
fun PlaylistScreen(id: String) {
  val context = androidx.compose.ui.platform.LocalContext.current
  val loader = rememberLoad(id) { Api.playlist(id) }
  Page {
    Loaded(loader) { p ->
      val own = p.isOwner == true || p.owner?.id == Api.user?.id
      LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
        item {
          Header(
            cover = p.coverUrl ?: p.mosaic.firstOrNull(), title = p.title, subtitle = p.owner?.displayName,
            meta = listOfNotNull(p.description?.takeIf { it.isNotBlank() }, tracksWord(p.tracks.size)).joinToString(" · "),
          ) {
            PlayButtons(p.tracks, "playlist:${p.id}")
          }
          Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            if (!own) LikeButton("playlist", p.id) else PlaylistOwnerMenu(p) { loader.reload() }
            OfflineButton(p.tracks)
            IconButton(onClick = { downloadToDevice(context, "/api/download/playlist/${p.id}", "${p.title}.zip") }) { Ico(R.drawable.ic_folder, "Скачать на устройство (ZIP)") }
            IconButton(onClick = { share(context, "/playlist/${p.id}", p.title) }) { Ico(R.drawable.ic_share, "Поделиться") }
          }
        }
        if (p.tracks.isEmpty()) item { Hint("Плейлист пуст. Добавляйте треки через меню ⋮ у любого трека.") }
        itemsIndexed(p.tracks) { i, t ->
          TrackRow(t, onClick = { PlayerConn.play(p.tracks, i, "playlist:${p.id}") }, menuExtra = { close ->
            if (own) DropdownMenuItem(text = { Text("Убрать из плейлиста") }, leadingIcon = { Ico(R.drawable.ic_close) }, onClick = {
              close()
              App.scope.launch { runCatching { Api.removeFromPlaylist(p.id, t.id) }.onSuccess { loader.reload() }.onFailure { App.say(it.message ?: "Не получилось") } }
            })
          })
        }
      }
    }
  }
}

@Composable
fun GenreScreen(slug: String) {
  val nav = LocalNav.current
  val loader = rememberLoad(slug) { Api.genre(slug) }
  Page {
    Loaded(loader) { g ->
      val color = parseColor(g.genre.color, MaterialTheme.colorScheme.primaryContainer)
      LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
        item {
          Column(
            Modifier.fillMaxWidth().background(Brush.verticalGradient(listOf(color, Color.Transparent))).padding(start = 20.dp, end = 20.dp, top = 72.dp, bottom = 16.dp),
          ) {
            Text(g.genre.name, style = MaterialTheme.typography.displaySmall)
            Text(tracksWord(g.genre.trackCount), color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { PlayButtons(g.tracks, "genre:${g.genre.slug}") }
          }
        }
        if (g.artists.isNotEmpty()) item {
          SectionTitle("Исполнители")
          CardRow(g.artists) { a -> MediaCard(a.name, "", a.imageUrl, { nav.artist(a.id) }, circle = true, width = 124.dp) }
        }
        if (g.albums.isNotEmpty()) item {
          SectionTitle("Альбомы")
          CardRow(g.albums) { a -> MediaCard(a.title, a.artist.name, a.coverUrl, { nav.album(a.id) }) }
        }
        if (g.tracks.isNotEmpty()) {
          item { SectionTitle("Треки") }
          itemsIndexed(g.tracks) { i, t -> TrackRow(t, onClick = { PlayerConn.play(g.tracks, i, "genre:${g.genre.slug}") }) }
        }
      }
    }
  }
}
