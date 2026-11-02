import { PageSkeleton, TableSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageSkeleton title="Teams" filters={false}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {[0, 1].map((c) => (
          <div key={c} className="space-y-4">
            {[0, 1, 2].map((d) => (
              <TableSkeleton key={d} title rows={5} cols={4} />
            ))}
          </div>
        ))}
      </div>
    </PageSkeleton>
  );
}
