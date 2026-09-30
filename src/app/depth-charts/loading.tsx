import { PageSkeleton, TableSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageSkeleton title="Depth Charts">
      <TableSkeleton toolbar rows={15} cols={6} />
    </PageSkeleton>
  );
}
