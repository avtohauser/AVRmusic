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
  val mimeType: String? = null,
  val artist: ArtistSummary,
  val featuring: List<ArtistSummary> = emptyList(),
  val album: AlbumRef? = null,
  val trackNo: Int? = null,
  val discNo: Int? = null,
  val genre: String? = null,
  val hasCanvas: Boolean = false,
  val canvasKind: String? = null,
  val hasLyrics: Boolean = false,
  val hasSyncedLyrics: Boolean = false,
  /** why "My Wave" picked it */
  val reason: String? = null,
  /** who put it into a shared playlist */
  val addedBy: FriendRef? = null,
  /** integrated loudness (LUFS), for evening out the volume */
  val loudness: Double? = null,
  val bpm: Double? = null,
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
  /** the artist in the catalogue (to top up the discography) */
  val deezerId: Long? = null,
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
  val canEdit: Boolean? = null,
  val mosaic: List<String> = emptyList(),
  val isCreator: Boolean? = null,
  /** "blend" / "radar" / "mix" / "smart": filled by the server */
  val autoKind: String? = null,
  /** a smart playlist's rules */
  val autoRules: SmartRules? = null,
)

@Serializable
data class Playlist(
  val id: String,
  val title: String,
  val description: String? = null,
  val coverUrl: String? = null,
  val isPublic: Boolean = false,
  val owner: Owner? = null,
  val trackCount: Int = 0,
  val durationMs: Long = 0,
  val isOwner: Boolean? = null,
  val tracks: List<Track> = emptyList(),
  val mosaic: List<String> = emptyList(),
  /** friends who may add and remove tracks too */
  val members: List<FriendRef> = emptyList(),
  val canEdit: Boolean? = null,
  /** everyone who owns it, the creator first */
  val owners: List<FriendRef> = emptyList(),
  val isCreator: Boolean? = null,
  val autoKind: String? = null,
  val autoRules: SmartRules? = null,
)

@Serializable
data class Genre(val slug: String, val name: String, val color: String = "#6750A4", val trackCount: Int = 0, val coverUrl: String? = null, val covers: List<String> = emptyList())

@Serializable
data class GenrePage(val genre: Genre, val tracks: List<Track> = emptyList(), val albums: List<AlbumSummary> = emptyList(), val artists: List<ArtistSummary> = emptyList())

@Serializable
data class Paged<T>(val items: List<T> = emptyList(), val total: Int = 0)

