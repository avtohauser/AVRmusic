@file:OptIn(ExperimentalFoundationApi::class, ExperimentalLayoutApi::class)

package space.avthsr.music.ui

import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularWavyProgressIndicator
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.IconButton
import androidx.compose.material3.LoadingIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import io.ktor.http.encodeURLParameter
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import space.avthsr.music.App
import space.avthsr.music.api.AlbumSummary
import space.avthsr.music.api.Api
import space.avthsr.music.api.ArtistSummary
import space.avthsr.music.api.Compat
import space.avthsr.music.api.Friend
import space.avthsr.music.api.FriendNow
import space.avthsr.music.api.Friends
import space.avthsr.music.api.Inbox
import space.avthsr.music.api.JamSummary
import space.avthsr.music.api.Playlist
import space.avthsr.music.api.PlaylistSummary
import space.avthsr.music.api.Share
import space.avthsr.music.api.Track
import space.avthsr.music.api.addMember
import space.avthsr.music.api.createBlend
import space.avthsr.music.api.friend
import space.avthsr.music.api.jams
import space.avthsr.music.api.removeMember
import space.avthsr.music.api.sendShare
import space.avthsr.music.player.Jam
import space.avthsr.music.player.PlayerConn
import space.avthsr.music.res.*
import space.avthsr.music.tr

private fun <T> JsonObject.decodeAs(s: kotlinx.serialization.KSerializer<T>): T? = runCatching { Api.json.decodeFromJsonElement(s, this) }.getOrNull()

/** A friend's photo; while they listen, a slowly turning ring of the theme's colours goes round it. */
@Composable
fun FriendAvatar(url: String?, size: Dp, listening: Boolean = false, modifier: Modifier = Modifier) {
  val cs = MaterialTheme.colorScheme
  Box(modifier.size(size), contentAlignment = Alignment.Center) {
    if (listening) {
      val spin = rememberInfiniteTransition(label = "ring")
      val angle by spin.animateFloat(0f, 360f, infiniteRepeatable(tween(5000, easing = LinearEasing)), label = "angle")
      Box(
        Modifier.size(size).rotate(angle).drawBehind {
          val w = 3.dp.toPx()
          drawCircle(Brush.sweepGradient(listOf(cs.primary, cs.tertiary, cs.secondary, cs.primary)), radius = this.size.minDimension / 2 - w / 2, style = Stroke(w))
        },
      )
    }
    val inner = if (listening) size - 10.dp else size
    Cover(url, Modifier.size(inner), AvatarShape, Res.drawable.ic_person)
  }
}

