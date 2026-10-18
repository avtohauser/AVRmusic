@file:OptIn(ExperimentalFoundationApi::class, ExperimentalMaterial3Api::class, ExperimentalMaterial3ExpressiveApi::class)

package space.avthsr.music.ui

import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.animation.togetherWith
import androidx.compose.animation.fadeOut
import androidx.compose.animation.fadeIn
import androidx.compose.animation.AnimatedContent
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.Immutable
import space.avthsr.music.tr
import space.avthsr.music.Lang
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.ButtonDefaults
import io.ktor.http.encodeURLParameter
import coil3.compose.LocalPlatformContext
import coil3.request.crossfade
import org.jetbrains.compose.resources.DrawableResource
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
import org.jetbrains.compose.resources.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import coil3.compose.AsyncImage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import space.avthsr.music.App
import space.avthsr.music.res.*
import space.avthsr.music.api.Api
import space.avthsr.music.api.Likes
import androidx.compose.animation.core.Animatable
import androidx.compose.ui.text.TextStyle
import androidx.compose.material3.LocalTextStyle
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.scaleOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import space.avthsr.music.api.LikePrefs
import space.avthsr.music.api.PlaylistSummary
import space.avthsr.music.api.Track
import space.avthsr.music.player.Offline
import space.avthsr.music.player.Jam
import space.avthsr.music.player.PlayerConn

/* ---------- navigation ---------- */

class Nav(private val c: NavController, val openPlayer: () -> Unit) {
  private fun go(route: String) = c.navigate(route) { launchSingleTop = true }
  fun album(id: String) = go("album/${id.encodeURLParameter()}")
  fun artist(id: String) { if (id.isNotEmpty()) go("artist/${id.encodeURLParameter()}") }
  fun playlist(id: String) = go("playlist/${id.encodeURLParameter()}")
  fun genre(slug: String) = go("genre/${slug.encodeURLParameter()}")
  fun catalogAlbum(id: Long) = go("calbum/$id")
  fun catalogArtist(id: Long) = go("cartist/$id")
  fun liked() = go("liked")
  fun superliked() = go("superliked")
  fun profile() = c.navigate("profile") {
    popUpTo(c.graph.findStartDestination().id) { saveState = true }
    launchSingleTop = true
    restoreState = true
  }
  fun jobs() = go("jobs")
  fun downloads() = go("downloads")
  fun route(route: String) = go(route)
  fun back() { c.popBackStack() }
}

val LocalNav = staticCompositionLocalOf<Nav> { error("Nav is not provided") }

/* ---------- small pieces ---------- */

@Composable
fun Ico(res: DrawableResource, desc: String? = null, modifier: Modifier = Modifier, tint: Color = LocalContentColor.current) {
  // every icon in the app: a new glyph springs in from small, a new colour slides in instead of switching
  val color = if (tint == Color.Unspecified) tint else animateColorAsState(tint, Motion.expressive.defaultEffectsSpec(), label = "ico-tint").value
  val pop = remember { Animatable(1f) }
  var shown by remember { mutableStateOf(res) }
  LaunchedEffect(res) {
    if (shown != res) {
      shown = res
      pop.snapTo(0.35f)
      pop.animateTo(1f, Motion.expressive.fastSpatialSpec())
    }
  }
  Icon(painterResource(res), desc, modifier.graphicsLayer { scaleX = pop.value; scaleY = pop.value; alpha = (0.3f + 0.7f * pop.value).coerceIn(0f, 1f) }, color)
}

/** A line (a count, mostly) that rolls to its new value: the old one slides up and away, the new one rises in. */
@Composable
fun RollText(text: String, modifier: Modifier = Modifier, style: TextStyle = LocalTextStyle.current, color: Color = Color.Unspecified) {
  AnimatedContent(
    targetState = text,
    transitionSpec = {
      (slideInVertically(Motion.expressive.defaultSpatialSpec()) { it / 2 } + fadeIn(Motion.expressive.defaultEffectsSpec()))
        .togetherWith(slideOutVertically(Motion.expressive.fastSpatialSpec()) { -it / 2 } + fadeOut(Motion.expressive.fastEffectsSpec()))
        .using(SizeTransform(clip = false))
    },
    modifier = modifier,
    label = "roll",
  ) { t -> Text(t, style = style, color = color, maxLines = 1) }
}

