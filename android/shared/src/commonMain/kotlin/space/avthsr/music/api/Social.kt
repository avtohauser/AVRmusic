// Friends on the server: who listens to what right now, their pages and how close their taste is,
// things sent to each other (with a notification), reactions at a moment of a track, shared playlists,
// "listen together" sessions and the listener's recap of a month or a year.
package space.avthsr.music.api

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import space.avthsr.music.Platform
import space.avthsr.music.localTime
import space.avthsr.music.tr

@Serializable
data class FriendRef(val id: String, val displayName: String = "", val avatarUrl: String? = null)

@Serializable
data class FriendNow(val track: Track, val positionMs: Long = 0, val playing: Boolean = false, val at: String = "")

@Serializable
data class Friend(
  val id: String,
  val username: String = "",
  val displayName: String = "",
  val avatarUrl: String? = null,
  val lastSeenAt: String? = null,
  val now: FriendNow? = null,
  val jamId: String? = null,
) {
  val name get() = displayName.ifBlank { username }
  val ref get() = FriendRef(id, name, avatarUrl)
}

@Serializable
data class Compat(val score: Int = 0, val label: String = "different", val commonArtists: List<ArtistSummary> = emptyList(), val commonTracks: List<Track> = emptyList())

@Serializable
data class FriendStats(val minutes: Int = 0, val topArtists: List<ArtistSummary> = emptyList(), val recent: List<Track> = emptyList(), val likes: Int = 0)

@Serializable
data class FriendPage(
  val id: String,
  val username: String = "",
  val displayName: String = "",
  val avatarUrl: String? = null,
  val lastSeenAt: String? = null,
  val now: FriendNow? = null,
  val jamId: String? = null,
  val createdAt: String = "",
  val stats: FriendStats = FriendStats(),
  val compat: Compat? = null,
  val playlists: List<PlaylistSummary> = emptyList(),
) {
  val name get() = displayName.ifBlank { username }
}

/** Something a friend sent: a track, album, artist, playlist or an invitation to listen together. */
@Serializable
data class Share(
  val id: String,
  val from: FriendRef? = null,
  val kind: String,
  val refId: String,
  val item: JsonObject? = null,
  val message: String = "",
  val seen: Boolean = false,
  val createdAt: String = "",
)

@Serializable
data class Reaction(val id: String, val user: FriendRef? = null, val atMs: Long = 0, val emoji: String = "", val text: String = "", val createdAt: String = "")

@Serializable
data class JamView(
  val id: String,
  val host: FriendRef? = null,
  val members: List<FriendRef> = emptyList(),
  val queue: List<Track> = emptyList(),
  val index: Int = 0,
  val positionMs: Long = 0,
  val playing: Boolean = false,
  val version: Int = 0,
  val serverNow: Long = 0,
  val lastBy: FriendRef? = null,
  val lastAction: String? = null,
  /** songs people want next, most votes first; the leader waits right after the current song */
  val suggestions: List<JamSuggestion> = emptyList(),
)

@Serializable
data class JamSummary(val id: String, val host: FriendRef? = null, val members: List<FriendRef> = emptyList(), val track: Track? = null, val playing: Boolean = false)

@Serializable
data class RecapTrack(val track: Track, val plays: Int = 0, val minutes: Int = 0)

@Serializable
data class RecapArtist(val artist: ArtistSummary, val minutes: Int = 0, val plays: Int = 0)

@Serializable
data class RecapGenre(val name: String, val share: Int = 0)

@Serializable
data class RecapDay(val date: String, val minutes: Int = 0)

@Serializable
data class Recap(
  val period: String = "month",
  val offset: Int = 0,
  val label: String = "",
  val minutes: Int = 0,
  val previousMinutes: Int = 0,
  val plays: Int = 0,
  val distinctTracks: Int = 0,
  val distinctArtists: Int = 0,
  val genres: Int = 0,
  val newArtists: Int = 0,
  val discoveries: Int = 0,
  val streakDays: Int = 0,
  val activeDays: Int = 0,
  val busiestDay: RecapDay? = null,
  val peakHour: Int? = null,
  val hours: List<Int> = emptyList(),
  val topTracks: List<RecapTrack> = emptyList(),
  val topArtists: List<RecapArtist> = emptyList(),
  val topGenres: List<RecapGenre> = emptyList(),
  val topAlbum: AlbumSummary? = null,
  val firstTrack: Track? = null,
  val personality: String = "none",
)

