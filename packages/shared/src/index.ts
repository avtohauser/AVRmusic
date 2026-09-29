// Shared API contract between @avrmusic/api and @avrmusic/web.

export type Role = 'admin' | 'user';

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  role: Role;
  avatarUrl: string | null;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Long-lived token accepted by /api/stream, /api/download, /api/canvas via ?t= */
  mediaToken: string;
  user: User;
}

export interface ArtistSummary {
  id: string;
  name: string;
  imageUrl: string | null;
}

export interface Artist extends ArtistSummary {
  deezerId?: number | null;
  bio: string | null;
  headerUrl: string | null;
  verified: boolean;
  followers: number;
  monthlyListeners: number;
  liked?: boolean;
}

export interface AlbumSummary {
  id: string;
  deezerId?: number | null;
  title: string;
  year: number | null;
  type: 'album' | 'single' | 'ep' | 'compilation';
  coverUrl: string | null;
  artist: ArtistSummary;
  trackCount: number;
  durationMs: number;
}

export interface Album extends AlbumSummary {
  description: string | null;
  releaseDate: string | null;
  label: string | null;
  tracks: Track[];
  liked?: boolean;
}

export interface Track {
  id: string;
  title: string;
  trackNo: number | null;
  discNo: number | null;
  durationMs: number;
  explicit: boolean;
  genre: string | null;
  playCount: number;
  mimeType: string;
  fileSize: number;
  bitrate: number | null;
  sampleRate: number | null;
  codec: string | null;
  hasLyrics: boolean;
  hasSyncedLyrics: boolean;
  hasCanvas: boolean;
  canvasKind: 'video' | 'image' | null;
  coverUrl: string | null;
  artist: ArtistSummary;
  featuring: ArtistSummary[];
  album: { id: string; title: string; year: number | null } | null;
  liked?: boolean;
  addedAt?: string;
  createdAt: string;
}

export interface LyricLine {
  timeMs: number;
  text: string;
}

export interface Lyrics {
  trackId: string;
  plain: string | null;
  synced: LyricLine[] | null;
  source: string | null;
}

export interface PlaylistSummary {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  isPublic: boolean;
  owner: { id: string; username: string; displayName: string };
  trackCount: number;
  durationMs: number;
  updatedAt: string;
  liked?: boolean;
  isOwner?: boolean;
}

export interface Playlist extends PlaylistSummary {
  tracks: Track[];
  /** First 4 track covers, used for mosaic when no custom cover is set */
  mosaic: string[];
}

export interface Genre {
  slug: string;
  name: string;
  color: string;
  trackCount: number;
  coverUrl: string | null;
}

export interface SearchResult {
  query: string;
  top: { kind: 'track' | 'album' | 'artist' | 'playlist'; item: Track | AlbumSummary | ArtistSummary | PlaylistSummary } | null;
  tracks: Track[];
  albums: AlbumSummary[];
  artists: ArtistSummary[];
  playlists: PlaylistSummary[];
}

export interface HomeSection {
  id: string;
  title: string;
  subtitle?: string;
  kind: 'tracks' | 'albums' | 'artists' | 'playlists' | 'genres' | 'mixed';
  items: Array<Track | AlbumSummary | ArtistSummary | PlaylistSummary | Genre>;
}

export interface HomeFeed {
  greeting: string;
  quickPicks: Array<AlbumSummary | PlaylistSummary | { id: string; kind: 'liked'; title: string; trackCount: number }>;
  sections: HomeSection[];
}

export interface PlayEvent {
  trackId: string;
  msPlayed: number;
  context?: string;
}

export interface HistoryEntry {
  id: number;
  playedAt: string;
  msPlayed: number;
  context: string | null;
  track: Track;
}

export interface AdminStats {
  users: number;
  artists: number;
  albums: number;
  tracks: number;
  playlists: number;
  plays: number;
  storageBytes: number;
  withLyrics: number;
  withCanvas: number;
}

export interface UploadResult {
  imported: Track[];
  skipped: Array<{ file: string; reason: string }>;
}

/** One-time registration code. */
export interface Invite {
  code: string;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
  expiresAt: string | null;
  usedAt: string | null;
  usedBy: { id: string; username: string; displayName: string } | null;
}

export interface ServerInfo {
  name: string;
  version: string;
  allowRegistration: boolean;
  /** Registration needs a one-time invite code (always, once the first account exists) */
  inviteRequired: boolean;
  publicLibrary: boolean;
  maxUploadMb: number;
  needsSetup: boolean;
  /** Global catalogue (Deezer metadata) browsing is enabled */
  catalog: boolean;
  /** Users may request tracks to be fetched into the library ('user' = everyone, 'admin' = admins only, 'off') */
  acquire: 'user' | 'admin' | 'off';
  acquireSource: 'youtube' | 'soundcloud';
  /** Canvases are cut automatically from the official clip for tracks added from the catalogue */
  canvasAuto: boolean;
  acquireSources: string[];
}

/* ---------- Global catalogue (metadata provider) ---------- */

export interface CatalogArtistSummary { id: number; name: string; imageUrl: string | null }
export interface CatalogArtist extends CatalogArtistSummary {
  fans: number;
  albumCount: number;
  /** Local artist id when at least one track of this artist is in the library */
  libraryArtistId: string | null;
}
export interface CatalogAlbum {
  id: number;
  title: string;
  coverUrl: string | null;
  type: 'album' | 'single' | 'ep' | 'compilation';
  year: number | null;
  releaseDate: string | null;
  trackCount: number;
  explicit: boolean;
  artist: CatalogArtistSummary;
  libraryAlbumId: string | null;
  /** How many of the album's tracks are already in the library */
  inLibrary: number;
}
export interface CatalogTrack {
  id: number;
  title: string;
  durationMs: number;
  explicit: boolean;
  previewUrl: string | null;
  trackNo: number | null;
  discNo: number | null;
  artist: CatalogArtistSummary;
  featuring: CatalogArtistSummary[];
  album: { id: number; title: string; coverUrl: string | null } | null;
  libraryTrackId: string | null;
}
export interface CatalogSearchResult {
  query: string;
  top: { kind: 'artist'; item: CatalogArtist } | { kind: 'album'; item: CatalogAlbum } | { kind: 'track'; item: CatalogTrack } | null;
  artists: CatalogArtist[];
  albums: CatalogAlbum[];
  tracks: CatalogTrack[];
}
export interface CatalogArtistPage {
  artist: CatalogArtist;
  topTracks: CatalogTrack[];
  albums: CatalogAlbum[];
  singles: CatalogAlbum[];
  compilations: CatalogAlbum[];
  related: CatalogArtist[];
  appearsOn: CatalogTrack[];
}
export interface CatalogAlbumPage extends CatalogAlbum {
  label: string | null;
  genres: string[];
  durationMs: number;
  contributors: Array<CatalogArtistSummary & { role: string }>;
  tracks: CatalogTrack[];
}
export type AcquireKind = 'track' | 'album' | 'artist';
export interface AcquireJob {
  id: string;
  kind: 'acquire' | 'canvas';
  status: 'queued' | 'running' | 'done' | 'error';
  progress: number;
  title: string;
  requestedBy: string | null;
  log: string[];
  imported: Track[];
  error?: string;
  createdAt: string;
  finishedAt?: string;
  stats?: Record<string, number>;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

export type Paginated<T> = { items: T[]; total: number; offset: number; limit: number };
