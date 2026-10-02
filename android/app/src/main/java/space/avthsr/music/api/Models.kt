// What the server returns (packages/shared/src/index.ts). Only the fields the app uses; everything is
// lenient so a field added or missing on the server never breaks the app.
package space.avthsr.music.api

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

@Serializable
data class User(
  val id: String,
  val email: String = "",
  val username: String = "",
  val displayName: String = "",
  val role: String = "user",
  val avatarUrl: String? = null,
  val canAcquire: Boolean? = null,
) {
  val isAdmin get() = role == "admin"
}

@Serializable
data class AuthTokens(val accessToken: String, val refreshToken: String, val mediaToken: String, val user: User)

@Serializable
data class ArtistSummary(val id: String, val name: String, val imageUrl: String? = null)

@Serializable
data class AlbumRef(val id: String, val title: String, val year: Int? = null)

@Serializable
data class Track(
  val id: String,
  val title: String,
  val durationMs: Long = 0,
  val explicit: Boolean = false,
  val coverUrl: String? = null,
  val artist: ArtistSummary,
  val featuring: List<ArtistSummary> = emptyList(),
  val album: AlbumRef? = null,
  val trackNo: Int? = null,
  val hasLyrics: Boolean = false,
  val hasSyncedLyrics: Boolean = false,
  /** why "My Wave" picked it */
  val reason: String? = null,
) {
  val artists: String get() = (listOf(artist) + featuring).joinToString(", ") { it.name }
}

@Serializable
data class AlbumSummary(
  val id: String,
  val title: String,
  val year: Int? = null,
  val type: String = "album",
  val coverUrl: String? = null,
  val artist: ArtistSummary,
  val trackCount: Int = 0,
  val durationMs: Long = 0,
)

@Serializable
data class Album(
  val id: String,
  val title: String,
  val year: Int? = null,
  val type: String = "album",
  val coverUrl: String? = null,
  val artist: ArtistSummary,
  val trackCount: Int = 0,
  val durationMs: Long = 0,
  val label: String? = null,
  val tracks: List<Track> = emptyList(),
)

@Serializable
data class ArtistPage(
  val id: String,
  val name: String,
  val imageUrl: String? = null,
  val headerUrl: String? = null,
  val bio: String? = null,
  val monthlyListeners: Long = 0,
  val albums: List<AlbumSummary> = emptyList(),
  val topTracks: List<Track> = emptyList(),
  val related: List<ArtistSummary> = emptyList(),
  val appearsOn: List<AlbumSummary> = emptyList(),
)

@Serializable
data class Owner(val id: String, val username: String = "", val displayName: String = "")

@Serializable
data class PlaylistSummary(
  val id: String,
  val title: String,
  val description: String? = null,
  val coverUrl: String? = null,
  val isPublic: Boolean = false,
  val owner: Owner? = null,
  val trackCount: Int = 0,
  val durationMs: Long = 0,
  val isOwner: Boolean? = null,
  val mosaic: List<String> = emptyList(),
)

@Serializable
data class Playlist(
  val id: String,
  val title: String,
  val description: String? = null,
  val coverUrl: String? = null,
  val owner: Owner? = null,
  val trackCount: Int = 0,
  val durationMs: Long = 0,
  val isOwner: Boolean? = null,
  val tracks: List<Track> = emptyList(),
  val mosaic: List<String> = emptyList(),
)

@Serializable
data class Genre(val slug: String, val name: String, val color: String = "#6750A4", val trackCount: Int = 0, val coverUrl: String? = null)

@Serializable
data class GenrePage(val genre: Genre, val tracks: List<Track> = emptyList(), val albums: List<AlbumSummary> = emptyList(), val artists: List<ArtistSummary> = emptyList())

@Serializable
data class SearchResult(
  val tracks: List<Track> = emptyList(),
  val albums: List<AlbumSummary> = emptyList(),
  val artists: List<ArtistSummary> = emptyList(),
  val playlists: List<PlaylistSummary> = emptyList(),
)

@Serializable
data class HomeSection(val id: String, val title: String, val subtitle: String? = null, val kind: String, val items: List<JsonObject> = emptyList())

@Serializable
data class HomeFeed(val greeting: String = "", val quickPicks: List<JsonObject> = emptyList(), val sections: List<HomeSection> = emptyList())

@Serializable
data class WaveBatch(val tracks: List<Track> = emptyList(), val mode: String = "mix")

@Serializable
data class Lyrics(val plain: String? = null, val synced: List<LyricLine>? = null)

@Serializable
data class LyricLine(val timeMs: Long, val text: String)

@Serializable
data class ServerInfo(val catalog: Boolean = false, val acquire: String = "off", val version: String = "")

/* ---------- global catalogue (Deezer) ---------- */

@Serializable
data class CatalogArtist(val id: Long, val name: String, val imageUrl: String? = null, val fans: Long = 0, val libraryArtistId: String? = null)

@Serializable
data class CatalogAlbumRef(val id: Long, val title: String, val coverUrl: String? = null)

@Serializable
data class CatalogAlbum(
  val id: Long,
  val title: String,
  val coverUrl: String? = null,
  val type: String = "album",
  val year: Int? = null,
  val trackCount: Int = 0,
  val artist: CatalogArtist,
  val libraryAlbumId: String? = null,
  val inLibrary: Int = 0,
  val reason: String? = null,
)

@Serializable
data class CatalogTrack(
  val id: Long,
  val title: String,
  val durationMs: Long = 0,
  val explicit: Boolean = false,
  val trackNo: Int? = null,
  val artist: CatalogArtist,
  val featuring: List<CatalogArtist> = emptyList(),
  val album: CatalogAlbumRef? = null,
  val libraryTrackId: String? = null,
  val reason: String? = null,
) {
  val artists: String get() = (listOf(artist) + featuring).joinToString(", ") { it.name }
}

@Serializable
data class CatalogSearch(val artists: List<CatalogArtist> = emptyList(), val albums: List<CatalogAlbum> = emptyList(), val tracks: List<CatalogTrack> = emptyList())

@Serializable
data class CatalogAlbumPage(
  val id: Long,
  val title: String,
  val coverUrl: String? = null,
  val type: String = "album",
  val year: Int? = null,
  val trackCount: Int = 0,
  val artist: CatalogArtist,
  val libraryAlbumId: String? = null,
  val inLibrary: Int = 0,
  val label: String? = null,
  val tracks: List<CatalogTrack> = emptyList(),
)

@Serializable
data class CatalogArtistPage(
  val artist: CatalogArtist,
  val topTracks: List<CatalogTrack> = emptyList(),
  val albums: List<CatalogAlbum> = emptyList(),
  val singles: List<CatalogAlbum> = emptyList(),
  val related: List<CatalogArtist> = emptyList(),
)

@Serializable
data class Suggestions(val releases: List<CatalogAlbum> = emptyList(), val tracks: List<CatalogTrack> = emptyList())

@Serializable
data class AcquireJob(
  val id: String,
  val kind: String = "acquire",
  val status: String = "queued",
  val progress: Double = 0.0,
  val title: String = "",
  val error: String? = null,
  val position: Int? = null,
  val stats: Map<String, Int>? = null,
  val requestedBy: String? = null,
)

@Serializable
data class AcquireResult(val jobId: String, val duplicate: Boolean = false)
