import { PageSkeleton, TableSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageSkeleton title="Standings">
      <div className="space-y-6">
        <TableSkeleton title rows={15} cols={12} />
        <TableSkeleton title rows={15} cols={12} />
      </div>
    </PageSkeleton>
  );
}
