import { Bone, PageSkeleton, TableSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageSkeleton title="Schedule">
        {/* The week strip, then a couple of days. */}
        <div className="panel mb-6 grid grid-cols-7 gap-2 px-10 py-3">
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className="flex flex-col items-center gap-1.5">
              <Bone width="2rem" className="h-2.5" />
              <Bone width="3rem" className="h-2" />
            </span>
          ))}
        </div>
        <div className="space-y-8">
          {[8, 6].map((rows) => (
            <div key={rows}>
              <Bone width="14rem" className="mb-3 h-4" />
              <TableSkeleton rows={rows} cols={3} />
            </div>
          ))}
        </div>
      </PageSkeleton>
    </div>
  );
}
