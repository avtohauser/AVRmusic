@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

// The global catalogue (Deezer): find music that is not on the server yet and ask the server to fetch
// it — a track, an album or a whole discography.
package space.avthsr.music.ui

import space.avthsr.music.tr
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.ButtonDefaults
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import space.avthsr.music.App
import space.avthsr.music.res.*
import space.avthsr.music.api.Api
import space.avthsr.music.api.CatalogAlbum
import space.avthsr.music.api.CatalogTrack
import space.avthsr.music.player.PlayerConn
import space.avthsr.music.player.Instant
import space.avthsr.music.api.follow
import androidx.compose.runtime.produceState
import androidx.lifecycle.compose.collectAsStateWithLifecycle

private val ADDED_HINT get() = tr("появится в медиатеке через минуту-другую")

/** Asks the server to fetch something; [done] gets whether the request was accepted. */
fun acquire(kind: String, id: Long, what: String, done: (Boolean) -> Unit = {}) {
  App.scope.launch {
    runCatching { Api.acquire(kind, id) }
      .onSuccess { r -> App.say(tr("{} добавляется на сервер — {}", what, ADDED_HINT) + if (r.duplicate) tr(" (уже в очереди)") else ""); done(true) }
      .onFailure { App.say(it.message ?: tr("Не получилось")); done(false) }
  }
}

/**
 * A catalogue track: a tap plays it in full at once (from the server when it is there, otherwise straight
 * from its source while the server fetches it); [onPlay] plays the whole list it is in instead.
 */
