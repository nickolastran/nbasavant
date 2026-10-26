'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Standing } from '@/lib/db';
import { TeamMark } from '@/components/TeamMark';
import { FavoriteMark } from '@/components/ScoreboardBar';
import { favoriteTeams, useFavorites } from '@/components/Favorites';
import { colsFor, type Col, type ColSet } from './columns';

type Section = { title: string | null; groups: { title: string; rows: Standing[] }[] };

/**
 * Every standings table on the page, sorted in the browser so a header click
 * is instant. Click a header for the best first, again for the worst; games
 * behind is the standings' own order and where every view starts.
 */
export function StandingsTables({ sections, set, lines }: { sections: Section[]; set: ColSet; lines: number[] }) {
  const cols = colsFor(set);
  const [sort, setSort] = useState('GB');
  const [worst, setWorst] = useState(false);
  const col = cols.find((c) => c.h === sort) ?? cols.find((c) => c.h === 'GB')!;
  const click = (c: Col) => {
    setWorst(c === col ? !worst : false);
    setSort(c.h);
  };
  // The postseason lines only mean something in standings order.
  const cut = col.h === 'GB' && !worst ? lines : [];

  return sections.map((s) => (
    <div key={s.title ?? 'all'} className="space-y-3">
      {s.title && <h2 className="text-lg font-bold tracking-tight">{s.title}</h2>}
      {s.groups.map((g) => (
        <Group key={g.title} title={g.title} rows={g.rows} lines={cut} cols={cols} sort={col} worst={worst} onSort={click} />
      ))}
    </div>
  ));
}

function Group({
  title, rows, lines, cols, sort, worst, onSort,
}: {
  title: string;
  rows: Standing[];
  lines: number[];
  cols: Col[];
  sort: Col;
  worst: boolean;
  onSort: (c: Col) => void;
}) {
  // Rows arrive in standings order, so a stable sort breaks ties by record.
  const sorted = [...rows].sort((a, b) => {
    const [x, y] = [sort.rank(a), sort.rank(b)];
    // A team with nothing to rank sorts last either way.
    if (x === null) return y === null ? 0 : 1;
    if (y === null) return -1;
    return worst ? x - y : y - x;
  });
  const favs = favoriteTeams(useFavorites());
  const cell = (c: Col) => ({ textAlign: 'center' as const, ...(c.sep && { borderLeft: '1px solid var(--line-2)' }) });
  return (
    <section className="panel overflow-hidden">
      <h2
        className="border-b px-3 py-2 text-sm font-bold uppercase tracking-[0.1em]"
        style={{ borderColor: 'var(--line)' }}
      >
        {title}
      </h2>
      <div className="overflow-x-auto">
        {/* Fixed, even columns: every table on the page lines up and nothing moves on a re-sort. */}
        <table className="stat-table" style={{ tableLayout: 'fixed', minWidth: 240 + cols.length * 72 }}>
          <colgroup>
            <col style={{ width: 240 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ cursor: 'default' }}>Team</th>
              {cols.map((c) => (
                <th
                  key={c.h}
                  title={c.tip}
                  aria-sort={c === sort ? (worst ? 'ascending' : 'descending') : 'none'}
                  tabIndex={0}
                  onClick={() => onSort(c)}
                  onKeyDown={(e) => e.key === 'Enter' && onSort(c)}
                  style={cell(c)}
                >
                  {c.h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr
                key={r.teamId}
                className={[lines.includes(i + 1) && 'cutline', favs.has(r.abbr) && 'fav'].filter(Boolean).join(' ') || undefined}
              >
                <td>
                  <span className="flex items-center gap-2">
                    <span className="tnum w-5 shrink-0 text-right text-[0.6875rem]" style={{ color: 'var(--ink-3)' }}>
                      {rows.indexOf(r) + 1}
                    </span>
                    <TeamMark abbr={r.abbr} color={r.color} size={18} />
                    <Link href={`/teams/${r.abbr}`} className="link truncate font-medium" style={{ color: 'var(--ink)' }}>
                      {r.name}
                    </Link>
                    {favs.has(r.abbr) && <FavoriteMark />}
                  </span>
                </td>
                {cols.map((c) => (
                  <td key={c.h} style={cell(c)}>
                    {c.cell(r, rows[0])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
