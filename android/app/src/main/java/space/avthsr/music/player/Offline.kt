// Tracks saved for offline listening ("Сохранить офлайн"): the audio file and its cover live in the
// app's own storage with a small index; the player prefers them to the network, so saved music plays
// on a plane. Saving runs in the background, one track after another, with progress per track.
package space.avthsr.music.player

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import okhttp3.OkHttpClient
import okhttp3.Request
import space.avthsr.music.App
import space.avthsr.music.api.Api
import space.avthsr.music.api.Track
import java.io.File
import java.util.concurrent.TimeUnit

@Serializable
data class OfflineEntry(val track: Track, val savedAt: Long, val size: Long, val file: String, val cover: String? = null)

object Offline {
  private lateinit var dir: File
  private val index get() = File(dir, "index.json")
  private val http = OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS).readTimeout(90, TimeUnit.SECONDS).build()
  private val lock = Mutex()

  private val _entries = MutableStateFlow<Map<String, OfflineEntry>>(emptyMap())
  val entries: StateFlow<Map<String, OfflineEntry>> = _entries.asStateFlow()

  /** tracks being saved right now: id → 0..1 */
  private val _progress = MutableStateFlow<Map<String, Float>>(emptyMap())
  val progress: StateFlow<Map<String, Float>> = _progress.asStateFlow()

  fun init(context: Context) {
    dir = File(context.filesDir, "offline").apply { mkdirs() }
    val list = runCatching { Api.json.decodeFromString(ListSerializer(OfflineEntry.serializer()), index.readText()) }.getOrDefault(emptyList())
    _entries.value = list.filter { File(dir, it.file).exists() }.associateBy { it.track.id }
  }

  private fun persist() {
    runCatching { index.writeText(Api.json.encodeToString(ListSerializer(OfflineEntry.serializer()), _entries.value.values.toList())) }
  }

  fun has(id: String) = id in _entries.value
  fun file(id: String): File? = _entries.value[id]?.let { File(dir, it.file) }?.takeIf { it.exists() }
  fun cover(id: String): File? = _entries.value[id]?.cover?.let { File(dir, it) }?.takeIf { it.exists() }
  fun usage(): Long = _entries.value.values.sumOf { it.size }

  /** Saves the tracks in the background (already saved ones are skipped). */
  fun save(tracks: List<Track>) {
    val todo = tracks.filter { !has(it.id) && it.id !in _progress.value }
    if (todo.isEmpty()) return
    _progress.value = _progress.value + todo.associate { it.id to 0f }
    App.say(if (todo.size == 1) "Сохраняю офлайн: ${todo[0].title}" else "Сохраняю офлайн ${todo.size} треков")
    App.scope.launch {
      var failed = 0
      for (t in todo) {
        val ok = runCatching { lock.withLock { saveOne(t) } }.isSuccess
        if (!ok) failed++
        _progress.value = _progress.value - t.id
      }
      App.say(if (failed == 0) "Сохранено офлайн" else "Сохранено офлайн, не получилось: $failed")
    }
  }

  private suspend fun saveOne(t: Track) = withContext(Dispatchers.IO) {
    val req = Request.Builder().url(Api.streamUrl(t.id) + "&offline=1").build()
    val (name, size) = http.newCall(req).execute().use { r ->
      if (!r.isSuccessful) error("HTTP ${r.code}")
      val body = r.body ?: error("пустой ответ")
      val ext = when (body.contentType()?.subtype) {
        "mpeg" -> "mp3"; "flac", "x-flac" -> "flac"; "mp4", "x-m4a", "aac" -> "m4a"; "ogg" -> "ogg"; "opus" -> "opus"; "webm" -> "webm"; "wav", "x-wav" -> "wav"
        else -> "audio"
      }
      val total = body.contentLength().takeIf { it > 0 }
      val part = File(dir, "${t.id}.part")
      var done = 0L
      var last = 0L
      body.byteStream().use { input ->
        part.outputStream().use { out ->
          val buf = ByteArray(64 * 1024)
          while (true) {
            val n = input.read(buf)
            if (n < 0) break
            out.write(buf, 0, n)
            done += n
            if (total != null && done - last > 256 * 1024) {
              last = done
              _progress.value = _progress.value + (t.id to (done.toFloat() / total).coerceIn(0f, 1f))
            }
          }
        }
      }
      val name = "${t.id}.$ext"
      if (!part.renameTo(File(dir, name))) error("не удалось сохранить файл")
      name to done
    }
    val cover = Api.img(t.coverUrl)?.let { url ->
      runCatching {
        http.newCall(Request.Builder().url(url).build()).execute().use { r ->
          if (!r.isSuccessful) return@runCatching null
          val c = "${t.id}.jpg"
          File(dir, c).outputStream().use { out -> r.body?.byteStream()?.copyTo(out) }
          c
        }
      }.getOrNull()
    }
    _entries.value = _entries.value + (t.id to OfflineEntry(t, System.currentTimeMillis(), size, name, cover))
    persist()
  }

  fun remove(ids: Collection<String>) {
    val gone = ids.mapNotNull { _entries.value[it] }
    gone.forEach { e ->
      File(dir, e.file).delete()
      e.cover?.let { File(dir, it).delete() }
    }
    _entries.value = _entries.value - ids.toSet()
    persist()
  }
}
