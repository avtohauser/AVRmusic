// "Now listening" for friends: the player tells the server what it plays — at once when the track or
// play / pause changes, otherwise every 15 s while playing (friends see it for a minute and a half).
// The listener can switch it off in the settings.
package space.avthsr.music.player

import kotlinx.coroutines.launch
import space.avthsr.music.App
import space.avthsr.music.Platform
import space.avthsr.music.api.Api
import space.avthsr.music.api.reportNow

object NowReport {
  private var lastKey = ""
  private var lastAt = 0L

  /** Shown to friends (a setting, on by default). */
  fun enabled() = runCatching { Api.prefs.getBoolean("share.now", true) }.getOrDefault(true)

  fun setEnabled(on: Boolean) {
    Api.prefs.edit().putBoolean("share.now", on).apply()
    if (!on) App.scope.launch { runCatching { Api.reportNow(null, 0, false) } }
    lastKey = ""
  }

  /** Called by the player often (every few seconds and on changes); sends only what is needed. */
  fun update(trackId: String?, positionMs: Long, playing: Boolean) {
    if (Api.session.value == null || !enabled()) return
    val key = "$trackId $playing"
    val now = Platform.nowMs()
    if (key == lastKey && (!playing || now - lastAt < 15_000)) return
    lastKey = key
    lastAt = now
    App.scope.launch { runCatching { Api.reportNow(trackId, positionMs, playing) } }
  }
}
