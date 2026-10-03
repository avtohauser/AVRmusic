@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package space.avthsr.music.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import space.avthsr.music.res.*
import space.avthsr.music.api.Api
import space.avthsr.music.api.News
import space.avthsr.music.api.NewsItem
import space.avthsr.music.api.deleteNews
import space.avthsr.music.api.postNews
import space.avthsr.music.tr

/** All news from the admin; opening it marks them read. */
@Composable
fun NewsScreen() {
  val items by News.items.collectAsStateWithLifecycle()
  LaunchedEffect(Unit) { News.refresh(); News.markRead() }
  LaunchedEffect(items) { News.markRead() }
  Page {
    LazyColumn(Modifier.fillMaxSize(), contentPadding = screenPadding(start = 16.dp, end = 16.dp, top = 56.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
      item { FlowText(tr("Новости"), MaterialTheme.typography.headlineMedium, Modifier.padding(horizontal = 4.dp), maxLines = 1) }
      if (items.isEmpty()) item { Text(tr("Новостей пока нет"), Modifier.padding(4.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
      items(items, key = { it.id }) { n -> NewsCard(n) }
    }
  }
}

@Composable
private fun NewsCard(n: NewsItem, onDelete: (() -> Unit)? = null) {
  val cs = MaterialTheme.colorScheme
  Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(cs.surfaceContainer).padding(start = 16.dp, top = 14.dp, bottom = 14.dp, end = if (onDelete != null) 4.dp else 16.dp)) {
    Column(Modifier.weight(1f)) {
      Text(n.title, style = MaterialTheme.typography.titleMedium)
      if (n.body.isNotBlank()) Text(n.body, Modifier.padding(top = 4.dp), style = MaterialTheme.typography.bodyMedium)
      Text(listOfNotNull(fmtDateTime(n.createdAt), n.author).joinToString(" · "), Modifier.padding(top = 6.dp), style = MaterialTheme.typography.labelSmall, color = cs.onSurfaceVariant)
    }
    if (onDelete != null) IconButton(onClick = onDelete) { Ico(Res.drawable.ic_delete, tr("Удалить")) }
  }
}

/** On Home: what the admin wrote since the listener last looked. */
@Composable
fun NewsBanner(onOpen: () -> Unit) {
  val items by News.items.collectAsStateWithLifecycle()
  val seen by News.seen.collectAsStateWithLifecycle()
  val unread = News.unread(items, seen)
  if (unread.isEmpty()) return
  val cs = MaterialTheme.colorScheme
  val n = unread.first()
  Row(
    Modifier.padding(horizontal = 16.dp, vertical = 6.dp).fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(cs.primaryContainer)
      .clickable(onClick = onOpen).padding(start = 16.dp, top = 14.dp, bottom = 10.dp, end = 8.dp),
    verticalAlignment = Alignment.Top,
  ) {
    Ico(Res.drawable.ic_campaign, null, tint = cs.onPrimaryContainer)
    Spacer(Modifier.width(12.dp))
    Column(Modifier.weight(1f)) {
      Text(n.title, style = MaterialTheme.typography.titleMedium, color = cs.onPrimaryContainer)
      if (n.body.isNotBlank()) Text(n.body, style = MaterialTheme.typography.bodyMedium, color = cs.onPrimaryContainer, maxLines = 3, overflow = TextOverflow.Ellipsis)
      if (unread.size > 1) Text(tr("и ещё {}", unread.size - 1), style = MaterialTheme.typography.labelMedium, color = cs.onPrimaryContainer.copy(alpha = 0.8f))
      Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
        TextButton(onClick = { News.markRead() }) { Text(tr("Понятно")) }
      }
    }
  }
}

/** Admin: write a news for everyone, take one back. */
@Composable
fun AdminNews() {
  val items by News.items.collectAsStateWithLifecycle()
  var title by remember { mutableStateOf("") }
  var body by remember { mutableStateOf("") }
  var busy by remember { mutableStateOf(false) }
  var remove by remember { mutableStateOf<NewsItem?>(null) }
  LaunchedEffect(Unit) { News.refresh() }
  LazyColumn(Modifier.fillMaxSize(), contentPadding = screenPadding(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 24.dp, hero = true), verticalArrangement = Arrangement.spacedBy(10.dp)) {
    item {
      Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(28.dp)).background(MaterialTheme.colorScheme.surfaceContainerLow).padding(16.dp)) {
        Text(tr("Новость для всех"), style = MaterialTheme.typography.titleMedium)
        Text(tr("Её увидят все: на главной и уведомлением на телефоне"), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(10.dp))
        OutlinedTextField(title, { title = it.take(140) }, Modifier.fillMaxWidth(), label = { Text(tr("Заголовок")) }, singleLine = true, shape = RoundedCornerShape(16.dp))
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(body, { body = it.take(4000) }, Modifier.fillMaxWidth(), label = { Text(tr("Текст (необязательно)")) }, minLines = 3, shape = RoundedCornerShape(16.dp))
        Spacer(Modifier.height(10.dp))
        Button(
          shapes = ButtonDefaults.shapes(),
          enabled = !busy && title.isNotBlank(),
          onClick = {
            busy = true
            act(tr("Опубликовано"), then = { busy = false; title = ""; body = "" }) {
              try { News.published(Api.postNews(title, body)) } finally { busy = false }
            }
          },
        ) { Ico(Res.drawable.ic_campaign); Spacer(Modifier.width(8.dp)); Text(tr("Опубликовать")) }
      }
    }
    if (items.isEmpty()) item { Text(tr("Новостей пока нет"), Modifier.padding(4.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
    items(items, key = { it.id }) { n -> NewsCard(n) { remove = n } }
  }
  remove?.let { n ->
    ConfirmDialog(tr("Удалить «{}»?", n.title), tr("Новость пропадёт у всех."), tr("Удалить"), { remove = null }) {
      act(tr("Новость удалена")) { Api.deleteNews(n.id); News.items.value = News.items.value.filter { it.id != n.id } }
    }
  }
}
