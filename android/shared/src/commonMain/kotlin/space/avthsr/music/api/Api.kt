// The server's REST API. Tokens live in the app's private preferences; an expired access token is
// refreshed once (shared between concurrent calls) and the request repeated. A refused refresh token
// (password changed, account blocked) signs the user out; a network error keeps the session.
package space.avthsr.music.api

import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.timeout
import io.ktor.client.request.forms.FormBuilder
import io.ktor.client.request.forms.MultiPartFormDataContent
import io.ktor.client.request.forms.formData
import io.ktor.client.request.header
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.content.OutgoingContent
import io.ktor.http.content.TextContent
import io.ktor.http.ContentType
import io.ktor.http.HttpMethod
import io.ktor.http.encodeURLParameter
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import space.avthsr.music.Platform
import space.avthsr.music.Prefs
import space.avthsr.music.httpClient
import space.avthsr.music.keyValues
import space.avthsr.music.tr

class ApiException(val status: Int, message: String) : Exception(message)

object Api {
  const val BASE = "https://music.avthsr.space"

  val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = false; isLenient = true }
  private val JSON_TYPE = ContentType.parse("application/json; charset=utf-8")
  val http = httpClient {
    expectSuccess = false
    install(HttpTimeout) { connectTimeoutMillis = 15_000; socketTimeoutMillis = 40_000 }
  }

  lateinit var prefs: Prefs
    private set

  private val _session = MutableStateFlow<AuthTokens?>(null)
  val session: StateFlow<AuthTokens?> = _session.asStateFlow()
  val user: User? get() = _session.value?.user

  fun init() {
    prefs = Prefs(keyValues("avr"))
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

  /** iPhones can't play Opus / WebM: the iOS app asks for such tracks as AAC (compat=1). */
  fun streamUrl(id: String) = "$BASE/api/stream/$id?t=${_session.value?.mediaToken.orEmpty()}" + if (Platform.name == "iOS") "&compat=1" else ""
  fun canvasUrl(id: String) = "$BASE/api/canvas/$id?t=${_session.value?.mediaToken.orEmpty()}"
  /** File download links (the media token is accepted by /api/download/…). */
  fun downloadUrl(path: String) = "$BASE$path?t=${_session.value?.mediaToken.orEmpty()}"

  fun enc(s: String): String = s.encodeURLParameter(spaceToPlus = true)

  /* ---------- transport ---------- */

  private suspend fun raw(method: String, path: String, body: String?, token: String?): Pair<Int, String> {
    val needsBody = method == "POST" || method == "PUT" || method == "PATCH"
    val text = body ?: if (needsBody) "{}" else null
    return send(method, path, token) { text?.let { TextContent(it, JSON_TYPE) } }
  }

  /** One request; [body] is built anew for each attempt (a refreshed token means a second one). */
  private suspend fun send(method: String, path: String, token: String?, body: () -> OutgoingContent?): Pair<Int, String> {
    val r = http.request(BASE + path) {
      this.method = HttpMethod.parse(method)
      if (token != null) header("Authorization", "Bearer $token")
      // long uploads and server work (files, imports) get more time
      if (method != "GET") timeout { socketTimeoutMillis = 300_000 }
      body()?.let { setBody(it) }
    }
    return r.status.value to r.bodyAsText()
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
    return check(r)
  }

  /** A multipart/form-data POST (files from the phone, plus text fields). */
  suspend fun multipart(path: String, build: FormBuilder.() -> Unit): String {
    val make = { MultiPartFormDataContent(formData(build)) }
    val token = _session.value?.accessToken
    var r = send("POST", path, token, make)
    if (r.first == 401 && token != null && refresh(token)) r = send("POST", path, _session.value?.accessToken, make)
    return check(r)
  }

  private fun check(r: Pair<Int, String>): String {
    if (r.first !in 200..299) {
      val msg = runCatching { json.parseToJsonElement(r.second).jsonObject["message"]?.jsonPrimitive?.content }.getOrNull()
      throw ApiException(r.first, msg ?: tr("Ошибка сервера ({})", r.first))
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
    setUser(get("/api/auth/me"))
  }

  fun setUser(u: User) {
    _session.value?.let { save(it.copy(user = u)) }
  }

  /** Sends a crash report (the admin sees it; signed in or not). */
  suspend fun reportError(message: String, stack: String, device: String) {
    call("POST", "/api/client-errors", buildJsonObject {
      put("app", Platform.name.lowercase()); put("version", Platform.version); put("device", device.take(120))
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
  suspend fun search(q: String, type: String = "all"): SearchResult =
    get("/api/search?q=${enc(q)}&type=$type&limit=${if (type == "all") 20 else 60}")
  suspend fun allAlbums(sort: String): List<AlbumSummary> = get<Paged<AlbumSummary>>("/api/albums?sort=$sort&limit=200").items
  suspend fun allArtists(sort: String): List<ArtistSummary> = get<Paged<ArtistSummary>>("/api/artists?sort=$sort&limit=200").items
  suspend fun publicPlaylists(): List<PlaylistSummary> = get("/api/playlists/public")
  suspend fun track(id: String): Track = get("/api/tracks/${enc(id)}")
  suspend fun album(id: String): Album = get("/api/albums/${enc(id)}")
  suspend fun artist(id: String): ArtistPage = get("/api/artists/${enc(id)}")
  /** every track of the artist, album by album */
  suspend fun artistTracks(id: String): List<Track> = get("/api/artists/${enc(id)}/tracks")
  suspend fun playlist(id: String): Playlist = get("/api/playlists/${enc(id)}")
  suspend fun genre(slug: String): GenrePage = get("/api/genres/${enc(slug)}")
  suspend fun playlists(): List<PlaylistSummary> = get("/api/playlists")
  suspend fun genres(): List<Genre> = get("/api/genres")
  suspend fun lyrics(id: String): Lyrics = get("/api/tracks/${enc(id)}/lyrics")
  suspend fun radio(id: String): List<Track> = get("/api/tracks/${enc(id)}/radio")
  /** Asks for a canvas (a slice of the official clip) for a library track. */
  suspend fun requestCanvas(id: String) { call("POST", "/api/tracks/${enc(id)}/canvas/fetch") }

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

  /* ---------- My Wave ---------- */

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
  /** Cancels one of the user's own fetch jobs. */
  suspend fun cancelCatalogJob(id: String) { call("DELETE", "/api/catalog/jobs/${enc(id)}") }

  /** Asks the server to fetch a track / album / discography from the catalogue. */
  suspend fun acquire(kind: String, id: Long): AcquireResult =
    post("/api/catalog/acquire", buildJsonObject { put("kind", kind); put("id", id) }.toString())
}
