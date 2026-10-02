// The server's REST API. Tokens live in the app's private preferences; an expired access token is
// refreshed once (shared between concurrent calls) and the request repeated. A refused refresh token
// (password changed, account blocked) signs the user out; a network error keeps the session.
package space.avthsr.music.api

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

class ApiException(val status: Int, message: String) : Exception(message)

object Api {
  const val BASE = "https://music.avthsr.space"

  val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false; isLenient = true }
  private val JSON_TYPE = "application/json; charset=utf-8".toMediaType()
  private val http = OkHttpClient.Builder()
    .connectTimeout(15, TimeUnit.SECONDS)
    .readTimeout(40, TimeUnit.SECONDS)
    .build()

  lateinit var prefs: SharedPreferences
    private set

  private val _session = MutableStateFlow<AuthTokens?>(null)
  val session: StateFlow<AuthTokens?> = _session.asStateFlow()
  val user: User? get() = _session.value?.user

  fun init(context: Context) {
    prefs = context.getSharedPreferences("avr", Context.MODE_PRIVATE)
    prefs.getString("auth", null)?.let { s -> runCatching { _session.value = json.decodeFromString(AuthTokens.serializer(), s) } }
  }

  private fun save(t: AuthTokens?) {
    _session.value = t
    val e = prefs.edit()
    if (t == null) e.remove("auth") else e.putString("auth", json.encodeToString(AuthTokens.serializer(), t))
    e.apply()
  }

  /** Absolute address of a cover/avatar: the server gives "/media/…", the catalogue full URLs. */
  fun img(path: String?): String? = when {
    path.isNullOrBlank() -> null
    path.startsWith("http") -> path
    else -> BASE + path
  }

  fun streamUrl(id: String) = "$BASE/api/stream/$id?t=${_session.value?.mediaToken.orEmpty()}"

  private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

  /* ---------- transport ---------- */

  private suspend fun raw(method: String, path: String, body: String?, token: String?): Pair<Int, String> = withContext(Dispatchers.IO) {
    val needsBody = method == "POST" || method == "PUT" || method == "PATCH"
    val rb = (body ?: if (needsBody) "{}" else null)?.toRequestBody(JSON_TYPE)
    val req = Request.Builder().url(BASE + path).method(method, rb)
    if (token != null) req.header("Authorization", "Bearer $token")
    http.newCall(req.build()).execute().use { r -> r.code to (r.body?.string() ?: "") }
  }

  private val refreshLock = Mutex()

  private suspend fun refresh(failedToken: String): Boolean = refreshLock.withLock {
    val cur = _session.value ?: return@withLock false
    if (cur.accessToken != failedToken) return@withLock true // another call refreshed meanwhile
    val body = buildJsonObject { put("refreshToken", cur.refreshToken) }.toString()
    val r = try { raw("POST", "/api/auth/refresh", body, null) } catch (e: Exception) { return@withLock false }
    if (r.first in 200..299) {
      save(json.decodeFromString(AuthTokens.serializer(), r.second)); true
    } else {
      if (r.first == 400 || r.first == 401 || r.first == 403) save(null)
      false
    }
  }

  suspend fun call(method: String, path: String, body: String? = null): String {
    val token = _session.value?.accessToken
    var r = raw(method, path, body, token)
    if (r.first == 401 && token != null && refresh(token)) r = raw(method, path, body, _session.value?.accessToken)
    if (r.first !in 200..299) {
      val msg = runCatching { json.parseToJsonElement(r.second).jsonObject["message"]?.jsonPrimitive?.content }.getOrNull()
      throw ApiException(r.first, msg ?: "Ошибка сервера (${r.first})")
    }
    return r.second
  }

  suspend inline fun <reified T> get(path: String): T = json.decodeFromString(call("GET", path))
  suspend inline fun <reified T> post(path: String, body: String = "{}"): T = json.decodeFromString(call("POST", path, body))

  /* ---------- account ---------- */

  suspend fun login(login: String, password: String) {
    val body = buildJsonObject { put("login", login.trim()); put("password", password) }.toString()
    save(json.decodeFromString(AuthTokens.serializer(), call("POST", "/api/auth/login", body)))
  }

  suspend fun register(email: String, username: String, displayName: String, password: String, invite: String) {
    val body = buildJsonObject {
      put("email", email.trim()); put("username", username.trim()); put("password", password)
      if (displayName.isNotBlank()) put("displayName", displayName.trim())
      put("inviteCode", invite.trim())
    }.toString()
    save(json.decodeFromString(AuthTokens.serializer(), call("POST", "/api/auth/register", body)))
  }

  suspend fun logout() {
    val t = _session.value
    if (t != null) runCatching { call("POST", "/api/auth/logout", buildJsonObject { put("refreshToken", t.refreshToken) }.toString()) }
    save(null)
  }

  /** Fresh profile (role, rights); also notices a blocked account. */
  suspend fun refreshMe() {
    val u: User = get("/api/auth/me")
    _session.value?.let { save(it.copy(user = u)) }
  }

  /** Sends a crash report (the admin sees it; signed in or not). */
  suspend fun reportError(message: String, stack: String, device: String) {
    call("POST", "/api/client-errors", buildJsonObject {
      put("app", "android"); put("version", space.avthsr.music.BuildConfig.VERSION_NAME); put("device", device.take(120))
      put("message", message.take(1000)); put("stack", stack.take(20_000))
    }.toString())
  }

  /** A separate session for the web pages opened inside the app (raw AuthTokens JSON, as the site stores it). */
  suspend fun forkSession(): String = call("POST", "/api/auth/fork")

  private var infoCache: ServerInfo? = null
  suspend fun info(): ServerInfo = infoCache ?: get<ServerInfo>("/api/info").also { infoCache = it }

  /** May this user fetch tracks from the catalogue to the server? */
  suspend fun canAcquire(): Boolean {
    val u = user ?: return false
    val i = runCatching { info() }.getOrNull() ?: return false
    if (!i.catalog || i.acquire == "off") return false
    if (i.acquire == "admin") return u.isAdmin
    return u.isAdmin || u.canAcquire != false
  }

  /* ---------- library ---------- */

  suspend fun home(): HomeFeed = get("/api/home")
  suspend fun search(q: String): SearchResult = get("/api/search?q=${enc(q)}&limit=20")
  suspend fun track(id: String): Track = get("/api/tracks/${enc(id)}")
  suspend fun album(id: String): Album = get("/api/albums/${enc(id)}")
  suspend fun artist(id: String): ArtistPage = get("/api/artists/${enc(id)}")
  suspend fun playlist(id: String): Playlist = get("/api/playlists/${enc(id)}")
  suspend fun genre(slug: String): GenrePage = get("/api/genres/${enc(slug)}")
  suspend fun playlists(): List<PlaylistSummary> = get("/api/playlists")
  suspend fun genres(): List<Genre> = get("/api/genres")
  suspend fun lyrics(id: String): Lyrics = get("/api/tracks/${enc(id)}/lyrics")
  suspend fun radio(id: String): List<Track> = get("/api/tracks/${enc(id)}/radio")

  suspend fun createPlaylist(title: String): PlaylistSummary =
    post("/api/playlists", buildJsonObject { put("title", title.trim()) }.toString())

  suspend fun addToPlaylist(playlistId: String, trackIds: List<String>) {
    call("POST", "/api/playlists/${enc(playlistId)}/tracks", buildJsonObject { put("trackIds", JsonArray(trackIds.map { JsonPrimitive(it) })) }.toString())
  }

  suspend fun removeFromPlaylist(playlistId: String, trackId: String) {
    call("DELETE", "/api/playlists/${enc(playlistId)}/tracks/${enc(trackId)}")
  }

  /* ---------- me ---------- */

  suspend fun likedTracks(): List<Track> = get("/api/me/likes/tracks")
  suspend fun likedAlbums(): List<AlbumSummary> = get("/api/me/likes/albums")
  suspend fun likedArtists(): List<ArtistSummary> = get("/api/me/likes/artists")
  suspend fun likeIds(): Map<String, List<String>> = get("/api/me/likes/ids")

  suspend fun setLike(type: String, id: String, liked: Boolean) {
    call(if (liked) "PUT" else "DELETE", "/api/me/likes/$type/${enc(id)}")
  }

  suspend fun reportPlay(trackId: String, ms: Long, context: String?) {
    call("POST", "/api/me/plays", buildJsonObject {
      put("trackId", trackId); put("msPlayed", ms)
      if (context != null) put("context", context.take(120))
    }.toString())
  }

  /* ---------- My Wave / Предложка ---------- */

  suspend fun waveNext(mode: String, exclude: List<String>): WaveBatch = post("/api/wave/next", buildJsonObject {
    put("mode", mode); put("count", 10)
    put("exclude", JsonArray(exclude.takeLast(300).map { JsonPrimitive(it) }))
  }.toString())

  suspend fun waveFeedback(trackId: String, value: Int) {
    call("POST", "/api/wave/feedback", buildJsonObject { put("trackId", trackId); put("value", value) }.toString())
  }

  suspend fun suggestions(fresh: Boolean = false): Suggestions = get("/api/suggestions" + if (fresh) "?fresh=1" else "")

  /* ---------- catalogue ---------- */

  suspend fun catalogSearch(q: String): CatalogSearch = get("/api/catalog/search?q=${enc(q)}&limit=12")
  suspend fun catalogAlbum(id: Long): CatalogAlbumPage = get("/api/catalog/albums/$id")
  suspend fun catalogArtist(id: Long): CatalogArtistPage = get("/api/catalog/artists/$id")
  suspend fun jobs(): List<AcquireJob> = get("/api/catalog/jobs")

  /** Asks the server to fetch a track / album / discography from the catalogue. */
  suspend fun acquire(kind: String, id: Long): AcquireResult =
    post("/api/catalog/acquire", buildJsonObject { put("kind", kind); put("id", id) }.toString())
}
