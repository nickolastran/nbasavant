import { PageSkeleton, TableSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageSkeleton title="Lineups">
      <TableSkeleton rows={15} cols={9} />
    </PageSkeleton>
  );
}
