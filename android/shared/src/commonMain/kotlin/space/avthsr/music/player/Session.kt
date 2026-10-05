// The player remembers where it was: the queue, the track and the moment in it are kept on the phone,
// and come back after the app (or the phone) restarts — paused, ready to go on with one tap.
package space.avthsr.music.player

import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import space.avthsr.music.App
import space.avthsr.music.Platform
import space.avthsr.music.api.Api
import space.avthsr.music.api.Track

@Serializable
data class SavedSession(val tracks: List<Track>, val index: Int, val positionMs: Long, val context: String? = null, val waveMode: String? = null, val at: Long = 0)

object Session {
  private const val KEY = "player.session"
  private var lastPositionSave = 0L

  @OptIn(FlowPreview::class)
  fun init() {
    // the queue and the track, a moment after each change
    App.scope.launch {
      PlayerConn.state.debounce(1500).collect { s -> if (s.queue.isNotEmpty() && s.index >= 0) save(s.queue, s.index, PlayerConn.position()) }
    }
  }

  private fun save(queue: List<Track>, index: Int, positionMs: Long) {
    // a window around the current track is enough (a wave can be long)
    val from = (index - 50).coerceAtLeast(0)
    val window = queue.subList(from, (index + 150).coerceAtMost(queue.size))
    val s = SavedSession(window, index - from, positionMs, Queue.context.value?.takeIf { it != Jam.CONTEXT }, Queue.waveMode.value, Platform.nowMs())
    runCatching { Api.prefs.edit().putString(KEY, Api.json.encodeToString(SavedSession.serializer(), s)).apply() }
  }

  /** The player tells where it is now and then (the app's screens may be closed). */
  fun notePosition(trackId: String?, positionMs: Long) {
    val now = Platform.nowMs()
    if (now - lastPositionSave < 10_000 || trackId == null) return
    lastPositionSave = now
    val s = saved() ?: return
    if (s.tracks.getOrNull(s.index)?.id != trackId) return
    runCatching { Api.prefs.edit().putString(KEY, Api.json.encodeToString(SavedSession.serializer(), s.copy(positionMs = positionMs, at = now))).apply() }
  }

  fun saved(): SavedSession? = runCatching {
    Api.prefs.getString(KEY, null)?.let { Api.json.decodeFromString(SavedSession.serializer(), it) }
  }.getOrNull()

  fun clear() { runCatching { Api.prefs.edit().remove(KEY).apply() } }
}
