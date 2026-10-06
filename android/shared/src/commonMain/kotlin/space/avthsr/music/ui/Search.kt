@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package space.avthsr.music.ui

import androidx.compose.foundation.combinedClickable
import space.avthsr.music.tr
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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AssistChip
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.FilterChip
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import space.avthsr.music.res.*
import space.avthsr.music.api.AlbumSummary
import space.avthsr.music.api.Api
import space.avthsr.music.api.ArtistSummary
import space.avthsr.music.api.PlaylistSummary
import space.avthsr.music.api.Track
import space.avthsr.music.player.PlayerConn
import space.avthsr.music.player.Instant
import androidx.compose.foundation.lazy.itemsIndexed

private val types get() = listOf("all" to tr("Всё"), "track" to tr("Треки"), "album" to tr("Альбомы"), "artist" to tr("Исполнители"), "playlist" to tr("Плейлисты"), "lyrics" to tr("По тексту"))

/** Recent searches, kept on the phone. */
private object Recent {
  private const val KEY = "search.recent"
  fun list(): List<String> = runCatching { Api.prefs.getString(KEY, "")!!.split('\n').filter { it.isNotBlank() } }.getOrDefault(emptyList())
  fun add(q: String) {
    val v = q.trim()
    if (v.length < 2) return
    val next = (listOf(v) + list().filter { !it.equals(v, ignoreCase = true) }).take(10)
    Api.prefs.edit().putString(KEY, next.joinToString("\n")).apply()
  }
  fun clear() { Api.prefs.edit().remove(KEY).apply() }
}

