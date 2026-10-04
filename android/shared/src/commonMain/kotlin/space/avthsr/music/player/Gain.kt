// How loud the player plays, from one place: smooth transitions (each track fades in at its start and
// out at its end), loudness normalization (every track brought to the same loudness from the level the
// server measured), the sleep timer's and the alarm's fades, and the equalizer's settings. The player
// (PlaybackService on Android, IosEngine on iOS) asks for the volume several times a second.
package space.avthsr.music.player

import kotlinx.coroutines.flow.MutableStateFlow
import space.avthsr.music.Platform
import space.avthsr.music.api.Api
import space.avthsr.music.api.Track
import space.avthsr.music.tr
import space.avthsr.music.ui.Choice
import kotlin.concurrent.Volatile
import kotlin.math.min
import kotlin.math.pow

data class EqPreset(val id: String, val label: String, val bands: List<Float>)

object Gain {
  /** the loudness every track is brought to (LUFS, like the streaming services) */
  const val TARGET_LUFS = -14.0

  /** the alarm fading the music in, 0…1 */
  @Volatile var alarm = 1f

  /** the sleep timer: when the music stops (epoch ms), or at the end of the current track */
  val sleepAt = MutableStateFlow<Long?>(null)
  val sleepAtTrackEnd = MutableStateFlow(false)

  /** The sleep timer's time has come (the player pauses and calls [slept]). */
  fun sleepDue(nowMs: Long): Boolean = sleepAt.value?.let { nowMs >= it } == true

  /** The player paused for the sleep timer. */
  fun slept() {
    sleepAt.value = null
    sleepAtTrackEnd.value = false
    space.avthsr.music.App.say(tr("Таймер сна: музыка остановлена"))
  }

  /** The sleep timer's fade: the last half minute, or the last seconds of the track. */
  private fun sleepFactor(nowMs: Long, positionMs: Long, durationMs: Long): Float {
    sleepAt.value?.let { at -> return ((at - nowMs) / 30_000f).coerceIn(0f, 1f) }
    if (sleepAtTrackEnd.value && durationMs > 0) return ((durationMs - positionMs) / 4_000f).coerceIn(0f, 1f)
    return 1f
  }

  /** fade length at the start and end of every track, ms (0 = off) */
  val fadeMs = MutableStateFlow(0)
  val normalize = MutableStateFlow(true)
  val eqOn = MutableStateFlow(false)
  val eqPreset = MutableStateFlow("flat")
  /** dB for each of [EQ_FREQS] */
  val eqBands = MutableStateFlow(List(EQ_FREQS.size) { 0f })

  val fades get() = listOf(0, 2000, 4000, 6000, 8000, 12000).map { Choice(it.toString(), if (it == 0) tr("Выкл.") else tr("{} с", it / 1000)) }

  val presets get() = listOf(
    EqPreset("flat", tr("Ровно"), listOf(0f, 0f, 0f, 0f, 0f)),
    EqPreset("bass", tr("Басы"), listOf(6f, 4f, 0f, 0f, 1f)),
    EqPreset("vocal", tr("Голос"), listOf(-2f, 0f, 3f, 4f, 1f)),
    EqPreset("rock", tr("Рок"), listOf(4f, 2f, -2f, 2f, 4f)),
    EqPreset("pop", tr("Поп"), listOf(-1f, 2f, 4f, 2f, -1f)),
    EqPreset("electronic", tr("Электроника"), listOf(5f, 3f, 0f, 2f, 5f)),
    EqPreset("acoustic", tr("Акустика"), listOf(3f, 1f, 1f, 2f, 3f)),
    EqPreset("treble", tr("Высокие"), listOf(0f, 0f, 0f, 3f, 6f)),
    EqPreset("night", tr("Ночь (тише басы)"), listOf(-5f, -2f, 1f, 1f, -1f)),
  )

  fun init() {
    val p = Api.prefs
    fadeMs.value = p.getInt("fade.ms", 0)
    normalize.value = p.getBoolean("norm", true)
    eqOn.value = p.getBoolean("eq.on", false)
    eqPreset.value = p.getString("eq.preset", "flat") ?: "flat"
    eqBands.value = (p.getString("eq.bands", null)?.split(',')?.mapNotNull { it.toFloatOrNull() }?.takeIf { it.size == EQ_FREQS.size }) ?: eqBands.value
  }

  fun setFade(ms: Int) { fadeMs.value = ms; Api.prefs.edit().putInt("fade.ms", ms).apply() }
  fun setNormalize(on: Boolean) { normalize.value = on; Api.prefs.edit().putBoolean("norm", on).apply() }
  fun setEqOn(on: Boolean) { eqOn.value = on; Api.prefs.edit().putBoolean("eq.on", on).apply() }

  fun setPreset(id: String) {
    val p = presets.firstOrNull { it.id == id } ?: return
    eqPreset.value = id
    eqBands.value = p.bands
    Api.prefs.edit().putString("eq.preset", id).putString("eq.bands", p.bands.joinToString(",")).apply()
  }

  fun setBand(i: Int, db: Float) {
    eqBands.value = eqBands.value.toMutableList().also { it[i] = db.coerceIn(-12f, 12f) }
    eqPreset.value = "custom"
    Api.prefs.edit().putString("eq.preset", "custom").putString("eq.bands", eqBands.value.joinToString(",")).apply()
  }

  /** dB to bring a track of [lufs] to the target (negative: quieter); 0 when unknown or switched off. */
  fun normDb(lufs: Double?): Double {
    if (!normalize.value || lufs == null || lufs >= 0.0 || lufs < -60.0) return 0.0
    return (TARGET_LUFS - lufs).coerceIn(-15.0, 8.0)
  }

  /** The volume (0…1) for a track at [positionMs] of [durationMs]: louder tracks are turned down here, quieter ones up by the player's own booster where there is one. */
  fun volume(t: Track?, positionMs: Long, durationMs: Long): Float {
    val db = normDb(t?.loudness)
    val norm = if (db < 0) 10.0.pow(db / 20).toFloat() else 1f
    val sleep = sleepFactor(Platform.nowMs(), positionMs, durationMs)
    return (sleep * alarm * norm * fade(positionMs, durationMs)).coerceIn(0f, 1f)
  }

  /** Smooth transitions: up from silence at the start, down to it at the end. */
  fun fade(positionMs: Long, durationMs: Long): Float {
    val f = fadeMs.value
    if (f <= 0 || durationMs <= 0 || durationMs < f * 3L) return 1f
    val inK = (positionMs.toFloat() / f).coerceIn(0f, 1f)
    val outK = ((durationMs - positionMs).toFloat() / f).coerceIn(0f, 1f)
    // an ease so the change is heard as even
    fun ease(x: Float) = x * x * (3 - 2 * x)
    return min(ease(inK), ease(outK))
  }
}

/** The equalizer's bands, Hz (the usual five of a phone's equalizer). */
val EQ_FREQS = listOf(60, 230, 910, 3600, 14000)
