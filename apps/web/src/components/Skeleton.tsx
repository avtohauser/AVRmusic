export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}
export function ShelfSkeleton({ count = 6, round = false }: { count?: number; round?: boolean }) {
  return (
    <div className="flex gap-4 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="w-40 shrink-0">
          <Skeleton className={`aspect-square w-full ${round ? 'rounded-full' : ''}`} />
          <Skeleton className="h-4 w-3/4 mt-3" />
          <Skeleton className="h-3 w-1/2 mt-2" />
        </div>
      ))}
    </div>
  );
}
export function TrackListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2">
          <Skeleton className="w-10 h-10" />
          <div className="flex-1"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/4 mt-2" /></div>
          <Skeleton className="h-3 w-10" />
        </div>
      ))}
    </div>
  );
}
