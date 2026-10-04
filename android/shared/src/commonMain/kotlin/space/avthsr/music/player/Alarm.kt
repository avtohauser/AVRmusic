// The music alarm: at the set time "My Wave" (or the favourites) starts by itself and rises from a
// whisper to full volume over a minute. Once or on chosen days of the week. On Android the system's
// alarm clock wakes the player service; on iOS a notification rings and a tap starts the music (if the
// app is alive at that moment, the music starts by itself).
package space.avthsr.music.player

import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer
import space.avthsr.music.App
import space.avthsr.music.Platform
import space.avthsr.music.api.Api
import space.avthsr.music.api.Track
import space.avthsr.music.localTime
import space.avthsr.music.tr

data class AlarmSetting(
  val on: Boolean = false,
  val hour: Int = 7,
  val minute: Int = 30,
  /** 1 = Monday … 7 = Sunday; empty: once */
  val days: Set<Int> = emptySet(),
  /** a wave mode ("mix", "run" …) or "liked" */
  val source: String = "mix",
)

object Alarm {
  val setting = MutableStateFlow(AlarmSetting())
  /** when it rings next (epoch ms) */
  val next = MutableStateFlow<Long?>(null)
  private var timer: Job? = null

  /** how long the music takes to rise to full volume */
  const val RISE_MS = 60_000L

  fun init() {
    val p = Api.prefs
    setting.value = AlarmSetting(
      on = p.getBoolean("alarm.on", false),
      hour = p.getInt("alarm.hour", 7),
      minute = p.getInt("alarm.minute", 30),
      days = (p.getString("alarm.days", "") ?: "").split(',').mapNotNull { it.toIntOrNull() }.toSet(),
      source = p.getString("alarm.source", "mix") ?: "mix",
    )
    reschedule(prefetch = true)
  }

  fun save(s: AlarmSetting) {
    setting.value = s
    Api.prefs.edit().putBoolean("alarm.on", s.on).putInt("alarm.hour", s.hour).putInt("alarm.minute", s.minute)
      .putString("alarm.days", s.days.sorted().joinToString(",")).putString("alarm.source", s.source).apply()
    reschedule(prefetch = true)
  }

  /** The next moment the alarm rings, after [fromMs]. */
  fun nextAfter(s: AlarmSetting, fromMs: Long): Long? {
    if (!s.on) return null
    // walk forward by days from today in local time, a minute step is not needed: find today's time
    val now = localTime(fromMs)
    val sinceMidnight = (now.hour * 60 + now.minute) * 60_000L + fromMs % 60_000L
    val todayMidnight = fromMs - sinceMidnight
    for (d in 0..7) {
      // a day later (DST shifts of an hour are corrected below by re-reading the local time)
      var at = todayMidnight + d * 86_400_000L + (s.hour * 60 + s.minute) * 60_000L
      val lt = localTime(at)
      at += ((s.hour - lt.hour) * 60 + (s.minute - lt.minute)) * 60_000L
      if (at <= fromMs + 5_000) continue
      if (s.days.isEmpty() || weekday(at) in s.days) return at
    }
    return null
  }

  /** 1 = Monday … 7 = Sunday, in local time. */
  private fun weekday(ms: Long): Int {
    // 1970-01-01 was a Thursday; the local date's day number gives the weekday
    val t = localTime(ms)
    val days = daysFromCivil(t.year, t.month, t.day)
    return (((days + 3) % 7 + 7) % 7 + 1).toInt()
  }

  private fun daysFromCivil(y0: Int, m: Int, d: Int): Long {
    val y = if (m <= 2) y0 - 1 else y0
    val era = (if (y >= 0) y else y - 399) / 400
    val yoe = y - era * 400
    val doy = (153 * (m + (if (m > 2) -3 else 9)) + 2) / 5 + d - 1
    val doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
    return era * 146097L + doe - 719468
  }

  fun reschedule(prefetch: Boolean = false) {
    val at = nextAfter(setting.value, Platform.nowMs())
    next.value = at
    timer?.cancel()
    if (at == null) { AlarmClock.cancel(); return }
    AlarmClock.schedule(at)
    if (prefetch) App.scope.launch { prepare() }
    // the app alive at that moment starts the music itself (on iOS this is the only way without a tap)
    if (Platform.name == "iOS") timer = App.scope.launch {
      delay((at - Platform.nowMs()).coerceAtLeast(0))
      ring()
    }
  }

  /** Tracks ready for the alarm (kept, so the music starts at once, even before the network wakes up). */
  private suspend fun prepare() {
    if (Api.session.value == null) return
    val s = setting.value
    val list = runCatching {
      if (s.source == "liked") Api.likedTracks().shuffled().take(40)
      else Api.waveNext(s.source, emptyList()).tracks
    }.getOrNull() ?: return
    if (list.isNotEmpty()) Api.prefs.edit().putString("alarm.tracks", Api.json.encodeToString(ListSerializer(Track.serializer()), list)).apply()
  }

  /** What the alarm plays: the kept tracks (a fresh set is fetched for next time). */
  fun storedTracks(): List<Track> = runCatching {
    Api.json.decodeFromString(ListSerializer(Track.serializer()), Api.prefs.getString("alarm.tracks", null) ?: "[]")
  }.getOrDefault(emptyList())

  /** The alarm's music is about to start: it rises from quiet; the next ring is set. */
  fun fired() {
    Gain.alarm = 0.05f
    alarmStartedAt = Platform.nowMs()
    val s = setting.value
    if (s.days.isEmpty()) save(s.copy(on = false)) else reschedule(prefetch = true)
  }

  private var alarmStartedAt = 0L

  /** Called by the player several times a second: the alarm's volume rise. */
  fun rise() {
    if (alarmStartedAt == 0L) return
    val k = (Platform.nowMs() - alarmStartedAt).toFloat() / RISE_MS
    if (k >= 1f) { Gain.alarm = 1f; alarmStartedAt = 0L } else Gain.alarm = 0.05f + 0.95f * k
  }

  /** Starts the alarm's music from the app (iOS, or a tap on the notification). */
  suspend fun ring() {
    if (Api.session.value == null) return
    val s = setting.value
    val list = storedTracks().ifEmpty {
      runCatching { if (s.source == "liked") Api.likedTracks().shuffled().take(40) else Api.waveNext(s.source, emptyList()).tracks }.getOrDefault(emptyList())
    }
    if (list.isEmpty()) return
    fired()
    if (s.source != "liked") Queue.setWaveMode(s.source)
    PlayerConn.play(list, 0, if (s.source == "liked") "liked" else Queue.WAVE)
    App.say(tr("Доброе утро! Будильник включил музыку"))
  }
}

/** The system's alarm: rings at [atMs] even with the app closed. */
expect object AlarmClock {
  fun schedule(atMs: Long)
  fun cancel()
}
