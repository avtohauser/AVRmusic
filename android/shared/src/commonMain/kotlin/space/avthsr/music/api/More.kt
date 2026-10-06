// Instant play from the catalogue, following artists, reports of wrong tracks, blends and the release
// radar, and moving a library here from Spotify / Yandex Music / a list.
package space.avthsr.music.api

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

@Serializable
data class CatalogPlay(val track: Track, val ready: Boolean = false)

@Serializable
data class PlayStatus(val status: String = "idle", val track: Track? = null)

@Serializable
data class TrackReport(val id: String, val reason: String = "", val note: String = "", val createdAt: String = "", val reporter: String? = null, val track: Track)

@Serializable
data class Follow(val id: Long, val name: String = "")

@Serializable
data class LyricHit(val track: Track, val line: String = "")

@Serializable
data class TransferStatus(val spotify: Boolean = false)

@Serializable
data class UrlBox(val url: String)

@Serializable
data class SpotifySettings(val clientId: String = "", val hasSecret: Boolean = false, val redirectUri: String = "")

/** A catalogue track as a queue item: the library's when it is there, otherwise a live stream ("dz:<id>"). */
fun CatalogTrack.asTrack(): Track = Track(
  id = libraryTrackId ?: "dz:$id",
  title = title,
  durationMs = durationMs,
  explicit = explicit,
  coverUrl = album?.coverUrl,
  artist = ArtistSummary(artist.libraryArtistId ?: "", artist.name, artist.imageUrl),
  featuring = featuring.map { ArtistSummary(it.libraryArtistId ?: "", it.name, it.imageUrl) },
  album = album?.let { AlbumRef("", it.title) },
)

/* ---------- instant play ---------- */

suspend fun Api.catalogPlay(id: Long): CatalogPlay = post("/api/catalog/play", buildJsonObject { put("id", id) }.toString())
suspend fun Api.catalogPlayStatus(id: Long): PlayStatus = get("/api/catalog/play/$id/status")

/* ---------- following, reports ---------- */

suspend fun Api.follow(artistId: Long, name: String, on: Boolean) {
  if (on) call("PUT", "/api/catalog/artists/$artistId/follow", buildJsonObject { put("name", name) }.toString())
  else call("DELETE", "/api/catalog/artists/$artistId/follow")
}
suspend fun Api.follows(): List<Follow> = get("/api/me/follows")

suspend fun Api.report(trackId: String, reason: String, note: String) {
  call("POST", "/api/tracks/${enc(trackId)}/report", buildJsonObject { put("reason", reason); put("note", note.trim()) }.toString())
}
suspend fun Api.reports(): List<TrackReport> = get("/api/admin/reports")
suspend fun Api.refetchReport(id: String) { call("POST", "/api/admin/reports/${enc(id)}/refetch") }
suspend fun Api.dismissReport(id: String) { call("POST", "/api/admin/reports/${enc(id)}/dismiss") }

/* ---------- playlists the server fills ---------- */

suspend fun Api.createBlend(userIds: List<String>): Playlist =
  post("/api/playlists/blend", buildJsonObject { put("userIds", JsonArray(userIds.map { JsonPrimitive(it) })) }.toString())
suspend fun Api.refreshPlaylist(id: String): Playlist = post("/api/playlists/${enc(id)}/refresh")
suspend fun Api.radar(): Playlist = get("/api/me/radar")

suspend fun Api.updatePlaylistTitle(id: String, title: String) {
  call("PATCH", "/api/playlists/${enc(id)}", buildJsonObject { put("title", title.trim()) }.toString())
}

/* ---------- lyrics search ---------- */

suspend fun Api.searchLyrics(q: String): List<LyricHit> = get<SearchResult>("/api/search?q=${enc(q)}&type=lyrics").lyrics

/* ---------- moving a library here ---------- */

suspend fun Api.transferStatus(): TransferStatus = get("/api/transfer/status")
suspend fun Api.spotifyStart(): UrlBox = get("/api/transfer/spotify/start")
suspend fun Api.listTransfer(text: String, target: String, title: String) {
  call("POST", "/api/transfer/list", buildJsonObject { put("text", text); put("target", target); put("title", title.trim()) }.toString())
}
suspend fun Api.spotifySettings(): SpotifySettings = get("/api/admin/spotify")
suspend fun Api.saveSpotify(clientId: String, secret: String) {
  call("PUT", "/api/admin/spotify", buildJsonObject { put("clientId", clientId.trim()); if (secret.isNotBlank()) put("secret", secret.trim()) }.toString())
}
