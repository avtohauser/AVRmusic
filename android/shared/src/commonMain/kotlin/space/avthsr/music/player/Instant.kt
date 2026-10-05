// Instant play from the catalogue: a song not on the server yet plays in full at once (the server passes
// its source through while it fetches it). Once it is in the library, the queue item quietly becomes the
// library's track — likes, lyrics, reactions and stats then work on it as on any other.
package space.avthsr.music.player

import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import space.avthsr.music.App
import space.avthsr.music.api.Api
import space.avthsr.music.api.CatalogTrack
import space.avthsr.music.api.asTrack
import space.avthsr.music.api.catalogPlay
import space.avthsr.music.api.catalogPlayStatus
import space.avthsr.music.tr

object Instant {
  private var watching: Job? = null

  /** Plays catalogue tracks from [index]: the tapped one is started on the server right away. */
  fun play(list: List<CatalogTrack>, index: Int, context: String = "catalog") {
    if (list.isEmpty()) return
    val i = index.coerceIn(0, list.size - 1)
    App.scope.launch {
      val first = runCatching { Api.catalogPlay(list[i].id) }.getOrElse { App.say(it.message ?: tr("Не получилось")); return@launch }
      val tracks = list.mapIndexed { n, t -> if (n == i) first.track else t.asTrack() }
      if (!first.ready) App.say(tr("Играет сразу целиком — трек уже скачивается на сервер"))
      PlayerConn.play(tracks, i, context)
      watch()
    }
  }

  fun playOne(t: CatalogTrack) = play(listOf(t), 0)

  /** While a "dz:" track plays, ask now and then whether it is in the library yet. */
  fun watch() {
    if (watching?.isActive == true) return
    watching = App.scope.launch {
      PlayerConn.state.distinctUntilChanged { a, b -> a.queue.map { it.id } == b.queue.map { it.id } }.collect { s ->
        s.queue.map { it.id }.filter { it.startsWith("dz:") }.distinct().forEach { id -> follow(id) }
      }
    }
  }

  private val following = mutableSetOf<String>()

  private fun follow(id: String) {
    if (!following.add(id)) return
    App.scope.launch {
      val deezerId = id.removePrefix("dz:").toLongOrNull() ?: return@launch
      // about five minutes: a song is usually in within a minute
      repeat(60) {
        delay(5_000)
        val st = runCatching { Api.catalogPlayStatus(deezerId) }.getOrNull()
        val t = st?.track
        if (st?.status == "ready" && t != null) {
          Queue.alias(id, t)
          PlayerConn.refresh()
          following.remove(id)
          return@launch
        }
        // nobody is fetching it (no rights, or it failed) and it is no longer queued: stop asking
        if (st?.status == "failed" || PlayerConn.state.value.queue.none { it.id == id || Queue.track(id)?.id == it.id }) { following.remove(id); return@launch }
      }
      following.remove(id)
    }
  }
}
