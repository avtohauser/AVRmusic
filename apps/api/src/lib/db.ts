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
