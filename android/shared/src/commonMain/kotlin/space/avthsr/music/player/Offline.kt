// Tracks saved for offline listening ("Сохранить офлайн"): the audio file and its cover live in the
// app's own storage with a small index; the player prefers them to the network, so saved music plays
// on a plane. Saving runs in the background, one track after another, with progress per track.
package space.avthsr.music.player

import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.request.prepareGet
import io.ktor.client.statement.bodyAsChannel
import io.ktor.http.contentLength
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import io.ktor.utils.io.readAvailable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.IO
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import okio.FileSystem
import okio.Path
import okio.Path.Companion.toPath
import okio.buffer
import okio.use
import space.avthsr.music.App
import space.avthsr.music.Platform
import space.avthsr.music.api.Api
import space.avthsr.music.api.Track
import space.avthsr.music.httpClient
import space.avthsr.music.tr

@Serializable
data class OfflineEntry(val track: Track, val savedAt: Long, val size: Long, val file: String, val cover: String? = null)

object Offline {
  private val fs = FileSystem.SYSTEM
  private lateinit var dir: Path
  private val index get() = dir / "index.json"
  private val http = httpClient {
    expectSuccess = false
    install(HttpTimeout) { connectTimeoutMillis = 20_000; socketTimeoutMillis = 90_000 }
  }
  private val lock = Mutex()

  private val _entries = MutableStateFlow<Map<String, OfflineEntry>>(emptyMap())
  val entries: StateFlow<Map<String, OfflineEntry>> = _entries.asStateFlow()

  /** tracks being saved right now: id → 0..1 */
  private val _progress = MutableStateFlow<Map<String, Float>>(emptyMap())
  val progress: StateFlow<Map<String, Float>> = _progress.asStateFlow()

  fun init() {
    dir = Platform.dataDir.toPath() / "offline"
    runCatching { fs.createDirectories(dir) }
    val list = runCatching { Api.json.decodeFromString(ListSerializer(OfflineEntry.serializer()), fs.read(index) { readUtf8() }) }.getOrDefault(emptyList())
    _entries.value = list.filter { fs.exists(dir / it.file) }.associateBy { it.track.id }
  }

  private fun persist() {
    runCatching { fs.write(index) { writeUtf8(Api.json.encodeToString(ListSerializer(OfflineEntry.serializer()), _entries.value.values.toList())) } }
  }

  fun has(id: String) = id in _entries.value
  /** the saved audio file's absolute path */
  fun file(id: String): String? = _entries.value[id]?.let { dir / it.file }?.takeIf { fs.exists(it) }?.toString()
  /** the saved cover's absolute path */
  fun cover(id: String): String? = _entries.value[id]?.cover?.let { dir / it }?.takeIf { fs.exists(it) }?.toString()
  fun usage(): Long = _entries.value.values.sumOf { it.size }

  /** Saves the tracks in the background (already saved ones are skipped). */
  fun save(tracks: List<Track>) {
    val todo = tracks.filter { !has(it.id) && it.id !in _progress.value }
    if (todo.isEmpty()) return
    _progress.value = _progress.value + todo.associate { it.id to 0f }
    App.say(if (todo.size == 1) tr("Сохраняю офлайн: {}", (todo[0].title)) else tr("Сохраняю офлайн {} треков", todo.size))
    App.scope.launch {
      var failed = 0
      for (t in todo) {
        val ok = runCatching { lock.withLock { saveOne(t) } }.isSuccess
        if (!ok) failed++
        _progress.value = _progress.value - t.id
      }
      App.say(if (failed == 0) tr("Сохранено офлайн") else tr("Сохранено офлайн, не получилось: {}", failed))
    }
  }

  private suspend fun saveOne(t: Track) = withContext(Dispatchers.IO) {
    val (name, size) = http.prepareGet(Api.streamUrl(t.id) + "&offline=1").execute { r ->
      if (!r.status.isSuccess()) error("HTTP ${r.status.value}")
      val ext = when (r.contentType()?.contentSubtype) {
        "mpeg" -> "mp3"; "flac", "x-flac" -> "flac"; "mp4", "x-m4a", "aac" -> "m4a"; "ogg" -> "ogg"; "opus" -> "opus"; "webm" -> "webm"; "wav", "x-wav" -> "wav"
        else -> "audio"
      }
      val total = r.contentLength()?.takeIf { it > 0 }
      val part = dir / "${t.id}.part"
      var done = 0L
      var last = 0L
      val input = r.bodyAsChannel()
      fs.sink(part).buffer().use { out ->
        val buf = ByteArray(64 * 1024)
        while (true) {
          val n = input.readAvailable(buf, 0, buf.size)
          if (n < 0) break
          if (n == 0) { if (input.isClosedForRead) break else continue }
          out.write(buf, 0, n)
          done += n
          if (total != null && done - last > 256 * 1024) {
            last = done
            _progress.value = _progress.value + (t.id to (done.toFloat() / total).coerceIn(0f, 1f))
          }
        }
      }
      if (done == 0L) error(tr("пустой ответ"))
      val name = "${t.id}.$ext"
      runCatching { fs.atomicMove(part, dir / name) }.getOrElse { error(tr("не удалось сохранить файл")) }
      name to done
    }
    val cover = Api.img(t.coverUrl)?.let { url ->
      runCatching {
        http.prepareGet(url).execute { r ->
          if (!r.status.isSuccess()) return@execute null
          val c = "${t.id}.jpg"
          val input = r.bodyAsChannel()
          fs.sink(dir / c).buffer().use { out ->
            val buf = ByteArray(64 * 1024)
            while (true) {
              val n = input.readAvailable(buf, 0, buf.size)
              if (n < 0) break
              if (n == 0) { if (input.isClosedForRead) break else continue }
              out.write(buf, 0, n)
            }
          }
          c
        }
      }.getOrNull()
    }
    _entries.value = _entries.value + (t.id to OfflineEntry(t, Platform.nowMs(), size, name, cover))
    persist()
  }

  fun remove(ids: Collection<String>) {
    val gone = ids.mapNotNull { _entries.value[it] }
    gone.forEach { e ->
      runCatching { fs.delete(dir / e.file) }
      e.cover?.let { runCatching { fs.delete(dir / it) } }
    }
    _entries.value = _entries.value - ids.toSet()
    persist()
  }
}
