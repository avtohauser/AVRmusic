import { M3eSkeleton } from '@/md';

export function Skeleton({ className = '' }: { className?: string }) {
  return <M3eSkeleton animation="wave" shape="rounded" className={`block ${className}`}><div className="w-full h-full" /></M3eSkeleton>;
}
export function ShelfSkeleton({ count = 6, round = false }: { count?: number; round?: boolean }) {
  return (
    <div className="flex gap-4 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="w-40 shrink-0 space-y-3">
          <M3eSkeleton animation="wave" shape={round ? 'circular' : 'rounded'} className="block"><div className="aspect-square w-full" /></M3eSkeleton>
          <M3eSkeleton animation="wave" shape="rounded" className="block w-3/4"><div className="h-4" /></M3eSkeleton>
          <M3eSkeleton animation="wave" shape="rounded" className="block w-1/2"><div className="h-3" /></M3eSkeleton>
        </div>
      ))}
    </div>
  );
}
export function TrackListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2">
          <M3eSkeleton animation="wave" shape="rounded" className="block"><div className="w-11 h-11" /></M3eSkeleton>
          <div className="flex-1 space-y-2"><M3eSkeleton animation="wave" shape="rounded" className="block w-1/3"><div className="h-4" /></M3eSkeleton><M3eSkeleton animation="wave" shape="rounded" className="block w-1/4"><div className="h-3" /></M3eSkeleton></div>
        </div>
      ))}
    </div>
  );
}
