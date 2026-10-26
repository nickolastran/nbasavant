import { CardSkeleton, PageSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageSkeleton title="Playoffs">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    </PageSkeleton>
  );
}