@Composable
fun CatalogTrackRow(t: CatalogTrack, index: Int? = null, cover: String? = t.album?.coverUrl, reason: Boolean = false, onPlay: (() -> Unit)? = null) {
  val have = t.libraryTrackId
  val canAcquire by produceState(false) { value = Api.canAcquire() }
  val currentId by PlayerConn.currentId.collectAsStateWithLifecycle()
  val current = currentId == (have ?: "dz:${t.id}")
  var state by remember(t.id) { mutableIntStateOf(0) } // 0 idle, 1 sending, 2 sent
  Row(
    Modifier.fillMaxWidth()
      .clickable { (onPlay ?: { Instant.playOne(t) })() }
      .padding(start = 16.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    if (index != null) Text("$index", Modifier.width(30.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    else {
      Cover(cover, Modifier.size(50.dp), RoundedCornerShape(12.dp))
      Spacer(Modifier.width(14.dp))
    }
    Column(Modifier.weight(1f)) {
      Text(t.title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis, color = if (current) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
      Text(
        if (reason && t.reason != null) "${t.artists} · ${t.reason}" else t.artists,
        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis,
      )
    }
    // the full song, at once
    IconButton(onClick = { (onPlay ?: { Instant.playOne(t) })() }) {
      Ico(Res.drawable.ic_play, tr("Слушать"), tint = if (have != null || current) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
    }
    when {
      have != null || !canAcquire -> {}
      state == 1 -> Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) { LoadingMark(Modifier.size(30.dp)) }
      state == 2 -> Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) { Ico(Res.drawable.ic_check, tr("Добавляется"), tint = MaterialTheme.colorScheme.primary) }
      else -> IconButton(onClick = { state = 1; acquire("track", t.id, tr("Трек")) { ok -> state = if (ok) 2 else 0 } }) {
        Ico(Res.drawable.ic_download, tr("Добавить на сервер"))
      }
    }
  }
}

@Composable
fun CatalogAlbumCard(a: CatalogAlbum, subtitle: String = listOfNotNull(a.artist.name, a.year?.toString()).joinToString(" · ")) {
  val nav = LocalNav.current
  val inLibrary = a.libraryAlbumId != null && a.inLibrary >= a.trackCount
  MediaCard(
    a.title, subtitle, a.coverUrl,
    { if (inLibrary && a.libraryAlbumId != null) nav.album(a.libraryAlbumId) else nav.catalogAlbum(a.id) },
    share = if (inLibrary) "album:${a.libraryAlbumId}" else "calbum:${a.id}",
  )
}

@Composable
fun CatalogAlbumScreen(id: Long) {
  val nav = LocalNav.current
  val loader = rememberLoad(id) { Api.catalogAlbum(id) }
  val canAcquire by produceState(false) { value = Api.canAcquire() }
  Page { Loaded(loader) { a ->
    var sent by remember(a.id) { mutableStateOf(false) }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = screenPadding(bottom = 24.dp, hero = true)) {
      item {
        Header(
          share = "calbum:$id",
          cover = a.coverUrl,
          title = a.title,
          subtitle = a.artist.name,
          onSubtitle = { nav.catalogArtist(a.artist.id) },
          meta = listOfNotNull(albumType(a.type), a.year?.toString(), tracksWord(a.trackCount), a.label).joinToString(" · "),
        ) {
          Button(shapes = ButtonDefaults.shapes(), enabled = a.tracks.isNotEmpty(), onClick = { Instant.play(a.tracks, 0, "calbum:${a.id}") }) {
            Ico(Res.drawable.ic_play, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text(tr("Слушать"))
          }
          if (a.libraryAlbumId != null) FilledTonalButton(shapes = ButtonDefaults.shapes(), onClick = { nav.album(a.libraryAlbumId) }) { Text(tr("В медиатеке")) }
          if (a.inLibrary < a.trackCount && canAcquire) {
            FilledTonalButton(shapes = ButtonDefaults.shapes(), enabled = !sent, onClick = { sent = true; acquire("album", a.id, tr("Альбом")) { ok -> sent = ok } }) {
              Ico(Res.drawable.ic_download, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp))
              Text(if (sent) tr("Добавляется…") else if (a.inLibrary > 0) tr("Добавить остальное") else tr("Добавить на сервер"))
            }
          }
        }
      }
      itemsIndexed(a.tracks) { i, t -> CatalogTrackRow(t, index = t.trackNo ?: (i + 1), onPlay = { Instant.play(a.tracks, i, "calbum:${a.id}") }) }
    }
  }
  }
}

@Composable
fun CatalogArtistScreen(id: Long) {
  val nav = LocalNav.current
  val loader = rememberLoad(id) { Api.catalogArtist(id) }
  val canAcquire by produceState(false) { value = Api.canAcquire() }
  var confirm by remember { mutableStateOf(false) }
  Page { Loaded(loader) { p ->
    val a = p.artist
    var following by remember(p) { mutableStateOf(p.following) }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = screenPadding(bottom = 24.dp, hero = true)) {
      item {
        Header(share = "cartist:$id", cover = a.imageUrl, title = a.name, meta = if (a.fans > 0) tr("{} поклонников в Deezer", a.fans) else "", circle = true) {
          if (p.topTracks.isNotEmpty()) Button(shapes = ButtonDefaults.shapes(), onClick = { Instant.play(p.topTracks, 0, "cartist:$id") }) {
            Ico(Res.drawable.ic_play, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text(tr("Слушать"))
          }
          // new releases come into the inbox (and the library) by themselves
          FilledTonalButton(shapes = ButtonDefaults.shapes(), onClick = {
            val on = !following
            following = on
            act(if (on) tr("Новинки {} будут приходить вам", a.name) else tr("Вы больше не следите за {}", a.name)) { Api.follow(a.id, a.name, on) }
          }) { Ico(if (following) Res.drawable.ic_check else Res.drawable.ic_campaign, null, Modifier.size(18.dp)); Spacer(Modifier.width(8.dp)); Text(if (following) tr("Вы следите") else tr("Следить")) }
          if (a.libraryArtistId != null) FilledTonalButton(shapes = ButtonDefaults.shapes(), onClick = { nav.artist(a.libraryArtistId) }) { Text(tr("В медиатеке")) }
          if (canAcquire) FilledTonalButton(shapes = ButtonDefaults.shapes(), onClick = { confirm = true }) { Text(tr("Вся дискография")) }
        }
      }
      if (p.topTracks.isNotEmpty()) {
        item { SectionTitle(tr("Популярные треки")) }
        itemsIndexed(p.topTracks.take(10)) { i, t -> CatalogTrackRow(t, onPlay = { Instant.play(p.topTracks, i, "cartist:$id") }) }
      }
      if (p.albums.isNotEmpty()) item { SectionTitle(tr("Альбомы")); CardRow(p.albums) { CatalogAlbumCard(it, it.year?.toString() ?: "") } }
      if (p.singles.isNotEmpty()) item { SectionTitle(tr("Синглы и EP")); CardRow(p.singles) { CatalogAlbumCard(it, it.year?.toString() ?: "") } }
      if (p.related.isNotEmpty()) item {
        SectionTitle(tr("Похожие"))
        CardRow(p.related) { r -> MediaCard(r.name, "", r.imageUrl, { nav.catalogArtist(r.id) }, share = "cartist:${r.id}", circle = true, width = 124.dp) }
      }
    }
    if (confirm) AlertDialog(
      onDismissRequest = { confirm = false },
      title = { Text(tr("Добавить дискографию?")) },
      text = { Text(tr("Сервер скачает все альбомы и синглы {}. Это может занять время.", a.name)) },
      confirmButton = { TextButton(onClick = { confirm = false; acquire("artist", a.id, tr("Дискография")) }) { Text(tr("Добавить")) } },
      dismissButton = { TextButton(onClick = { confirm = false }) { Text(tr("Отмена")) } },
    )
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
  share: String? = null,
  actions: @Composable () -> Unit = {},
) {
  val cs = MaterialTheme.colorScheme
  Box(Modifier.fillMaxWidth()) {
    Backdrop(cover)
    Column(Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 56.dp + LocalEdges.current.top, bottom = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
      Cover(cover, Modifier.size(224.dp).sharedCover(share), if (circle) ArtistShape else RoundedCornerShape(28.dp), if (circle) Res.drawable.ic_person else Res.drawable.ic_album)
      Spacer(Modifier.height(18.dp))
      FlowText(title, MaterialTheme.typography.headlineMedium, textAlign = TextAlign.Center, maxLines = 3)
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
  Box(Modifier.fillMaxWidth().height(300.dp + LocalEdges.current.top)) {
    BlurredCover(cover, Modifier.fillMaxSize(), alpha = 0.5f)
    Box(Modifier.fillMaxSize().background(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(bg.copy(alpha = 0.2f), bg))))
  }
}
