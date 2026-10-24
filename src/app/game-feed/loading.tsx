import { BoardSkeleton, PageSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageSkeleton title="Game Feed" subtitle={false} filters={false}>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 12 }, (_, i) => (
          <BoardSkeleton key={i} />
        ))}
      </div>
    </PageSkeleton>
  );
}