@Serializable
data class SearchResult(
  val top: JsonObject? = null,
  val tracks: List<Track> = emptyList(),
  val albums: List<AlbumSummary> = emptyList(),
  val artists: List<ArtistSummary> = emptyList(),
  val playlists: List<PlaylistSummary> = emptyList(),
  /** songs found by a line of their lyrics */
  val lyrics: List<LyricHit> = emptyList(),
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
data class ServerInfo(
  val catalog: Boolean = false,
  val acquire: String = "off",
  val version: String = "",
  val needsSetup: Boolean = false,
  val inviteRequired: Boolean = true,
  val allowRegistration: Boolean = true,
)

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
  val previewUrl: String? = null,
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
  /** this listener follows the artist's new releases */
  val following: Boolean = false,
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

/* ---------- profile ---------- */

@Serializable
data class NamedCount(val id: String = "", val name: String = "", val n: Int = 0)

@Serializable
data class MeStats(
  val plays: Int = 0,
  val msListened: Long = 0,
  val topTracks: List<Track> = emptyList(),
  val topArtists: List<ArtistSummary> = emptyList(),
  val topGenres: List<NamedCount> = emptyList(),
)

@Serializable
data class HistoryEntry(val id: Long, val playedAt: String, val msPlayed: Long = 0, val context: String? = null, val track: Track)

/* ---------- admin ---------- */

@Serializable
data class AdminStats(
  val users: Int = 0, val artists: Int = 0, val albums: Int = 0, val tracks: Int = 0, val playlists: Int = 0,
  val plays: Long = 0, val storageBytes: Long = 0, val withLyrics: Int = 0, val withCanvas: Int = 0,
)

@Serializable
data class DayStat(val day: String, val plays: Int = 0, val ms: Long = 0, val users: Int = 0)

@Serializable
data class TopTrack(val id: String = "", val title: String = "", val artist: String = "", val plays: Int = 0)

@Serializable
data class TopArtist(val id: String = "", val name: String = "", val plays: Int = 0)

@Serializable
data class SourceStat(val source: String = "", val tracks: Int = 0, val bytes: Long = 0)

@Serializable
data class JobCounts(val done: Int = 0, val error: Int = 0, val queued: Int = 0, val running: Int = 0)

@Serializable
data class AdminActivity(
  val daily: List<DayStat> = emptyList(),
  val topTracks: List<TopTrack> = emptyList(),
  val topArtists: List<TopArtist> = emptyList(),
  val sources: List<SourceStat> = emptyList(),
  val jobs24h: JobCounts = JobCounts(),
  val activeUsers7d: Int = 0,
)

@Serializable
data class AdminUser(
  val id: String,
  val email: String = "",
  val username: String = "",
  val displayName: String = "",
  val role: String = "user",
  val avatarUrl: String? = null,
  val createdAt: String = "",
  val canAcquire: Boolean? = null,
  val disabled: Boolean = false,
  val lastSeenAt: String? = null,
  val plays: Int = 0,
  val msListened: Long = 0,
  val plays7d: Int = 0,
  val likes: Int = 0,
  val playlists: Int = 0,
  val added: Int = 0,
  val downloads: Int = 0,
  val downloadBytes: Long = 0,
)

@Serializable
data class RecentPlay(val trackId: String = "", val title: String = "", val artist: String = "", val playedAt: String = "", val msPlayed: Long = 0)

@Serializable
data class AddedTrack(val trackId: String = "", val title: String = "", val artist: String = "", val createdAt: String = "")

@Serializable
data class DownloadEntry(val kind: String = "", val refId: String? = null, val title: String? = null, val bytes: Long? = null, val createdAt: String = "")

@Serializable
data class AdminUserDetail(
  val user: AdminUser,
  val daily: List<DayStat> = emptyList(),
  val topArtists: List<TopArtist> = emptyList(),
  val topTracks: List<TopTrack> = emptyList(),
  val recentPlays: List<RecentPlay> = emptyList(),
  val added: List<AddedTrack> = emptyList(),
  val downloads: List<DownloadEntry> = emptyList(),
  val jobs: JobCounts = JobCounts(),
)

@Serializable
data class InviteUser(val id: String = "", val username: String = "", val displayName: String = "")

@Serializable
data class Invite(
  val code: String,
  val note: String? = null,
  val createdAt: String = "",
  val expiresAt: String? = null,
  val usedAt: String? = null,
  val usedBy: InviteUser? = null,
)

@Serializable
data class YtAccount(
  val id: String,
  val label: String = "",
  val updatedAt: String = "",
  val cookies: Int = 0,
  val loggedIn: Boolean = false,
  val busy: Boolean = false,
  val coolingUntil: String? = null,
  val ok: Int = 0,
  val failed: Int = 0,
  val lastError: String? = null,
  val lastUsedAt: String? = null,
  /** a friend who gave this spare account */
  val ownerName: String? = null,
)

@Serializable
data class ClientError(
  val id: Long,
  val app: String = "",
  val version: String? = null,
  val device: String? = null,
  val message: String = "",
  val stack: String? = null,
  @kotlinx.serialization.SerialName("created_at") val createdAt: String = "",
  val username: String? = null,
)

@Serializable
data class ServerJob(
  val id: String,
  val kind: String = "",
  val url: String? = null,
  val title: String? = null,
  val status: String = "queued",
  val progress: Double = 0.0,
  val log: List<String> = emptyList(),
  val error: String? = null,
  val createdAt: String = "",
  val position: Int? = null,
  val stats: Map<String, Int>? = null,
)

@Serializable
data class Skipped(val file: String = "", val reason: String = "")

@Serializable
data class UploadResult(val imported: List<Track> = emptyList(), val skipped: List<Skipped> = emptyList())

@Serializable
data class TrackPage(val items: List<Track> = emptyList(), val total: Int = 0)

@Serializable
data class AdminLyrics(val lyricsSynced: String? = null, val lyricsPlain: String? = null, val source: String? = null)

@Serializable
data class NewPassword(val password: String)

@Serializable
data class SourceState(val name: String = "", val label: String = "", val enabled: Boolean = false, val ok: Boolean = false, val reason: String? = null)

@Serializable
data class Capabilities(
  val ytdlp: Boolean = false,
  val ytdlpVersion: String? = null,
  val ffmpeg: Boolean = false,
  val musicDir: String? = null,
  val mediaDir: String? = null,
  val sources: List<SourceState> = emptyList(),
)

@Serializable
data class ScanResult(val dir: String = "", val imported: Int = 0, val skipped: List<Skipped> = emptyList())

/** A note from the admin to everyone. */
@Serializable
data class NewsItem(val id: String, val title: String, val body: String = "", val createdAt: String, val author: String? = null)
