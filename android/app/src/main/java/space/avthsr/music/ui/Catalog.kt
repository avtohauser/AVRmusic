// The global catalogue (Deezer): find music that is not on the server yet and ask the server to fetch
// it — a track, an album or a whole discography. Also "Предложка", new music picked for the listener.
package space.avthsr.music.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import space.avthsr.music.App
import space.avthsr.music.R
import space.avthsr.music.api.Api
import space.avthsr.music.api.CatalogAlbum
import space.avthsr.music.api.CatalogTrack
import space.avthsr.music.player.PlayerConn

private const val ADDED_HINT = "появится в медиатеке через минуту-другую"

/** Asks the server to fetch something; [done] gets whether the request was accepted. */
fun acquire(kind: String, id: Long, what: String, done: (Boolean) -> Unit = {}) {
  App.scope.launch {
    runCatching { Api.acquire(kind, id) }
      .onSuccess { r -> App.say("$what добавляется на сервер — $ADDED_HINT" + if (r.duplicate) " (уже в очереди)" else ""); done(true) }
      .onFailure { App.say(it.message ?: "Не получилось"); done(false) }
  }
}

/** A catalogue track: plays when it is on the server already, otherwise can be added. */
@Composable
fun CatalogTrackRow(t: CatalogTrack, index: Int? = null, cover: String? = t.album?.coverUrl, reason: Boolean = false) {
  val have = t.libraryTrackId
  var state by remember(t.id) { mutableIntStateOf(0) } // 0 idle, 1 sending, 2 sent
  Row(
    Modifier.fillMaxWidth()
      .clickable(enabled = have != null) { if (have != null) App.scope.launch { runCatching { PlayerConn.playId(have) }.onFailure { App.say(it.message ?: "Не получилось") } } }
      .padding(start = 16.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    if (index != null) Text("$index", Modifier.width(30.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    else {
      Cover(cover, Modifier.size(50.dp), RoundedCornerShape(12.dp))
      Spacer(Modifier.width(14.dp))
    }
    Column(Modifier.weight(1f)) {
      Text(t.title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
      Text(
        if (reason && t.reason != null) "${t.artists} · ${t.reason}" else t.artists,
        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis,
      )
    }
    when {
      have != null -> Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) { Ico(R.drawable.ic_play, "На сервере", tint = MaterialTheme.colorScheme.primary) }
      state == 1 -> Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) { CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) }
      state == 2 -> Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) { Ico(R.drawable.ic_check, "Добавляется", tint = MaterialTheme.colorScheme.primary) }
      else -> IconButton(onClick = { state = 1; acquire("track", t.id, "Трек") { ok -> state = if (ok) 2 else 0 } }) {
        Ico(R.drawable.ic_download, "Добавить на сервер")
      }
    }
  }
}

@Composable
fun CatalogAlbumCard(a: CatalogAlbum, subtitle: String = listOfNotNull(a.artist.name, a.year?.toString()).joinToString(" · ")) {
  val nav = LocalNav.current
  MediaCard(a.title, subtitle, a.coverUrl, { if (a.libraryAlbumId != null && a.inLibrary >= a.trackCount) nav.album(a.libraryAlbumId) else nav.catalogAlbum(a.id) })
}

@Composable
fun CatalogAlbumScreen(id: Long) {
  val nav = LocalNav.current
  val loader = rememberLoad(id) { Api.catalogAlbum(id) }
  Page { Loaded(loader) { a ->
    var sent by remember(a.id) { mutableStateOf(false) }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
      item {
        Header(
          cover = a.coverUrl,
          title = a.title,
          subtitle = a.artist.name,
          onSubtitle = { nav.catalogArtist(a.artist.id) },
          meta = listOfNotNull(albumType(a.type), a.year?.toString(), tracksWord(a.trackCount), a.label).joinToString(" · "),
        ) {
          if (a.libraryAlbumId != null) FilledTonalButton(onClick = { nav.album(a.libraryAlbumId) }) { Text("В медиатеке") }
          if (a.inLibrary < a.trackCount) {
            Button(enabled = !sent, onClick = { sent = true; acquire("album", a.id, "Альбом") { ok -> sent = ok } }) {
              Ico(R.drawable.ic_download, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp))
              Text(if (sent) "Добавляется…" else if (a.inLibrary > 0) "Добавить остальное" else "Добавить на сервер")
            }
          }
        }
      }
      itemsIndexed(a.tracks) { i, t -> CatalogTrackRow(t, index = t.trackNo ?: (i + 1)) }
    }
  }
  }
}

