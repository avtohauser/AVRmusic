// Times as the server sends them (ISO or SQLite, UTC) and as the screens show them, in the app's
// language and the phone's time zone.
package space.avthsr.music

private fun daysFromCivil(y0: Int, m: Int, d: Int): Long {
  val y = if (m <= 2) y0 - 1 else y0
  val era = (if (y >= 0) y else y - 399) / 400
  val yoe = y - era * 400
  val doy = (153 * (if (m > 2) m - 3 else m + 9) + 2) / 5 + d - 1
  val doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
  return era * 146097L + doe - 719468
}

/** Server time ("2025-01-02T03:04:05.678Z", "2025-01-02 03:04:05", "2025-01-02") in epoch milliseconds. */
fun parseTime(s: String?): Long? {
  if (s.isNullOrBlank()) return null
  val m = Regex("""^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?(Z|[+-]\d{2}:?\d{2})?$""").matchEntire(s.trim()) ?: return null
  val g = m.groupValues
  val days = daysFromCivil(g[1].toInt(), g[2].toInt(), g[3].toInt())
  val h = g[4].toIntOrNull() ?: 0
  val min = g[5].toIntOrNull() ?: 0
  val sec = g[6].toIntOrNull() ?: 0
  val ms = g[7].takeIf { it.isNotEmpty() }?.padEnd(3, '0')?.take(3)?.toInt() ?: 0
  var t = ((days * 24 + h) * 60 + min) * 60_000L + sec * 1000L + ms
  val zone = g[8]
  if (zone.length > 1) {
    val z = zone.replace(":", "")
    val off = (z.substring(1, 3).toInt() * 60 + z.substring(3, 5).toInt()) * 60_000L
    t -= if (z[0] == '+') off else -off
  }
  return t
}

private fun p2(n: Int) = n.toString().padStart(2, '0')

/** "2025-01-02T03:04:05.678Z" */
fun isoUtc(ms: Long): String {
  val days = ms.floorDiv(86_400_000L)
  val rest = ms - days * 86_400_000L
  // civil from days (Howard Hinnant)
  val z = days + 719468
  val era = (if (z >= 0) z else z - 146096) / 146097
  val doe = z - era * 146097
  val yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365
  val doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
  val mp = (5 * doy + 2) / 153
  val d = (doy - (153 * mp + 2) / 5 + 1).toInt()
  val m = (if (mp < 10) mp + 3 else mp - 9).toInt()
  val y = (yoe + era * 400 + if (m <= 2) 1 else 0).toInt()
  val h = (rest / 3_600_000).toInt()
  val min = (rest / 60_000 % 60).toInt()
  val s = (rest / 1000 % 60).toInt()
  val milli = (rest % 1000).toInt()
  return "$y-${p2(m)}-${p2(d)}T${p2(h)}:${p2(min)}:${p2(s)}.${milli.toString().padStart(3, '0')}Z"
}

private val monthsRu = listOf("янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек.")
private val monthsEn = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

/** "3 окт. 2025" */
fun fmtDate(ms: Long): String {
  val t = localTime(ms)
  val mon = (if (Lang.code == "en") monthsEn else monthsRu)[t.month - 1]
  return "${t.day} $mon ${t.year}"
}

/** "14:05" in the phone's time zone */
fun fmtClock(ms: Long): String {
  val t = localTime(ms)
  return "${p2(t.hour)}:${p2(t.minute)}"
}

/** A number with [decimals] digits after the point (a comma in Russian). */
fun fmtNumber(v: Double, decimals: Int): String {
  var f = 1L
  repeat(decimals) { f *= 10 }
  val r = kotlin.math.round(v * f).toLong()
  val whole = r / f
  val frac = (r % f).let { if (it < 0) -it else it }
  if (decimals == 0) return whole.toString()
  return "$whole${if (Lang.code == "en") "." else ","}${frac.toString().padStart(decimals, '0')}"
}
