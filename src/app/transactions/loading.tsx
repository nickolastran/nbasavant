import { PageSkeleton, TableSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageSkeleton title="Transactions">
      <TableSkeleton toolbar rows={15} cols={4} />
    </PageSkeleton>
  );
}