@Composable
fun CatalogArtistScreen(id: Long) {
  val nav = LocalNav.current
  val loader = rememberLoad(id) { Api.catalogArtist(id) }
  var confirm by remember { mutableStateOf(false) }
  Page { Loaded(loader) { p ->
    val a = p.artist
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
      item {
        Header(cover = a.imageUrl, title = a.name, meta = if (a.fans > 0) "${a.fans} поклонников в Deezer" else "", circle = true) {
          if (a.libraryArtistId != null) FilledTonalButton(onClick = { nav.artist(a.libraryArtistId) }) { Text("В медиатеке") }
          Button(onClick = { confirm = true }) { Text("Вся дискография") }
        }
      }
      if (p.topTracks.isNotEmpty()) {
        item { SectionTitle("Популярные треки") }
        items(p.topTracks.take(10)) { CatalogTrackRow(it) }
      }
      if (p.albums.isNotEmpty()) item { SectionTitle("Альбомы"); CardRow(p.albums) { CatalogAlbumCard(it, it.year?.toString() ?: "") } }
      if (p.singles.isNotEmpty()) item { SectionTitle("Синглы и EP"); CardRow(p.singles) { CatalogAlbumCard(it, it.year?.toString() ?: "") } }
      if (p.related.isNotEmpty()) item {
        SectionTitle("Похожие")
        CardRow(p.related) { r -> MediaCard(r.name, "", r.imageUrl, { nav.catalogArtist(r.id) }, circle = true, width = 124.dp) }
      }
    }
    if (confirm) AlertDialog(
      onDismissRequest = { confirm = false },
      title = { Text("Добавить дискографию?") },
      text = { Text("Сервер скачает все альбомы и синглы ${a.name}. Это может занять время.") },
      confirmButton = { TextButton(onClick = { confirm = false; acquire("artist", a.id, "Дискография") }) { Text("Добавить") } },
      dismissButton = { TextButton(onClick = { confirm = false }) { Text("Отмена") } },
    )
  }
  }
}

/** "Предложка": new releases of the listener's artists and tracks of artists like them. */
@Composable
fun DiscoverScreen() {
  var fresh by remember { mutableIntStateOf(0) }
  val loader = rememberLoad(fresh) { Api.suggestions(fresh > 0) }
  Page { Column(Modifier.fillMaxSize()) {
    Row(Modifier.fillMaxWidth().padding(start = 56.dp, end = 8.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
      Text("Предложка", style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f))
      IconButton(onClick = { fresh++ }) { Ico(R.drawable.ic_refresh, "Обновить") }
    }
    Box(Modifier.weight(1f)) {
      Loaded(loader) { s ->
        if (s.releases.isEmpty() && s.tracks.isEmpty()) {
          Text(
            "Послушайте и лайкните побольше треков — тогда здесь появятся новинки для вас.",
            Modifier.fillMaxWidth().padding(32.dp), textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant,
          )
        } else LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
          if (s.releases.isNotEmpty()) item {
            SectionTitle("Новые релизы", "Свежее от исполнителей, которых вы слушаете")
            CardRow(s.releases) { a -> CatalogAlbumCard(a, a.reason ?: a.artist.name) }
          }
          if (s.tracks.isNotEmpty()) {
            item { SectionTitle("Может понравиться", "Нажмите ⤓, чтобы добавить трек на сервер") }
            items(s.tracks) { CatalogTrackRow(it, reason = true) }
          }
        }
      }
    }
  }
  }
}

/** Big centred cover with the title under it, on a blurred copy of the cover. */
@Composable
fun Header(
  cover: String?,
  title: String,
  subtitle: String? = null,
  onSubtitle: (() -> Unit)? = null,
  meta: String = "",
  circle: Boolean = false,
  actions: @Composable () -> Unit = {},
) {
  val cs = MaterialTheme.colorScheme
  Box(Modifier.fillMaxWidth()) {
    Backdrop(cover)
    Column(Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 56.dp, bottom = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
      Cover(cover, Modifier.size(224.dp), if (circle) CircleShape else RoundedCornerShape(28.dp), if (circle) R.drawable.ic_person else R.drawable.ic_album)
      Spacer(Modifier.height(18.dp))
      Text(title, style = MaterialTheme.typography.headlineMedium, textAlign = TextAlign.Center)
      if (subtitle != null) {
        Text(
          subtitle, style = MaterialTheme.typography.titleMedium, color = cs.primary, textAlign = TextAlign.Center,
          modifier = Modifier.clip(RoundedCornerShape(8.dp)).clickable(enabled = onSubtitle != null) { onSubtitle?.invoke() }.padding(4.dp),
        )
      }
      if (meta.isNotEmpty()) Text(meta, style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant, textAlign = TextAlign.Center)
      Spacer(Modifier.height(14.dp))
      Row(horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically) { actions() }
    }
  }
}

@Composable
fun Backdrop(cover: String?) {
  val bg = MaterialTheme.colorScheme.background
  Box(Modifier.fillMaxWidth().height(300.dp)) {
    if (Api.img(cover) != null) {
      coil.compose.AsyncImage(
        model = Api.img(cover), contentDescription = null,
        modifier = Modifier.fillMaxSize().blur(60.dp),
        contentScale = androidx.compose.ui.layout.ContentScale.Crop, alpha = 0.45f,
      )
    }
    Box(Modifier.fillMaxSize().background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(bg.copy(alpha = 0.2f), bg))))
  }
}
