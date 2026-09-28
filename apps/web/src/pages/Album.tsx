import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Download, MoreHorizontal, Shuffle } from 'lucide-react';
import { useAlbum, useArtist } from '@/lib/queries';
import { usePlayer } from '@/stores/player';
import { useAuth } from '@/stores/auth';
import { useUI } from '@/stores/ui';
import { useI18n, useT } from '@/lib/i18n';
import { fmtDurationLong, tracksWord } from '@/lib/format';
import { albumZipUrl } from '@/lib/api';
import { Hero } from '@/components/Hero';
import { TrackList } from '@/components/TrackList';
import { PlayButton } from '@/components/PlayButton';
import { LikeButton } from '@/components/LikeButton';
import { Shelf } from '@/components/Shelf';
import { AlbumCard } from '@/components/Cards';
import { TrackListSkeleton } from '@/components/Skeleton';
import { useEffect } from 'react';

export default function Album() {
  const { id } = useParams();
  const { data: album, isLoading } = useAlbum(id);
  const { data: artist } = useArtist(album?.artist.id);
  const [params] = useSearchParams();
  const t = useT();
  const lang = useI18n((s) => s.lang);
  const user = useAuth((s) => s.user);
  const openMenu = useUI((s) => s.openMenu);
  const current = usePlayer((s) => s.queue[s.index]);
  const playing = usePlayer((s) => s.playing);
  const context = usePlayer((s) => s.context);
  const p = usePlayer.getState();
  const isThis = context === `album:${id}` && !!current;

  useEffect(() => {
    const tr = params.get('track');
    if (tr && album) { const i = album.tracks.findIndex((x) => x.id === tr); if (i >= 0) document.querySelectorAll('.track-row')[i]?.scrollIntoView({ block: 'center' }); }
  }, [album, params]);

  if (isLoading || !album) return <div className="page pt-8"><TrackListSkeleton /></div>;
  const kind = album.type === 'single' ? t('single') : album.type === 'ep' ? t('ep') : album.type === 'compilation' ? t('compilation') : t('album');
  const others = (artist?.albums ?? []).filter((a) => a.id !== album.id);

  return (
    <div>
      <Hero kind={kind} title={album.title} cover={album.coverUrl} description={album.description}
        meta={<>
          <Link to={`/artist/${album.artist.id}`} className="font-semibold hover:underline flex items-center gap-1.5">{album.artist.name}</Link>
          {album.year && <span>· {album.year}</span>}
          <span>· {tracksWord(album.trackCount, lang)}, {fmtDurationLong(album.durationMs, lang)}</span>
        </>}>
        <PlayButton size="lg" playing={isThis && playing} onClick={() => (isThis ? p.toggle() : p.playTracks(album.tracks, 0, `album:${album.id}`))} />
        <button className="icon-btn" title={t('shuffle')} onClick={() => { if (!p.shuffle) p.toggleShuffle(); p.playTracks(album.tracks, Math.floor(Math.random() * album.tracks.length), `album:${album.id}`); }}><Shuffle size={22} /></button>
        <LikeButton type="album" id={album.id} size={24} alwaysVisible />
        {user && <a className="icon-btn" href={albumZipUrl(album.id)} title={t('downloadAll')}><Download size={22} /></a>}
        <button className="icon-btn" onClick={(e) => openMenu(e.clientX, e.clientY, { kind: 'album', album })}><MoreHorizontal size={22} /></button>
      </Hero>
      <div className="page">
        <TrackList tracks={album.tracks} context={`album:${album.id}`} showAlbum={false} showCover={false} />
        {album.label && <p className="text-xs text-muted mt-6">© {album.label}</p>}
        {others.length > 0 && <div className="mt-10"><Shelf title={`${t('more')} · ${album.artist.name}`} to={`/artist/${album.artist.id}`}>{others.map((a) => <AlbumCard key={a.id} album={a} />)}</Shelf></div>}
      </div>
    </div>
  );
}
