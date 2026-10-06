// The newer parts of the server: smart playlists and daily mixes, the company's week, "guess the melody",
// the listener's own devices, and the outside services (Telegram, Last.fm, concerts, backups).
package space.avthsr.music.api

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

private fun strs(list: List<String>) = JsonArray(list.map { JsonPrimitive(it) })

/* ---------- smart playlists, mixes, the week ---------- */

@Serializable
data class SmartRules(
  val genres: List<String> = emptyList(),
  val artists: List<String> = emptyList(),
  val yearFrom: Int? = null,
  val yearTo: Int? = null,
  val addedDays: Int? = null,
  val liked: Boolean = false,
  val notPlayedDays: Int? = null,
  val minPlays: Int? = null,
  val noExplicit: Boolean = false,
  val sort: String = "random",
  val limit: Int = 100,
)

suspend fun Api.createSmart(title: String, rules: SmartRules): Playlist =
  post("/api/playlists/smart", buildJsonObject { put("title", title.trim()); put("rules", json.encodeToJsonElement(SmartRules.serializer(), rules)) }.toString())

suspend fun Api.setSmartRules(id: String, rules: SmartRules): Playlist =
  json.decodeFromString(call("PUT", "/api/playlists/${enc(id)}/rules", buildJsonObject { put("rules", json.encodeToJsonElement(SmartRules.serializer(), rules)) }.toString()))

suspend fun Api.smartRules(id: String): SmartRules? =
  playlists().firstOrNull { it.id == id }?.autoRules

@Serializable
data class ChartTrack(val track: Track, val plays: Int = 0, val listeners: List<FriendRef> = emptyList())

@Serializable
data class ChartPerson(val user: FriendRef, val minutes: Int = 0)

@Serializable
data class WeekChart(val tracks: List<ChartTrack> = emptyList(), val people: List<ChartPerson> = emptyList())

suspend fun Api.weekChart(): WeekChart = get("/api/charts/week")

/* ---------- listen together: suggestions ---------- */

@Serializable
data class JamSuggestion(val track: Track, val by: FriendRef? = null, val votes: Int = 0, val voted: Boolean = false, val next: Boolean = false)

/* ---------- guess the melody ---------- */

@Serializable
data class GameOption(val n: Int, val title: String = "", val artist: String = "")

@Serializable
data class GamePlayer(val user: FriendRef, val score: Int = 0, val answered: Boolean = false, val points: Int? = null, val correct: Boolean? = null)

@Serializable
data class GameAnswer(val n: Int, val track: Track? = null)

@Serializable
data class GameView(
  val id: String,
  val host: FriendRef? = null,
  /** lobby / round / reveal / done */
  val state: String = "lobby",
  val round: Int = 0,
  val rounds: Int = 0,
  val source: String = "ours",
  val players: List<GamePlayer> = emptyList(),
  val options: List<GameOption> = emptyList(),
  val clipUrl: String? = null,
  val clipOffsetMs: Long = 0,
  val clipMs: Long = 15_000,
  val startsAt: Long? = null,
  val endsAt: Long? = null,
  val myChoice: Int? = null,
  val answer: GameAnswer? = null,
  val played: List<Track> = emptyList(),
  val version: Int = 0,
  val serverNow: Long = 0,
)

suspend fun Api.myGame(): GameView? = json.decodeFromString(call("GET", "/api/game"))
suspend fun Api.createGame(source: String, rounds: Int): GameView =
  post("/api/games", buildJsonObject { put("source", source); put("rounds", rounds) }.toString())
/** The game; with [version] the server answers when it changes (or after 25 s). Null: the player is out. */
suspend fun Api.game(id: String, version: Int?): GameView? = json.decodeFromString(call("GET", "/api/games/${enc(id)}" + (version?.let { "?v=$it" } ?: "")))
suspend fun Api.joinGame(id: String): GameView = post("/api/games/${enc(id)}/join")
suspend fun Api.leaveGame(id: String) { call("POST", "/api/games/${enc(id)}/leave") }
suspend fun Api.gameNext(id: String): GameView = post("/api/games/${enc(id)}/next")
suspend fun Api.gameAnswer(id: String, n: Int): GameView = post("/api/games/${enc(id)}/answer", buildJsonObject { put("n", n) }.toString())

/* ---------- the listener's devices ---------- */

@Serializable
data class DeviceInfo(
  val id: String,
  val name: String = "",
  /** android / ios / web */
  val kind: String = "android",
  val current: Boolean = false,
  val track: Track? = null,
  val positionMs: Long = 0,
  val playing: Boolean = false,
  val volume: Float = 1f,
  val seenAt: String = "",
)

@Serializable
data class DeviceQueue(val tracks: List<Track> = emptyList(), val index: Int = 0, val positionMs: Long = 0, val playing: Boolean = false)