@Serializable
data class Recognized(val title: String, val artist: String = "", val coverUrl: String? = null, val isrc: String? = null, val catalog: List<CatalogTrack> = emptyList())

private fun ids(list: List<String>) = JsonArray(list.map { JsonPrimitive(it) })

/* ---------- friends ---------- */

suspend fun Api.friends(): List<Friend> = get("/api/users")
suspend fun Api.friend(id: String): FriendPage = get("/api/users/${enc(id)}")

/** What this phone plays now (friends see it for a minute and a half after the last word). */
suspend fun Api.reportNow(trackId: String?, positionMs: Long, playing: Boolean) {
  call("POST", "/api/me/now", buildJsonObject { put("trackId", trackId); put("positionMs", positionMs.coerceAtLeast(0)); put("playing", playing) }.toString())
}

/** The listener's month or year; [offset] 1 is the previous one. */
suspend fun Api.recap(period: String, offset: Int): Recap {
  val now = Platform.nowMs()
  val t = localTime(now)
  // minutes east of UTC, from the local and UTC clocks
  val utcMin = ((now / 60_000) % (24 * 60)).toInt()
  var tz = t.hour * 60 + t.minute - utcMin
  if (tz > 14 * 60) tz -= 24 * 60
  if (tz < -14 * 60) tz += 24 * 60
  return get("/api/me/recap?period=$period&offset=$offset&tz=$tz")
}

/* ---------- sending ---------- */

suspend fun Api.sendShare(to: List<String>, kind: String, refId: String, message: String) {
  call("POST", "/api/shares", buildJsonObject {
    put("to", ids(to)); put("kind", kind); put("refId", refId); put("message", message.trim())
  }.toString())
}

suspend fun Api.shares(after: String? = null): List<Share> = get("/api/shares" + (after?.let { "?after=${enc(it)}" } ?: ""))
suspend fun Api.sharesSeen() { call("POST", "/api/shares/seen") }

/* ---------- reactions ---------- */

suspend fun Api.reactions(trackId: String): List<Reaction> = get("/api/tracks/${enc(trackId)}/reactions")
suspend fun Api.react(trackId: String, atMs: Long, emoji: String, text: String): Reaction =
  post("/api/tracks/${enc(trackId)}/reactions", buildJsonObject { put("atMs", atMs.coerceAtLeast(0)); put("emoji", emoji); put("text", text.trim()) }.toString())
suspend fun Api.deleteReaction(id: String) { call("DELETE", "/api/reactions/${enc(id)}") }

/* ---------- shared playlists ---------- */

suspend fun Api.addMember(playlistId: String, userId: String) {
  call("POST", "/api/playlists/${enc(playlistId)}/members", buildJsonObject { put("userId", userId) }.toString())
}
suspend fun Api.removeMember(playlistId: String, userId: String) { call("DELETE", "/api/playlists/${enc(playlistId)}/members/${enc(userId)}") }

/* ---------- listen together ---------- */

suspend fun Api.jams(): List<JamSummary> = get("/api/jams")
suspend fun Api.myJam(): JamView? = json.decodeFromString(call("GET", "/api/jam"))
suspend fun Api.startJam(trackIds: List<String>, index: Int, positionMs: Long, playing: Boolean): JamView =
  post("/api/jam", buildJsonObject { put("trackIds", ids(trackIds)); put("index", index); put("positionMs", positionMs); put("playing", playing) }.toString())
/** The session; with [version] the server answers when it changes (or after 25 s). Null: the listener is out. */
suspend fun Api.jam(id: String, version: Int?): JamView? = json.decodeFromString(call("GET", "/api/jam/${enc(id)}" + (version?.let { "?v=$it" } ?: "")))
suspend fun Api.joinJam(id: String): JamView = post("/api/jam/${enc(id)}/join")
suspend fun Api.leaveJam() { call("POST", "/api/jam/leave") }
suspend fun Api.jamOp(id: String, body: JsonObject): JamView = post("/api/jam/${enc(id)}/op", body.toString())

/* ---------- link import, recognition ---------- */

