// The line being sung, in the notification shade and on the lock screen (a setting): the player shows it
// in place of the artist while a track with synced lyrics plays.
package space.avthsr.music.player

import kotlinx.coroutines.flow.MutableStateFlow
import space.avthsr.music.api.Api
import space.avthsr.music.api.LyricLine

object LockLyrics {
  val enabled = MutableStateFlow(false)
  private val cache = LinkedHashMap<String, List<LyricLine>?>()

  fun init() { enabled.value = runCatching { Api.prefs.getBoolean("lyrics.lock", false) }.getOrDefault(false) }

  fun set(on: Boolean) {
    enabled.value = on
    Api.prefs.edit().putBoolean("lyrics.lock", on).apply()
  }

  /** The synced lines of a library track (null: none), asked for once. */
  suspend fun lines(trackId: String): List<LyricLine>? {
    if (trackId.startsWith("dz:")) return null
    if (cache.containsKey(trackId)) return cache[trackId]
    val l = runCatching { Api.lyrics(trackId).synced?.takeIf { it.isNotEmpty() } }.getOrNull()
    cache[trackId] = l
    while (cache.size > 30) cache.remove(cache.keys.first())
    return l
  }

  /** The line at [positionMs] (a little early: the eye reads ahead of the voice), or null between lines. */
  fun lineAt(lines: List<LyricLine>, positionMs: Long): String? =
    lines.lastOrNull { it.timeMs <= positionMs + 300 }?.text?.replace(Regex("<[^>]*>"), "")?.trim()?.takeIf { it.isNotEmpty() }
}
