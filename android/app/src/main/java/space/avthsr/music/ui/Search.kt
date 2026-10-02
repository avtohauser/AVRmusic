@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package space.avthsr.music.ui

import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.LoadingIndicator
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import space.avthsr.music.R
import space.avthsr.music.api.Api
import space.avthsr.music.player.PlayerConn

@Composable
fun SearchScreen() {
  val nav = LocalNav.current
  val focus = LocalFocusManager.current
  var q by rememberSaveable { mutableStateOf("") }
  var query by remember { mutableStateOf(q.trim()) }
  LaunchedEffect(q) { delay(350); query = q.trim() }
  val canAcquire by produceState(false) { value = Api.canAcquire() }
  val genres = rememberLoad(Unit) { Api.genres() }
  val local = rememberLoad(query) { if (query.isEmpty()) null else Api.search(query) }
  val remote = rememberLoad(query, canAcquire) { if (query.length < 2 || !canAcquire) null else Api.catalogSearch(query) }

  Column(Modifier.fillMaxSize()) {
    TextField(
      value = q,
      onValueChange = { q = it },
      modifier = Modifier.fillMaxWidth().padding(16.dp),
      placeholder = { Text("Треки, альбомы, исполнители") },
      leadingIcon = { Ico(R.drawable.ic_search) },
      trailingIcon = { if (q.isNotEmpty()) IconButton(onClick = { q = "" }) { Ico(R.drawable.ic_close, "Очистить") } },
      singleLine = true,
      shape = RoundedCornerShape(28.dp),
      keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
      keyboardActions = KeyboardActions(onSearch = { query = q.trim(); focus.clearFocus() }),
      colors = TextFieldDefaults.colors(focusedIndicatorColor = Color.Transparent, unfocusedIndicatorColor = Color.Transparent),
    )
    LazyColumn(Modifier.weight(1f).imePadding(), contentPadding = PaddingValues(bottom = 24.dp)) {
      if (query.isEmpty()) {
        val g = genres.data.orEmpty()
        if (g.isNotEmpty()) {
          item { SectionTitle("Жанры и настроения") }
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
            if (r.tracks.isEmpty() && r.albums.isEmpty() && r.artists.isEmpty() && r.playlists.isEmpty()) {
              item {
                Text(
                  if (canAcquire) "На сервере ничего не нашлось — посмотрите в каталоге ниже" else "Ничего не нашлось",
                  Modifier.fillMaxWidth().padding(24.dp), textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
              }
            }
            if (r.tracks.isNotEmpty()) {
              item { SectionTitle("Треки") }
              items(r.tracks) { t -> TrackRow(t, onClick = { PlayerConn.play(r.tracks, r.tracks.indexOf(t), "search") }) }
            }
            if (r.artists.isNotEmpty()) item {
              SectionTitle("Исполнители")
              CardRow(r.artists) { a -> MediaCard(a.name, "", a.imageUrl, { nav.artist(a.id) }, circle = true, width = 124.dp) }
            }
            if (r.albums.isNotEmpty()) item {
              SectionTitle("Альбомы")
              CardRow(r.albums) { a -> MediaCard(a.title, a.artist.name, a.coverUrl, { nav.album(a.id) }) }
            }
            if (r.playlists.isNotEmpty()) item {
              SectionTitle("Плейлисты")
              CardRow(r.playlists) { p -> MediaCard(p.title, p.owner?.displayName ?: "", p.coverUrl ?: p.mosaic.firstOrNull(), { nav.playlist(p.id) }) }
            }
          }
        }
        is Load.Err -> item { Text(s.message, Modifier.padding(24.dp), color = MaterialTheme.colorScheme.error) }
        else -> item { Box(Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) { LoadingIndicator() } }
      }
      if (canAcquire) {
        val c = remote.data
        if (c != null && (c.tracks.isNotEmpty() || c.albums.isNotEmpty() || c.artists.isNotEmpty())) {
          item { SectionTitle("В каталоге", "Чего нет на сервере — добавьте в одно касание") }
          items(c.tracks.take(8)) { CatalogTrackRow(it) }
          if (c.albums.isNotEmpty()) item { CardRow(c.albums) { CatalogAlbumCard(it) } }
          if (c.artists.isNotEmpty()) item {
            CardRow(c.artists) { a -> MediaCard(a.name, "", a.imageUrl, { nav.catalogArtist(a.id) }, circle = true, width = 124.dp) }
          }
        }
      }
    }
  }
}
