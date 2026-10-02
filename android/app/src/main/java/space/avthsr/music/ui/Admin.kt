@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalMaterial3ExpressiveApi::class)

package space.avthsr.music.ui

import space.avthsr.music.tr
import androidx.compose.material3.LinearWavyProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.ButtonDefaults
import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.LoadingIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import space.avthsr.music.App
import space.avthsr.music.R
import space.avthsr.music.api.AdminUser
import space.avthsr.music.api.Api
import space.avthsr.music.api.Invite
import space.avthsr.music.api.ServerJob
import space.avthsr.music.api.YtAccount
import space.avthsr.music.api.addYtAccount
import space.avthsr.music.api.adminActivity
import space.avthsr.music.api.adminDeleteCanvas
import space.avthsr.music.api.adminDeleteTrack
import space.avthsr.music.api.adminDeleteUser
import space.avthsr.music.api.adminFetchCanvas
import space.avthsr.music.api.adminFetchLyrics
import space.avthsr.music.api.adminLyricsFile
import space.avthsr.music.api.capabilities
import space.avthsr.music.api.reindex
import space.avthsr.music.api.scanLibrary
import androidx.compose.runtime.produceState
import space.avthsr.music.api.adminLyrics
import space.avthsr.music.api.adminPatchTrack
import space.avthsr.music.api.adminPatchUser
import space.avthsr.music.api.adminResetPassword
import space.avthsr.music.api.adminStats
import space.avthsr.music.api.adminTrackCanvas
import space.avthsr.music.api.adminTrackCover
import space.avthsr.music.api.adminTracks
import space.avthsr.music.api.adminUser
import space.avthsr.music.api.adminUsers
import space.avthsr.music.api.cancelJob
import space.avthsr.music.api.clientErrors
import space.avthsr.music.api.createInvite
import space.avthsr.music.api.deleteInvite
import space.avthsr.music.api.deleteYtAccount
import space.avthsr.music.api.fetchMissingCanvases
import space.avthsr.music.api.fetchMissingLyrics
import space.avthsr.music.api.importUrl
import space.avthsr.music.api.invites
import space.avthsr.music.api.jsonStrings
import space.avthsr.music.api.serverJobs
import space.avthsr.music.api.uploadTracks
import space.avthsr.music.api.wakeYtAccount
import space.avthsr.music.api.ytAccounts

private val adminTabs get() = listOf(tr("Обзор"), tr("Пользователи"), tr("Приглашения"), tr("Загрузки"), "YouTube", tr("Треки"), tr("Ошибки"))

@Composable
fun AdminScreen() {
  var tab by rememberSaveable { mutableIntStateOf(0) }
  Page {
    Column(Modifier.fillMaxSize()) {
      FlowText(tr("Админ-панель"), MaterialTheme.typography.headlineMedium, Modifier.padding(start = 60.dp, top = 10.dp, bottom = 6.dp), maxLines = 1)
      Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        adminTabs.forEachIndexed { i, label -> FilterChip(selected = tab == i, onClick = { tab = i }, label = { Text(label) }) }
      }
      Box(Modifier.weight(1f)) {
        when (tab) {
          0 -> AdminOverview()
          1 -> AdminUsers()
          2 -> AdminInvites()
          3 -> AdminDownloads()
          4 -> AdminYoutube()
          5 -> AdminTracks()
          else -> AdminErrors()
        }
      }
    }
  }
}

/* ---------- overview ---------- */

@Composable
private fun AdminOverview() {
  val stats = rememberLoad(Unit) { Api.adminStats() }
  val activity = rememberLoad(Unit) { Api.adminActivity() }
  LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = 8.dp, bottom = 24.dp)) {
    stats.data?.let { s ->
      item {
        StatGrid(
          listOf(
            s.tracks.toString() to tr("треков"), s.albums.toString() to tr("альбомов"),
            s.artists.toString() to tr("исполнителей"), s.users.toString() to tr("пользователей"),
            s.plays.toString() to tr("прослушиваний"), fmtBytes(s.storageBytes) to tr("музыки на диске"),
            s.withLyrics.toString() to tr("с текстом"), s.withCanvas.toString() to tr("с канвасом"),
          ),
        )
      }
    }
    activity.data?.let { a ->
      item {
        SectionTitle(tr("Активность"))
        StatGrid(
          listOf(
            a.activeUsers7d.toString() to tr("слушали за 7 дней"),
            "${a.jobs24h.done} / ${a.jobs24h.error}" to tr("задач за сутки: готово / ошибок"),
            "${a.jobs24h.running}" to tr("задач идёт"), "${a.jobs24h.queued}" to tr("в очереди"),
          ),
        )
        Spacer(Modifier.height(12.dp))
        Bars(a.daily.map { it.plays.toFloat() }, tr("Прослушивания за 30 дней · всего {}, {}", (a.daily.sumOf { it.plays }), (fmtListened(a.daily.sumOf { it.ms }))))
      }
      if (a.topTracks.isNotEmpty()) {
        item { SectionTitle(tr("Топ треков за месяц")) }
        items(a.topTracks) { t -> SimpleRow(t.title, t.artist, "${t.plays}") }
      }
      if (a.topArtists.isNotEmpty()) {
        item { SectionTitle(tr("Топ исполнителей")) }
        items(a.topArtists) { t -> SimpleRow(t.name, "", "${t.plays}") }
      }
      if (a.sources.isNotEmpty()) {
        item { SectionTitle(tr("Откуда музыка")) }
        items(a.sources) { s -> SimpleRow(s.source, tracksWord(s.tracks), fmtBytes(s.bytes)) }
      }
    }
    if (stats.state is Load.Loading) item { Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) { LoadingIndicator() } }
  }
}

