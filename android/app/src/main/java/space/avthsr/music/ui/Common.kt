@file:OptIn(ExperimentalFoundationApi::class, ExperimentalMaterial3Api::class, ExperimentalMaterial3ExpressiveApi::class)

package space.avthsr.music.ui

import space.avthsr.music.tr
import space.avthsr.music.Lang
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.ButtonDefaults
import android.net.Uri
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.LoadingIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LocalContentColor
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
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import coil.compose.AsyncImage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import space.avthsr.music.App
import space.avthsr.music.R
import space.avthsr.music.api.Api
import space.avthsr.music.api.Likes
import space.avthsr.music.api.PlaylistSummary
import space.avthsr.music.api.Track
import space.avthsr.music.player.Offline
import space.avthsr.music.player.PlayerConn

/* ---------- navigation ---------- */

class Nav(private val c: NavController, val openPlayer: () -> Unit) {
  private fun go(route: String) = c.navigate(route) { launchSingleTop = true }
  fun album(id: String) = go("album/${Uri.encode(id)}")
  fun artist(id: String) { if (id.isNotEmpty()) go("artist/${Uri.encode(id)}") }
  fun playlist(id: String) = go("playlist/${Uri.encode(id)}")
  fun genre(slug: String) = go("genre/${Uri.encode(slug)}")
  fun catalogAlbum(id: Long) = go("calbum/$id")
  fun catalogArtist(id: Long) = go("cartist/$id")
  fun liked() = go("liked")
  fun discover() = go("discover")
  fun profile() = go("profile")
  fun jobs() = go("jobs")
  fun downloads() = go("downloads")
  fun route(route: String) = go(route)
  fun back() { c.popBackStack() }
}

val LocalNav = staticCompositionLocalOf<Nav> { error("Nav is not provided") }

/* ---------- small pieces ---------- */

@Composable
fun Ico(res: Int, desc: String? = null, modifier: Modifier = Modifier, tint: Color = LocalContentColor.current) {
  Icon(painterResource(res), desc, modifier, tint)
}

