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
data class Integrations(val telegram: TelegramState = TelegramState(), val lastfm: LastfmState = LastfmState(), val tgProfile: TgProfileState = TgProfileState(), val city: String? = null)

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

/* ---------- badges ---------- */

@Serializable
data class Badge(val id: String, val title: String = "", val emoji: String = "", val color: String = "#F2A0C4", val description: String = "", val givenAt: String? = null, val holders: Int? = null)

suspend fun Api.badges(): List<Badge> = get("/api/badges")
suspend fun Api.myBadges(): List<Badge> = get("/api/me/badges")
suspend fun Api.saveBadge(id: String?, title: String, emoji: String, color: String, description: String): Badge {
  val body = buildJsonObject { put("title", title.trim()); put("emoji", emoji.trim()); put("color", color); put("description", description.trim()) }.toString()
  return if (id == null) post("/api/admin/badges", body) else json.decodeFromString(call("PUT", "/api/admin/badges/${enc(id)}", body))
}
suspend fun Api.deleteBadge(id: String) { call("DELETE", "/api/admin/badges/${enc(id)}") }
suspend fun Api.badgeHolders(id: String): List<FriendRef> = get("/api/admin/badges/${enc(id)}/holders")
suspend fun Api.giveBadge(id: String, userIds: List<String>) { call("POST", "/api/admin/badges/${enc(id)}/give", buildJsonObject { put("userIds", strs(userIds)) }.toString()) }
suspend fun Api.takeBadge(id: String, userId: String) { call("DELETE", "/api/admin/badges/${enc(id)}/give/${enc(userId)}") }

/* ---------- the servers' state ---------- */

@Serializable
data class DiskInfo(val name: String, val total: Long = 0, val free: Long = 0, val used: Long = 0)

@Serializable
data class ServerSample(val at: String, val load: Float = 0f, val mem: Float = 0f, val online: Int = 0, val listening: Int = 0)

@Serializable
data class ServerStats(
  val disks: List<DiskInfo> = emptyList(),
  val music: MusicInfo = MusicInfo(),
  val cpu: CpuInfo = CpuInfo(),
  val memory: MemInfo = MemInfo(),
  val uptime: UptimeInfo = UptimeInfo(),
  val people: PeopleInfo = PeopleInfo(),
  val downloads: DownloadsInfo = DownloadsInfo(),
  val history: List<ServerSample> = emptyList(),
) {
  @Serializable data class MusicInfo(val bytes: Long = 0, val tracks: Int = 0, val avgTrackBytes: Long = 0)
  @Serializable data class CpuInfo(val cores: Int = 1, val busy: Float = 0f, val load: List<Float> = emptyList())
  @Serializable data class MemInfo(val total: Long = 0, val free: Long = 0, val app: Long = 0)
  @Serializable data class UptimeInfo(val server: Double = 0.0, val app: Double = 0.0)
  @Serializable data class PeopleInfo(val online: Int = 0, val devices: Int = 0, val listening: Int = 0, val today: Int = 0)
  @Serializable data class DownloadsInfo(val running: Int = 0, val queued: Int = 0, val slots: Int = 0, val accounts: Int = 0, val exits: Int = 1)
}

suspend fun Api.serverStats(): ServerStats = get("/api/admin/server")

/* ---------- spare YouTube accounts from friends ---------- */

@Serializable
data class GivenAccount(val id: String, val label: String = "", val createdAt: String = "", val loggedIn: Boolean = false, val coolingUntil: String? = null, val ok: Int = 0, val failed: Int = 0, val lastError: String? = null)

@Serializable
data class GivenAccounts(val max: Int = 3, val accounts: List<GivenAccount> = emptyList())

suspend fun Api.givenAccounts(): GivenAccounts = get("/api/me/youtube-accounts")
suspend fun Api.giveAccount(file: space.avthsr.music.PickedFile): GivenAccounts = json.decodeFromString(multipart("/api/me/youtube-accounts") { addFile(file) })
suspend fun Api.takeAccount(id: String): GivenAccounts = json.decodeFromString(call("DELETE", "/api/me/youtube-accounts/${enc(id)}"))

/* ---------- loved artists fetched by themselves; the Telegram API app ---------- */

@Serializable
data class Autofetch(val on: Boolean = true, val next: List<String> = emptyList())

suspend fun Api.autofetch(): Autofetch = get("/api/admin/autofetch")
suspend fun Api.setAutofetch(on: Boolean): Autofetch = json.decodeFromString(call("PUT", "/api/admin/autofetch", buildJsonObject { put("on", on) }.toString()))

@Serializable
data class TgAppAdmin(val apiId: Long? = null, val hasHash: Boolean = false)

suspend fun Api.tgAppAdmin(): TgAppAdmin = get("/api/admin/tg-app")
suspend fun Api.setTgApp(apiId: Long, apiHash: String) {
  call("PUT", "/api/admin/tg-app", buildJsonObject { put("apiId", apiId); put("apiHash", apiHash.trim()) }.toString())
}

/* ---------- what plays, in the listener's Telegram profile ---------- */

@Serializable
data class TgProfileLink(val username: String? = null, val enabled: Boolean = true)

@Serializable
data class TgProfileState(val available: Boolean = false, val linked: TgProfileLink? = null)

@Serializable
data class TgCodeReply(val viaApp: Boolean = true, val needPassword: Boolean = false)

suspend fun Api.tgProfileStart(phone: String): TgCodeReply = post("/api/me/tg-profile/start", buildJsonObject { put("phone", phone.trim()) }.toString())
suspend fun Api.tgProfileCode(code: String): TgCodeReply = post("/api/me/tg-profile/code", buildJsonObject { put("code", code.trim()) }.toString())
suspend fun Api.tgProfilePassword(password: String) { call("POST", "/api/me/tg-profile/password", buildJsonObject { put("password", password) }.toString()) }
suspend fun Api.tgProfileEnabled(on: Boolean) { call("PUT", "/api/me/tg-profile", buildJsonObject { put("enabled", on) }.toString()) }
suspend fun Api.tgProfileUnlink() { call("DELETE", "/api/me/tg-profile") }
