// The user's likes, known everywhere at once (lists, the player, the ♥ in the notification shade).
// A toggle shows at once and is rolled back when the server refuses it. A superlike is a like with a
// star: the track stays in Liked and is also in Superlikes.
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
  private val _supers = MutableStateFlow<Set<String>>(emptySet())

  fun of(type: String): StateFlow<Set<String>> = flows.getValue(type)
  val tracks: StateFlow<Set<String>> get() = of("track")
  /** the superliked tracks (they are in [tracks] too) */
  val supers: StateFlow<Set<String>> get() = _supers

  suspend fun load() {
    val ids = runCatching { Api.likeIds() }.getOrNull() ?: return
    flows.forEach { (type, f) -> f.value = ids[type].orEmpty().toSet() }
    _supers.value = ids["super"].orEmpty().toSet()
  }

  fun clear() {
    flows.values.forEach { it.value = emptySet() }
    _supers.value = emptySet()
  }

  /** Likes or unlikes; returns the new state. No like, no star: unliking a track takes its superlike too. */
  suspend fun toggle(type: String, id: String): Boolean {
    val f = flows.getValue(type)
    val before = f.value to _supers.value
    val on = id !in f.value
    f.value = if (on) f.value + id else f.value - id
    if (!on && type == "track") _supers.value -= id
    try {
      Api.setLike(type, id, on)
    } catch (e: Exception) {
      f.value = before.first
      _supers.value = before.second
      throw e
    }
    return on
  }

  /** Puts the star on a track (liking it too) or takes it off (the like stays); returns whether it is on. */
  suspend fun toggleSuper(id: String): Boolean {
    val tracks = flows.getValue("track")
    val before = tracks.value to _supers.value
    val on = id !in _supers.value
    _supers.value = if (on) _supers.value + id else _supers.value - id
    if (on) tracks.value += id
    try {
      Api.setSuperLike(id, on)
    } catch (e: Exception) {
      tracks.value = before.first
      _supers.value = before.second
      throw e
    }
    return on
  }
}

/** How likes work for this listener, kept on the device: superlikes at all, what the heart's tap does, what goes first. */
object LikePrefs {
  private const val ON = "likes.super"
  private const val TAP = "likes.tap"
  private const val FIRST = "likes.first"

  private val _superOn by lazy { MutableStateFlow(runCatching { Api.prefs.getBoolean(ON, true) }.getOrDefault(true)) }
  private val _tapSuper by lazy { MutableStateFlow(runCatching { Api.prefs.getString(TAP, null) == "super" }.getOrDefault(false)) }
  private val _superFirst by lazy { MutableStateFlow(runCatching { Api.prefs.getString(FIRST, null) == "super" }.getOrDefault(false)) }

  /** superlikes at all: off — the heart only likes */
  val superOn: StateFlow<Boolean> get() = _superOn
  /** a tap on the heart gives a superlike (a long press — a plain like); otherwise the other way round */
  val tapSuper: StateFlow<Boolean> get() = _tapSuper
  /** Superlikes go before Liked in the library and on the home page */
  val superFirst: StateFlow<Boolean> get() = _superFirst

  fun setSuperOn(v: Boolean) { _superOn.value = v; Api.prefs.edit().putBoolean(ON, v).apply() }
  fun setTapSuper(v: Boolean) { _tapSuper.value = v; Api.prefs.edit().putString(TAP, if (v) "super" else "like").apply() }
  fun setSuperFirst(v: Boolean) { _superFirst.value = v; Api.prefs.edit().putString(FIRST, if (v) "super" else "liked").apply() }
}
