@file:OptIn(ExperimentalMaterial3ExpressiveApi::class)

package space.avthsr.music.ui

import space.avthsr.music.tr
import androidx.compose.material3.ExperimentalMaterial3ExpressiveApi
import androidx.compose.material3.LinearWavyProgressIndicator
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import space.avthsr.music.api.AcquireJob
import space.avthsr.music.api.Api

/** What the server is fetching from the catalogue right now, and the queue. */
@Composable
fun JobsScreen() {
  var jobs by remember { mutableStateOf<List<AcquireJob>?>(null) }
  var error by remember { mutableStateOf<String?>(null) }
  LaunchedEffect(Unit) {
    while (true) {
      try { jobs = Api.jobs(); error = null } catch (e: Exception) { error = e.message }
      delay(3000)
    }
  }
  Page {
    val list = jobs
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 56.dp, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
      item {
        Text(tr("Загрузки на сервер"), style = MaterialTheme.typography.headlineMedium)
        Text(
          tr("Одиночные треки и альбомы идут вне очереди, дискографии — по очереди. Скорость зависит от числа аккаунтов YouTube на сервере."),
          style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(8.dp))
      }
      error?.let { e -> item { Text(e, color = MaterialTheme.colorScheme.error) } }
      if (list != null && list.isEmpty()) item { Text(tr("Сейчас ничего не качается"), color = MaterialTheme.colorScheme.onSurfaceVariant) }
      val active = list.orEmpty().filter { it.status == "running" || it.status == "queued" }.sortedWith(compareBy({ if (it.status == "running") 0 else 1 }, { it.position ?: 0 }))
      val finished = list.orEmpty().filter { it.status == "done" || it.status == "error" }.take(20)
      items(active) { JobCard(it) }
      if (finished.isNotEmpty()) item { SectionTitle(tr("Готово")) }
      items(finished) { JobCard(it) }
    }
  }
}

@Composable
private fun JobCard(j: AcquireJob) {
  val cs = MaterialTheme.colorScheme
  val stats = j.stats
  val status = when (j.status) {
    "running" -> if (stats != null) tr("Качается: {} загружено, {} уже было, {} не найдено из {}", (stats["imported"] ?: 0), (stats["exists"] ?: 0), (stats["failed"] ?: 0), (stats["total"] ?: 0)) else tr("Качается…")
    "queued" -> when (val p = j.position) { null -> tr("В очереди"); 1 -> tr("В очереди · следующая"); else -> tr("В очереди · впереди {}", (p - 1)) }
    "done" -> if (stats != null) tr("Готово: {} загружено, {} уже было, {} не найдено", (stats["imported"] ?: 0), (stats["exists"] ?: 0), (stats["failed"] ?: 0)) else tr("Готово")
    else -> tr("Ошибка: {}", (j.error ?: tr("неизвестно")))
  }
  Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(cs.surfaceContainer).padding(16.dp)) {
    Text(j.title.ifBlank { j.kind }, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis)
    Text(status, style = MaterialTheme.typography.bodySmall, color = if (j.status == "error") cs.error else cs.onSurfaceVariant)
    val mine = j.requestedBy == Api.user?.id || Api.user?.isAdmin == true
    if (mine && (j.status == "queued" || j.status == "running")) {
      TextButton(onClick = { act(tr("Задача отменена")) { Api.cancelCatalogJob(j.id) } }) { Text(if (j.status == "queued") tr("Убрать из очереди") else tr("Остановить")) }
    }
    if (j.status == "running") {
      Spacer(Modifier.height(8.dp))
      LinearWavyProgressIndicator(progress = { (j.progress / 100.0).toFloat().coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth())
    }
  }
}
