// Listening along with a friend: this phone follows what they play — the same song at the same moment,
// a new song when they switch, a pause when they pause — until the listener plays something of their own
// or stops it. The friend's app does nothing special: it reports what it plays anyway.
package space.avthsr.music.player

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import space.avthsr.music.App
import space.avthsr.music.Platform
import space.avthsr.music.api.Api
import space.avthsr.music.api.FriendNow
import space.avthsr.music.api.FriendRef
import space.avthsr.music.tr
import kotlin.math.abs

@Serializable
private data class FriendNowReply(val version: Int = 0, val now: FriendNow? = null, val serverNow: Long = 0)

object Follow {
  private val _friend = MutableStateFlow<FriendRef?>(null)
  /** the friend this phone listens along with, or null */
  val friend: StateFlow<FriendRef?> = _friend.asStateFlow()
  /** what plays here is the friend's (set by this object's own plays) */
  const val CONTEXT = "follow"
  private var loop: Job? = null

  fun start(f: FriendRef) {
    if (Jam.active) Jam.leave()
    stop(quiet = true)
    _friend.value = f
    App.say(tr("Вы слушаете вместе с {}", f.displayName))
    loop = App.scope.launch {
      var version: Int? = null
      var silentSince = 0L
      while (isActive && _friend.value?.id == f.id) {
        val r = try {
          Api.get<FriendNowReply>("/api/users/${Api.enc(f.id)}/now" + (version?.let { "?v=$it" } ?: ""))
        } catch (e: CancellationException) {
          throw e
        } catch (_: Exception) {
          delay(3000); continue
        }
        if (_friend.value?.id != f.id) break
        version = r.version
        val n = r.now
        if (n == null) {
          // the friend stopped (or closed the app): pause, and after a few minutes stop following
          if (silentSince == 0L) silentSince = Platform.nowMs()
          if (PlayerConn.state.value.wantsToPlay && Queue.context.value == CONTEXT) PlayerConn.toggle()
          if (Platform.nowMs() - silentSince > 5 * 60_000) { stop(); App.say(tr("{} больше не слушает — вы снова сами по себе", f.displayName)); break }
          delay(4000)
          continue
        }
        silentSince = 0L
        apply(n)
      }
    }
  }

  /** The friend's song at their moment; play / pause as they do; a seek when we drift apart. */
  private fun apply(n: FriendNow) {
    val s = PlayerConn.state.value
    if (s.track?.id != n.track.id) {
      PlayerConn.play(listOf(n.track), 0, CONTEXT)
      if (n.positionMs > 2000) App.scope.launch { delay(700); PlayerConn.seek(n.positionMs + 700) }
      if (!n.playing) App.scope.launch { delay(900); if (PlayerConn.state.value.wantsToPlay) PlayerConn.toggle() }
      return
    }
    if (s.wantsToPlay != n.playing) PlayerConn.toggle()
    if (n.playing && abs(PlayerConn.position() - n.positionMs) > 4000) PlayerConn.seek(n.positionMs)
  }

  /** The listener played something of their own (or tapped "stop"): no more following. */
  fun stop(quiet: Boolean = false) {
    val f = _friend.value ?: return
    _friend.value = null
    loop?.cancel(); loop = null
    if (!quiet) App.say(tr("Вы больше не слушаете с {}", f.displayName))
  }
}
