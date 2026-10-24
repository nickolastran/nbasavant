'use client';

import { useEffect, useState } from 'react';
import { LeaderBoard, type Board } from '@/components/LeaderBoard';
import { BoardSkeleton, Bone } from '@/components/Skeleton';

export type RailBoard = Board;

/**
 * A column of top-5 boards, three of `boards` picked at random on every visit.
 * The server can't pick (the page is cached for a minute), so the first paint
 * is skeleton boards and the browser deals the real ones once it mounts.
 */
export function LeaderRail({ heading, boards, className = '' }: { heading: string; boards: RailBoard[]; className?: string }) {
  const [shown, setShown] = useState<RailBoard[] | null>(null);

  useEffect(() => {
    const pool = boards.some((b) => b.rows.length) ? boards.filter((b) => b.rows.length) : boards;
    setShown(pool.map((b) => ({ b, r: Math.random() })).sort((x, y) => x.r - y.r).slice(0, 3).map((x) => x.b));
  }, [boards]);

  if (!shown) return <RailSkeleton className={className} />;
  return (
    <div className={`space-y-3 ${className}`}>
      <p className="eyebrow">{heading}</p>
      {shown.map((b) => (
        <LeaderBoard key={b.key} board={b} more="/leaders" />
      ))}
    </div>
  );
}

/** A rail while it loads: the heading and three boards. */
export function RailSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`space-y-3 ${className}`} aria-hidden>
      <Bone width="9rem" className="h-2.5" />
      {[0, 1, 2].map((i) => (
        <BoardSkeleton key={i} />
      ))}
    </div>
  );
}
