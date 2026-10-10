package space.avthsr.music.ui

import org.jetbrains.compose.resources.DrawableResource
import space.avthsr.music.Pick
import space.avthsr.music.Platform
import space.avthsr.music.rememberPicker

import space.avthsr.music.tr
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
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import space.avthsr.music.App
import space.avthsr.music.res.*
import space.avthsr.music.api.Api
import space.avthsr.music.api.myBadges
import space.avthsr.music.api.Yandex
import space.avthsr.music.api.importLibrary
import space.avthsr.music.api.Likes
import space.avthsr.music.api.changePassword
import space.avthsr.music.api.clearHistory
import space.avthsr.music.api.history
import space.avthsr.music.api.importLink
import space.avthsr.music.api.myStats
import space.avthsr.music.api.removeAvatar
import space.avthsr.music.api.updateProfile
import space.avthsr.music.api.uploadAvatarSquare
import space.avthsr.music.player.PlayerConn

@Composable
fun ProfileScreen() {
  val nav = LocalNav.current
  val session by Api.session.collectAsStateWithLifecycle()
  val u = session?.user ?: return
  val cs = MaterialTheme.colorScheme
  var editName by remember { mutableStateOf(false) }
  var editPassword by remember { mutableStateOf(false) }
  var avatarMenu by remember { mutableStateOf(false) }
  var logout by remember { mutableStateOf(false) }
  var importLink by remember { mutableStateOf(false) }
  val stats = rememberLoad(Unit) { Api.myStats() }
  val badges = rememberLoad(Unit) { Api.myBadges() }
  val pickAvatar = rememberPicker(Pick.IMAGE) { f ->
    f.firstOrNull()?.let { file -> act(tr("Аватар обновлён")) { Api.uploadAvatarSquare(file) } }
  }

  Page(back = false) {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = screenPadding(top = 16.dp, bottom = 24.dp)) {
      item {
        Row(Modifier.padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically) {
          Box {
            Cover(u.avatarUrl, Modifier.size(88.dp).clickable { avatarMenu = true }, AvatarShape, Res.drawable.ic_person)
            DropdownMenu(expanded = avatarMenu, onDismissRequest = { avatarMenu = false }) {
              DropdownMenuItem(text = { Text(tr("Выбрать фото")) }, onClick = { avatarMenu = false; pickAvatar() })
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
      badges.data?.takeIf { it.isNotEmpty() }?.let { list -> item { Box(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp)) { BadgeChips(list) } } }
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
      item { SectionTitle(tr("Музыка и друзья")) }
      item {
        Column(Modifier.padding(horizontal = 16.dp)) {
          ProfileItem(Res.drawable.ic_chart, tr("Итоги"), tr("Ваш месяц и год в музыке — истории, которыми можно поделиться")) { nav.route("recap") }
          val inbox by space.avthsr.music.api.Inbox.items.collectAsStateWithLifecycle()
          val fresh = space.avthsr.music.api.Inbox.unread(inbox)
          ProfileItem(Res.drawable.ic_inbox, tr("Входящие"), if (fresh > 0) tr("Новых: {}", fresh) else tr("Что вам отправили друзья")) { nav.route("inbox") }
          ProfileItem(Res.drawable.ic_group, tr("Друзья"), tr("Кто что слушает, совместимость вкусов, волна друга")) { nav.route("friends") }
          ProfileItem(Res.drawable.ic_quiz, tr("Угадай мелодию"), tr("Игра с друзьями на скорость")) { nav.route("game") }
          ProfileItem(Res.drawable.ic_event, tr("Концерты"), tr("Ваши исполнители в вашем городе")) { nav.route("concerts") }
          ProfileItem(Res.drawable.ic_mic, tr("Распознать песню"), tr("Узнать, что играет рядом")) { nav.route("recognize") }
          ProfileItem(Res.drawable.ic_import, tr("Перенести музыку"), tr("Всё из Spotify, Яндекс Музыки и ВК: лайки, плейлисты, исполнители")) { nav.route("transfer") }
          ProfileItem(Res.drawable.ic_alarm, tr("Будильник"), alarmLine()) { nav.route("alarm") }
        }
      }
      item { SectionTitle(tr("Аккаунт")) }
      item {
        Column(Modifier.padding(horizontal = 16.dp)) {
          if (u.isAdmin) ProfileItem(Res.drawable.ic_settings, tr("Админ-панель"), tr("Пользователи, приглашения, загрузки, аккаунты YouTube, треки")) { nav.route("admin") }
          val news by space.avthsr.music.api.News.items.collectAsStateWithLifecycle()
          val newsSeen by space.avthsr.music.api.News.seen.collectAsStateWithLifecycle()
          val unread = space.avthsr.music.api.News.unread(news, newsSeen).size
          ProfileItem(Res.drawable.ic_campaign, tr("Новости"), if (unread > 0) tr("Новых: {}", unread) else tr("Что пишет администратор")) { nav.route("news") }
          ProfileItem(Res.drawable.ic_queue, tr("История прослушиваний"), tr("Что и когда вы слушали")) { nav.route("history") }
          ProfileItem(Res.drawable.ic_download, tr("Загрузки на сервер"), tr("Что сейчас качается и кто в очереди")) { nav.jobs() }
          ProfileItem(Res.drawable.ic_palette, tr("Оформление"), tr("Язык, тема, цвета, скорость, канвасы")) { nav.route("settings") }
          ProfileItem(Res.drawable.ic_link, tr("Сервисы"), tr("Telegram-бот и статус, Last.fm, город для концертов")) { nav.route("connections") }
          ProfileItem(Res.drawable.ic_download, tr("Помочь с загрузками"), tr("Дать запасной аккаунт YouTube — треки будут качаться быстрее")) { nav.route("give-accounts") }
          ProfileItem(Res.drawable.ic_offline, tr("Скачанные"), tr("Треки, сохранённые в приложении")) { nav.downloads() }
          ProfileItem(Res.drawable.ic_person, tr("Имя и email"), u.displayName.ifBlank { u.username }) { editName = true }
          ProfileItem(Res.drawable.ic_settings, tr("Сменить пароль"), "") { editPassword = true }
          ProfileItem(Res.drawable.ic_logout, tr("Выйти"), "") { logout = true }
          Spacer(Modifier.height(16.dp))
          Text(tr("avr music для {} {}", Platform.name, Platform.version), style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant)
          val update by space.avthsr.music.player.AppUpdate.available.collectAsStateWithLifecycle()
          update?.let { r -> TextButton(onClick = { space.avthsr.music.player.AppUpdate.prompt.value = true }) { Text(tr("Обновить до {}", r.version)) } }
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

  if (importLink) ImportLinkDialog { importLink = false }

  if (logout) ConfirmDialog(tr("Выйти из аккаунта?"), tr("Музыка остановится, вход понадобится снова."), tr("Выйти"), { logout = false }) {
    App.scope.launch {
      PlayerConn.stop()
      Api.logout()
      Likes.clear()
    }
  }
}

@Composable
fun ProfileItem(icon: DrawableResource, title: String, subtitle: String, onClick: () -> Unit) {
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
            if (list.isNotEmpty()) IconButton(onClick = { clear = true }) { Ico(Res.drawable.ic_close, tr("Очистить")) }
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

/** A playlist or album from Yandex Music or Spotify, by its link: it becomes a playlist here, missing tracks are fetched. */
@Composable
fun ImportLinkDialog(onDone: () -> Unit) {
  val nav = LocalNav.current
  FormDialog(
    tr("Импорт по ссылке"),
    listOf(Field(tr("Ссылка на плейлист, альбом или трек"), "")),
    confirm = tr("Импортировать"),
    onDismiss = onDone,
  ) { v ->
    val url = v[0].trim()
    if (!url.startsWith("http")) { App.say(tr("Вставьте ссылку из Яндекс Музыки или Spotify")); return@FormDialog }
    onDone()
    act(tr("Импорт начат — плейлист появится в медиатеке"), { nav.jobs() }) {
      // Yandex keeps its music closed to the server abroad: the phone reads the playlist itself
      if ("music.yandex." in url) Api.importLibrary(emptyList(), listOf(Yandex.byLink(url)), emptyList(), emptyList())
      else Api.importLink(url)
    }
  }
}
