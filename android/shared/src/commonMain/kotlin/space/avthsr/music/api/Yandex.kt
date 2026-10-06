// Yandex Music, read on the phone: Yandex keeps its music API closed to the server (it is abroad, 451),
// so after the sign-in code (confirmed at ya.ru/device) the app itself reads "Мне нравится", the
// playlists, the liked artists and albums, and sends the lists to the server — which moves them like
// any other transfer. A link to one Yandex playlist / album is read here too.
package space.avthsr.music.api

import io.ktor.client.request.forms.FormDataContent
import io.ktor.client.request.header
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpMethod
import io.ktor.http.Parameters
import io.ktor.http.encodeURLPathPart
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull
import space.avthsr.music.tr

@Serializable
data class YandexLogin(val id: String, val userCode: String, val url: String = "https://ya.ru/device", val interval: Int = 5, val expiresIn: Int = 300)

@Serializable
data class YandexLoginState(val status: String, val token: String? = null, val message: String? = null)

/** Ask the server for a code to confirm at ya.ru/device. */
suspend fun Api.yandexLoginStart(): YandexLogin = post("/api/transfer/yandex/login")
suspend fun Api.yandexLoginState(id: String): YandexLoginState = get("/api/transfer/yandex/login/${enc(id)}")

@Serializable data class MovedTrack(val title: String, val artist: String, val durationSec: Int? = null)
@Serializable data class MovedPlaylist(val title: String, val tracks: List<MovedTrack>)
@Serializable data class MovedAlbum(val title: String, val artist: String)
@Serializable
private data class MovedLibrary(
  val source: String = "yandex",
  val liked: List<MovedTrack> = emptyList(),
  val playlists: List<MovedPlaylist> = emptyList(),
  val artists: List<String> = emptyList(),
  val albums: List<MovedAlbum> = emptyList(),
)

/** Send what was read; the server fetches the songs, makes the playlists, likes and follows. */
suspend fun Api.importLibrary(liked: List<MovedTrack>, playlists: List<MovedPlaylist>, artists: List<String>, albums: List<MovedAlbum>) {
  call("POST", "/api/transfer/import", json.encodeToString(MovedLibrary(liked = liked, playlists = playlists, artists = artists, albums = albums)))
}

/** What the listener has in Yandex Music: counts to pick from (the songs are read when moving). */
class YandexOverview(
  val uid: String,
  val login: String,
  val likedIds: List<String>,
  val playlists: List<Triple<Int, String, Int>>, // kind, title, songs
  val artists: List<String>,
  val albums: List<MovedAlbum>,
)

object Yandex {
  private const val API = "https://api.music.yandex.net"

  private suspend fun call(token: String?, path: String, form: Map<String, String>? = null): JsonElement {
    val r = Api.http.request(API + path) {
      method = if (form != null) HttpMethod.Post else HttpMethod.Get
      token?.let { header("Authorization", "OAuth $it") }
      header("X-Yandex-Music-Client", "YandexMusicAndroid/24023621")
      if (form != null) setBody(FormDataContent(Parameters.build { form.forEach { (k, v) -> append(k, v) } }))
    }
    when (r.status.value) {
      in 200..299 -> {}
      451 -> throw ApiException(451, tr("Яндекс Музыка не открывается из этой страны — выключите VPN и попробуйте снова"))
      401, 403 -> throw ApiException(r.status.value, tr("Яндекс не пустил — войдите заново"))
      404 -> throw ApiException(404, tr("Такого плейлиста нет или он закрыт"))
      else -> throw ApiException(r.status.value, tr("Яндекс Музыка ответила {}", r.status.value))
    }
    return Api.json.parseToJsonElement(r.bodyAsText()).jsonObject["result"] ?: JsonNull
  }

  private fun JsonElement?.obj(): JsonObject? = this as? JsonObject
  private fun JsonElement?.arr(): List<JsonElement> = (this as? JsonArray) ?: emptyList()
  private fun JsonElement?.str(): String? = (this as? JsonPrimitive)?.contentOrNull

  private fun track(el: JsonElement?): MovedTrack? {
    val t = el.obj() ?: return null
    val title = t["title"].str()?.trim().orEmpty()
    val version = t["version"].str()?.trim().orEmpty()
    val artist = t["artists"].arr().firstOrNull().obj()?.get("name").str()?.trim().orEmpty()
    if (title.isEmpty() || artist.isEmpty()) return null
    val ms = (t["durationMs"] as? JsonPrimitive)?.longOrNull
    return MovedTrack(if (version.isNotEmpty()) "$title ($version)" else title, artist, ms?.let { (it / 1000).toInt() })
  }

