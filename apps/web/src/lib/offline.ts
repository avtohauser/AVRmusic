import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Track } from '@avrmusic/shared';
import { streamUrl } from './api';

interface OfflineDB extends DBSchema {
  tracks: { key: string; value: { track: Track; savedAt: number; size: number; mime: string }; indexes: { savedAt: number } };
  blobs: { key: string; value: Blob };
  covers: { key: string; value: Blob };
}

let dbp: Promise<IDBPDatabase<OfflineDB>> | null = null;
function db() {
  if (!dbp) {
    dbp = openDB<OfflineDB>('avrmusic-offline', 1, {
      upgrade(d) {
        const s = d.createObjectStore('tracks', { keyPath: 'track.id' });
        s.createIndex('savedAt', 'savedAt');
        d.createObjectStore('blobs');
        d.createObjectStore('covers');
      },
    });
  }
  return dbp;
}

type Listener = () => void;
const listeners = new Set<Listener>();
export function onOfflineChange(cb: Listener) { listeners.add(cb); return () => { listeners.delete(cb); }; }
const emit = () => listeners.forEach((l) => l());

const blobUrls = new Map<string, string>();

export async function listOffline(): Promise<Array<{ track: Track; savedAt: number; size: number }>> {
  const d = await db();
  const all = await d.getAllFromIndex('tracks', 'savedAt');
  return all.reverse();
}
export async function isOffline(trackId: string): Promise<boolean> {
  return !!(await (await db()).getKey('tracks', trackId));
}
export async function offlineIds(): Promise<Set<string>> {
  return new Set(await (await db()).getAllKeys('tracks'));
}

export async function saveOffline(track: Track, onProgress?: (pct: number) => void): Promise<void> {
  const res = await fetch(streamUrl(track.id));
  if (!res.ok) throw new Error('Не удалось скачать трек');
  const total = Number(res.headers.get('content-length') || 0);
  const mime = res.headers.get('content-type') || track.mimeType;
  let blob: Blob;
  if (res.body && total && onProgress) {
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length; onProgress(Math.round((got / total) * 100));
    }
    blob = new Blob(chunks as BlobPart[], { type: mime });
  } else {
    blob = await res.blob();
  }
  const d = await db();
  const tx = d.transaction(['tracks', 'blobs', 'covers'], 'readwrite');
  await tx.objectStore('blobs').put(blob, track.id);
  await tx.objectStore('tracks').put({ track, savedAt: Date.now(), size: blob.size, mime });
  await tx.done;
  if (track.coverUrl) {
    try {
      const c = await fetch(track.coverUrl);
      if (c.ok) await (await db()).put('covers', await c.blob(), track.id);
    } catch { /* cover is optional */ }
  }
  emit();
}

export async function removeOffline(trackId: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['tracks', 'blobs', 'covers'], 'readwrite');
  await tx.objectStore('tracks').delete(trackId);
  await tx.objectStore('blobs').delete(trackId);
  await tx.objectStore('covers').delete(trackId);
  await tx.done;
  const u = blobUrls.get(trackId);
  if (u) { URL.revokeObjectURL(u); blobUrls.delete(trackId); }
  emit();
}

/** Returns an object URL for a locally saved track, or null. */
export async function offlineSrc(trackId: string): Promise<string | null> {
  if (blobUrls.has(trackId)) return blobUrls.get(trackId)!;
  const blob = await (await db()).get('blobs', trackId);
  if (!blob) return null;
  const u = URL.createObjectURL(blob);
  blobUrls.set(trackId, u);
  return u;
}
export async function offlineCover(trackId: string): Promise<string | null> {
  const key = `cover:${trackId}`;
  if (blobUrls.has(key)) return blobUrls.get(key)!;
  const blob = await (await db()).get('covers', trackId);
  if (!blob) return null;
  const u = URL.createObjectURL(blob);
  blobUrls.set(key, u);
  return u;
}
export async function offlineUsage(): Promise<number> {
  const all = await (await db()).getAll('tracks');
  return all.reduce((s, x) => s + x.size, 0);
}