@Composable
fun Cover(url: String?, modifier: Modifier = Modifier, shape: Shape = RoundedCornerShape(12.dp), placeholder: Int = R.drawable.ic_album) {
  Box(modifier.clip(shape).background(MaterialTheme.colorScheme.surfaceContainerHighest), contentAlignment = Alignment.Center) {
    val u = Api.img(url)
    if (u == null) Ico(placeholder, null, Modifier.fillMaxSize(0.42f), MaterialTheme.colorScheme.onSurfaceVariant)
    else AsyncImage(model = u, contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
  }
}

fun fmtTime(ms: Long): String {
  val s = (ms / 1000).coerceAtLeast(0)
  return "%d:%02d".format(s / 60, s % 60)
}

fun plural(n: Int, one: String, few: String, many: String): String {
  val m10 = n % 10
  val m100 = n % 100
  val w = when {
    Lang.code == "en" -> if (n == 1) one else many
    m10 == 1 && m100 != 11 -> one
    m10 in 2..4 && m100 !in 12..14 -> few
    else -> many
  }
  return "$n $w"
}

fun tracksWord(n: Int) = plural(n, tr("трек"), tr("трека"), tr("треков"))

fun albumType(t: String) = when (t) {
  "single" -> tr("Сингл")
  "ep" -> "EP"
  "compilation" -> tr("Сборник")
  else -> tr("Альбом")
}

/* ---------- loading ---------- */

sealed interface Load<out T> {
  data object Loading : Load<Nothing>
  data class Ok<T>(val data: T) : Load<T>
  data class Err(val message: String) : Load<Nothing>
}

class Loader<T>(val state: Load<T>, val reload: () -> Unit) {
  /** the loaded value, if any */
  @Suppress("UNCHECKED_CAST")
  val data: T? get() = (state as? Load.Ok<T>)?.data
}

/** Runs [load] when the keys change; `reload()` runs it again (keeping the shown data meanwhile). */
@Composable
fun <T> rememberLoad(vararg keys: Any?, load: suspend () -> T): Loader<T> {
  var version by remember { mutableIntStateOf(0) }
  var state by remember(*keys) { mutableStateOf<Load<T>>(Load.Loading) }
  LaunchedEffect(*keys, version) {
    state = try {
      Load.Ok(load())
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      if (state is Load.Ok) state else Load.Err(e.message ?: tr("Не удалось загрузить"))
    }
  }
  return Loader(state) { version++ }
}

@Composable
fun <T> Loaded(loader: Loader<T>, content: @Composable (T) -> Unit) {
  when (val s = loader.state) {
    is Load.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { LoadingIndicator() }
    is Load.Err -> Column(
      Modifier.fillMaxSize().padding(32.dp),
      verticalArrangement = Arrangement.Center,
      horizontalAlignment = Alignment.CenterHorizontally,
    ) {
      Text(s.message, textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant)
      Spacer(Modifier.height(16.dp))
      Button(shapes = ButtonDefaults.shapes(), onClick = loader.reload) { Text(tr("Повторить")) }
    }
    is Load.Ok -> content(s.data)
  }
}

/* ---------- sections and cards ---------- */

@Composable
fun SectionTitle(text: String, subtitle: String? = null, action: (@Composable () -> Unit)? = null) {
  Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 22.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
    Column(Modifier.weight(1f)) {
      Text(text, style = MaterialTheme.typography.titleLarge)
      if (subtitle != null) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    action?.invoke()
  }
}

@Composable
fun MediaCard(
  title: String,
  subtitle: String,
  cover: String?,
  onClick: () -> Unit,
  circle: Boolean = false,
  width: Dp = 148.dp,
  menu: (@Composable (expanded: Boolean, close: () -> Unit) -> Unit)? = null,
) {
  var open by remember { mutableStateOf(false) }
  Box {
  Column(
    Modifier.width(width).clip(RoundedCornerShape(18.dp))
      .combinedClickable(onClick = onClick, onLongClick = menu?.let { { open = true } })
      .padding(6.dp),
    horizontalAlignment = if (circle) Alignment.CenterHorizontally else Alignment.Start,
  ) {
    Cover(cover, Modifier.size(width - 12.dp), if (circle) ArtistShape else RoundedCornerShape(16.dp), if (circle) R.drawable.ic_person else R.drawable.ic_album)
    Spacer(Modifier.height(8.dp))
    Text(title, style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = if (circle) TextAlign.Center else TextAlign.Start)
    if (subtitle.isNotEmpty()) {
      Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
  }
  menu?.invoke(open) { open = false }
  }
}

/** Loads the tracks of an album or playlist for a menu action; says what went wrong. */
private fun withTracks(load: suspend () -> List<Track>, then: (List<Track>) -> Unit) {
  App.scope.launch {
    runCatching { load() }.onSuccess(then).onFailure { App.say(it.message ?: tr("Не удалось загрузить")) }
  }
}

/** Long-press menu of an album card, as on the site. */
@Composable
fun AlbumMenu(id: String, title: String, artistId: String, artistName: String, expanded: Boolean, close: () -> Unit) {
  val nav = LocalNav.current
  val context = androidx.compose.ui.platform.LocalContext.current
  val liked by Likes.of("album").collectAsStateWithLifecycle()
  var pick by remember { mutableStateOf<List<String>?>(null) }
  val load = suspend { Api.album(id).tracks }
  DropdownMenu(expanded = expanded, onDismissRequest = close) {
    DropdownMenuItem(text = { Text(tr("Играть следующим")) }, leadingIcon = { Ico(R.drawable.ic_queue) }, onClick = { close(); withTracks(load) { PlayerConn.playNext(it) } })
    DropdownMenuItem(text = { Text(tr("Добавить в очередь")) }, leadingIcon = { Ico(R.drawable.ic_add) }, onClick = { close(); withTracks(load) { PlayerConn.enqueue(it) } })
    val on = id in liked
    DropdownMenuItem(
      text = { Text(if (on) tr("Убрать из избранного") else tr("В избранное")) },
      leadingIcon = { Ico(if (on) R.drawable.ic_heart_filled else R.drawable.ic_heart_outline) },
      onClick = { close(); toggleLike("album", id) },
    )
    DropdownMenuItem(text = { Text(tr("Добавить в плейлист")) }, leadingIcon = { Ico(R.drawable.ic_playlist_add) }, onClick = { close(); withTracks(load) { pick = it.map { t -> t.id } } })
    DropdownMenuItem(text = { Text(tr("Сохранить офлайн")) }, leadingIcon = { Ico(R.drawable.ic_download) }, onClick = { close(); withTracks(load) { Offline.save(it) } })
    DropdownMenuItem(text = { Text(tr("Скачать на устройство (ZIP)")) }, leadingIcon = { Ico(R.drawable.ic_folder) }, onClick = {
      close(); downloadToDevice(context, "/api/download/album/$id", "$artistName - $title.zip")
    })
    if (artistId.isNotEmpty()) DropdownMenuItem(text = { Text(tr("К исполнителю")) }, leadingIcon = { Ico(R.drawable.ic_person) }, onClick = { close(); nav.artist(artistId) })
    DropdownMenuItem(text = { Text(tr("Поделиться")) }, leadingIcon = { Ico(R.drawable.ic_share) }, onClick = { close(); share(context, "/album/$id", "$artistName — $title") })
  }
  pick?.let { ids -> PlaylistPicker(ids) { pick = null } }
}

/** Long-press menu of a playlist card, as on the site. */
@Composable
fun PlaylistMenu(p: PlaylistSummary, expanded: Boolean, close: () -> Unit) {
  val context = androidx.compose.ui.platform.LocalContext.current
  val liked by Likes.of("playlist").collectAsStateWithLifecycle()
  val load = suspend { Api.playlist(p.id).tracks }
  val own = p.isOwner == true || (p.owner != null && p.owner.id == Api.user?.id)
  DropdownMenu(expanded = expanded, onDismissRequest = close) {
    DropdownMenuItem(text = { Text(tr("Играть следующим")) }, leadingIcon = { Ico(R.drawable.ic_queue) }, onClick = { close(); withTracks(load) { PlayerConn.playNext(it) } })
    DropdownMenuItem(text = { Text(tr("Добавить в очередь")) }, leadingIcon = { Ico(R.drawable.ic_add) }, onClick = { close(); withTracks(load) { PlayerConn.enqueue(it) } })
    if (!own) {
      val on = p.id in liked
      DropdownMenuItem(
        text = { Text(if (on) tr("Убрать из избранного") else tr("В избранное")) },
        leadingIcon = { Ico(if (on) R.drawable.ic_heart_filled else R.drawable.ic_heart_outline) },
        onClick = { close(); toggleLike("playlist", p.id) },
      )
    }
    DropdownMenuItem(text = { Text(tr("Сохранить офлайн")) }, leadingIcon = { Ico(R.drawable.ic_download) }, onClick = { close(); withTracks(load) { Offline.save(it) } })
    DropdownMenuItem(text = { Text(tr("Скачать на устройство (ZIP)")) }, leadingIcon = { Ico(R.drawable.ic_folder) }, onClick = {
      close(); downloadToDevice(context, "/api/download/playlist/${p.id}", "${p.title}.zip")
    })
    DropdownMenuItem(text = { Text(tr("Поделиться")) }, leadingIcon = { Ico(R.drawable.ic_share) }, onClick = { close(); share(context, "/playlist/${p.id}", p.title) })
  }
}

@Composable
fun <T> CardRow(items: List<T>, card: @Composable (T) -> Unit) {
  LazyRow(contentPadding = PaddingValues(horizontal = 10.dp)) { items(items) { card(it) } }
}

/* ---------- tracks ---------- */

@Composable
fun TrackRow(
  t: Track,
  onClick: () -> Unit,
  index: Int? = null,
  showCover: Boolean = true,
  subtitle: String? = null,
  menuExtra: (@Composable ColumnScope.(close: () -> Unit) -> Unit)? = null,
) {
  val player by PlayerConn.state.collectAsStateWithLifecycle()
  val liked by Likes.tracks.collectAsStateWithLifecycle()
  val current = player.track?.id == t.id
  var menu by remember { mutableStateOf(false) }
  Row(
    Modifier.fillMaxWidth().combinedClickable(onClick = onClick, onLongClick = { menu = true }).padding(start = 16.dp, end = 4.dp, top = 6.dp, bottom = 6.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    if (index != null) {
      Text(
        "$index", Modifier.width(30.dp), style = MaterialTheme.typography.bodyMedium,
        color = if (current) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
      )
    }
    if (showCover) {
      Cover(t.coverUrl, Modifier.size(50.dp), RoundedCornerShape(12.dp))
      Spacer(Modifier.width(14.dp))
    }
    Column(Modifier.weight(1f)) {
      Text(
        t.title, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleMedium,
        color = if (current) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
      )
      Text(
        subtitle ?: t.artists, maxLines = 1, overflow = TextOverflow.Ellipsis,
        style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
    }
    if (t.id in liked) Ico(R.drawable.ic_heart_filled, tr("В избранном"), Modifier.size(16.dp), MaterialTheme.colorScheme.primary)
    Box {
      IconButton(onClick = { menu = true }) { Ico(R.drawable.ic_more, tr("Ещё"), tint = MaterialTheme.colorScheme.onSurfaceVariant) }
      TrackMenu(t, menu, { menu = false }, menuExtra)
    }
  }
}

@Composable
fun TrackMenu(t: Track, expanded: Boolean, close: () -> Unit, extra: (@Composable ColumnScope.(close: () -> Unit) -> Unit)? = null) {
  val nav = LocalNav.current
  val context = androidx.compose.ui.platform.LocalContext.current
  val liked by Likes.tracks.collectAsStateWithLifecycle()
  var pick by remember { mutableStateOf(false) }
  DropdownMenu(expanded = expanded, onDismissRequest = close) {
    DropdownMenuItem(text = { Text(tr("Играть следующим")) }, leadingIcon = { Ico(R.drawable.ic_queue) }, onClick = { close(); PlayerConn.playNext(t) })
    DropdownMenuItem(text = { Text(tr("Добавить в очередь")) }, leadingIcon = { Ico(R.drawable.ic_add) }, onClick = { close(); PlayerConn.enqueue(t) })
    DropdownMenuItem(text = { Text(tr("Радио по треку")) }, leadingIcon = { Ico(R.drawable.ic_radio) }, onClick = {
      close(); App.scope.launch { PlayerConn.radio(t) }
    })
    val on = t.id in liked
    DropdownMenuItem(
      text = { Text(if (on) tr("Убрать из избранного") else tr("В избранное")) },
      leadingIcon = { Ico(if (on) R.drawable.ic_heart_filled else R.drawable.ic_heart_outline) },
      onClick = { close(); toggleLike("track", t.id) },
    )
    DropdownMenuItem(text = { Text(tr("Добавить в плейлист")) }, leadingIcon = { Ico(R.drawable.ic_playlist_add) }, onClick = { close(); pick = true })
    if (t.hasLyrics) DropdownMenuItem(text = { Text(tr("Текст песни")) }, leadingIcon = { Ico(R.drawable.ic_lyrics) }, onClick = {
      close()
      if (PlayerConn.state.value.track?.id != t.id) PlayerConn.play(listOf(t))
      showLyrics.value = true
      nav.openPlayer()
    })
    t.album?.let { a -> DropdownMenuItem(text = { Text(tr("К альбому")) }, leadingIcon = { Ico(R.drawable.ic_album) }, onClick = { close(); nav.album(a.id) }) }
    if (t.artist.id.isNotEmpty()) {
      DropdownMenuItem(text = { Text(tr("К исполнителю")) }, leadingIcon = { Ico(R.drawable.ic_person) }, onClick = { close(); nav.artist(t.artist.id) })
    }
    val savedOffline by Offline.entries.collectAsStateWithLifecycle()
    if (t.id in savedOffline) {
      DropdownMenuItem(text = { Text(tr("Удалить из офлайн")) }, leadingIcon = { Ico(R.drawable.ic_offline) }, onClick = { close(); Offline.remove(listOf(t.id)) })
    } else {
      DropdownMenuItem(text = { Text(tr("Сохранить офлайн")) }, leadingIcon = { Ico(R.drawable.ic_download) }, onClick = { close(); Offline.save(listOf(t)) })
    }
    DropdownMenuItem(text = { Text(tr("Скачать на устройство")) }, leadingIcon = { Ico(R.drawable.ic_folder) }, onClick = { close(); downloadTrack(context, t) })
    DropdownMenuItem(text = { Text(tr("Поделиться")) }, leadingIcon = { Ico(R.drawable.ic_share) }, onClick = { close(); share(context, trackPath(t), "${t.artists} — ${t.title}") })
    DropdownMenuItem(text = { Text(tr("Скопировать ссылку")) }, leadingIcon = { Ico(R.drawable.ic_link) }, onClick = { close(); copyLink(context, trackPath(t)) })
    if (!t.hasCanvas && Api.user?.canAcquire != false) {
      DropdownMenuItem(text = { Text(tr("Найти канвас")) }, leadingIcon = { Ico(R.drawable.ic_movie) }, onClick = {
        close(); act(tr("Ищу клип — канвас появится через минуту")) { Api.requestCanvas(t.id) }
      })
    }
    if (Api.user?.isAdmin == true) {
      DropdownMenuItem(text = { Text(tr("Редактировать трек")) }, leadingIcon = { Ico(R.drawable.ic_settings) }, onClick = { close(); nav.route("admin/track/${Uri.encode(t.id)}") })
    }
    extra?.invoke(this, close)
  }
  if (pick) PlaylistPicker(listOf(t.id)) { pick = false }
}

fun toggleLike(type: String, id: String) {
  App.scope.launch {
    runCatching { Likes.toggle(type, id) }
      .onSuccess { if (type == "track") App.say(if (it) tr("Добавлено в избранное") else tr("Убрано из избранного")) }
      .onFailure { App.say(it.message ?: tr("Не получилось")) }
  }
}

@Composable
fun LikeButton(type: String, id: String) {
  val liked by Likes.of(type).collectAsStateWithLifecycle()
  val on = id in liked
  IconButton(onClick = { toggleLike(type, id) }, shapes = IconButtonDefaults.shapes()) {
    Ico(
      if (on) R.drawable.ic_heart_filled else R.drawable.ic_heart_outline, if (on) tr("Убрать из избранного") else tr("В избранное"),
      tint = if (on) MaterialTheme.colorScheme.primary else LocalContentColor.current,
    )
  }
}

/** Adds tracks to one of the user's playlists (or a new one). */
@Composable
fun PlaylistPicker(trackIds: List<String>, onDone: () -> Unit) {
  val loader = rememberLoad(Unit) { Api.playlists().filter { it.isOwner != false } }
  var title by remember { mutableStateOf("") }
  fun add(p: PlaylistSummary) {
    onDone()
    App.scope.launch {
      runCatching { Api.addToPlaylist(p.id, trackIds) }
        .onSuccess { App.say(tr("Добавлено в «{}»", p.title)) }
        .onFailure { App.say(it.message ?: tr("Не получилось")) }
    }
  }
  AlertDialog(
    onDismissRequest = onDone,
    title = { Text(tr("Добавить в плейлист")) },
    text = {
      Column {
        when (val s = loader.state) {
          is Load.Ok -> LazyColumn(Modifier.height(240.dp)) {
            items(s.data) { p ->
              Text(
                p.title, Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { add(p) }.padding(12.dp),
                style = MaterialTheme.typography.bodyLarge,
              )
            }
          }
          is Load.Err -> Text(s.message)
          else -> LoadingIndicator()
        }
        HorizontalDivider(Modifier.padding(vertical = 8.dp))
        OutlinedTextField(title, { title = it }, label = { Text(tr("Новый плейлист")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
      }
    },
    confirmButton = {
      TextButton(enabled = title.isNotBlank(), onClick = {
        val name = title
        onDone()
        App.scope.launch {
          runCatching { Api.addToPlaylist(Api.createPlaylist(name).id, trackIds) }
            .onSuccess { App.say(tr("Плейлист «{}» создан", name)) }
            .onFailure { App.say(it.message ?: tr("Не получилось")) }
        }
      }) { Text(tr("Создать")) }
    },
    dismissButton = { TextButton(onClick = onDone) { Text(tr("Отмена")) } },
  )
}

/** A page with a back arrow over its top-left corner. */
@Composable
fun Page(back: Boolean = true, content: @Composable () -> Unit) {
  Box(Modifier.fillMaxSize()) {
    content()
    if (back) BackButton(Modifier.align(Alignment.TopStart))
  }
}

/** Back arrow over a page. */
@Composable
fun BackButton(modifier: Modifier = Modifier) {
  val nav = LocalNav.current
  IconButton(onClick = { nav.back() }, modifier = modifier.padding(4.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surface.copy(alpha = 0.6f))) {
    Ico(R.drawable.ic_back, tr("Назад"))
  }
}