/**
 * An icon that turns into the next one when it changes — the old one shrinks away as the new one grows in
 * on the expressive spring — and slides its colour instead of switching it.
 */
@Composable
fun MorphIco(res: DrawableResource, desc: String? = null, modifier: Modifier = Modifier, tint: Color = LocalContentColor.current) {
  val color by animateColorAsState(tint, Motion.expressive.defaultEffectsSpec(), label = "ico-tint")
  AnimatedContent(
    targetState = res,
    transitionSpec = {
      (scaleIn(Motion.expressive.fastSpatialSpec(), initialScale = 0.3f) + fadeIn(Motion.expressive.fastEffectsSpec()))
        .togetherWith(scaleOut(Motion.expressive.fastSpatialSpec(), targetScale = 0.3f) + fadeOut(Motion.expressive.fastEffectsSpec()))
        .using(SizeTransform(clip = false))
    },
    label = "ico",
  ) { r -> Icon(painterResource(r), desc, modifier, color) }
}

@Composable
fun Cover(url: String?, modifier: Modifier = Modifier, shape: Shape = RoundedCornerShape(12.dp), placeholder: DrawableResource = Res.drawable.ic_album) {
  Box(modifier.clip(shape).background(MaterialTheme.colorScheme.surfaceContainerHighest), contentAlignment = Alignment.Center) {
    val u = Api.img(url)
    if (u == null) Ico(placeholder, null, Modifier.fillMaxSize(0.42f), MaterialTheme.colorScheme.onSurfaceVariant)
    else {
      // whatever size of this cover is already in memory shows at once while the right size loads,
      // so a cover flying from a card into a page never blinks empty
      val context = LocalPlatformContext.current
      val request = remember(u) { coil3.request.ImageRequest.Builder(context).data(u).placeholderMemoryCacheKey(u).crossfade(true).build() }
      AsyncImage(model = request, contentDescription = null, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
    }
  }
}

fun fmtTime(ms: Long): String {
  val s = (ms / 1000).coerceAtLeast(0)
  return "${s / 60}:${(s % 60).toString().padStart(2, '0')}"
}

/** A random id (for one card's shared-element key). */
fun uniqueToken(): String = kotlin.random.Random.nextLong().toULong().toString(36) + kotlin.random.Random.nextInt().toUInt().toString(36)

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

/**
 * What screens loaded last, by loader and keys: a screen opened again (back, another tab, the same album
 * from elsewhere) shows it at once and refreshes it quietly, instead of a spinner every time.
 */
object LoadCache {
  // insertion order kept as recency order: a read moves the entry to the end, the oldest go first
  private val map = LinkedHashMap<Any, Any?>()

  fun get(key: Any): Any? {
    if (!map.containsKey(key)) return null
    val v = map.remove(key)
    map[key] = v
    return v
  }

  fun put(key: Any, value: Any?) {
    map.remove(key)
    map[key] = value
    while (map.size > 120) map.remove(map.keys.first())
  }
  fun has(key: Any) = map.containsKey(key)
  fun clear() = map.clear()
}

/** Runs [load] when the keys change; `reload()` runs it again (keeping the shown data meanwhile). */
@Composable
fun <T> rememberLoad(vararg keys: Any?, load: suspend () -> T): Loader<T> {
  var version by remember { mutableIntStateOf(0) }
  // each call site's lambda has its own class: with the keys it names the data
  val cacheKey = remember(*keys) { listOf(load::class) + keys.toList() }
  @Suppress("UNCHECKED_CAST")
  var state by remember(*keys) {
    mutableStateOf<Load<T>>(if (LoadCache.has(cacheKey)) Load.Ok(LoadCache.get(cacheKey) as T) else Load.Loading)
  }
  LaunchedEffect(*keys, version) {
    state = try {
      Load.Ok(load().also { LoadCache.put(cacheKey, it) })
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      if (state is Load.Ok) state else Load.Err(space.avthsr.music.api.friendlyError(e))
    }
  }
  return Loader(state) { version++ }
}

@Composable
fun <T> Loaded(loader: Loader<T>, content: @Composable (T) -> Unit) {
  // loading, error and content fade through one another on the effects spring
  AnimatedContent(
    targetState = loader.state,
    contentKey = { it::class },
    transitionSpec = { fadeIn(Motion.expressive.defaultEffectsSpec()).togetherWith(fadeOut(Motion.expressive.fastEffectsSpec())) },
    label = "load",
  ) { state -> LoadState(state, loader, content) }
}

@Composable
private fun <T> LoadState(state: Load<T>, loader: Loader<T>, content: @Composable (T) -> Unit) {
  when (val s = state) {
    is Load.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { LoadingMark() }
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
  share: String? = null,
) {
  var open by remember { mutableStateOf(false) }
  // this card's identity, so only the tapped copy of a cover flies into the page (and back)
  val token = rememberSaveable { uniqueToken() }
  val interaction = remember { MutableInteractionSource() }
  Box {
  Column(
    Modifier.width(width).pressSquash(interaction, 0.96f).clip(RoundedCornerShape(18.dp))
      .combinedClickable(
        interactionSource = interaction,
        indication = LocalIndication.current,
        onClick = { if (share != null) SharedCover.tap(token, share, cover, title, circle); onClick() },
        onLongClick = menu?.let { { open = true } },
      )
      .padding(6.dp),
    horizontalAlignment = if (circle) Alignment.CenterHorizontally else Alignment.Start,
  ) {
    Cover(cover, Modifier.size(width - 12.dp).sharedCover(share, token), if (circle) ArtistShape else RoundedCornerShape(16.dp), if (circle) Res.drawable.ic_person else Res.drawable.ic_album)
    Spacer(Modifier.height(8.dp))
    Text(title, Modifier.sharedTitle(share, token), style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = if (circle) TextAlign.Center else TextAlign.Start)
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
  val liked by Likes.of("album").collectAsStateWithLifecycle()
  var pick by remember { mutableStateOf<List<String>?>(null) }
  var send by remember { mutableStateOf(false) }
  val load = suspend { Api.album(id).tracks }
  DropdownMenu(expanded = expanded, onDismissRequest = close) {
    DropdownMenuItem(text = { Text(tr("Играть следующим")) }, leadingIcon = { Ico(Res.drawable.ic_queue) }, onClick = { close(); withTracks(load) { PlayerConn.playNext(it) } })
    DropdownMenuItem(text = { Text(tr("Добавить в очередь")) }, leadingIcon = { Ico(Res.drawable.ic_add) }, onClick = { close(); withTracks(load) { PlayerConn.enqueue(it) } })
    val on = id in liked
    DropdownMenuItem(
      text = { Text(if (on) tr("Убрать из избранного") else tr("В избранное")) },
      leadingIcon = { Ico(if (on) Res.drawable.ic_heart_filled else Res.drawable.ic_heart_outline) },
      onClick = { close(); toggleLike("album", id) },
    )
    DropdownMenuItem(text = { Text(tr("Добавить в плейлист")) }, leadingIcon = { Ico(Res.drawable.ic_playlist_add) }, onClick = { close(); withTracks(load) { pick = it.map { t -> t.id } } })
    DropdownMenuItem(text = { Text(tr("Сохранить офлайн")) }, leadingIcon = { Ico(Res.drawable.ic_download) }, onClick = { close(); withTracks(load) { Offline.save(it) } })
    DropdownMenuItem(text = { Text(tr("Скачать на устройство (ZIP)")) }, leadingIcon = { Ico(Res.drawable.ic_folder) }, onClick = {
      close(); downloadToDevice("/api/download/album/$id", "$artistName - $title.zip")
    })
    if (artistId.isNotEmpty()) DropdownMenuItem(text = { Text(tr("К исполнителю")) }, leadingIcon = { Ico(Res.drawable.ic_person) }, onClick = { close(); nav.artist(artistId) })
    DropdownMenuItem(text = { Text(tr("Отправить другу")) }, leadingIcon = { Ico(Res.drawable.ic_send) }, onClick = { close(); send = true })
    DropdownMenuItem(text = { Text(tr("Поделиться")) }, leadingIcon = { Ico(Res.drawable.ic_share) }, onClick = { close(); share("/album/$id", "$artistName — $title") })
  }
  pick?.let { ids -> PlaylistPicker(ids) { pick = null } }
  if (send) SendDialog("album", id, "$artistName — $title") { send = false }
}

/** Long-press menu of a playlist card, as on the site. */
@Composable
fun PlaylistMenu(p: PlaylistSummary, expanded: Boolean, close: () -> Unit) {
  val liked by Likes.of("playlist").collectAsStateWithLifecycle()
  val load = suspend { Api.playlist(p.id).tracks }
  val own = p.isOwner == true || (p.owner != null && p.owner.id == Api.user?.id)
  var send by remember { mutableStateOf(false) }
  DropdownMenu(expanded = expanded, onDismissRequest = close) {
    DropdownMenuItem(text = { Text(tr("Играть следующим")) }, leadingIcon = { Ico(Res.drawable.ic_queue) }, onClick = { close(); withTracks(load) { PlayerConn.playNext(it) } })
    DropdownMenuItem(text = { Text(tr("Добавить в очередь")) }, leadingIcon = { Ico(Res.drawable.ic_add) }, onClick = { close(); withTracks(load) { PlayerConn.enqueue(it) } })
    if (!own) {
      val on = p.id in liked
      DropdownMenuItem(
        text = { Text(if (on) tr("Убрать из избранного") else tr("В избранное")) },
        leadingIcon = { Ico(if (on) Res.drawable.ic_heart_filled else Res.drawable.ic_heart_outline) },
        onClick = { close(); toggleLike("playlist", p.id) },
      )
    }
    DropdownMenuItem(text = { Text(tr("Сохранить офлайн")) }, leadingIcon = { Ico(Res.drawable.ic_download) }, onClick = { close(); withTracks(load) { Offline.save(it) } })
    DropdownMenuItem(text = { Text(tr("Скачать на устройство (ZIP)")) }, leadingIcon = { Ico(Res.drawable.ic_folder) }, onClick = {
      close(); downloadToDevice("/api/download/playlist/${p.id}", "${p.title}.zip")
    })
    DropdownMenuItem(text = { Text(tr("Отправить другу")) }, leadingIcon = { Ico(Res.drawable.ic_send) }, onClick = { close(); send = true })
    DropdownMenuItem(text = { Text(tr("Поделиться")) }, leadingIcon = { Ico(Res.drawable.ic_share) }, onClick = { close(); share("/playlist/${p.id}", p.title) })
  }
  if (send) SendDialog("playlist", p.id, p.title) { send = false }
}

@Composable
fun <T> CardRow(items: List<T>, card: @Composable (T) -> Unit) {
  LazyRow(contentPadding = PaddingValues(horizontal = 10.dp)) { items(items) { Glide { card(it) } } }
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
  val currentId by PlayerConn.currentId.collectAsStateWithLifecycle()
  val liked by Likes.tracks.collectAsStateWithLifecycle()
  val supers by Likes.supers.collectAsStateWithLifecycle()
  val superOn by LikePrefs.superOn.collectAsStateWithLifecycle()
  val current = currentId == t.id
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
    AnimatedVisibility(t.id in liked, enter = scaleIn(Motion.expressive.fastSpatialSpec()) + fadeIn(), exit = scaleOut(Motion.expressive.fastSpatialSpec()) + fadeOut()) {
      HeartStar(filled = true, star = superOn && t.id in supers, modifier = Modifier.size(16.dp).semantics { contentDescription = tr("В избранном") })
    }
    Box {
      IconButton(shapes = IconButtonDefaults.shapes(), onClick = { menu = true }) { Ico(Res.drawable.ic_more, tr("Ещё"), tint = MaterialTheme.colorScheme.onSurfaceVariant) }
      TrackMenu(t, menu, { menu = false }, menuExtra)
    }
  }
}

@Composable
fun TrackMenu(t: Track, expanded: Boolean, close: () -> Unit, extra: (@Composable ColumnScope.(close: () -> Unit) -> Unit)? = null) {
  val nav = LocalNav.current
  val liked by Likes.tracks.collectAsStateWithLifecycle()
  var pick by remember { mutableStateOf(false) }
  var send by remember { mutableStateOf(false) }
  var report by remember { mutableStateOf(false) }
  DropdownMenu(expanded = expanded, onDismissRequest = close) {
    if (Jam.active) DropdownMenuItem(text = { Text(tr("Предложить в сессию")) }, leadingIcon = { Ico(Res.drawable.ic_thumb_up) }, onClick = { close(); Jam.suggest(t) })
    DropdownMenuItem(text = { Text(tr("Играть следующим")) }, leadingIcon = { Ico(Res.drawable.ic_queue) }, onClick = { close(); PlayerConn.playNext(t) })
    DropdownMenuItem(text = { Text(tr("Добавить в очередь")) }, leadingIcon = { Ico(Res.drawable.ic_add) }, onClick = { close(); PlayerConn.enqueue(t) })
    DropdownMenuItem(text = { Text(tr("Радио по треку")) }, leadingIcon = { Ico(Res.drawable.ic_radio) }, onClick = {
      close(); App.scope.launch { PlayerConn.radio(t) }
    })
    val on = t.id in liked
    DropdownMenuItem(
      text = { Text(if (on) tr("Убрать из избранного") else tr("В избранное")) },
      leadingIcon = { Ico(if (on) Res.drawable.ic_heart_filled else Res.drawable.ic_heart_outline) },
      onClick = { close(); toggleLike("track", t.id) },
    )
    val superOn by LikePrefs.superOn.collectAsStateWithLifecycle()
    val supers by Likes.supers.collectAsStateWithLifecycle()
    if (superOn) DropdownMenuItem(
      text = { Text(if (t.id in supers) tr("Убрать суперлайк") else tr("Суперлайк")) },
      leadingIcon = { SuperStar(Modifier.size(22.dp)) },
      onClick = { close(); toggleSuperLike(t.id) },
    )
    DropdownMenuItem(text = { Text(tr("Добавить в плейлист")) }, leadingIcon = { Ico(Res.drawable.ic_playlist_add) }, onClick = { close(); pick = true })
    if (t.hasLyrics) DropdownMenuItem(text = { Text(tr("Текст песни")) }, leadingIcon = { Ico(Res.drawable.ic_lyrics) }, onClick = {
      close()
      if (PlayerConn.state.value.track?.id != t.id) PlayerConn.play(listOf(t))
      showLyrics.value = true
      nav.openPlayer()
    })
    t.album?.let { a -> DropdownMenuItem(text = { Text(tr("К альбому")) }, leadingIcon = { Ico(Res.drawable.ic_album) }, onClick = { close(); nav.album(a.id) }) }
    if (t.artist.id.isNotEmpty()) {
      DropdownMenuItem(text = { Text(tr("К исполнителю")) }, leadingIcon = { Ico(Res.drawable.ic_person) }, onClick = { close(); nav.artist(t.artist.id) })
    }
    val savedOffline by Offline.entries.collectAsStateWithLifecycle()
    if (t.id in savedOffline) {
      DropdownMenuItem(text = { Text(tr("Удалить из офлайн")) }, leadingIcon = { Ico(Res.drawable.ic_offline) }, onClick = { close(); Offline.remove(listOf(t.id)) })
    } else {
      DropdownMenuItem(text = { Text(tr("Сохранить офлайн")) }, leadingIcon = { Ico(Res.drawable.ic_download) }, onClick = { close(); Offline.save(listOf(t)) })
    }
    DropdownMenuItem(text = { Text(tr("Скачать на устройство")) }, leadingIcon = { Ico(Res.drawable.ic_folder) }, onClick = { close(); downloadTrack(t) })
    DropdownMenuItem(text = { Text(tr("Отправить другу")) }, leadingIcon = { Ico(Res.drawable.ic_send) }, onClick = { close(); send = true })
    DropdownMenuItem(text = { Text(tr("Поделиться")) }, leadingIcon = { Ico(Res.drawable.ic_share) }, onClick = { close(); share(trackPath(t), "${t.artists} — ${t.title}") })
    DropdownMenuItem(text = { Text(tr("Скопировать ссылку")) }, leadingIcon = { Ico(Res.drawable.ic_link) }, onClick = { close(); copyLink(trackPath(t)) })
    if (!t.hasCanvas && Api.user?.canAcquire != false) {
      DropdownMenuItem(text = { Text(tr("Найти канвас")) }, leadingIcon = { Ico(Res.drawable.ic_movie) }, onClick = {
        close(); act(tr("Ищу клип — канвас появится через минуту")) { Api.requestCanvas(t.id) }
      })
    }
    DropdownMenuItem(text = { Text(tr("Пожаловаться на трек")) }, leadingIcon = { Ico(Res.drawable.ic_campaign) }, onClick = { close(); report = true })
    if (Api.user?.isAdmin == true) {
      DropdownMenuItem(text = { Text(tr("Редактировать трек")) }, leadingIcon = { Ico(Res.drawable.ic_settings) }, onClick = { close(); nav.route("admin/track/${t.id.encodeURLParameter()}") })
    }
    extra?.invoke(this, close)
  }
  if (pick) PlaylistPicker(listOf(t.id)) { pick = false }
  if (send) SendDialog("track", t.id, "${t.artists} — ${t.title}") { send = false }
  if (report) ReportDialog(t) { report = false }
}

fun toggleLike(type: String, id: String) {
  App.scope.launch {
    runCatching { Likes.toggle(type, id) }
      .onSuccess { if (type == "track") App.say(if (it) tr("Добавлено в избранное") else tr("Убрано из избранного")) }
      .onFailure { App.say(it.message ?: tr("Не получилось")) }
  }
}

fun toggleSuperLike(id: String) {
  App.scope.launch {
    runCatching { Likes.toggleSuper(id) }
      .onSuccess { App.say(if (it) tr("★ Суперлайк — трек в «Суперлайках»") else tr("Суперлайк убран, лайк остался")) }
      .onFailure { App.say(it.message ?: tr("Не получилось")) }
  }
}

/** The avr star of a superliked track. */
@Composable
fun SuperStar(modifier: Modifier = Modifier) = BrandMark(modifier, waves = false)

/**
 * The heart. On a track a long press gives a superlike — the heart flows into the avr star and the track
 * goes to Superlikes as well (the settings can swap what the tap and the long press do).
 */
@Composable
fun LikeButton(type: String, id: String) {
  val liked by Likes.of(type).collectAsStateWithLifecycle()
  val supers by Likes.supers.collectAsStateWithLifecycle()
  val superOn by LikePrefs.superOn.collectAsStateWithLifecycle()
  val tapSuper by LikePrefs.tapSuper.collectAsStateWithLifecycle()
  val on = id in liked
  val canStar = type == "track" && superOn
  val starred = canStar && id in supers
  val label = if (starred) tr("Убрать суперлайк") else if (on) tr("Убрать из избранного") else tr("В избранное")
  if (!canStar) {
    IconButton(onClick = { toggleLike(type, id) }, shapes = IconButtonDefaults.shapes()) {
      HeartStar(filled = on, star = false, modifier = Modifier.size(24.dp).semantics { contentDescription = label })
    }
    return
  }
  val tap = { if (tapSuper) toggleSuperLike(id) else toggleLike(type, id) }
  // the long press buzzes by itself (combinedClickable's haptics)
  val long = { if (tapSuper) toggleLike(type, id) else toggleSuperLike(id) }
  Box(Modifier.minimumInteractiveComponentSize().size(40.dp), contentAlignment = Alignment.Center) {
    // the touch and its ripple in the circle; the heart above it, unclipped, so the star's burst flies out
    Box(
      Modifier.matchParentSize().clip(CircleShape)
        .combinedClickable(
          role = Role.Button,
          onClickLabel = label,
          onLongClickLabel = if (tapSuper) tr("Обычный лайк") else tr("Суперлайк"),
          onLongClick = long,
          onClick = tap,
        )
        .semantics { contentDescription = label },
    )
    HeartStar(filled = on, star = starred, modifier = Modifier.size(24.dp))
  }
}

/** Adds tracks to one of the user's playlists (or a new one). */
@Composable
fun PlaylistPicker(trackIds: List<String>, onDone: () -> Unit) {
  // own playlists and shared ones this listener may add to
  val loader = rememberLoad(Unit) { Api.playlists().filter { it.canEdit ?: (it.isOwner != false) } }
  var title by remember { mutableStateOf("") }
  fun add(p: PlaylistSummary) {
    onDone()
    App.scope.launch {
      runCatching { Api.addToPlaylist(p.id, trackIds) }
        .onSuccess { App.say(tr("Добавлено в «{}»", p.title)) }
        .onFailure { App.say(it.message ?: tr("Не получилось")) }
    }
  }
  AlertDialog(modifier = Modifier.growIn(),
    onDismissRequest = onDone,
    title = { Text(tr("Добавить в плейлист")) },
    text = {
      Column {
        when (val s = loader.state) {
          is Load.Ok -> LazyColumn(Modifier.height(240.dp)) {
            items(s.data) { p -> Glide {
              Text(
                p.title, Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).clickable { add(p) }.padding(12.dp),
                style = MaterialTheme.typography.bodyLarge,
              ) }
            }
          }
          is Load.Err -> Text(s.message)
          else -> LoadingMark()
        }
        HorizontalDivider(Modifier.padding(vertical = 8.dp))
        OutlinedTextField(title, { title = it }, label = { Text(tr("Новый плейлист")) }, singleLine = true, modifier = Modifier.fillMaxWidth())
      }
    },
    confirmButton = {
      TextButton(shapes = ButtonDefaults.shapes(), enabled = title.isNotBlank(), onClick = {
        val name = title
        onDone()
        App.scope.launch {
          runCatching { Api.addToPlaylist(Api.createPlaylist(name).id, trackIds) }
            .onSuccess { App.say(tr("Плейлист «{}» создан", name)) }
            .onFailure { App.say(it.message ?: tr("Не получилось")) }
        }
      }) { Text(tr("Создать")) }
    },
    dismissButton = { TextButton(shapes = ButtonDefaults.shapes(), onClick = onDone) { Text(tr("Отмена")) } },
  )
}

/**
 * What the screens keep clear of, edge to edge: the camera cutout on top and the floating mini player
 * and navigation island at the bottom. Content runs under both; only its padding leaves the room.
 */
@Immutable
data class Edges(val top: Dp = 0.dp, val bottom: Dp = 0.dp)

val LocalEdges = compositionLocalOf { Edges() }

/** Padding for a screen's scrolling content; [hero] screens start with a picture that runs under the cutout. */
@Composable
fun screenPadding(start: Dp = 0.dp, top: Dp = 0.dp, end: Dp = 0.dp, bottom: Dp = 0.dp, hero: Boolean = false): PaddingValues {
  val e = LocalEdges.current
  return PaddingValues(start = start, top = top + if (hero) 0.dp else e.top, end = end, bottom = bottom + e.bottom)
}

/** A page with a back arrow over its top-left corner. */
@Composable
fun Page(back: Boolean = true, content: @Composable () -> Unit) {
  Box(Modifier.fillMaxSize()) {
    content()
    if (back) BackButton(Modifier.align(Alignment.TopStart).padding(top = LocalEdges.current.top))
  }
}

/** Back arrow over a page. */
@Composable
fun BackButton(modifier: Modifier = Modifier) {
  val nav = LocalNav.current
  IconButton(shapes = IconButtonDefaults.shapes(), onClick = { nav.back() }, modifier = modifier.padding(4.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surface.copy(alpha = 0.6f))) {
    Ico(Res.drawable.ic_back, tr("Назад"))
  }
}
