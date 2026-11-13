import { PageSkeleton, TableSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageSkeleton title="Leaderboards">
      <TableSkeleton toolbar rows={15} cols={10} />
    </PageSkeleton>
  );
}
