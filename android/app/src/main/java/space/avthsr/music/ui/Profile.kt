package space.avthsr.music.ui

import space.avthsr.music.tr
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import space.avthsr.music.App
import space.avthsr.music.BuildConfig
import space.avthsr.music.R
import space.avthsr.music.api.Api
import space.avthsr.music.api.Likes
import space.avthsr.music.api.changePassword
import space.avthsr.music.api.clearHistory
import space.avthsr.music.api.history
import space.avthsr.music.api.myStats
import space.avthsr.music.api.removeAvatar
import space.avthsr.music.api.updateProfile
import space.avthsr.music.api.uploadAvatarSquare
import space.avthsr.music.player.PlayerConn

@Composable
fun ProfileScreen() {
  val nav = LocalNav.current
  val context = LocalContext.current
  val session by Api.session.collectAsStateWithLifecycle()
  val u = session?.user ?: return
  val cs = MaterialTheme.colorScheme
  var editName by remember { mutableStateOf(false) }
  var editPassword by remember { mutableStateOf(false) }
  var avatarMenu by remember { mutableStateOf(false) }
  var logout by remember { mutableStateOf(false) }
  val stats = rememberLoad(Unit) { Api.myStats() }
  val pickAvatar = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
    if (uri != null) act(tr("Аватар обновлён")) { Api.uploadAvatarSquare(context, uri) }
  }

  Page(back = false) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = screenPadding(top = 16.dp, bottom = 24.dp)) {
      item {
        Row(Modifier.padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically) {
          Box {
            Cover(u.avatarUrl, Modifier.size(88.dp).clickable { avatarMenu = true }, AvatarShape, R.drawable.ic_person)
            DropdownMenu(expanded = avatarMenu, onDismissRequest = { avatarMenu = false }) {
              DropdownMenuItem(text = { Text(tr("Выбрать фото")) }, onClick = { avatarMenu = false; pickAvatar.launch("image/*") })
              if (u.avatarUrl != null) DropdownMenuItem(text = { Text(tr("Убрать фото")) }, onClick = { avatarMenu = false; act(tr("Фото убрано")) { Api.removeAvatar() } })
            }
          }
          Spacer(Modifier.width(16.dp))
          Column(Modifier.weight(1f)) {
            Text(u.displayName.ifBlank { u.username }, style = MaterialTheme.typography.headlineSmall)
            Text("@${u.username}" + if (u.isAdmin) tr(" · администратор") else "", color = cs.onSurfaceVariant)
            Text(u.email, style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant)
          }
        }
      }
      val s = stats.data
      if (s != null) {
        item { SectionTitle(tr("Статистика")) }
        item { StatGrid(listOf(s.plays.toString() to tr("прослушиваний"), fmtListened(s.msListened) to tr("музыки всего"))) }
        if (s.topArtists.isNotEmpty()) item {
          SectionTitle(tr("Чаще всего слушаете"))
          CardRow(s.topArtists) { a -> MediaCard(a.name, "", a.imageUrl, { nav.artist(a.id) }, share = "artist:${a.id}", circle = true, width = 116.dp) }
        }
        if (s.topTracks.isNotEmpty()) {
          item { SectionTitle(tr("Любимые треки по прослушиваниям")) }
          itemsIndexed(s.topTracks.take(5)) { i, t -> TrackRow(t, onClick = { PlayerConn.play(s.topTracks, i, "top") }) }
        }
        if (s.topGenres.isNotEmpty()) item {
          Text(
            tr("Жанры: ") + s.topGenres.joinToString(", ") { it.name },
            Modifier.padding(horizontal = 20.dp, vertical = 8.dp), style = MaterialTheme.typography.bodyMedium, color = cs.onSurfaceVariant,
          )
        }
      }
      item { SectionTitle(tr("Аккаунт")) }
      item {
        Column(Modifier.padding(horizontal = 16.dp)) {
          if (u.isAdmin) ProfileItem(R.drawable.ic_settings, tr("Админ-панель"), tr("Пользователи, приглашения, загрузки, аккаунты YouTube, треки")) { nav.route("admin") }
          val news by space.avthsr.music.api.News.items.collectAsStateWithLifecycle()
          val newsSeen by space.avthsr.music.api.News.seen.collectAsStateWithLifecycle()
          val unread = space.avthsr.music.api.News.unread(news, newsSeen).size
          ProfileItem(R.drawable.ic_campaign, tr("Новости"), if (unread > 0) tr("Новых: {}", unread) else tr("Что пишет администратор")) { nav.route("news") }
          ProfileItem(R.drawable.ic_queue, tr("История прослушиваний"), tr("Что и когда вы слушали")) { nav.route("history") }
          ProfileItem(R.drawable.ic_download, tr("Загрузки на сервер"), tr("Что сейчас качается и кто в очереди")) { nav.jobs() }
          ProfileItem(R.drawable.ic_sparkle, tr("Предложка"), tr("Новая музыка для вас")) { nav.discover() }
          ProfileItem(R.drawable.ic_palette, tr("Оформление"), tr("Язык, тема, цвета, палитра, контраст, скорость")) { nav.route("settings") }
          ProfileItem(R.drawable.ic_offline, tr("Скачанные"), tr("Треки, сохранённые в приложении")) { nav.downloads() }
          ProfileItem(R.drawable.ic_person, tr("Имя и email"), u.displayName.ifBlank { u.username }) { editName = true }
          ProfileItem(R.drawable.ic_settings, tr("Сменить пароль"), "") { editPassword = true }
          ProfileItem(R.drawable.ic_logout, tr("Выйти"), "") { logout = true }
          Spacer(Modifier.height(16.dp))
          Text(tr("AVRmusic для Android {}", BuildConfig.VERSION_NAME), style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant)
        }
      }
    }
  }

  if (editName) FormDialog(
    tr("Имя и email"),
    listOf(Field(tr("Как вас называть"), u.displayName), Field("Email", u.email)),
    onDismiss = { editName = false },
  ) { v -> act(tr("Сохранено")) { Api.updateProfile(v[0], v[1]) } }

  if (editPassword) FormDialog(
    tr("Сменить пароль"),
    listOf(Field(tr("Текущий пароль"), password = true), Field(tr("Новый пароль"), password = true), Field(tr("Новый пароль ещё раз"), password = true)),
    onDismiss = { editPassword = false },
  ) { v ->
    when {
      v[1].length < 6 -> App.say(tr("Новый пароль — не короче 6 символов"))
      v[1] != v[2] -> App.say(tr("Пароли не совпадают"))
      else -> act(tr("Пароль изменён")) { Api.changePassword(v[0], v[1]) }
    }
  }

  if (logout) ConfirmDialog(tr("Выйти из аккаунта?"), tr("Музыка остановится, вход понадобится снова."), tr("Выйти"), { logout = false }) {
    App.scope.launch {
      PlayerConn.stop()
      Api.logout()
      Likes.clear()
    }
  }
}

