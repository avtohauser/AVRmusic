// State shared by the player service and the screens (same process): the tracks behind the queue's
// media items, what is playing (an album, a playlist, "My Wave" …) and the wave's mode.
@file:OptIn(ExperimentalAtomicApi::class)

package space.avthsr.music.player

import kotlin.concurrent.atomics.AtomicReference
import kotlin.concurrent.atomics.ExperimentalAtomicApi

import kotlinx.coroutines.flow.MutableStateFlow
import org.jetbrains.compose.resources.DrawableResource
import space.avthsr.music.api.Api
import space.avthsr.music.api.Track
import space.avthsr.music.res.Res
import space.avthsr.music.res.ic_all_inclusive
import space.avthsr.music.res.ic_explore
import space.avthsr.music.res.ic_fire
import space.avthsr.music.res.ic_heart_filled
import space.avthsr.music.tr

data class WaveMode(val id: String, val label: String, val hint: String, val icon: DrawableResource)

object Queue {
  const val WAVE = "wave"

  val modes get() = listOf(
    WaveMode("mix", tr("Микс"), tr("Любимое и новое вперемешку"), Res.drawable.ic_all_inclusive),
    WaveMode("favorites", tr("Любимое"), tr("То, что вы слушаете чаще всего"), Res.drawable.ic_heart_filled),
    WaveMode("discover", tr("Незнакомое"), tr("Новая музыка рядом с любимой — волна сама находит и докачивает"), Res.drawable.ic_explore),
    WaveMode("popular", tr("Популярное"), tr("Что слушают друзья"), Res.drawable.ic_fire),
  )

  // the player service and the screens both touch it (on Android from different threads)
  private val tracks = AtomicReference(mapOf<String, Track>())

  /** "wave", "album:<id>", "playlist:<id>", "liked" … — sent with play reports */
  val context = MutableStateFlow<String?>(null)
  val waveMode = MutableStateFlow("mix")

  fun init() {
    waveMode.value = Api.prefs.getString("waveMode", "mix") ?: "mix"
  }

  fun setWaveMode(mode: String) {
    waveMode.value = mode
    Api.prefs.edit().putString("waveMode", mode).apply()
  }

  fun remember(list: List<Track>) {
    while (true) {
      val cur = tracks.load()
      if (tracks.compareAndSet(cur, cur + list.associateBy { it.id })) return
    }
  }

  fun track(id: String?): Track? = id?.let { tracks.load()[it] }
}