  /** Full songs by their ids, a few hundred per request. */
  private suspend fun byIds(token: String?, ids: List<String>): List<MovedTrack> =
    ids.chunked(250).flatMap { part -> call(token, "/tracks", mapOf("track-ids" to part.joinToString(","), "with-positions" to "false")).arr().mapNotNull { track(it) } }

  /** A playlist's songs: most come whole; the rest are asked for by id. */
  private suspend fun songs(token: String?, items: List<JsonElement>): List<MovedTrack> {
    val out = mutableListOf<MovedTrack>()
    val missing = mutableListOf<String>()
    for (item in items) {
      val o = item.obj() ?: continue
      val t = track(o["track"]) ?: track(o)
      if (t != null) out += t else o["id"].str()?.let { missing += it }
    }
    if (missing.isNotEmpty()) out += byIds(token, missing)
    return out
  }

  suspend fun overview(token: String): YandexOverview {
    val acc = call(token, "/account/status").obj()?.get("account").obj()
    val uid = (acc?.get("uid") as? JsonPrimitive)?.contentOrNull ?: throw ApiException(401, tr("Яндекс не пустил — войдите заново"))
    val login = acc?.get("login").str() ?: uid
    val liked = call(token, "/users/$uid/likes/tracks").obj()?.get("library").obj()?.get("tracks").arr()
      .mapNotNull { it.obj()?.get("id").str() }
    val playlists = call(token, "/users/$uid/playlists/list").arr().mapNotNull { p ->
      val o = p.obj() ?: return@mapNotNull null
      val kind = (o["kind"] as? JsonPrimitive)?.intOrNull ?: return@mapNotNull null
      if (kind == 3) null else Triple(kind, o["title"].str() ?: tr("Плейлист"), (o["trackCount"] as? JsonPrimitive)?.intOrNull ?: 0)
    }
    val artists = runCatching { call(token, "/users/$uid/likes/artists?with-timestamps=false").arr() }.getOrDefault(emptyList())
      .mapNotNull { (it.obj()?.get("artist").obj() ?: it.obj())?.get("name").str() }.distinct()
    val albums = runCatching { call(token, "/users/$uid/likes/albums?rich=true").arr() }.getOrDefault(emptyList()).mapNotNull { a ->
      val al = a.obj()?.get("album").obj() ?: a.obj() ?: return@mapNotNull null
      val title = al["title"].str() ?: return@mapNotNull null
      MovedAlbum(title, al["artists"].arr().firstOrNull().obj()?.get("name").str().orEmpty())
    }
    return YandexOverview(uid, login, liked, playlists, artists, albums)
  }

  suspend fun likedSongs(token: String, o: YandexOverview): List<MovedTrack> = byIds(token, o.likedIds)

  suspend fun playlist(token: String?, owner: String, kind: String): MovedPlaylist {
    val p = call(token, "/users/${owner.encodeURLPathPart()}/playlists/${kind.encodeURLPathPart()}").obj()
    return MovedPlaylist(p?.get("title").str() ?: "Яндекс Музыка", songs(token, p?.get("tracks").arr()))
  }

  /** A link to one playlist, album or song (read here; signing in is not needed for open ones). */
  suspend fun byLink(url: String, token: String? = null): MovedPlaylist {
    val path = url.substringAfter("://").substringAfter('/').substringBefore('?').substringBefore('#').split('/').filter { it.isNotEmpty() }
    val u = path.indexOf("users")
    return when {
      u >= 0 && path.getOrNull(u + 2) == "playlists" && path.getOrNull(u + 3) != null -> playlist(token, path[u + 1], path[u + 3])
      path.firstOrNull() == "playlists" && path.getOrNull(1) != null -> {
        val p = call(token, "/playlist/${path[1].encodeURLPathPart()}").obj()
        MovedPlaylist(p?.get("title").str() ?: "Яндекс Музыка", songs(token, p?.get("tracks").arr()))
      }
      path.firstOrNull() == "album" && path.getOrNull(1) != null -> {
        val a = call(token, "/albums/${path[1].encodeURLPathPart()}/with-tracks").obj()
        MovedPlaylist(a?.get("title").str() ?: "Яндекс Музыка", a?.get("volumes").arr().flatMap { v -> v.arr().mapNotNull { track(it) } })
      }
      else -> throw ApiException(400, tr("Нужна ссылка на плейлист или альбом Яндекс Музыки"))
    }
  }
}
