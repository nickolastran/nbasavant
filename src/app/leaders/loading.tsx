import { PageSkeleton, TableSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageSkeleton title="Stat Leaders">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <TableSkeleton key={i} title rows={5} cols={2} />
        ))}
      </div>
    </PageSkeleton>
  );
}
