// Liked tracks saved on the phone by themselves while on Wi-Fi (a setting): whatever is liked and not
// saved yet is fetched in the background, so the favourites play on the road without the network.
package space.avthsr.music.player

import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.launch
import space.avthsr.music.App
import space.avthsr.music.api.Api
import space.avthsr.music.api.Likes

object AutoOffline {
  val enabled = MutableStateFlow(false)
  private var running = false

  @OptIn(FlowPreview::class)
  fun init() {
    enabled.value = Api.prefs.getBoolean("auto.offline", false)
    App.scope.launch {
      combine(enabled, Net.unmetered, Likes.tracks) { on, wifi, liked -> Triple(on, wifi, liked) }
        .debounce(5_000)
        .collect { (on, wifi, liked) -> if (on && wifi) sync(liked) }
    }
  }

  fun set(on: Boolean) {
    enabled.value = on
    Api.prefs.edit().putBoolean("auto.offline", on).apply()
  }

  private suspend fun sync(liked: Set<String>) {
    if (running || Api.session.value == null) return
    val missing = liked - Offline.entries.value.keys
    if (missing.isEmpty()) return
    running = true
    try {
      val tracks = runCatching { Api.likedTracks() }.getOrDefault(emptyList()).filter { it.id in missing }
      if (tracks.isNotEmpty()) Offline.save(tracks)
    } finally {
      running = false
    }
  }
}
