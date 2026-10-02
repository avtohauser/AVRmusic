// State shared by the player service and the screens (same process): the tracks behind the queue's
// media items, what is playing (an album, a playlist, "My Wave" …) and the wave's mode.
package space.avthsr.music.player

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import space.avthsr.music.R
import space.avthsr.music.data.Track
import java.util.concurrent.ConcurrentHashMap

data class WaveMode(val id: String, val label: String, val hint: String, val icon: Int)

object Queue {
  const val WAVE = "wave"

  val modes = listOf(
    WaveMode("mix", "Микс", "Любимое и новое вперемешку", R.drawable.ic_all_inclusive),
    WaveMode("favorites", "Любимое", "То, что вы слушаете чаще всего", R.drawable.ic_heart_filled),
    WaveMode("discover", "Незнакомое", "Новые для вас исполнители рядом с любимыми", R.drawable.ic_explore),
    WaveMode("popular", "Популярное", "Что слушают друзья", R.drawable.ic_fire),
  )

  private val tracks = ConcurrentHashMap<String, Track>()
  private lateinit var prefs: SharedPreferences

  /** "wave", "album:<id>", "playlist:<id>", "liked" … — sent with play reports */
  val context = MutableStateFlow<String?>(null)
  val waveMode = MutableStateFlow("mix")

  fun init(c: Context) {
    prefs = c.getSharedPreferences("avr", Context.MODE_PRIVATE)
    waveMode.value = prefs.getString("waveMode", "mix") ?: "mix"
  }

  fun setWaveMode(mode: String) {
    waveMode.value = mode
    prefs.edit().putString("waveMode", mode).apply()
  }

  fun remember(list: List<Track>) = list.forEach { tracks[it.id] = it }
  fun track(id: String?): Track? = id?.let { tracks[it] }
}