/** "Сейчас слушают": friends as a row of photos on the home screen; those listening come first. */
@Composable
fun FriendsRow() {
  val nav = LocalNav.current
  val friends by Friends.list.collectAsStateWithLifecycle()
  LaunchedEffect(Unit) { while (true) { Friends.refresh(); delay(30_000) } }
  if (friends.isEmpty()) return
  val listening = friends.count { it.now?.playing == true }
  SectionTitle(
    tr("Друзья"),
    if (listening > 0) tr("Сейчас слушают: {}", listening) else null,
  ) { TextButton(onClick = { nav.route("friends") }) { Text(tr("Все")) } }
  LazyRow(contentPadding = PaddingValues(horizontal = 12.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
    items(friends, key = { it.id }) { f -> FriendBubble(f) { nav.route("user/${f.id.encodeURLParameter()}") } }
  }
}

@Composable
private fun FriendBubble(f: Friend, onClick: () -> Unit) {
  val cs = MaterialTheme.colorScheme
  val now = f.now
  Column(
    Modifier.width(92.dp).clip(RoundedCornerShape(20.dp)).clickable(onClick = onClick).padding(vertical = 6.dp),
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Box {
      FriendAvatar(f.avatarUrl, 72.dp, listening = now?.playing == true)
      // the cover of what they play, pinned to the photo
      if (now != null) Cover(
        now.track.coverUrl,
        Modifier.align(Alignment.BottomEnd).offset(x = 4.dp, y = 2.dp).size(30.dp).border(2.dp, cs.background, RoundedCornerShape(9.dp)),
        RoundedCornerShape(9.dp),
      )
      if (f.jamId != null) Box(
        Modifier.align(Alignment.TopEnd).size(24.dp).clip(CircleShape).background(cs.tertiary),
        contentAlignment = Alignment.Center,
      ) { Ico(Res.drawable.ic_headphones, null, Modifier.size(14.dp), cs.onTertiary) }
    }
    Spacer(Modifier.height(6.dp))
    Text(f.name, style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
    Text(
      now?.track?.title ?: fmtAgo(f.lastSeenAt),
      style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = TextOverflow.Ellipsis,
      color = if (now?.playing == true) cs.primary else cs.onSurfaceVariant,
    )
  }
}

/** The inbox button with the number of new things friends sent. */
@Composable
fun InboxButton() {
  val nav = LocalNav.current
  val items by Inbox.items.collectAsStateWithLifecycle()
  val unread = Inbox.unread(items)
  IconButton(onClick = { nav.route("inbox") }) {
    BadgedBox(badge = { if (unread > 0) Badge { Text("$unread") } }) { Ico(Res.drawable.ic_inbox, tr("Входящие")) }
  }
}

/* ---------- all friends ---------- */

@Composable
fun FriendsScreen() {
  val nav = LocalNav.current
  val friends by Friends.list.collectAsStateWithLifecycle()
  val jams = rememberLoad(Unit) { Api.jams() }
  LaunchedEffect(Unit) { Friends.refresh() }
  Page {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = screenPadding(top = 60.dp, bottom = 24.dp)) {
      item { FlowText(tr("Друзья"), MaterialTheme.typography.headlineMedium, Modifier.padding(horizontal = 20.dp), maxLines = 1) }
      item { Box(Modifier.padding(horizontal = 16.dp, vertical = 10.dp)) { GameCard { nav.route("game") } } }
      val sessions = jams.data.orEmpty()
      if (sessions.isNotEmpty()) {
        item { SectionTitle(tr("Слушают вместе")) }
        items(sessions, key = { "jam:" + it.id }) { j -> JamRow(j) }
      }
      item { SectionTitle(tr("Все на сервере")) }
      if (friends.isEmpty()) item { Text(tr("Пока никого — пригласите друзей кодом из админки"), Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
      items(friends, key = { it.id }) { f ->
        Row(
          Modifier.fillMaxWidth().clickable { nav.route("user/${f.id.encodeURLParameter()}") }.padding(horizontal = 16.dp, vertical = 8.dp),
          verticalAlignment = Alignment.CenterVertically,
        ) {
          FriendAvatar(f.avatarUrl, 56.dp, f.now?.playing == true)
          Spacer(Modifier.width(14.dp))
          Column(Modifier.weight(1f)) {
            Text(f.name, style = MaterialTheme.typography.titleMedium)
            val n = f.now
            Text(
              if (n != null) (if (n.playing) "♪ " else "❚❚ ") + "${n.track.title} · ${n.track.artists}" else tr("был(а) {}", fmtAgo(f.lastSeenAt)),
              style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis,
              color = if (n?.playing == true) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            )
          }
        }
      }
    }
  }
}

/** A session friends are listening in, with a button to join. */
@Composable
fun JamRow(j: JamSummary) {
  val cs = MaterialTheme.colorScheme
  val view by Jam.view.collectAsStateWithLifecycle()
  val inside = view?.id == j.id
  Row(
    Modifier.padding(horizontal = 16.dp, vertical = 6.dp).fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(cs.tertiaryContainer).padding(12.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Cover(j.track?.coverUrl, Modifier.size(52.dp), RoundedCornerShape(14.dp))
    Spacer(Modifier.width(12.dp))
    Column(Modifier.weight(1f)) {
      Text(j.members.joinToString(", ") { it.displayName }, style = MaterialTheme.typography.titleSmall, color = cs.onTertiaryContainer, maxLines = 1, overflow = TextOverflow.Ellipsis)
      Text(j.track?.let { "${it.title} · ${it.artists}" } ?: "", style = MaterialTheme.typography.bodySmall, color = cs.onTertiaryContainer.copy(alpha = 0.8f), maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
    if (inside) Text(tr("Вы здесь"), style = MaterialTheme.typography.labelLarge, color = cs.onTertiaryContainer)
    else Button(onClick = { act(tr("Вы слушаете вместе")) { Jam.join(j.id) } }, shapes = ButtonDefaults.shapes()) { Text(tr("Войти")) }
  }
}

/* ---------- a friend's page ---------- */

@Composable
fun FriendScreen(id: String) {
  val nav = LocalNav.current
  val loader = rememberLoad(id) { Api.friend(id) }
  val cs = MaterialTheme.colorScheme
  val scope = rememberCoroutineScope()
  Page {
    Loaded(loader) { p ->
      LazyColumn(Modifier.fillMaxSize(), contentPadding = screenPadding(top = 56.dp, bottom = 24.dp)) {
        item {
          Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            FriendAvatar(p.avatarUrl, 132.dp, listening = p.now?.playing == true)
            Spacer(Modifier.height(12.dp))
            FlowText(p.name, MaterialTheme.typography.headlineMedium, maxLines = 1)
            Text(
              "@${p.username} · " + if (p.now?.playing == true) tr("слушает сейчас") else tr("был(а) {}", fmtAgo(p.lastSeenAt)),
              style = MaterialTheme.typography.bodyMedium, color = cs.onSurfaceVariant, textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
              Button(shapes = ButtonDefaults.shapes(), onClick = {
                scope.launch { runCatching { PlayerConn.startWave("friend:$id") }.onFailure { App.say(it.message ?: tr("Не получилось")) } }
              }) {
                Ico(Res.drawable.ic_sparkle, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(tr("Волна друга"))
              }
              p.jamId?.let { jam ->
                FilledTonalButton(shapes = ButtonDefaults.shapes(), onClick = { act(tr("Вы слушаете вместе")) { Jam.join(jam) } }) {
                  Ico(Res.drawable.ic_headphones, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(tr("Слушать вместе"))
                }
              }
            }
          }
        }
        p.now?.let { n -> item { NowCard(p.name, n, p.jamId) } }
        p.compat?.let { c -> item { CompatCard(p.name, c) } }
        item {
          Spacer(Modifier.height(8.dp))
          StatGrid(listOf(fmtListened(p.stats.minutes * 60_000L) to tr("музыки за месяц"), p.stats.likes.toString() to tr("треков в избранном")))
        }
        if (p.stats.topArtists.isNotEmpty()) item {
          SectionTitle(tr("Слушает чаще всего"))
          CardRow(p.stats.topArtists) { a -> MediaCard(a.name, "", a.imageUrl, { nav.artist(a.id) }, share = "artist:${a.id}", circle = true, width = 116.dp) }
        }
        if (p.stats.recent.isNotEmpty()) {
          item { SectionTitle(tr("Недавно слушал(а)")) }
          itemsIndexed(p.stats.recent) { i, t -> TrackRow(t, onClick = { PlayerConn.play(p.stats.recent, i, "user:$id") }) }
        }
        if (p.playlists.isNotEmpty()) item {
          SectionTitle(tr("Плейлисты"))
          CardRow(p.playlists) { pl -> MediaCard(pl.title, tracksWord(pl.trackCount), pl.coverUrl ?: pl.mosaic.firstOrNull(), { nav.playlist(pl.id) }, share = "playlist:${pl.id}", menu = { e, c -> PlaylistMenu(pl, e, c) }) }
        }
      }
    }
  }
}

/** What a friend plays right now: join them at the same moment, or listen together. */
@Composable
private fun NowCard(name: String, n: FriendNow, jamId: String?) {
  val cs = MaterialTheme.colorScheme
  Column(
    Modifier.padding(16.dp).fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(cs.secondaryContainer).padding(16.dp),
  ) {
    Text(if (n.playing) tr("{} слушает", name) else tr("{} поставил(а) на паузу", name), style = MaterialTheme.typography.labelLarge, color = cs.onSecondaryContainer)
    Spacer(Modifier.height(10.dp))
    Row(verticalAlignment = Alignment.CenterVertically) {
      Cover(n.track.coverUrl, Modifier.size(64.dp), RoundedCornerShape(16.dp))
      Spacer(Modifier.width(12.dp))
      Column(Modifier.weight(1f)) {
        Text(n.track.title, style = MaterialTheme.typography.titleMedium, color = cs.onSecondaryContainer, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Text(n.track.artists, style = MaterialTheme.typography.bodyMedium, color = cs.onSecondaryContainer.copy(alpha = 0.8f), maxLines = 1, overflow = TextOverflow.Ellipsis)
      }
      MorphPlayButton(false, {
        // the same track from the same moment
        PlayerConn.play(listOf(n.track), 0, "friend-now")
        if (n.positionMs > 3000) PlayerConn.seek(n.positionMs)
      }, 52.dp)
    }
    if (jamId == null) {
      Spacer(Modifier.height(8.dp))
      Text(tr("Нажмите ▶, чтобы включить с того же места"), style = MaterialTheme.typography.bodySmall, color = cs.onSecondaryContainer.copy(alpha = 0.7f))
    }
  }
}

fun compatLabel(label: String) = when (label) {
  "twins" -> tr("Музыкальные близнецы")
  "close" -> tr("Очень похожий вкус")
  "common" -> tr("Есть много общего")
  "different" -> tr("Разные вкусы — есть что открыть")
  else -> tr("Противоположности притягиваются")
}

/** How close two tastes are: a wavy ring filling to the score, the artists and tracks in common. */
@Composable
fun CompatCard(name: String, c: Compat) {
  val nav = LocalNav.current
  val cs = MaterialTheme.colorScheme
  val fill = remember { Animatable(0f) }
  LaunchedEffect(c.score) { fill.animateTo(c.score / 100f, tween(1400)) }
  Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp).fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(cs.primaryContainer).padding(18.dp)) {
    Row(verticalAlignment = Alignment.CenterVertically) {
      Box(contentAlignment = Alignment.Center) {
        CircularWavyProgressIndicator(progress = { fill.value }, modifier = Modifier.size(96.dp), color = cs.primary, trackColor = cs.onPrimaryContainer.copy(alpha = 0.15f))
        Text("${(fill.value * 100).toInt()}%", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = cs.onPrimaryContainer)
      }
      Spacer(Modifier.width(16.dp))
      Column(Modifier.weight(1f)) {
        Text(tr("Совместимость с {}", name), style = MaterialTheme.typography.labelLarge, color = cs.onPrimaryContainer.copy(alpha = 0.8f))
        Text(compatLabel(c.label), style = MaterialTheme.typography.titleLarge, color = cs.onPrimaryContainer)
      }
    }
    if (c.commonArtists.isNotEmpty()) {
      Spacer(Modifier.height(14.dp))
      Text(tr("Вы оба слушаете"), style = MaterialTheme.typography.labelLarge, color = cs.onPrimaryContainer)
      Spacer(Modifier.height(8.dp))
      FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        c.commonArtists.forEach { a ->
          Row(
            Modifier.clip(CircleShape).background(cs.surface.copy(alpha = 0.5f)).clickable { nav.artist(a.id) }.padding(end = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
          ) {
            Cover(a.imageUrl, Modifier.size(32.dp), CircleShape, Res.drawable.ic_person)
            Spacer(Modifier.width(6.dp))
            Text(a.name, style = MaterialTheme.typography.labelLarge, color = cs.onPrimaryContainer, maxLines = 1)
          }
        }
      }
    }
    if (c.commonTracks.isNotEmpty()) {
      Spacer(Modifier.height(12.dp))
      FilledTonalButton(onClick = { PlayerConn.play(c.commonTracks, 0, "common") }, shapes = ButtonDefaults.shapes()) {
        Ico(Res.drawable.ic_play, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(tr("Общие треки · {}", c.commonTracks.size))
      }
    }
  }
}

/* ---------- inbox ---------- */

@Composable
fun InboxScreen() {
  val items by Inbox.items.collectAsStateWithLifecycle()
  LaunchedEffect(Unit) {
    Inbox.refresh()
    delay(1500)
    Inbox.markSeen()
  }
  Page {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = screenPadding(top = 60.dp, bottom = 24.dp)) {
      item { FlowText(tr("Входящие"), MaterialTheme.typography.headlineMedium, Modifier.padding(horizontal = 20.dp), maxLines = 1) }
      item {
        Text(
          tr("Треки, альбомы и плейлисты, которые вам отправили друзья. Отправить своё — «Отправить другу» в меню ⋮."),
          Modifier.padding(horizontal = 20.dp, vertical = 6.dp), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
      }
      if (items.isEmpty()) item { Box(Modifier.fillMaxWidth().padding(40.dp), contentAlignment = Alignment.Center) { Ico(Res.drawable.ic_inbox, null, Modifier.size(64.dp), MaterialTheme.colorScheme.outline) } }
      items(items, key = { it.id }) { s -> ShareCard(s) }
    }
  }
}

@Composable
private fun ShareCard(s: Share) {
  val nav = LocalNav.current
  val cs = MaterialTheme.colorScheme
  val o = s.item ?: return
  Column(
    Modifier.padding(horizontal = 16.dp, vertical = 6.dp).fillMaxWidth().clip(RoundedCornerShape(24.dp))
      .background(if (s.seen) cs.surfaceContainer else cs.secondaryContainer).padding(14.dp).animateContentSize(),
  ) {
    Row(verticalAlignment = Alignment.CenterVertically) {
      // a notice from the server itself (a new release) has no sender
      if (s.from == null) Box(Modifier.size(36.dp).clip(LogoShape).background(cs.primary), contentAlignment = Alignment.Center) {
        Ico(when (s.kind) { "digest" -> Res.drawable.ic_chart; "concert" -> Res.drawable.ic_event; else -> Res.drawable.ic_campaign }, null, Modifier.size(20.dp), cs.onPrimary)
      }
      else FriendAvatar(s.from.avatarUrl, 36.dp)
      Spacer(Modifier.width(10.dp))
      Column(Modifier.weight(1f)) {
        Text(
          s.from?.displayName ?: when (s.kind) { "release" -> tr("Новый релиз"); "digest" -> tr("Итоги недели"); "concert" -> tr("Концерт рядом"); else -> "avr music" },
          style = MaterialTheme.typography.titleSmall,
        )
        Text(fmtAgo(s.createdAt), style = MaterialTheme.typography.labelSmall, color = cs.onSurfaceVariant)
      }
      if (!s.seen) Box(Modifier.size(10.dp).clip(CircleShape).background(cs.primary))
    }
    val note = s.message.takeIf { it.isNotBlank() && it != "invite" && s.from != null && s.kind != "report" }
    if (note != null) {
      Spacer(Modifier.height(8.dp))
      Text(
        note, Modifier.clip(RoundedCornerShape(topStart = 4.dp, topEnd = 18.dp, bottomEnd = 18.dp, bottomStart = 18.dp)).background(cs.surface).padding(horizontal = 12.dp, vertical = 8.dp),
        style = MaterialTheme.typography.bodyLarge,
      )
    }
    if (s.message == "invite") {
      Spacer(Modifier.height(6.dp))
      Text(tr("Приглашает вести плейлист вместе — вы можете добавлять и убирать треки"), style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant)
    }
    Spacer(Modifier.height(10.dp))
    when (s.kind) {
      "track" -> o.decodeAs(Track.serializer())?.let { t ->
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).clickable { PlayerConn.play(listOf(t), 0, "share") }, verticalAlignment = Alignment.CenterVertically) {
          Cover(t.coverUrl, Modifier.size(56.dp), RoundedCornerShape(14.dp))
          Spacer(Modifier.width(12.dp))
          Column(Modifier.weight(1f)) {
            Text(t.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(t.artists, style = MaterialTheme.typography.bodyMedium, color = cs.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
          }
          LikeButton("track", t.id)
          MorphPlayButton(false, { PlayerConn.play(listOf(t), 0, "share") }, 44.dp)
        }
      }
      "album" -> o.decodeAs(AlbumSummary.serializer())?.let { a -> SharedItem(a.coverUrl, a.title, a.artist.name) { nav.album(a.id) } }
      "artist" -> o.decodeAs(ArtistSummary.serializer())?.let { a -> SharedItem(a.imageUrl, a.name, tr("Исполнитель"), circle = true) { nav.artist(a.id) } }
      "playlist" -> o.decodeAs(PlaylistSummary.serializer())?.let { p -> SharedItem(p.coverUrl ?: p.mosaic.firstOrNull(), p.title, tracksWord(p.trackCount)) { nav.playlist(p.id) } }
      "jam" -> o.decodeAs(JamSummary.serializer())?.let { j -> JamRow(j) }
      "game" -> {
        fun num(k: String) = (o[k] as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull() ?: 0
        val id = (o["id"] as? kotlinx.serialization.json.JsonPrimitive)?.content.orEmpty()
        Row(verticalAlignment = Alignment.CenterVertically) {
          Ico(Res.drawable.ic_quiz, null, Modifier.size(32.dp), cs.tertiary)
          Spacer(Modifier.width(12.dp))
          Column(Modifier.weight(1f)) {
            Text(tr("Угадай мелодию"), style = MaterialTheme.typography.titleMedium)
            Text(tr("{} · раундов: {}", plural(num("players"), tr("игрок"), tr("игрока"), tr("игроков")), num("rounds")), style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant)
          }
          Button(onClick = { act { GameRoom.join(id); nav.route("game") } }, shapes = ButtonDefaults.shapes()) { Text(tr("Играть")) }
        }
      }
      "digest" -> DigestCard(o)
      "concert" -> {
        fun str(k: String) = (o[k] as? kotlinx.serialization.json.JsonPrimitive)?.content
        SharedItem(str("imageUrl"), "${str("artist").orEmpty()} — ${str("title").orEmpty()}", listOfNotNull(str("date"), str("place")).joinToString(" · ")) {
          str("url")?.let { space.avthsr.music.Platform.openUrl(it) }
        }
      }
      "release" -> {
        fun str(k: String) = (o[k] as? kotlinx.serialization.json.JsonPrimitive)?.content
        val lib = str("libraryAlbumId")
        val cid = str("id")?.toLongOrNull()
        SharedItem(str("coverUrl"), str("title").orEmpty(), listOfNotNull(str("artist"), albumType(str("type") ?: "album"), str("year")).joinToString(" · ")) {
          if (lib != null) nav.album(lib) else if (cid != null) nav.catalogAlbum(cid)
        }
      }
      "report" -> o.decodeAs(Track.serializer())?.let { t ->
        Text(reportReason(s.message), style = MaterialTheme.typography.labelLarge, color = cs.error)
        Spacer(Modifier.height(6.dp))
        SharedItem(t.coverUrl, t.title, t.artists) { nav.route("admin") }
      }
    }
  }
}

@Composable
private fun SharedItem(cover: String?, title: String, subtitle: String, circle: Boolean = false, onClick: () -> Unit) {
  Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).clickable(onClick = onClick), verticalAlignment = Alignment.CenterVertically) {
    Cover(cover, Modifier.size(56.dp), if (circle) ArtistShape else RoundedCornerShape(14.dp), if (circle) Res.drawable.ic_person else Res.drawable.ic_album)
    Spacer(Modifier.width(12.dp))
    Column(Modifier.weight(1f)) {
      Text(title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
      Text(subtitle, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
    Ico(Res.drawable.ic_back, null, Modifier.size(20.dp).rotate(180f), MaterialTheme.colorScheme.onSurfaceVariant)
  }
}

/* ---------- sending to friends ---------- */

/** Pick friends, add a word, send: they get a notification and find it in their inbox. */
@Composable
fun SendDialog(kind: String, refId: String, title: String, onDone: () -> Unit) {
  val friends by Friends.list.collectAsStateWithLifecycle()
  LaunchedEffect(Unit) { Friends.refresh() }
  val picked = remember { mutableStateListOf<String>() }
  var message by remember { mutableStateOf("") }
  AlertDialog(
    onDismissRequest = onDone,
    title = { Text(tr("Отправить другу")) },
    text = {
      Column {
        Text(title, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Spacer(Modifier.height(8.dp))
        if (friends.isEmpty()) Text(tr("Друзей пока нет"), color = MaterialTheme.colorScheme.onSurfaceVariant)
        LazyColumn(Modifier.heightIn(max = 260.dp)) {
          items(friends, key = { it.id }) { f ->
            val on = f.id in picked
            Row(
              Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).clickable { if (on) picked.remove(f.id) else picked.add(f.id) }.padding(vertical = 4.dp),
              verticalAlignment = Alignment.CenterVertically,
            ) {
              FriendAvatar(f.avatarUrl, 40.dp)
              Spacer(Modifier.width(10.dp))
              Text(f.name, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
              Checkbox(checked = on, onCheckedChange = { if (it) picked.add(f.id) else picked.remove(f.id) })
            }
          }
        }
        HorizontalDivider(Modifier.padding(vertical = 8.dp))
        OutlinedTextField(message, { message = it.take(500) }, label = { Text(tr("Пара слов (необязательно)")) }, modifier = Modifier.fillMaxWidth(), maxLines = 3)
      }
    },
    confirmButton = {
      TextButton(enabled = picked.isNotEmpty(), onClick = {
        val to = picked.toList()
        val text = message
        onDone()
        act(if (to.size == 1) tr("Отправлено") else tr("Отправлено: {}", to.size)) { Api.sendShare(to, kind, refId, text) }
      }) { Ico(Res.drawable.ic_send, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(tr("Отправить")) }
    },
    dismissButton = { TextButton(onClick = onDone) { Text(tr("Отмена")) } },
  )
}

/* ---------- shared playlists ---------- */

/** Who may add and remove tracks besides the owner; the owner invites friends here. */
@Composable
fun MembersDialog(p: Playlist, onChanged: () -> Unit, onDone: () -> Unit) {
  val friends by Friends.list.collectAsStateWithLifecycle()
  LaunchedEffect(Unit) { Friends.refresh() }
  val own = p.isOwner == true || p.owner?.id == Api.user?.id
  val members = p.members.map { it.id }.toSet()
  AlertDialog(
    onDismissRequest = onDone,
    title = { Text(tr("Плейлист вместе")) },
    text = {
      Column {
        Text(
          tr("Участники добавляют и убирают треки, рядом с каждым видно, кто его добавил."),
          style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(10.dp))
        LazyColumn(Modifier.heightIn(max = 320.dp)) {
          items(friends, key = { it.id }) { f ->
            val inside = f.id in members
            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
              FriendAvatar(f.avatarUrl, 40.dp)
              Spacer(Modifier.width(10.dp))
              Column(Modifier.weight(1f)) {
                Text(f.name, style = MaterialTheme.typography.bodyLarge)
                if (inside) Text(tr("участник"), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
              }
              if (own) {
                if (inside) TextButton(onClick = { act(tr("{} больше не участник", f.name), onChanged) { Api.removeMember(p.id, f.id) } }) { Text(tr("Убрать")) }
                else TextButton(onClick = { act(tr("{} приглашён(а)", f.name), onChanged) { Api.addMember(p.id, f.id) } }) { Text(tr("Пригласить")) }
              }
            }
          }
        }
      }
    },
    confirmButton = { TextButton(onClick = onDone) { Text(tr("Готово")) } },
    dismissButton = if (!own && Api.user?.id in members) {
      { TextButton(onClick = { onDone(); act(tr("Вы вышли из плейлиста"), onChanged) { Api.removeMember(p.id, Api.user!!.id) } }) { Text(tr("Выйти")) } }
    } else null,
  )
}

/** The members' photos in a row, overlapping a little. */
@Composable
fun MemberFaces(p: Playlist, onClick: () -> Unit) {
  val cs = MaterialTheme.colorScheme
  Row(
    Modifier.clip(CircleShape).clickable(onClick = onClick).padding(horizontal = 6.dp, vertical = 4.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    val faces = listOfNotNull(p.owner?.let { o -> p.members.firstOrNull { it.id == o.id } }) + p.members
    faces.distinctBy { it.id }.take(5).forEachIndexed { i, m ->
      Cover(m.avatarUrl, Modifier.offset(x = (-8 * i).dp).size(30.dp).border(2.dp, cs.background, CircleShape), CircleShape, Res.drawable.ic_person)
    }
    Spacer(Modifier.width(2.dp))
    Ico(Res.drawable.ic_person_add, tr("Участники"), Modifier.size(20.dp), cs.primary)
  }
}

/** A blend: pick up to four friends — a playlist you all own, filled from everyone's taste every day. */
@Composable
fun BlendDialog(onCreated: (String) -> Unit, onDone: () -> Unit) {
  val friends by Friends.list.collectAsStateWithLifecycle()
  LaunchedEffect(Unit) { Friends.refresh() }
  val picked = remember { mutableStateListOf<String>() }
  AlertDialog(
    onDismissRequest = onDone,
    title = { Text(tr("Блендер")) },
    text = {
      Column {
        Text(tr("Общий плейлист из ваших вкусов: любимое каждого и то, что вы слушаете оба. Обновляется каждый день, все — владельцы."), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(8.dp))
        LazyColumn(Modifier.heightIn(max = 280.dp)) {
          items(friends, key = { it.id }) { f ->
            val on = f.id in picked
            Row(
              Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).clickable { if (on) picked.remove(f.id) else if (picked.size < 4) picked.add(f.id) }.padding(vertical = 4.dp),
              verticalAlignment = Alignment.CenterVertically,
            ) {
              FriendAvatar(f.avatarUrl, 40.dp)
              Spacer(Modifier.width(10.dp))
              Text(f.name, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
              Checkbox(checked = on, onCheckedChange = { if (it && picked.size < 4) picked.add(f.id) else picked.remove(f.id) })
            }
          }
        }
      }
    },
    confirmButton = {
      TextButton(enabled = picked.isNotEmpty(), onClick = {
        val ids = picked.toList()
        onDone()
        act(tr("Блендер готов")) { onCreated(Api.createBlend(ids).id) }
      }) { Text(tr("Смешать")) }
    },
    dismissButton = { TextButton(onClick = onDone) { Text(tr("Отмена")) } },
  )
}

/** The Sunday digest: the listener's minutes and song of the week, the company's song, who listened most. */
@Composable
private fun DigestCard(o: kotlinx.serialization.json.JsonObject) {
  val cs = MaterialTheme.colorScheme
  fun num(k: String) = (o[k] as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull() ?: 0
  val my = (o["myTop"] as? kotlinx.serialization.json.JsonObject)?.decodeAs(Track.serializer())
  val group = (o["groupTop"] as? kotlinx.serialization.json.JsonObject)?.decodeAs(Track.serializer())
  val leader = o["leader"] as? kotlinx.serialization.json.JsonObject
  val leaderName = ((leader?.get("user") as? kotlinx.serialization.json.JsonObject)?.get("displayName") as? kotlinx.serialization.json.JsonPrimitive)?.content
  val leaderMin = (leader?.get("minutes") as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull() ?: 0
  Text(tr("{} мин музыки за неделю", num("minutes")), style = MaterialTheme.typography.headlineSmall, color = cs.primary)
  Spacer(Modifier.height(8.dp))
  my?.let { t ->
    Text(tr("Ваш трек недели · {} раз", num("myTopPlays")), style = MaterialTheme.typography.labelLarge, color = cs.onSurfaceVariant)
    SharedItem(t.coverUrl, t.title, t.artists) { PlayerConn.play(listOf(t), 0, "share") }
    Spacer(Modifier.height(6.dp))
  }
  group?.let { t ->
    Text(tr("Трек компании"), style = MaterialTheme.typography.labelLarge, color = cs.onSurfaceVariant)
    SharedItem(t.coverUrl, t.title, t.artists) { PlayerConn.play(listOf(t), 0, "share") }
    Spacer(Modifier.height(6.dp))
  }
  if (leaderName != null) Text(tr("Больше всех слушал(а) {} — {} мин", leaderName, leaderMin), style = MaterialTheme.typography.bodyMedium, color = cs.onSurfaceVariant)
}