@Composable
private fun SimpleRow(title: String, subtitle: String, trailing: String, onClick: (() -> Unit)? = null) {
  Row(
    Modifier.fillMaxWidth().clickable(enabled = onClick != null) { onClick?.invoke() }.padding(horizontal = 20.dp, vertical = 8.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Column(Modifier.weight(1f)) {
      Text(title, style = MaterialTheme.typography.bodyLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
      if (subtitle.isNotEmpty()) Text(subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
    if (trailing.isNotEmpty()) Text(trailing, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
  }
}

/* ---------- users ---------- */

private val userSorts get() = listOf(tr("Активность"), tr("Прослушивания"), tr("Добавили"), tr("Скачивания"))

@Composable
private fun AdminUsers() {
  val nav = LocalNav.current
  val loader = rememberLoad(Unit) { Api.adminUsers() }
  var sort by rememberSaveable { mutableIntStateOf(0) }
  LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = 8.dp, bottom = 24.dp)) {
    item {
      Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        userSorts.forEachIndexed { i, l -> FilterChip(selected = sort == i, onClick = { sort = i }, label = { Text(l) }) }
      }
    }
    val list = loader.data.orEmpty().sortedByDescending {
      when (sort) {
        1 -> it.plays.toLong()
        2 -> it.added.toLong()
        3 -> it.downloads.toLong()
        else -> parseTime(it.lastSeenAt) ?: 0L
      }
    }
    items(list) { u -> UserRow(u) { nav.route("admin/user/${u.id}") } }
    if (loader.state is Load.Loading) item { Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) { LoadingIndicator() } }
  }
}

@Composable
private fun UserRow(u: AdminUser, onClick: () -> Unit) {
  val cs = MaterialTheme.colorScheme
  Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
    Cover(u.avatarUrl, Modifier.size(48.dp), AvatarShape, R.drawable.ic_person)
    Spacer(Modifier.width(14.dp))
    Column(Modifier.weight(1f)) {
      Row(verticalAlignment = Alignment.CenterVertically) {
        Text(u.displayName.ifBlank { u.username }, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
        if (u.role == "admin") Badge(tr("админ"), cs.primary)
        if (u.disabled) Badge(tr("заблокирован"), cs.error)
      }
      Text(
        tr("@{} · был {} · {} прослушиваний · добавил {} · скачал {}", u.username, (fmtAgo(u.lastSeenAt)), u.plays, u.added, u.downloads),
        style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis,
      )
    }
  }
}

@Composable
private fun Badge(text: String, color: androidx.compose.ui.graphics.Color) {
  Text(
    text, style = MaterialTheme.typography.labelSmall, color = color,
    modifier = Modifier.padding(start = 6.dp).clip(RoundedCornerShape(6.dp)).background(color.copy(alpha = 0.14f)).padding(horizontal = 6.dp, vertical = 2.dp),
  )
}

@Composable
fun AdminUserScreen(id: String) {
  val nav = LocalNav.current
  var version by remember { mutableIntStateOf(0) }
  val loader = rememberLoad(id, version) { Api.adminUser(id) }
  var password by remember { mutableStateOf<String?>(null) }
  var confirmReset by remember { mutableStateOf(false) }
  var confirmDelete by remember { mutableStateOf(false) }
  val clipboard = LocalClipboardManager.current
  val me = Api.user?.id
  fun patch(ok: String, body: kotlinx.serialization.json.JsonObject) = act(ok, then = { version++ }) { Api.adminPatchUser(id, body) }
  Page {
    Loaded(loader) { d ->
      val u = d.user
      LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = 56.dp, bottom = 24.dp)) {
        item {
          Row(Modifier.padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically) {
            Cover(u.avatarUrl, Modifier.size(72.dp), AvatarShape, R.drawable.ic_person)
            Spacer(Modifier.width(16.dp))
            Column {
              Text(u.displayName.ifBlank { u.username }, style = MaterialTheme.typography.headlineSmall)
              Text("@${u.username} · ${u.email}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
              Text(tr("с нами с {} · был {}", (fmtDateTime(u.createdAt)), (fmtAgo(u.lastSeenAt))), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
          }
        }
        item {
          Spacer(Modifier.height(12.dp))
          StatGrid(
            listOf(
              u.plays.toString() to tr("прослушиваний"), fmtListened(u.msListened) to tr("музыки"),
              u.plays7d.toString() to tr("за 7 дней"), u.likes.toString() to tr("лайков"),
              u.added.toString() to tr("добавил треков"), "${u.downloads} · ${fmtBytes(u.downloadBytes)}" to tr("скачал"),
              u.playlists.toString() to tr("плейлистов"), "${d.jobs.done} / ${d.jobs.error}" to tr("задач: готово / ошибок"),
            ),
          )
          Spacer(Modifier.height(12.dp))
          Bars(d.daily.map { it.plays.toFloat() }, tr("Прослушивания по дням"))
        }
        item {
          SectionTitle(tr("Права"))
          Column(Modifier.padding(horizontal = 12.dp)) {
            CheckRow(tr("Администратор"), u.role == "admin") { on ->
              if (u.id == me) App.say(tr("Нельзя снять права с самого себя"))
              else patch(if (on) tr("Теперь администратор") else tr("Права сняты"), buildJsonObject { put("role", if (on) "admin" else "user") })
            }
            CheckRow(tr("Может добавлять треки на сервер"), u.canAcquire != false) { on -> patch(tr("Сохранено"), buildJsonObject { put("canAcquire", on) }) }
            CheckRow(tr("Заблокирован"), u.disabled) { on ->
              if (u.id == me) App.say(tr("Нельзя заблокировать самого себя"))
              else patch(if (on) tr("Заблокирован и вышел отовсюду") else tr("Разблокирован"), buildJsonObject { put("disabled", on) })
            }
          }
          Row(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilledTonalButton(shapes = ButtonDefaults.shapes(), onClick = { confirmReset = true }) { Text(tr("Сбросить пароль")) }
            if (u.id != me) OutlinedButton(shapes = ButtonDefaults.shapes(), onClick = { confirmDelete = true }) { Text(tr("Удалить"), color = MaterialTheme.colorScheme.error) }
          }
        }
        if (d.topArtists.isNotEmpty()) {
          item { SectionTitle(tr("Любимые исполнители")) }
          items(d.topArtists) { a -> SimpleRow(a.name, "", "${a.plays}") { nav.artist(a.id) } }
        }
        if (d.topTracks.isNotEmpty()) {
          item { SectionTitle(tr("Любимые треки")) }
          items(d.topTracks) { t -> SimpleRow(t.title, t.artist, "${t.plays}") }
        }
        if (d.recentPlays.isNotEmpty()) {
          item { SectionTitle(tr("Недавно слушал")) }
          items(d.recentPlays) { p -> SimpleRow(p.title, "${p.artist} · ${fmtAgo(p.playedAt)}", fmtTime(p.msPlayed)) }
        }
        if (d.added.isNotEmpty()) {
          item { SectionTitle(tr("Добавил на сервер")) }
          items(d.added) { a -> SimpleRow(a.title, "${a.artist} · ${fmtAgo(a.createdAt)}", "") }
        }
        if (d.downloads.isNotEmpty()) {
          item { SectionTitle(tr("Скачал")) }
          items(d.downloads) { x ->
            val kind = when (x.kind) { "album" -> tr("альбом"); "playlist" -> tr("плейлист"); "offline" -> tr("офлайн"); else -> tr("файл") }
            SimpleRow(x.title ?: x.refId ?: "—", "$kind · ${fmtAgo(x.createdAt)}", x.bytes?.let { fmtBytes(it) } ?: "")
          }
        }
      }
      if (confirmReset) ConfirmDialog(tr("Сбросить пароль?"), tr("Будет создан новый временный пароль, {} выйдет отовсюду.", u.username), tr("Сбросить"), { confirmReset = false }) {
        act { password = Api.adminResetPassword(id) }
      }
      if (confirmDelete) ConfirmDialog(tr("Удалить {}?", u.username), tr("Аккаунт, его лайки, плейлисты и история удалятся навсегда."), tr("Удалить"), { confirmDelete = false }) {
        act(tr("Пользователь удалён"), then = { nav.back() }) { Api.adminDeleteUser(id) }
      }
    }
  }
  password?.let { p ->
    AlertDialog(
      onDismissRequest = { password = null },
      title = { Text(tr("Новый пароль")) },
      text = { SelectionContainer { Text(p, style = MaterialTheme.typography.headlineSmall) } },
      confirmButton = { TextButton(onClick = { clipboard.setText(AnnotatedString(p)); App.say(tr("Скопировано")); password = null }) { Text(tr("Скопировать")) } },
      dismissButton = { TextButton(onClick = { password = null }) { Text(tr("Закрыть")) } },
    )
  }
}

/* ---------- invites ---------- */

private fun inviteLink(code: String) = "${Api.BASE}/register?invite=$code"

@Composable
private fun AdminInvites() {
  val context = LocalContext.current
  val clipboard = LocalClipboardManager.current
  var version by remember { mutableIntStateOf(0) }
  val loader = rememberLoad(version) { Api.invites() }
  var create by remember { mutableStateOf(false) }
  var created by remember { mutableStateOf<Invite?>(null) }
  fun share(code: String) {
    val send = Intent(Intent.ACTION_SEND).setType("text/plain")
      .putExtra(Intent.EXTRA_TEXT, tr("Приглашение в AVRmusic: {}\nКод: {}", (inviteLink(code)), code))
    context.startActivity(Intent.createChooser(send, tr("Отправить приглашение")))
  }
  LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
    item {
      Text(
        tr("Каждый код одноразовый: после регистрации он сгорает. Ссылка открывает регистрацию с уже вписанным кодом."),
        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
      Spacer(Modifier.height(8.dp))
      Button(shapes = ButtonDefaults.shapes(), onClick = { create = true }) { Ico(R.drawable.ic_add, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(tr("Создать код")) }
    }
    items(loader.data.orEmpty()) { inv ->
      val expired = inv.expiresAt != null && (parseTime(inv.expiresAt) ?: Long.MAX_VALUE) < System.currentTimeMillis()
      val status = when {
        inv.usedAt != null -> tr("использован: {} · {}", (inv.usedBy?.displayName ?: inv.usedBy?.username ?: ""), (fmtAgo(inv.usedAt)))
        expired -> tr("истёк")
        inv.expiresAt != null -> tr("активен до {}", (fmtDateTime(inv.expiresAt)))
        else -> tr("активен")
      }
      Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(MaterialTheme.colorScheme.surfaceContainer).padding(start = 16.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
      ) {
        Column(Modifier.weight(1f)) {
          Text(inv.code, style = MaterialTheme.typography.titleMedium)
          Text(listOfNotNull(inv.note, status).joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (inv.usedAt == null && !expired) {
          IconButton(onClick = { clipboard.setText(AnnotatedString(inviteLink(inv.code))); App.say(tr("Ссылка скопирована")) }) { Ico(R.drawable.ic_playlist_add, tr("Скопировать ссылку")) }
          IconButton(onClick = { share(inv.code) }) { Ico(R.drawable.ic_web, tr("Отправить")) }
        }
        IconButton(onClick = { act(tr("Код удалён"), then = { version++ }) { Api.deleteInvite(inv.code) } }) { Ico(R.drawable.ic_close, tr("Удалить")) }
      }
    }
  }
  if (create) FormDialog(tr("Новый код"), listOf(Field(tr("Для кого (необязательно)")), Field(tr("Срок, дней (пусто — бессрочно)"), number = true)), tr("Создать"), { create = false }) { v ->
    act(then = { version++ }) { created = Api.createInvite(v[0], v[1].trim().toIntOrNull()) }
  }
  created?.let { inv ->
    AlertDialog(
      onDismissRequest = { created = null },
      title = { Text(tr("Код создан")) },
      text = { SelectionContainer { Text("${inv.code}\n\n${inviteLink(inv.code)}") } },
      confirmButton = { TextButton(onClick = { share(inv.code); created = null }) { Text(tr("Отправить")) } },
      dismissButton = { TextButton(onClick = { clipboard.setText(AnnotatedString(inviteLink(inv.code))); App.say(tr("Ссылка скопирована")); created = null }) { Text(tr("Скопировать")) } },
    )
  }
}

/* ---------- downloads and imports ---------- */

@Composable
private fun AdminDownloads() {
  val context = LocalContext.current
  var jobs by remember { mutableStateOf<List<ServerJob>>(emptyList()) }
  var url by rememberSaveable { mutableStateOf("") }
  var video by rememberSaveable { mutableStateOf(false) }
  var files by remember { mutableStateOf<List<android.net.Uri>>(emptyList()) }
  var uploading by remember { mutableStateOf(false) }
  var open by remember { mutableStateOf<String?>(null) }
  LaunchedEffect(Unit) {
    while (true) {
      runCatching { jobs = Api.serverJobs() }
      delay(3000)
    }
  }
  val pick = rememberLauncherForActivityResult(ActivityResultContracts.GetMultipleContents()) { list -> if (list.isNotEmpty()) files = list }
  val caps by produceState<space.avthsr.music.api.Capabilities?>(null) { value = runCatching { Api.capabilities() }.getOrNull() }
  LazyColumn(Modifier.fillMaxSize().imePadding(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
    item {
      Text(tr("Загрузить файлы"), style = MaterialTheme.typography.titleLarge)
      Text(tr("Аудиофайлы с телефона попадут в библиотеку с тегами из файлов."), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
      Spacer(Modifier.height(6.dp))
      Row(verticalAlignment = Alignment.CenterVertically) {
        Button(shapes = ButtonDefaults.shapes(), onClick = { pick.launch("audio/*") }, enabled = !uploading) { Ico(R.drawable.ic_add, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(tr("Выбрать файлы")) }
        if (uploading) { Spacer(Modifier.width(12.dp)); LoadingIndicator(Modifier.size(32.dp)); Text(tr("  загружается…")) }
      }
    }
    item {
      Spacer(Modifier.height(8.dp))
      Text(tr("Импорт по ссылке"), style = MaterialTheme.typography.titleLarge)
      OutlinedTextField(url, { url = it }, Modifier.fillMaxWidth(), label = { Text(tr("Ссылка (YouTube, SoundCloud, …)")) }, singleLine = true)
      Row(verticalAlignment = Alignment.CenterVertically) {
        CheckRow(tr("Как видео (канвас)"), video) { video = it }
      }
      Button(shapes = ButtonDefaults.shapes(), enabled = url.isNotBlank(), onClick = { val u = url; act(tr("Добавлено в очередь"), then = { url = "" }) { Api.importUrl(u, video) } }) { Text(tr("Импортировать")) }
    }
    item {
      Spacer(Modifier.height(8.dp))
      Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        FilledTonalButton(shapes = ButtonDefaults.shapes(), onClick = {
          act { val r = Api.scanLibrary(); App.say(tr("Папка {}: импортировано {}, пропущено {}", r.dir, r.imported, r.skipped.size)) }
        }) { Text(tr("Сканировать папку")) }
        FilledTonalButton(shapes = ButtonDefaults.shapes(), onClick = { act(tr("Поиск переиндексирован")) { Api.reindex() } }) { Text(tr("Переиндексировать поиск")) }
        FilledTonalButton(shapes = ButtonDefaults.shapes(), onClick = { act(tr("Ищу недостающие тексты")) { Api.fetchMissingLyrics() } }) { Text(tr("Найти тексты")) }
        FilledTonalButton(shapes = ButtonDefaults.shapes(), onClick = { act(tr("Канвасы в очереди")) { Api.fetchMissingCanvases() } }) { Text(tr("Нарезать канвасы")) }
      }
      caps?.let { c ->
        Spacer(Modifier.height(10.dp))
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(MaterialTheme.colorScheme.surfaceContainer).padding(14.dp)) {
          Text(tr("Инструменты сервера"), style = MaterialTheme.typography.titleSmall)
          Row(verticalAlignment = Alignment.CenterVertically) { Dot(c.ytdlp); Text("  yt-dlp ${c.ytdlpVersion ?: ""}", style = MaterialTheme.typography.bodySmall) }
          Row(verticalAlignment = Alignment.CenterVertically) { Dot(c.ffmpeg); Text("  ffmpeg", style = MaterialTheme.typography.bodySmall) }
          c.musicDir?.let { Text(tr("Папка музыки: {}", it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
          c.sources.forEach { src ->
            Row(verticalAlignment = Alignment.CenterVertically) {
              Dot(src.ok && src.enabled)
              Text("  ${src.label}" + (if (!src.enabled) tr(" · выключен") else "") + (src.reason?.let { " · $it" } ?: ""), style = MaterialTheme.typography.bodySmall)
            }
          }
        }
      }
      SectionTitle(tr("Задачи"))
    }
    val active = jobs.filter { it.status == "running" || it.status == "queued" }.sortedWith(compareBy({ if (it.status == "running") 0 else 1 }, { it.position ?: Int.MAX_VALUE }))
    val done = jobs.filter { it.status == "done" || it.status == "error" }.take(30)
    if (jobs.isEmpty()) item { Text(tr("Задач нет"), color = MaterialTheme.colorScheme.onSurfaceVariant) }
    items(active + done) { j -> ServerJobCard(j, open == j.id, { open = if (open == j.id) null else j.id }) }
  }
  if (files.isNotEmpty()) FormDialog(
    tr("Загрузить {} {}", files.size, (if (files.size == 1) tr("файл") else tr("файлов"))),
    listOf(Field(tr("Исполнитель (если в тегах нет)")), Field(tr("Альбом")), Field(tr("Жанр")), Field(tr("Год"), number = true)),
    tr("Загрузить"),
    { files = emptyList() },
  ) { v ->
    val list = files
    files = emptyList()
    uploading = true
    act(then = { uploading = false }) {
      try {
        val r = Api.uploadTracks(context, list, mapOf("artist" to v[0], "album" to v[1], "genre" to v[2], "year" to v[3]))
        App.say(tr("Загружено: {}", r.imported.size) + if (r.skipped.isNotEmpty()) tr(", пропущено: {} ({})", r.skipped.size, (r.skipped.first().reason)) else "")
      } finally { uploading = false }
    }
  }
}

@Composable
private fun ServerJobCard(j: ServerJob, expanded: Boolean, toggle: () -> Unit) {
  val cs = MaterialTheme.colorScheme
  val s = j.stats
  val kind = when (j.kind) { "acquire" -> tr("Каталог"); "canvas" -> tr("Канвасы"); "heal" -> tr("Проверка звука"); "url" -> tr("Ссылка"); "lyrics" -> tr("Тексты"); else -> j.kind }
  val status = when (j.status) {
    "running" -> tr("идёт {}%", (j.progress.toInt())) + (s?.let { tr(" · загружено {}, было {}, не найдено {} из {}", (it["imported"] ?: 0), (it["exists"] ?: 0), (it["failed"] ?: 0), (it["total"] ?: 0)) } ?: "")
    "queued" -> j.position?.let { if (it <= 1) tr("в очереди · следующая") else tr("в очереди · впереди {}", (it - 1)) } ?: tr("в очереди")
    "done" -> tr("готово") + (s?.let { tr(" · загружено {}, было {}, не найдено {}", (it["imported"] ?: 0), (it["exists"] ?: 0), (it["failed"] ?: 0)) } ?: "")
    else -> tr("ошибка: {}", (j.error ?: ""))
  }
  Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(cs.surfaceContainer).clickable(onClick = toggle).padding(14.dp)) {
    Row(verticalAlignment = Alignment.CenterVertically) {
      Column(Modifier.weight(1f)) {
        Text(j.title ?: j.url ?: kind, style = MaterialTheme.typography.titleSmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
        Text("$kind · $status", style = MaterialTheme.typography.bodySmall, color = if (j.status == "error") cs.error else cs.onSurfaceVariant, maxLines = 3)
      }
      if (j.status == "running" || j.status == "queued") {
        IconButton(onClick = { act(tr("Задача отменена")) { Api.cancelJob(j.id) } }) { Ico(R.drawable.ic_close, tr("Отменить")) }
      }
    }
    if (j.status == "running") {
      Spacer(Modifier.height(6.dp))
      LinearWavyProgressIndicator(progress = { (j.progress / 100.0).toFloat().coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth())
    }
    if (expanded && j.log.isNotEmpty()) {
      Spacer(Modifier.height(8.dp))
      SelectionContainer {
        Text(j.log.takeLast(40).joinToString("\n"), style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant)
      }
    }
  }
}

/* ---------- YouTube accounts ---------- */

@Composable
private fun AdminYoutube() {
  val context = LocalContext.current
  var accounts by remember { mutableStateOf<List<YtAccount>?>(null) }
  var label by rememberSaveable { mutableStateOf("") }
  var remove by remember { mutableStateOf<YtAccount?>(null) }
  var tick by remember { mutableIntStateOf(0) }
  LaunchedEffect(tick) {
    while (true) {
      runCatching { accounts = Api.ytAccounts() }
      delay(5000)
    }
  }
  val pick = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
    if (uri != null) {
      val name = label
      act(tr("Аккаунт добавлен"), then = { label = ""; tick++ }) { Api.addYtAccount(context, uri, name) }
    }
  }
  LazyColumn(Modifier.fillMaxSize().imePadding(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
    item {
      Text(
        tr("Каждый аккаунт качает по 2 трека одновременно с остальными. Если YouTube откажет аккаунту, он отдохнёт 20 минут, а загрузка перейдёт на следующий. Нужен cookies.txt (формат Netscape) из отдельного Google-аккаунта; хранится только на сервере."),
        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
      )
      Spacer(Modifier.height(8.dp))
      OutlinedTextField(label, { label = it }, Modifier.fillMaxWidth(), label = { Text(tr("Название нового аккаунта (необязательно)")) }, singleLine = true)
      Spacer(Modifier.height(6.dp))
      Button(shapes = ButtonDefaults.shapes(), onClick = { pick.launch(arrayOf("text/plain", "text/*", "application/octet-stream", "*/*")) }) {
        Ico(R.drawable.ic_add, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text(tr("Добавить cookies.txt"))
      }
    }
    val list = accounts
    if (list != null && list.isEmpty()) item { Text(tr("Аккаунтов нет: загрузки идут без входа, по 2 одновременно."), color = MaterialTheme.colorScheme.onSurfaceVariant) }
    items(list.orEmpty()) { a ->
      val cs = MaterialTheme.colorScheme
      val state = when { a.busy -> tr("качает"); a.coolingUntil != null -> tr("отдыхает до {}", (fmtDateTime(a.coolingUntil).substringAfter(", "))); else -> tr("свободен") }
      Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(cs.surfaceContainer).padding(14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
          Dot(a.busy || a.coolingUntil == null)
          Spacer(Modifier.width(8.dp))
          Text(a.label, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
          Text(state, style = MaterialTheme.typography.labelMedium, color = if (a.coolingUntil != null) cs.error else cs.primary)
        }
        Text(
          "${a.cookies} cookies" + (if (a.loggedIn) tr(", вход есть") else tr(" — входа нет")) + tr(" · скачано {}, ошибок {}", a.ok, a.failed) +
            (a.lastUsedAt?.let { " · ${fmtAgo(it)}" } ?: ""),
          style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant,
        )
        a.lastError?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = cs.error, maxLines = 3, overflow = TextOverflow.Ellipsis) }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          if (a.coolingUntil != null) TextButton(onClick = { act(tr("Снова в работе"), then = { tick++ }) { Api.wakeYtAccount(a.id) } }) { Text(tr("Вернуть в работу")) }
          TextButton(onClick = { remove = a }) { Text(tr("Удалить"), color = cs.error) }
        }
      }
    }
  }
  remove?.let { a ->
    ConfirmDialog(tr("Удалить «{}»?", a.label), tr("Cookies этого аккаунта удалятся с сервера."), tr("Удалить"), { remove = null }) {
      act(tr("Аккаунт удалён"), then = { tick++ }) { Api.deleteYtAccount(a.id) }
    }
  }
}

/* ---------- tracks ---------- */

@Composable
private fun AdminTracks() {
  val nav = LocalNav.current
  var q by rememberSaveable { mutableStateOf("") }
  var query by remember { mutableStateOf("") }
  LaunchedEffect(q) { delay(350); query = q.trim() }
  val loader = rememberLoad(query) { Api.adminTracks(query) }
  LazyColumn(Modifier.fillMaxSize().imePadding(), contentPadding = PaddingValues(top = 8.dp, bottom = 24.dp)) {
    item {
      OutlinedTextField(q, { q = it }, Modifier.fillMaxWidth().padding(horizontal = 16.dp), label = { Text(tr("Название, исполнитель или альбом")) }, singleLine = true)
      loader.data?.let { Text(tr("Найдено: {}", it.total), Modifier.padding(horizontal = 20.dp, vertical = 6.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
    items(loader.data?.items.orEmpty()) { t ->
      TrackRow(t, onClick = { nav.route("admin/track/${t.id}") }, subtitle = listOfNotNull(t.artists, t.album?.title).joinToString(" · "))
    }
  }
}

@Composable
fun AdminTrackScreen(id: String) {
  val nav = LocalNav.current
  val context = LocalContext.current
  var version by remember { mutableIntStateOf(0) }
  val loader = rememberLoad(id, version) { Api.track(id) to Api.adminLyrics(id) }
  var confirmDelete by remember { mutableStateOf(false) }
  val pickCover = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
    if (uri != null) act(tr("Обложка обновлена"), then = { version++ }) { Api.adminTrackCover(context, id, uri) }
  }
  val pickLyrics = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
    if (uri != null) act(tr("Текст загружен"), then = { version++ }) { Api.adminLyricsFile(context, id, uri) }
  }
  val pickCanvas = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
    if (uri != null) act(tr("Канвас загружен"), then = { version++ }) { Api.adminTrackCanvas(context, id, uri) }
  }
  Page {
    Loaded(loader) { (t, lyrics) ->
      var title by remember(t) { mutableStateOf(t.title) }
      var artist by remember(t) { mutableStateOf(t.artist.name) }
      var feat by remember(t) { mutableStateOf(t.featuring.joinToString(", ") { it.name }) }
      var album by remember(t) { mutableStateOf(t.album?.title.orEmpty()) }
      var genre by remember(t) { mutableStateOf(t.genre.orEmpty()) }
      var year by remember(t) { mutableStateOf(t.album?.year?.toString().orEmpty()) }
      var trackNo by remember(t) { mutableStateOf(t.trackNo?.toString().orEmpty()) }
      var explicit by remember(t) { mutableStateOf(t.explicit) }
      var synced by remember(lyrics) { mutableStateOf(lyrics.lyricsSynced.orEmpty()) }
      var plain by remember(lyrics) { mutableStateOf(lyrics.lyricsPlain.orEmpty()) }
      Column(
        Modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(start = 16.dp, end = 16.dp, top = 56.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
      ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
          Cover(t.coverUrl, Modifier.size(96.dp).clickable { pickCover.launch("image/*") }, RoundedCornerShape(18.dp))
          Spacer(Modifier.width(14.dp))
          Column(Modifier.weight(1f)) {
            Text(t.title, style = MaterialTheme.typography.titleLarge)
            Text(t.artists, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(tr("Нажмите на обложку, чтобы сменить её"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
          }
        }
        OutlinedTextField(title, { title = it }, Modifier.fillMaxWidth(), label = { Text(tr("Название")) }, singleLine = true)
        OutlinedTextField(artist, { artist = it }, Modifier.fillMaxWidth(), label = { Text(tr("Исполнитель")) }, singleLine = true)
        OutlinedTextField(feat, { feat = it }, Modifier.fillMaxWidth(), label = { Text(tr("При участии (через запятую)")) }, singleLine = true)
        OutlinedTextField(album, { album = it }, Modifier.fillMaxWidth(), label = { Text(tr("Альбом")) }, singleLine = true)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          OutlinedTextField(genre, { genre = it }, Modifier.weight(1f), label = { Text(tr("Жанр")) }, singleLine = true)
          OutlinedTextField(year, { year = it }, Modifier.weight(1f), label = { Text(tr("Год")) }, singleLine = true)
          OutlinedTextField(trackNo, { trackNo = it }, Modifier.weight(1f), label = { Text("№") }, singleLine = true)
        }
        CheckRow("Explicit", explicit) { explicit = it }
        Button(shapes = ButtonDefaults.shapes(), onClick = {
          val body = buildJsonObject {
            put("title", title.trim()); put("artist", artist.trim())
            put("album", album.trim().takeIf { it.isNotEmpty() }?.let { JsonPrimitive(it) } ?: JsonNull)
            put("genre", genre.trim().takeIf { it.isNotEmpty() }?.let { JsonPrimitive(it) } ?: JsonNull)
            put("year", year.trim().toIntOrNull()?.let { JsonPrimitive(it) } ?: JsonNull)
            put("trackNo", trackNo.trim().toIntOrNull()?.let { JsonPrimitive(it) } ?: JsonNull)
            put("explicit", explicit)
            put("featuring", jsonStrings(feat.split(',').map { it.trim() }.filter { it.isNotEmpty() }))
          }
          act(tr("Сохранено"), then = { version++ }) { Api.adminPatchTrack(id, body) }
        }) { Text(tr("Сохранить")) }

        SectionTitleInline(tr("Текст песни"))
        OutlinedTextField(synced, { synced = it }, Modifier.fillMaxWidth(), label = { Text(tr("Синхронный (LRC: [01:23.45] строка)")) }, minLines = 4, maxLines = 10)
        OutlinedTextField(plain, { plain = it }, Modifier.fillMaxWidth(), label = { Text(tr("Обычный текст")) }, minLines = 4, maxLines = 10)
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          Button(shapes = ButtonDefaults.shapes(), onClick = {
            val body = buildJsonObject {
              put("lyricsSynced", synced.trim().takeIf { it.isNotEmpty() }?.let { JsonPrimitive(it) } ?: JsonNull)
              put("lyricsPlain", plain.trim().takeIf { it.isNotEmpty() }?.let { JsonPrimitive(it) } ?: JsonNull)
            }
            act(tr("Текст сохранён"), then = { version++ }) { Api.adminPatchTrack(id, body) }
          }) { Text(tr("Сохранить текст")) }
          FilledTonalButton(shapes = ButtonDefaults.shapes(), onClick = { act(tr("Ищу текст…"), then = { version++ }) { Api.adminFetchLyrics(id) } }) { Text(tr("Найти")) }
          FilledTonalButton(shapes = ButtonDefaults.shapes(), onClick = { pickLyrics.launch(arrayOf("text/*", "application/octet-stream", "*/*")) }) { Text(".lrc / .txt") }
        }

        SectionTitleInline(tr("Канвас"))
        Text(if (t.hasCanvas) tr("Есть") else tr("Нет"), color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          FilledTonalButton(shapes = ButtonDefaults.shapes(), onClick = { act(tr("Канвас в очереди — нарежется из клипа")) { Api.adminFetchCanvas(id) } }) { Text(tr("Из клипа")) }
          FilledTonalButton(shapes = ButtonDefaults.shapes(), onClick = { pickCanvas.launch("video/*") }) { Text(tr("Свой файл")) }
          if (t.hasCanvas) OutlinedButton(shapes = ButtonDefaults.shapes(), onClick = { act(tr("Канвас убран"), then = { version++ }) { Api.adminDeleteCanvas(id) } }) { Text(tr("Убрать")) }
        }

        Spacer(Modifier.height(12.dp))
        OutlinedButton(shapes = ButtonDefaults.shapes(), onClick = { confirmDelete = true }) { Text(tr("Удалить трек"), color = MaterialTheme.colorScheme.error) }
      }
      if (confirmDelete) ConfirmDialog(tr("Удалить «{}»?", t.title), tr("Файл удалится с сервера, трек пропадёт из плейлистов и лайков."), tr("Удалить"), { confirmDelete = false }) {
        act(tr("Трек удалён"), then = { nav.back() }) { Api.adminDeleteTrack(id) }
      }
    }
  }
}

@Composable
private fun SectionTitleInline(text: String) {
  Text(text, style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 12.dp))
}

/* ---------- app crash reports ---------- */

@Composable
private fun AdminErrors() {
  val loader = rememberLoad(Unit) { Api.clientErrors() }
  var open by remember { mutableStateOf<Long?>(null) }
  LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
    val list = loader.data.orEmpty()
    if (loader.data != null && list.isEmpty()) item { Text(tr("Ошибок нет 🎉"), color = MaterialTheme.colorScheme.onSurfaceVariant) }
    items(list) { e ->
      val cs = MaterialTheme.colorScheme
      Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(cs.surfaceContainer).clickable { open = if (open == e.id) null else e.id }.padding(14.dp)) {
        Text(e.message, style = MaterialTheme.typography.titleSmall, maxLines = 3, overflow = TextOverflow.Ellipsis)
        Text(
          listOfNotNull(fmtAgo(e.createdAt), e.app + (e.version?.let { " $it" } ?: ""), e.device, e.username?.let { "@$it" }).joinToString(" · "),
          style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant,
        )
        if (open == e.id && e.stack != null) {
          Spacer(Modifier.height(8.dp))
          SelectionContainer { Text(e.stack.lines().take(40).joinToString("\n"), style = MaterialTheme.typography.bodySmall, color = cs.onSurfaceVariant) }
        }
      }
    }
  }
}
