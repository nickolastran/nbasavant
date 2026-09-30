import { PageSkeleton, TableSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageSkeleton title="Team Stats">
      <TableSkeleton toolbar rows={15} cols={12} />
    </PageSkeleton>
  );
}
