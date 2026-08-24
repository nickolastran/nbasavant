'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { downloadCsv, downloadJson } from '@/lib/export';

/**
 * Columns are declarative rather than render functions: this table is a client
 * component, and server components can't hand functions across the boundary.
 */
export type Col<T> = {
  key: keyof T & string;
  label: string;
  /** Decimal places for numeric cells. Omit to print the raw value. */
  dp?: number;
  suffix?: string;
  /** Percentile-shade this column red (high) to blue (low), Savant-style. */
  shade?: boolean;
  /** Set for stats where lower is better (DRtg, turnovers). */
  lowerIsBetter?: boolean;
  title?: string;
};

type Props<T> = {
  rows: T[];
  cols: Col<T>[];
  initialSort?: keyof T & string;
  /** Links the first column: `${href.base}/${row[href.key]}`. */
  href?: { base: string; key: keyof T & string };
  filename?: string;
  pageSize?: number;
  caption?: string;
  /** Shown instead of rows when there are none. */
  empty?: string;
};

export function StatTable<T extends Record<string, any>>({
  rows, cols, initialSort, href, filename = 'nba-savant', pageSize = 50, caption,
  empty = 'No players match these filters. Try widening the minimum games or clearing the team.',
}: Props<T>) {
  const [sort, setSort] = useState<string>(initialSort ?? cols[1]?.key ?? cols[0].key);
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [shown, setShown] = useState(pageSize);

  const sorted = useMemo(() => {
    const out = [...rows].sort((a, b) => {
      const [x, y] = [a[sort], b[sort]];
      if (typeof x === 'number' && typeof y === 'number') return dir === 'asc' ? x - y : y - x;
      return dir === 'asc'
        ? String(x).localeCompare(String(y))
        : String(y).localeCompare(String(x));
    });
    return out;
  }, [rows, sort, dir]);

  // Percentile per shaded column, computed once over the full set so paging
  // never changes a cell's color.
  const ranks = useMemo(() => {
    const out: Record<string, Map<number, number>> = {};
    for (const c of cols.filter((c) => c.shade)) {
      const vals = rows.map((r) => Number(r[c.key])).filter(Number.isFinite).sort((a, b) => a - b);
      const m = new Map<number, number>();
      for (const v of new Set(vals)) {
        const below = vals.filter((x) => x < v).length;
        m.set(v, vals.length > 1 ? below / (vals.length - 1) : 0.5);
      }
      out[c.key] = m;
    }
    return out;
  }, [rows, cols]);

  const shadeOf = (c: Col<T>, v: number) => {
    const p = ranks[c.key]?.get(v);
    if (p === undefined) return undefined;
    const t = (c.lowerIsBetter ? 1 - p : p) * 2 - 1; // -1 cold .. +1 hot
    const pctColor = Math.round(Math.abs(t) * 55);
    if (pctColor < 6) return undefined;
    return `color-mix(in oklab, var(${t > 0 ? '--hot' : '--cold'}) ${pctColor}%, transparent)`;
  };

  const click = (key: string) => {
    if (key === sort) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(key);
      setDir('desc');
    }
  };

  const visible = sorted.slice(0, shown);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
        {caption ? <div className="eyebrow">{caption}</div> : <span />}
        <div className="flex gap-1">
          <button className="btn-ghost" onClick={() => downloadCsv(sorted, filename)}>
            CSV
          </button>
          <button className="btn-ghost" onClick={() => downloadJson(sorted, filename)}>
            JSON
          </button>
        </div>
      </div>

      <div className="panel max-h-[70vh] overflow-auto">
        <table className="stat-table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th
                  key={c.key}
                  title={c.title ?? c.label}
                  scope="col"
                  aria-sort={sort === c.key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  onClick={() => click(c.key)}
                  onKeyDown={(e) => e.key === 'Enter' && click(c.key)}
                  tabIndex={0}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={i}>
                {cols.map((c, j) => {
                  const raw = row[c.key];
                  const text =
                    c.dp !== undefined && Number.isFinite(Number(raw))
                      ? Number(raw).toFixed(c.dp) + (c.suffix ?? '')
                      : `${raw ?? ''}${c.suffix ?? ''}`;
                  return (
                    <td
                      key={c.key}
                      style={c.shade ? { background: shadeOf(c, Number(raw)) } : undefined}
                    >
                      {j === 0 && href ? (
                        <Link href={`${href.base}/${row[href.key]}`} className="link font-medium">
                          {text}
                        </Link>
                      ) : (
                        text
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={cols.length} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '2rem' }}>
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {shown < sorted.length && (
        <button className="btn-ghost mt-2" onClick={() => setShown((s) => s + pageSize)}>
          Show {Math.min(pageSize, sorted.length - shown)} more ({sorted.length - shown} left)
        </button>
      )}
    </div>
  );
}
