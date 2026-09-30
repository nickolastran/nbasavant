import { CardSkeleton, PageSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageSkeleton title="Scoreboard" subtitle={false} filters={false}>
      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => (
          <CardSkeleton key={i} footer />
        ))}
      </div>
    </PageSkeleton>
  );
}
