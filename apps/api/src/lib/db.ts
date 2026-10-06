import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

export type DB = Database.Database;

const MIGRATIONS: string[] = [
  // 1: initial schema
  `
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    avatar_path TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_refresh_user ON refresh_tokens(user_id);

  CREATE TABLE artists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL UNIQUE,
    bio TEXT,
    image_path TEXT,
    header_path TEXT,
    verified INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE albums (
    id TEXT PRIMARY KEY,
    artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    title_key TEXT NOT NULL,
    year INTEGER,
    release_date TEXT,
    type TEXT NOT NULL DEFAULT 'album',
    cover_path TEXT,
    description TEXT,
    label TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(artist_id, title_key)
  );
  CREATE INDEX idx_albums_artist ON albums(artist_id);

  CREATE TABLE tracks (
    id TEXT PRIMARY KEY,
    album_id TEXT REFERENCES albums(id) ON DELETE SET NULL,
    artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    track_no INTEGER,
    disc_no INTEGER,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    file_path TEXT NOT NULL UNIQUE,
    file_size INTEGER NOT NULL DEFAULT 0,
    file_hash TEXT,
    mime_type TEXT NOT NULL,
    bitrate INTEGER,
    sample_rate INTEGER,
    codec TEXT,
    explicit INTEGER NOT NULL DEFAULT 0,
    genre TEXT,
    lyrics_plain TEXT,
    lyrics_synced TEXT,
    lyrics_source TEXT,
    canvas_path TEXT,
    canvas_mime TEXT,
    cover_path TEXT,
    play_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_tracks_album ON tracks(album_id);
  CREATE INDEX idx_tracks_artist ON tracks(artist_id);
  CREATE INDEX idx_tracks_genre ON tracks(genre);
  CREATE INDEX idx_tracks_hash ON tracks(file_hash);

  CREATE TABLE track_artists (
    track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    artist_id TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (track_id, artist_id)
  );

  CREATE TABLE playlists (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    cover_path TEXT,
    is_public INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_playlists_owner ON playlists(owner_id);

  CREATE TABLE playlist_tracks (
    playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    added_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (playlist_id, track_id)
  );
  CREATE INDEX idx_playlist_tracks_pos ON playlist_tracks(playlist_id, position);

  CREATE TABLE likes (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (user_id, entity_type, entity_id)
  );
  CREATE INDEX idx_likes_entity ON likes(entity_type, entity_id);

  CREATE TABLE plays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    ms_played INTEGER NOT NULL DEFAULT 0,
    context TEXT,
    played_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_plays_user_time ON plays(user_id, played_at DESC);
  CREATE INDEX idx_plays_track ON plays(track_id);

  CREATE VIRTUAL TABLE search_index USING fts5(
    kind UNINDEXED,
    entity_id UNINDEXED,
    title,
    subtitle,
    extra,
    tokenize = 'unicode61 remove_diacritics 2'
  );
  `,
  // 2: global catalogue links + response cache
  `
  ALTER TABLE artists ADD COLUMN deezer_id INTEGER;
  ALTER TABLE albums ADD COLUMN deezer_id INTEGER;
  ALTER TABLE tracks ADD COLUMN deezer_id INTEGER;
  ALTER TABLE tracks ADD COLUMN isrc TEXT;
  ALTER TABLE tracks ADD COLUMN source TEXT;
  CREATE INDEX idx_artists_deezer ON artists(deezer_id);
  CREATE INDEX idx_albums_deezer ON albums(deezer_id);
  CREATE INDEX idx_tracks_deezer ON tracks(deezer_id);
  CREATE TABLE catalog_cache (
    key TEXT PRIMARY KEY,
    json TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );
  `,
  // 3: one-time invite codes (generated by an admin, consumed by exactly one registration)
  `
  CREATE TABLE invites (
    code TEXT PRIMARY KEY,
    created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    note TEXT,
    expires_at TEXT,
    used_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    used_at TEXT
  );
  `,
  // 4: persistent job queue (survives restarts/deploys)
  `
  CREATE TABLE jobs (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    title TEXT,
    url TEXT,
    mode TEXT,
    requested_by TEXT,
    status TEXT NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,
    log TEXT NOT NULL DEFAULT '[]',
    imported TEXT NOT NULL DEFAULT '[]',
    stats TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    finished_at TEXT,
    payload TEXT NOT NULL DEFAULT '{}'
  );
  CREATE INDEX idx_jobs_created ON jobs(created_at);
  `,
  // 5: small key/value store for one-time maintenance flags
  `
  CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT);
  CREATE INDEX idx_tracks_source ON tracks(source);
  `,
  // 6: what the audio source was called (to verify it is the right recording) and the self-healing state
  `
  ALTER TABLE tracks ADD COLUMN source_title TEXT;
  ALTER TABLE tracks ADD COLUMN source_ok INTEGER;
  ALTER TABLE tracks ADD COLUMN heal_at TEXT;
  `,
  // 7: acoustic match with the catalogue preview; every catalogue track is checked again with the
  //    stricter matching (exact credited artists, YouTube Music credits, audio)
  `
  ALTER TABLE tracks ADD COLUMN audio_match REAL;
  UPDATE tracks SET source_title = NULL, source_ok = NULL, heal_at = NULL WHERE deezer_id IS NOT NULL AND source LIKE 'youtube:%';
  `,
  // 8: user management (blocked, may fetch to the server, last seen), who added which track,
  //    file / offline downloads, "My Wave" feedback
  `
  ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN can_acquire INTEGER NOT NULL DEFAULT 1;
  ALTER TABLE users ADD COLUMN last_seen_at TEXT;
  ALTER TABLE tracks ADD COLUMN added_by TEXT;
  CREATE TABLE downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    ref_id TEXT,
    bytes INTEGER,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_downloads_user ON downloads(user_id, created_at);
  CREATE TABLE wave_feedback (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    value INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (user_id, track_id)
  );
  CREATE INDEX idx_tracks_added_by ON tracks(added_by);
  `,
  // 9: crash reports from the apps (shown in the admin panel and the deploy report)
  `
  CREATE TABLE client_errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    app TEXT NOT NULL,
    version TEXT,
    device TEXT,
    message TEXT NOT NULL,
    stack TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  `,
  // 10: the home feed's "new releases" and "popular now" without sorting whole tables
  `
  CREATE INDEX IF NOT EXISTS idx_albums_created ON albums(created_at);
  CREATE INDEX IF NOT EXISTS idx_tracks_plays ON tracks(play_count, created_at);
  `,
  // 11: news from the admin to everyone
  `
  CREATE TABLE news (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_news_created ON news(created_at);
  `,
  // 12: new tracks My Wave fetched for a listener (and the ones it tried), with the reason
  `
  CREATE TABLE wave_found (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    deezer_id INTEGER NOT NULL,
    track_id TEXT,
    reason TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (user_id, deezer_id)
  );
  `,
  // 13: friends — things sent to each other, reactions at a moment of a track, playlists edited
  //     together; per track: tempo (for the wave's moods) and loudness (to even out the volume)
  `
  CREATE TABLE shares (
    id TEXT PRIMARY KEY,
    from_user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    ref_id TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    seen INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_shares_to ON shares(to_user, created_at);
  CREATE TABLE reactions (
    id TEXT PRIMARY KEY,
    track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    at_ms INTEGER NOT NULL,
    emoji TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_reactions_track ON reactions(track_id, at_ms);
  CREATE TABLE playlist_members (
    playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (playlist_id, user_id)
  );
  CREATE INDEX idx_playlist_members_user ON playlist_members(user_id);
  ALTER TABLE tracks ADD COLUMN bpm REAL;
  ALTER TABLE tracks ADD COLUMN loudness REAL;
  `,
  // 14: notices from the server itself in the inbox (a share with no sender: new releases), reports of
  //     wrong tracks, followed catalogue artists and the releases already announced, likes waiting for
  //     a song still being fetched, playlists filled by the server (a blend of friends, the release radar)
  `
  CREATE TABLE shares_new (
    id TEXT PRIMARY KEY,
    from_user TEXT REFERENCES users(id) ON DELETE CASCADE,
    to_user TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    ref_id TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    seen INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  INSERT INTO shares_new SELECT id, from_user, to_user, kind, ref_id, message, seen, created_at FROM shares;
  DROP TABLE shares;
  ALTER TABLE shares_new RENAME TO shares;
  CREATE INDEX idx_shares_to ON shares(to_user, created_at);
  CREATE TABLE track_reports (
    id TEXT PRIMARY KEY,
    track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    resolved_at TEXT
  );
  CREATE INDEX idx_reports_status ON track_reports(status, created_at);
  CREATE TABLE artist_follows (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    deezer_artist_id INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (user_id, deezer_artist_id)
  );
  CREATE TABLE release_seen (
    artist_deezer_id INTEGER NOT NULL,
    album_deezer_id INTEGER NOT NULL,
    seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (artist_deezer_id, album_deezer_id)
  );
  CREATE TABLE pending_likes (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    deezer_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (user_id, deezer_id)
  );
  ALTER TABLE playlists ADD COLUMN auto_kind TEXT;
  ALTER TABLE playlists ADD COLUMN auto_at TEXT;
  ALTER TABLE playlist_tracks ADD COLUMN auto INTEGER NOT NULL DEFAULT 0;
  `,
  // 15: search by a line of the lyrics, kept up to date by triggers whenever a track's lyrics change
  `
  CREATE VIRTUAL TABLE lyrics_index USING fts5(track_id UNINDEXED, text, tokenize = 'unicode61 remove_diacritics 2');
  INSERT INTO lyrics_index(track_id, text) SELECT id, COALESCE(lyrics_plain, lyrics_synced) FROM tracks WHERE COALESCE(lyrics_plain, lyrics_synced) IS NOT NULL;
  CREATE TRIGGER tracks_lyrics_ins AFTER INSERT ON tracks WHEN COALESCE(NEW.lyrics_plain, NEW.lyrics_synced) IS NOT NULL BEGIN
    INSERT INTO lyrics_index(track_id, text) VALUES (NEW.id, COALESCE(NEW.lyrics_plain, NEW.lyrics_synced));
  END;
  CREATE TRIGGER tracks_lyrics_upd AFTER UPDATE OF lyrics_plain, lyrics_synced ON tracks BEGIN
    DELETE FROM lyrics_index WHERE track_id = OLD.id;
    INSERT INTO lyrics_index(track_id, text) SELECT NEW.id, COALESCE(NEW.lyrics_plain, NEW.lyrics_synced) WHERE COALESCE(NEW.lyrics_plain, NEW.lyrics_synced) IS NOT NULL;
  END;
  CREATE TRIGGER tracks_lyrics_del AFTER DELETE ON tracks BEGIN
    DELETE FROM lyrics_index WHERE track_id = OLD.id;
  END;
  `,
  // 16: rules of the playlists the server fills (daily mixes, smart playlists); the listener's city (concerts);
  // links to Telegram and Last.fm; concerts already told about
  `
  ALTER TABLE playlists ADD COLUMN auto_rules TEXT;
  ALTER TABLE users ADD COLUMN city TEXT;
  CREATE TABLE telegram_links (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL,
    username TEXT,
    linked_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE lastfm_links (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    session_key TEXT NOT NULL,
    username TEXT NOT NULL,
    linked_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE concert_seen (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL,
    seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, event_id)
  );
  `,
  // 17: badges the admin makes and gives; Telegram accounts linked to show what plays in their bio
  `
  CREATE TABLE badges (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    emoji TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#F2A0C4',
    description TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE user_badges (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id TEXT NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
    given_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    given_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (user_id, badge_id)
  );
  CREATE TABLE tg_profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    session TEXT NOT NULL,
    username TEXT,
    original_about TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    linked_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `,
];

export function openDatabase(dbPath = config.dbPath): DB {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  migrate(db);
  return db;
}

function migrate(db: DB) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r: any) => r.version as number));
  const tx = db.transaction((version: number, sql: string) => {
    db.exec(sql);
    db.prepare('INSERT INTO schema_migrations(version) VALUES (?)').run(version);
  });
  MIGRATIONS.forEach((sql, i) => {
    const version = i + 1;
    if (!applied.has(version)) tx(version, sql);
  });
}

export function nowIso(): string {
  return new Date().toISOString();
}
