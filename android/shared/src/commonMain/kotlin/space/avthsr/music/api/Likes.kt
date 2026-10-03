// The user's likes, known everywhere at once (lists, the player, the ♥ in the notification shade).
// A toggle shows at once and is rolled back when the server refuses it.
package space.avthsr.music.api

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

object Likes {
  private val flows = mapOf(
    "track" to MutableStateFlow<Set<String>>(emptySet()),
    "album" to MutableStateFlow<Set<String>>(emptySet()),
    "artist" to MutableStateFlow<Set<String>>(emptySet()),
    "playlist" to MutableStateFlow<Set<String>>(emptySet()),
  )

  fun of(type: String): StateFlow<Set<String>> = flows.getValue(type)
  val tracks: StateFlow<Set<String>> get() = of("track")

  suspend fun load() {
    val ids = runCatching { Api.likeIds() }.getOrNull() ?: return
    flows.forEach { (type, f) -> f.value = ids[type].orEmpty().toSet() }
  }

  fun clear() = flows.values.forEach { it.value = emptySet() }

  /** Likes or unlikes; returns the new state. */
  suspend fun toggle(type: String, id: String): Boolean {
    val f = flows.getValue(type)
    val on = id !in f.value
    f.value = if (on) f.value + id else f.value - id
    try {
      Api.setLike(type, id, on)
    } catch (e: Exception) {
      f.value = if (on) f.value - id else f.value + id
      throw e
    }
    return on
  }
}