@Serializable
data class DeviceCommand(
  val seq: Int = 0,
  val from: String? = null,
  val type: String = "",
  val positionMs: Long? = null,
  val volume: Float? = null,
  val trackIds: List<String> = emptyList(),
  val index: Int = 0,
  val playing: Boolean = true,
)

@Serializable
data class DeviceCommands(val seq: Int = 0, val commands: List<DeviceCommand> = emptyList())

suspend fun Api.deviceHeartbeat(id: String, name: String, kind: String, trackId: String?, positionMs: Long, playing: Boolean, queue: List<String>, index: Int): List<DeviceInfo> =
  post("/api/me/devices/heartbeat", buildJsonObject {
    put("id", id); put("name", name); put("kind", kind); put("trackId", trackId); put("positionMs", positionMs.coerceAtLeast(0)); put("playing", playing)
    put("queue", strs(queue.take(500))); put("index", index.coerceAtLeast(0))
  }.toString())
suspend fun Api.devices(self: String): List<DeviceInfo> = get("/api/me/devices?self=${enc(self)}")
suspend fun Api.deviceQueue(id: String): DeviceQueue = get("/api/me/devices/${enc(id)}/queue")
suspend fun Api.deviceCommands(id: String, after: Int): DeviceCommands = get("/api/me/devices/${enc(id)}/commands?after=$after")
suspend fun Api.deviceCommand(target: String, from: String, type: String, positionMs: Long? = null, volume: Float? = null, trackIds: List<String>? = null, index: Int = 0, playing: Boolean = true) {
  call("POST", "/api/me/devices/${enc(target)}/command?from=${enc(from)}", buildJsonObject {
    put("type", type)
    positionMs?.let { put("positionMs", it.coerceAtLeast(0)) }
    volume?.let { put("volume", it.coerceIn(0f, 1f)) }
    trackIds?.let { put("trackIds", strs(it.take(500))); put("index", index); put("playing", playing) }
  }.toString())
}

/* ---------- Telegram, Last.fm, concerts ---------- */

@Serializable
data class LinkedAccount(val username: String? = null)

@Serializable
data class TelegramState(val available: Boolean = false, val bot: String? = null, val linked: LinkedAccount? = null)

@Serializable
data class LastfmState(val available: Boolean = false, val linked: LinkedAccount? = null)

@Serializable
data class Integrations(val telegram: TelegramState = TelegramState(), val lastfm: LastfmState = LastfmState(), val city: String? = null)

@Serializable
data class UrlReply(val url: String)

@Serializable
data class City(val slug: String, val name: String)

@Serializable
data class Concert(
  val id: String,
  val artist: String = "",
  val title: String = "",
  val startsAt: String = "",
  val date: String = "",
  val place: String? = null,
  val address: String? = null,
  val url: String? = null,
  val imageUrl: String? = null,
)

@Serializable
data class Concerts(val city: String? = null, val checkedAt: String? = null, val concerts: List<Concert> = emptyList())

suspend fun Api.integrations(): Integrations = get("/api/me/integrations")
suspend fun Api.telegramLink(): String = post<UrlReply>("/api/me/telegram/link").url
suspend fun Api.telegramUnlink() { call("DELETE", "/api/me/telegram") }
suspend fun Api.lastfmStart(): String = get<UrlReply>("/api/me/lastfm/start").url
suspend fun Api.lastfmUnlink() { call("DELETE", "/api/me/lastfm") }
suspend fun Api.cities(): List<City> = get("/api/concerts/cities")
suspend fun Api.setCity(slug: String?) { call("PUT", "/api/me/city", buildJsonObject { put("city", slug) }.toString()) }
suspend fun Api.concerts(): Concerts = get("/api/me/concerts")

/* ---------- the admin's side ---------- */

@Serializable
data class TelegramAdmin(val configured: Boolean = false, val bot: String? = null)

@Serializable
data class LastfmAdmin(val key: String = "", val hasSecret: Boolean = false)

@Serializable
data class BackupFile(val name: String, val size: Long = 0, val at: String = "")

@Serializable
data class Backups(val last: String? = null, val files: List<BackupFile> = emptyList())

suspend fun Api.telegramAdmin(): TelegramAdmin = get("/api/admin/telegram")
suspend fun Api.setTelegramToken(token: String?): TelegramAdmin =
  json.decodeFromString(call("PUT", "/api/admin/telegram", buildJsonObject { put("token", token?.trim()?.ifBlank { null }) }.toString()))
suspend fun Api.lastfmAdmin(): LastfmAdmin = get("/api/admin/lastfm")
suspend fun Api.setLastfmApp(key: String, secret: String) {
  call("PUT", "/api/admin/lastfm", buildJsonObject { put("key", key.trim()); put("secret", secret.trim()) }.toString())
}
suspend fun Api.backups(): Backups = get("/api/admin/backups")
suspend fun Api.backupNow(): BackupFile = post("/api/admin/backups")
