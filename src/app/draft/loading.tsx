import { PageSkeleton, TableSkeleton } from '@/components/Skeleton';

/** The title names the year, which isn't known yet. */
export default function Loading() {
  return (
    <PageSkeleton>
      <TableSkeleton toolbar rows={15} cols={10} />
    </PageSkeleton>
  );
}