@Composable
fun ProfileItem(icon: Int, title: String, subtitle: String, onClick: () -> Unit) {
  val cs = MaterialTheme.colorScheme
  Row(
    Modifier.fillMaxWidth().padding(vertical = 4.dp).clip(RoundedCornerShape(20.dp)).background(cs.surfaceContainer).clickable(onClick = onClick).padding(16.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Box(Modifier.size(40.dp).clip(RoundedCornerShape(14.dp)).background(cs.secondaryContainer), contentAlignment = Alignment.Center) {
      Ico(icon, null, Modifier.size(22.dp), cs.onSecondaryContainer)
    }
    Spacer(Modifier.width(14.dp))
    Column(Modifier.weight(1f)) {
      Text(title, style = MaterialTheme.typography.titleMedium)
      if (subtitle.isNotEmpty()) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant)
    }
  }
}

/** Everything the user played, newest first. */
@Composable
fun HistoryScreen() {
  var version by remember { mutableIntStateOf(0) }
  val loader = rememberLoad(version) { Api.history() }
  var clear by remember { mutableStateOf(false) }
  Page {
    Loaded(loader) { list ->
      LazyColumn(Modifier.fillMaxSize(), contentPadding = screenPadding(top = 56.dp, bottom = 24.dp)) {
        item {
          Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(tr("История"), style = MaterialTheme.typography.headlineMedium, modifier = Modifier.weight(1f))
            if (list.isNotEmpty()) IconButton(onClick = { clear = true }) { Ico(R.drawable.ic_close, tr("Очистить")) }
          }
        }
        if (list.isEmpty()) item { Text(tr("Пока пусто"), Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
        val tracks = list.map { it.track }
        itemsIndexed(list) { i, e ->
          TrackRow(e.track, onClick = { PlayerConn.play(tracks, i, "history") }, subtitle = "${e.track.artists} · ${fmtAgo(e.playedAt)}")
        }
      }
    }
  }
  if (clear) ConfirmDialog(tr("Очистить историю?"), tr("Статистика и «Моя волна» начнут учиться заново."), tr("Очистить"), { clear = false }) {
    act(tr("История очищена"), then = { version++ }) { Api.clearHistory() }
  }
}
