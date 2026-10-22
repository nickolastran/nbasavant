'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Headshot } from '@/components/Headshot';
import { TeamMark } from '@/components/TeamMark';
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
  /** Leave zero unshaded: for counts where nothing isn't "cold" (double-doubles). */
  plainZero?: boolean;
  /** The cell is a team abbreviation: show its logo instead. */
  logo?: boolean;
  /** A short label column (team, position): centered between vertical rules. */
  divide?: boolean;
  title?: string;
};

type Props<T> = {
  rows: T[];
  cols: Col<T>[];
  initialSort?: keyof T & string;
  /** Links the first column: `${href.base}/${row[href.key]}`. */
  href?: { base: string; key: keyof T & string };
  filename?: string;
  /** Rows "show more" adds; `firstPage` (default the same) is how many show at the start. */
  pageSize?: number;
  firstPage?: number;
  /** Grow with the page instead of scrolling inside a 70vh box. */
  tall?: boolean;
  /** A headshot beside the first column, by this key's NBA person id. */
  photo?: keyof T & string;
  /** Number the rows in the current sort, left of the first column. */
  ranked?: boolean;
  caption?: string;
  /** Shown instead of rows when there are none. */
  empty?: string;
};

export function StatTable<T extends Record<string, any>>({
  rows, cols, initialSort, href, filename = 'nba-savant', pageSize = 50, firstPage = pageSize, tall, photo, ranked, caption,
  empty = 'No players match these filters. Try widening the minimum games or clearing the team.',
}: Props<T>) {
  const [sort, setSort] = useState<string>(initialSort ?? cols[1]?.key ?? cols[0].key);
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [shown, setShown] = useState(firstPage);

  const sorted = useMemo(() => {
    const out = [...rows].sort((a, b) => {
      const [x, y] = [a[sort], b[sort]];
      // A stat the league didn't keep that season sorts last either way.
      if (x === null || x === undefined) return y === null || y === undefined ? 0 : 1;
      if (y === null || y === undefined) return -1;
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
      // Only real numbers rank: Number(null) is 0, which would shade a blank cell.
      const vals = rows
        .map((r): unknown => r[c.key])
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
        .sort((a, b) => a - b);
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
    if (c.plainZero && v === 0) return undefined;
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
  const lead = (row: T, text: string) =>
    href ? (
      <Link href={`${href.base}/${row[href.key]}`} className="link font-medium">
        {text}
      </Link>
    ) : (
      text
    );

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

      <div className={`panel overflow-auto ${tall ? '' : 'max-h-[70vh]'}`}>
        <table className="stat-table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th
                  key={c.key}
                  title={c.title ?? c.label}
                  scope="col"
                  className={c.divide ? 'divide' : undefined}
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
                  const missing = raw === null || raw === undefined;
                  const text = missing
                    ? '—'
                    : c.dp !== undefined && Number.isFinite(Number(raw))
                      ? Number(raw).toFixed(c.dp) + (c.suffix ?? '')
                      : `${raw}${c.suffix ?? ''}`;
                  return (
                    <td
                      key={c.key}
                      className={c.divide ? 'divide' : undefined}
                      style={
                        missing
                          ? { color: 'var(--ink-3)' }
                          : c.shade ? { background: shadeOf(c, Number(raw)) } : undefined
                      }
                    >
                      {j === 0 ? (
                        <span className="flex items-center gap-2">
                          {ranked && (
                            <span className="w-6 shrink-0 text-right text-[0.6875rem]" style={{ color: 'var(--ink-3)' }}>
                              {i + 1}
                            </span>
                          )}
                          {photo && (
                            <Headshot
                              id={row[photo]}
                              name=""
                              className="h-6 w-6 shrink-0 rounded-full bg-[var(--panel-2)] object-cover object-top"
                            />
                          )}
                          {lead(row, text)}
                        </span>
                      ) : c.logo && raw ? (
                        <span className="inline-flex align-middle" title={text}>
                          <TeamMark abbr={text} size={20} />
                          <span className="sr-only">{text}</span>
                        </span>
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
        <button className="btn-ghost mx-auto mt-2 block" onClick={() => setShown((s) => s + pageSize)}>
          Show {Math.min(pageSize, sorted.length - shown)} more ({sorted.length - shown} left)
        </button>
      )}
    </div>
  );
}
