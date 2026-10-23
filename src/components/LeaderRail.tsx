'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Headshot } from '@/components/Headshot';
import { TeamMark } from '@/components/TeamMark';

export type RailBoard = {
  key: string;
  label: string;
  /** Printed after the label: "per game", or nothing. */
  note: string;
  empty: string;
  rows: { playerId: number; name: string; abbr: string; color: string; value: string }[];
};

/**
 * A column of top-5 boards, three of `boards` picked at random on every visit.
 * The server can't pick (the page is cached for a minute), so the first paint
 * is hidden and the browser deals the boards once it mounts.
 */
export function LeaderRail({ heading, boards, className = '' }: { heading: string; boards: RailBoard[]; className?: string }) {
  const [shown, setShown] = useState<RailBoard[] | null>(null);

  useEffect(() => {
    const pool = boards.some((b) => b.rows.length) ? boards.filter((b) => b.rows.length) : boards;
    setShown(pool.map((b) => ({ b, r: Math.random() })).sort((x, y) => x.r - y.r).slice(0, 3).map((x) => x.b));
  }, [boards]);

  return (
    <div className={`space-y-3 transition-opacity duration-300 ${className}`} style={{ opacity: shown ? 1 : 0 }}>
      <p className="eyebrow">{heading}</p>
      {(shown ?? boards.slice(0, 3)).map((b) => (
        <section key={b.key} className="panel overflow-hidden">
          <h2 className="eyebrow border-b px-3 py-2" style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}>
            {b.label}
            {b.note && (
              <span className="ml-1 font-normal normal-case tracking-normal" style={{ color: 'var(--ink-3)' }}>
                {b.note}
              </span>
            )}
          </h2>
          <ol>
            {b.rows.map((r, i) => (
              <li key={r.playerId} className="flex items-center gap-2 border-b px-3 py-1.5 text-sm" style={{ borderColor: 'var(--line)' }}>
                <span className="tnum w-3 text-right text-[0.6875rem]" style={{ color: 'var(--ink-3)' }}>
                  {i + 1}
                </span>
                <TeamMark abbr={r.abbr} color={r.color} size={18} />
                <Headshot id={r.playerId} name="" className="h-6 w-6 shrink-0 rounded-full bg-[var(--panel-2)] object-cover object-top" />
                <Link href={`/players/${r.playerId}`} className="link flex-1 truncate">
                  {r.name}
                </Link>
                <span className="tnum font-semibold">{r.value}</span>
              </li>
            ))}
            {!b.rows.length && (
              <li className="border-b px-3 py-3 text-sm" style={{ borderColor: 'var(--line)', color: 'var(--ink-3)' }}>
                {b.empty}
              </li>
            )}
          </ol>
          <Link href="/leaders" className="eyebrow block py-1.5 text-center no-underline hover:underline">
            Complete list →
          </Link>
        </section>
      ))}
    </div>
  );
}
