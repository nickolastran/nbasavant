import { Bone, PageSkeleton, TableSkeleton } from '@/components/Skeleton';

export default function Loading() {
  return (
    <PageSkeleton filters={false}>
      <div className="panel mb-6 flex items-center gap-4 p-4">
        <Bone className="h-16 w-16 rounded-full" />
        <div className="flex-1 space-y-2">
          <Bone width="12rem" className="h-5" />
          <Bone width="8rem" />
        </div>
      </div>
      <div className="space-y-6">
        <TableSkeleton toolbar rows={10} cols={10} />
        <TableSkeleton toolbar rows={8} cols={10} />
      </div>
    </PageSkeleton>
  );
}