@Composable
fun SearchScreen() {
  val nav = LocalNav.current
  val focus = LocalFocusManager.current
  var q by rememberSaveable { mutableStateOf("") }
  var type by rememberSaveable { mutableStateOf("all") }
  var query by remember { mutableStateOf(q.trim()) }
  var recent by remember { mutableStateOf(Recent.list()) }
  LaunchedEffect(q) { delay(350); query = q.trim() }
  val canAcquire by produceState(false) { value = Api.canAcquire() }
  // the catalogue plays for everyone (in full, at once); fetching to the server needs the right
  val catalogOn by produceState(false) { value = runCatching { Api.info().catalog }.getOrDefault(false) }
  val genres = rememberLoad(Unit) { Api.genres() }
  val local = rememberLoad(query, type) { if (query.isEmpty()) null else Api.search(query, type) }
  val remote = rememberLoad(query, catalogOn) { if (query.length < 2 || !catalogOn) null else Api.catalogSearch(query) }
  fun keep(text: String = query) { Recent.add(text); recent = Recent.list() }
  val voice = rememberVoiceInput { text -> q = text; query = text; keep(text) }

  Column(Modifier.fillMaxSize()) {
    TextField(
      value = q,
      onValueChange = { q = it },
      modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 16.dp + LocalEdges.current.top, bottom = 8.dp),
      placeholder = { Text(tr("Что хотите послушать?")) },
      leadingIcon = { Ico(Res.drawable.ic_search) },
      trailingIcon = {
        if (q.isNotEmpty()) IconButton(onClick = { q = "" }) { Ico(Res.drawable.ic_close, tr("Очистить")) }
        else if (voice != null) IconButton(onClick = voice) { Ico(Res.drawable.ic_mic, tr("Сказать голосом")) }
      },
      singleLine = true,
      shape = RoundedCornerShape(28.dp),
      keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
      keyboardActions = KeyboardActions(onSearch = { query = q.trim(); keep(q); focus.clearFocus() }),
      colors = TextFieldDefaults.colors(focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent),
    )
    if (query.isNotEmpty()) {
      Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        types.forEach { (id, label) -> FilterChip(selected = type == id, onClick = { type = id }, label = { Text(label) }) }
      }
    }
    LazyColumn(Modifier.weight(1f).imePadding(), contentPadding = screenPadding(bottom = 24.dp, hero = true)) {
      if (query.isEmpty()) {
        if (recent.isNotEmpty()) {
          item {
            SectionTitle(tr("Недавние запросы")) { TextButton(onClick = { Recent.clear(); recent = emptyList() }) { Text(tr("Очистить")) } }
            Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
              recent.forEach { r -> AssistChip(onClick = { q = r; query = r }, label = { Text(r) }, leadingIcon = { Ico(Res.drawable.ic_history, null, Modifier.size(18.dp)) }) }
            }
          }
        }
        val g = genres.data.orEmpty()
        if (g.isNotEmpty()) {
          item { SectionTitle(tr("Обзор: жанры и настроения")) }
          items(g.chunked(2)) { row ->
            Row(Modifier.padding(horizontal = 16.dp, vertical = 5.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
              row.forEach { GenreTile(it, Modifier.weight(1f)) { nav.genre(it.slug) } }
              if (row.size == 1) Box(Modifier.weight(1f))
            }
          }
        }
        return@LazyColumn
      }
      when (val s = local.state) {
        is Load.Ok -> {
          val r = s.data
          if (r != null) {
            val empty = r.tracks.isEmpty() && r.albums.isEmpty() && r.artists.isEmpty() && r.playlists.isEmpty() && r.lyrics.isEmpty()
            if (empty) {
              item {
                Text(
                  if (catalogOn) tr("На сервере ничего не нашлось — посмотрите в каталоге ниже") else tr("Ничего не найдено. Попробуйте другой запрос"),
                  Modifier.fillMaxWidth().padding(24.dp), textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
              }
            }
            if (type == "all") r.top?.let { top -> item { TopResult(top) { keep() } } }
            if (r.tracks.isNotEmpty()) {
              item { SectionTitle(tr("Треки")) }
              items(if (type == "all") r.tracks.take(8) else r.tracks) { t ->
                TrackRow(t, onClick = { keep(); PlayerConn.play(r.tracks, r.tracks.indexOf(t), "search") })
              }
            }
            // a line of a song typed in: the songs that have it
            if (r.lyrics.isNotEmpty()) {
              item { SectionTitle(tr("По строчке из песни")) }
              items(r.lyrics) { h ->
                TrackRow(h.track, onClick = { keep(); PlayerConn.play(r.lyrics.map { it.track }, r.lyrics.indexOf(h), "search") }, subtitle = "«${h.line}» · ${h.track.artists}")
              }
            }
            if (r.artists.isNotEmpty()) {
              if (type == "all") item {
                SectionTitle(tr("Исполнители"))
                CardRow(r.artists) { a -> MediaCard(a.name, "", a.imageUrl, { keep(); nav.artist(a.id) }, share = "artist:${a.id}", circle = true, width = 124.dp) }
              } else items(r.artists) { a -> ResultRow(a.imageUrl, a.name, tr("Исполнитель"), circle = true, share = "artist:${a.id}") { keep(); nav.artist(a.id) } }
            }
            if (r.albums.isNotEmpty()) {
              if (type == "all") item {
                SectionTitle(tr("Альбомы"))
                CardRow(r.albums) { a -> MediaCard(a.title, a.artist.name, a.coverUrl, { keep(); nav.album(a.id) }, share = "album:${a.id}", menu = { e, c -> AlbumMenu(a.id, a.title, a.artist.id, a.artist.name, e, c) }) }
              } else items(r.albums) { a -> ResultRow(a.coverUrl, a.title, listOfNotNull(albumType(a.type), a.artist.name, a.year?.toString()).joinToString(" · "), menu = { e, c -> AlbumMenu(a.id, a.title, a.artist.id, a.artist.name, e, c) }, share = "album:${a.id}") { keep(); nav.album(a.id) } }
            }
            if (r.playlists.isNotEmpty()) {
              if (type == "all") item {
                SectionTitle(tr("Плейлисты"))
                CardRow(r.playlists) { p -> MediaCard(p.title, p.owner?.displayName ?: "", p.coverUrl ?: p.mosaic.firstOrNull(), { keep(); nav.playlist(p.id) }, share = "playlist:${p.id}", menu = { e, c -> PlaylistMenu(p, e, c) }) }
              } else items(r.playlists) { p -> ResultRow(p.coverUrl ?: p.mosaic.firstOrNull(), p.title, listOfNotNull(p.owner?.displayName, tracksWord(p.trackCount)).joinToString(" · "), menu = { e, c -> PlaylistMenu(p, e, c) }, share = "playlist:${p.id}") { keep(); nav.playlist(p.id) } }
            }
          }
        }
        is Load.Err -> item { Text(s.message, Modifier.padding(24.dp), color = MaterialTheme.colorScheme.error) }
        else -> item { Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { LoadingMark() } }
      }
      if (catalogOn && type == "all") {
        val c = remote.data
        if (c != null && (c.tracks.isNotEmpty() || c.albums.isNotEmpty() || c.artists.isNotEmpty())) {
          item { SectionTitle(tr("В каталоге"), tr("Нажмите — заиграет сразу целиком, а сервер сохранит трек себе")) }
          val top = c.tracks.take(8)
          itemsIndexed(top) { i, t -> CatalogTrackRow(t, onPlay = { keep(); Instant.play(top, i, "search") }) }
          if (c.albums.isNotEmpty()) item { CardRow(c.albums) { CatalogAlbumCard(it) } }
          if (c.artists.isNotEmpty()) item {
            CardRow(c.artists) { a -> MediaCard(a.name, "", a.imageUrl, { nav.catalogArtist(a.id) }, share = "cartist:${a.id}", circle = true, width = 124.dp) }
          }
        }
      }
    }
  }
}