/** A playlist or album from Yandex Music / Spotify becomes a playlist here (missing tracks are fetched). */
suspend fun Api.importLink(url: String): AcquireResult = post("/api/import/link", buildJsonObject { put("url", url.trim()) }.toString())

/** A few seconds of sound from the microphone: which song it is, and where it is in the catalogue. */
suspend fun Api.recognize(bytes: ByteArray, fileName: String, mime: String): Recognized =
  json.decodeFromString(multipart("/api/recognize") { addBytes(bytes, fileName, mime) })

/* ---------- friends' list and the inbox, kept for the screens ---------- */

object Friends {
  val list = MutableStateFlow<List<Friend>>(emptyList())

  suspend fun refresh() {
    if (Api.session.value == null) return
    runCatching { Api.friends() }.onSuccess { list.value = it }
  }
}

object Inbox {
  val items = MutableStateFlow<List<Share>>(emptyList())

  fun unread(list: List<Share>) = list.count { !it.seen }

  suspend fun refresh() {
    if (Api.session.value == null) return
    runCatching { Api.shares() }.onSuccess { items.value = it }
  }

  /** Everything in the inbox counts as seen (and needs no notification any more). */
  suspend fun markSeen() {
    if (items.value.none { !it.seen }) return
    items.value = items.value.map { it.copy(seen = true) }
    items.value.firstOrNull()?.let { noted(it.createdAt) }
    runCatching { Api.sharesSeen() }
  }

  private fun noted(at: String) {
    if (at > (Api.prefs.getString("shares.notified", "") ?: "")) Api.prefs.edit().putString("shares.notified", at).apply()
  }

  /** What a share is about, in a line: "трек «…»", "альбом «…»" … */
  fun what(s: Share): String {
    val o = s.item ?: return ""
    fun str(k: String) = (o[k] as? JsonPrimitive)?.content.orEmpty()
    return when (s.kind) {
      "track" -> tr("трек «{}»", str("title"))
      "album" -> tr("альбом «{}»", str("title"))
      "artist" -> tr("исполнителя {}", str("name"))
      "playlist" -> if (s.message == "invite") tr("плейлист «{}» — вместе", str("title")) else tr("плейлист «{}»", str("title"))
      "jam" -> tr("слушать вместе")
      "game" -> tr("в «Угадай мелодию»")
      "concert" -> "${str("artist")} — ${str("date")}"
      "digest" -> tr("{} мин музыки за неделю", str("minutes"))
      "release" -> "${str("artist")} — ${str("title")}"
      "report" -> tr("жалобу на «{}»", str("title"))
      else -> ""
    }
  }

  /** The background check: things friends sent since the last notified one become notifications. */
  suspend fun check(): Boolean {
    if (Api.session.value == null) return true
    val p = Api.prefs
    val since = p.getString("shares.notified", null)
    if (since == null) {
      p.edit().putString("shares.notified", News.nowIso()).apply()
      return true
    }
    val fresh = runCatching { Api.shares(since) }.getOrElse { return false }
    if (fresh.isEmpty()) return true
    fresh.asReversed().forEach { s ->
      val who = s.from?.displayName ?: tr("Друг")
      val title = when (s.kind) {
        "jam" -> tr("{} зовёт слушать вместе", who)
        "game" -> tr("{} зовёт в «Угадай мелодию»", who)
        "digest" -> tr("Ваша неделя в музыке")
        "concert" -> tr("Концерт: {}", what(s))
        "release" -> tr("Новый релиз: {}", what(s))
        "report" -> tr("{} пожаловался(ась) на трек", who)
        else -> tr("{} отправил(а) вам {}", who, what(s))
      }
      val body = when (s.kind) {
        "release" -> tr("Уже скачивается на сервер — откройте, чтобы послушать")
        "digest" -> what(s)
        "concert" -> (s.item?.get("place") as? JsonPrimitive)?.content ?: tr("Откройте, чтобы посмотреть")
        "game" -> tr("Откройте, чтобы играть")
        "report" -> what(s)
        else -> s.message.takeIf { it.isNotBlank() && it != "invite" } ?: tr("Откройте, чтобы послушать")
      }
      NewsAlerts.notify("share-${s.id}", title, body, "inbox")
    }
    noted(fresh.first().createdAt)
    items.value = (fresh + items.value).distinctBy { it.id }
    return true
  }
}
