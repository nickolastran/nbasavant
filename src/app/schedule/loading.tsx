import { CardSkeleton, PageSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageSkeleton title="Schedule">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 9 }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </PageSkeleton>
  );
}
