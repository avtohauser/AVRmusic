@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package space.avthsr.music.ui

import space.avthsr.music.tr
import android.app.DownloadManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material3.CircularWavyProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.IconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import space.avthsr.music.App
import space.avthsr.music.R
import space.avthsr.music.api.Api
import space.avthsr.music.api.Track
import space.avthsr.music.player.Offline
import space.avthsr.music.player.PlayerConn

/* ---------- links ---------- */

/** The site's address of a page ("/album/…"); links open in the app too. */
fun siteLink(path: String) = Api.BASE + path

fun trackPath(t: Track) = t.album?.let { "/album/${it.id}?track=${t.id}" } ?: "/artist/${t.artist.id}"

fun share(context: Context, path: String, title: String) {
  val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, "$title\n${siteLink(path)}")
  context.startActivity(Intent.createChooser(send, tr("Поделиться")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

fun copyLink(context: Context, path: String) {
  val cm = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
  cm.setPrimaryClip(ClipData.newPlainText("AVRmusic", siteLink(path)))
  App.say(tr("Ссылка скопирована"))
}

/* ---------- files to the phone's Downloads ---------- */

private fun safeName(s: String) = s.replace(Regex("[\\\\/:*?\"<>|]+"), " ").trim().take(120).ifEmpty { "AVRmusic" }

private fun extOf(mime: String?) = when (mime) {
  "audio/mpeg" -> "mp3"; "audio/flac", "audio/x-flac" -> "flac"; "audio/mp4", "audio/x-m4a", "audio/aac" -> "m4a"
  "audio/ogg" -> "ogg"; "audio/opus" -> "opus"; "audio/webm" -> "webm"; "audio/wav", "audio/x-wav" -> "wav"
  else -> "mp3"
}

/** Saves a file (a track, or an album / playlist as ZIP) to Downloads/AVRmusic through the system downloader. */
fun downloadToDevice(context: Context, path: String, fileName: String) {
  runCatching {
    val name = "AVRmusic/" + safeName(fileName)
    val req = DownloadManager.Request(Uri.parse(Api.downloadUrl(path)))
      .setTitle(fileName)
      .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
    // Android 10+: the shared Downloads folder needs no permission; before that the app's own folder
    if (Build.VERSION.SDK_INT >= 29) req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
    else req.setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, name)
    (context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(req)
    App.say(tr("Скачивание началось: {}", fileName))
  }.onFailure { App.say(tr("Не удалось скачать: {}", it.message)) }
}

fun downloadTrack(context: Context, t: Track) = downloadToDevice(context, "/api/download/${t.id}", "${t.artists} - ${t.title}.${extOf(t.mimeType)}")

/* ---------- offline ---------- */

/**
 * Save-offline button for a list of tracks: an arrow while not saved, a wavy ring while saving,
 * a filled pin when everything is on the phone (tap again to remove).
 */
@Composable
fun OfflineButton(tracks: List<Track>) {
  val saved by Offline.entries.collectAsStateWithLifecycle()
  val progress by Offline.progress.collectAsStateWithLifecycle()
  var confirm by remember { mutableStateOf(false) }
  if (tracks.isEmpty()) return
  val all = tracks.all { it.id in saved }
  val busy = tracks.filter { it.id in progress }
  IconButton(onClick = { if (all) confirm = true else Offline.save(tracks) }, shapes = IconButtonDefaults.shapes()) {
    when {
      busy.isNotEmpty() -> {
        val done = tracks.count { it.id in saved } + busy.sumOf { (progress[it.id] ?: 0f).toDouble() }.toFloat()
        CircularWavyProgressIndicator(progress = { (done / tracks.size).coerceIn(0f, 1f) }, modifier = Modifier.size(28.dp))
      }
      all -> Ico(R.drawable.ic_offline, tr("Сохранено офлайн"), tint = MaterialTheme.colorScheme.primary)
      else -> Ico(R.drawable.ic_download, tr("Сохранить офлайн"), tint = LocalContentColor.current)
    }
  }
  if (confirm) ConfirmDialog(tr("Удалить из офлайн?"), tr("Файлы удалятся с телефона, на сервере всё останется."), tr("Удалить"), { confirm = false }) {
    Offline.remove(tracks.map { it.id })
  }
}

/** Saved tracks: play them without the network, see what they take, remove. */
@Composable
fun DownloadsScreen() {
  val saved by Offline.entries.collectAsStateWithLifecycle()
  val progress by Offline.progress.collectAsStateWithLifecycle()
  var clear by remember { mutableStateOf(false) }
  val list = saved.values.sortedByDescending { it.savedAt }
  val tracks = list.map { it.track }
  Page {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(top = 56.dp, bottom = 24.dp)) {
      item {
        Column(Modifier.padding(horizontal = 20.dp)) {
          FlowText(tr("Скачанные"), MaterialTheme.typography.headlineMedium, maxLines = 1)
          Text(
            "${tracksWord(list.size)} · ${fmtBytes(list.sumOf { it.size })}" + if (progress.isNotEmpty()) tr(" · сохраняется ещё {}", progress.size) else "",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
          )
          Spacer(Modifier.height(12.dp))
          Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            PlayButtons(tracks, "offline")
            if (list.isNotEmpty()) TextButton(onClick = { clear = true }) { Text(tr("Удалить все")) }
          }
        }
      }
      if (list.isEmpty()) item {
        Text(
          tr("Нет сохранённых треков. Нажмите ⤓ у альбома, плейлиста или трека — он сохранится в приложении и будет играть без интернета."),
          Modifier.padding(20.dp), color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
      }
      itemsIndexed(tracks) { i, t ->
        TrackRow(t, onClick = { PlayerConn.play(tracks, i, "offline") }, subtitle = "${t.artists} · ${fmtBytes(list[i].size)}", menuExtra = { close ->
          DropdownMenuItem(text = { Text(tr("Удалить из офлайн")) }, leadingIcon = { Ico(R.drawable.ic_delete) }, onClick = { close(); Offline.remove(listOf(t.id)) })
        })
      }
    }
  }
  if (clear) ConfirmDialog(tr("Удалить все сохранённые?"), tr("{} удалятся с телефона.", (tracksWord(list.size))), tr("Удалить"), { clear = false }) {
    Offline.remove(list.map { it.track.id })
  }
}

/** Shown at the top while the phone has no internet. */
@Composable
fun OfflineBanner(onOpen: () -> Unit) {
  Row(
    Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp),
    verticalAlignment = Alignment.CenterVertically,
  ) {
    Ico(R.drawable.ic_cloud_off, null, Modifier.size(18.dp), MaterialTheme.colorScheme.error)
    Text(tr("  Вы офлайн — доступны сохранённые треки"), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.error, modifier = Modifier.weight(1f))
    TextButton(onClick = onOpen) { Text(tr("Открыть")) }
  }
}