@Composable
private fun ResultRow(
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
    Modifier.fillMaxWidth().combinedClickable(onClick = { if (share != null) SharedCover.tap(token, share); onClick() }, onLongClick = menu?.let { { open = true } })
      .padding(start = 16.dp, end = if (menu != null) 4.dp else 16.dp, top = 8.dp, bottom = 8.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Cover(cover, Modifier.size(56.dp).sharedCover(share, token), if (circle) ArtistShape else RoundedCornerShape(14.dp), if (circle) Res.drawable.ic_person else Res.drawable.ic_album)
    Spacer(Modifier.width(14.dp))
    Column(Modifier.weight(1f)) {
      Text(title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
      Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
    if (menu != null) Box {
      IconButton(onClick = { open = true }) { Ico(Res.drawable.ic_more, tr("Ещё"), tint = MaterialTheme.colorScheme.onSurfaceVariant) }
      menu(open) { open = false }
    }
  }
}

/** "Лучший результат": the best match as a big card. */
@Composable
private fun TopResult(top: JsonObject, onOpen: () -> Unit) {
  val nav = LocalNav.current
  val kind = top["kind"]?.jsonPrimitive?.content ?: return
  val item = top["item"] as? JsonObject ?: return
  fun <T> dec(s: kotlinx.serialization.KSerializer<T>): T? = runCatching { Api.json.decodeFromJsonElement(s, item) }.getOrNull()
  var cover: String? = null
  var title = ""
  var subtitle = ""
  var circle = false
  var open: () -> Unit = {}
  when (kind) {
    "track" -> dec(Track.serializer())?.let { t -> cover = t.coverUrl; title = t.title; subtitle = tr("Трек · {}", t.artists); open = { PlayerConn.play(listOf(t), 0, "search") } }
    "album" -> dec(AlbumSummary.serializer())?.let { a -> cover = a.coverUrl; title = a.title; subtitle = "${albumType(a.type)} · ${a.artist.name}"; open = { nav.album(a.id) } }
    "artist" -> dec(ArtistSummary.serializer())?.let { a -> cover = a.imageUrl; title = a.name; subtitle = tr("Исполнитель"); circle = true; open = { nav.artist(a.id) } }
    "playlist" -> dec(PlaylistSummary.serializer())?.let { p -> cover = p.coverUrl ?: p.mosaic.firstOrNull(); title = p.title; subtitle = tr("Плейлист · {}", (p.owner?.displayName ?: "")); open = { nav.playlist(p.id) } }
  }
  if (title.isEmpty()) return
  SectionTitle(tr("Лучший результат"))
  Row(
    Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(MaterialTheme.colorScheme.surfaceContainerHigh)
      .clickable { onOpen(); open() }.padding(16.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Cover(cover, Modifier.size(96.dp), if (circle) ArtistShape else RoundedCornerShape(20.dp), if (circle) Res.drawable.ic_person else Res.drawable.ic_album)
    Spacer(Modifier.width(16.dp))
    Column(Modifier.weight(1f)) {
      Text(title, style = MaterialTheme.typography.headlineSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
      Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
  }
}
