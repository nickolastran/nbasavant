'use client';

import {
  type ColumnDef, type SortingState, flexRender, getCoreRowModel, getSortedRowModel, useReactTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Headshot } from '@/components/Headshot';
import { Icon } from '@/components/icons';
import { PlayerLink } from '@/components/PlayerLink';
import { Sparkline } from '@/components/Sparkline';
import { TeamMark } from '@/components/TeamMark';
import { toast } from '@/components/Toast';
import { Segmented } from '@/components/ViewTabs';
import { downloadCsv } from '@/lib/export';
import { type Filter, type Op, type TableState, applyFilters, decodeState, encodeState } from '@/lib/table-state';

type Cell = string | number | null | number[];
export type Row = Record<string, Cell>;

/**
 * Columns are plain data, not render functions: pages are server components
 * and can't hand functions to this client one.
 */
export type ACol = {
  key: string;
  label: string;
  /** Header group ("Shooting"); consecutive columns with the same group share one. */
  group?: string;
  title?: string;
  /** num (default): a stat. text: a short label. team: an abbreviation shown as a logo. spark: number[] drawn as a sparkline. */
  kind?: 'num' | 'text' | 'team' | 'spark';
  dp?: number;
  suffix?: string;
  /** Print a plus sign on positive values (differentials). */
  signed?: boolean;
  /** Percentile-shade this column, red (better) to blue (worse). */
  shade?: boolean;
  lowerIsBetter?: boolean;
};

export type Preset = { key: string; label: string; cols: string[] };

type Props = {
  rows: Row[];
  cols: ACol[];
  /** The sticky first column: a name, optionally linked, with a photo or logo. */
  lead: { key: string; label: string; hrefBase?: string; idKey?: string; photoKey?: string; logoKey?: string };
  presets?: Preset[];
  /** The preset shown when the URL names none; without it every column shows. */
  defaultPreset?: string;
  initialSort: string;
  filename?: string;
  /** Text columns offered as dropdown filters (team, position). */
  selects?: string[];
  /** A numeric column offered as an always-visible "at least" box (the minutes qualifier). */
  qualifier?: { key: string; label: string };
  empty?: string;
  /** Set when the data couldn't be loaded: shown instead of the table. */
  error?: string;
};

const ROW_H = 33;
const GROUP_H = 26;
const OPS: Record<Op, string> = { gte: '≥', lte: '≤', eq: '=' };

const fmtCell = (c: ACol, v: Cell) => {
  if (v === null || v === undefined || Array.isArray(v)) return '—';
  if (typeof v !== 'number') return v;
  return `${c.signed && v > 0 ? '+' : ''}${c.dp === undefined ? v : v.toFixed(c.dp)}${c.suffix ?? ''}`;
};

/**
 * The leaderboard table: sticky header and first column, multi-column sort
 * (shift-click or Shift+Enter adds a column), column groups and presets,
 * show/hide, per-column filters, search, percentile shading, last-10
 * sparklines, CSV export, and virtual rows past sixty. Its whole view lives in
 * the URL, so any state of it is a link.
 */
export function AdvancedTable({
  rows, cols, lead, presets = [], defaultPreset, initialSort, filename = 'nba-savant', selects = [], qualifier,
  empty = 'Nothing matches these filters.', error,
}: Props) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const byKey = useMemo(() => new Map(cols.map((c) => [c.key, c])), [cols]);
  const defaults = useMemo<TableState>(
    () => ({ sort: [{ id: initialSort, desc: !byKey.get(initialSort)?.lowerIsBetter }], preset: defaultPreset ?? null, cols: null, filters: [], q: '', shade: true }),
    [initialSort, byKey, defaultPreset],
  );
  const [state, setState] = useState<TableState>(() => decodeState(new URLSearchParams(sp.toString()), defaults));
  const [panel, setPanel] = useState<'cols' | 'filter' | null>(null);

  // The URL follows the table. replaceState, not the router: nothing on the server depends on these params.
  useEffect(() => {
    const next = encodeState(state, new URLSearchParams(window.location.search), defaults).toString();
    if (next !== window.location.search.slice(1)) window.history.replaceState(null, '', next ? `${pathname}?${next}` : pathname);
  }, [state, defaults, pathname]);

  const visibleKeys = useMemo(() => {
    const keys = state.cols ?? presets.find((p) => p.key === state.preset)?.cols ?? cols.map((c) => c.key);
    return new Set(keys);
  }, [state.cols, state.preset, presets, cols]);

  const filtered = useMemo(() => applyFilters(rows, state.filters, state.q, lead.key), [rows, state.filters, state.q, lead.key]);

  // Percentile per shaded column over every row, so filtering never recolors a cell.
  const ranks = useMemo(() => {
    const out = new Map<string, Map<number, number>>();
    for (const c of cols.filter((c) => c.shade)) {
      const vals = rows.map((r) => r[c.key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v)).sort((a, b) => a - b);
      const m = new Map<number, number>();
      vals.forEach((v, i) => {
        if (!m.has(v)) m.set(v, vals.length > 1 ? i / (vals.length - 1) : 0.5);
      });
      out.set(c.key, m);
    }
    return out;
  }, [rows, cols]);
  const shadeOf = (c: ACol, v: Cell) => {
    if (!state.shade || !c.shade || typeof v !== 'number') return undefined;
    const p = ranks.get(c.key)?.get(v);
    if (p === undefined) return undefined;
    const t = (c.lowerIsBetter ? 1 - p : p) * 2 - 1; // -1 cold .. +1 hot
    const strength = Math.round(Math.abs(t) * 55);
    return strength < 6 ? undefined : `color-mix(in oklab, var(${t > 0 ? '--hot' : '--cold'}) ${strength}%, transparent)`;
  };

  const columns = useMemo<ColumnDef<Row>[]>(() => {
    const def = (c: ACol): ColumnDef<Row> => ({
      id: c.key,
      header: c.label,
      // Blank stats are undefined to the sorter, which then keeps them last in either direction.
      accessorFn: (r) => (r[c.key] === null || Array.isArray(r[c.key]) ? undefined : r[c.key]),
      sortUndefined: 'last',
      sortDescFirst: (c.kind ?? 'num') === 'num' && !c.lowerIsBetter,
      enableSorting: c.kind !== 'spark',
    });
    const out: ColumnDef<Row>[] = [{ id: lead.key, header: lead.label, accessorFn: (r) => r[lead.key] ?? undefined, sortDescFirst: false, enableHiding: false }];
    for (const c of cols) {
      const last = out[out.length - 1] as ColumnDef<Row> & { columns?: ColumnDef<Row>[]; header?: unknown };
      if (c.group && last.columns && last.header === c.group) last.columns.push(def(c));
      else out.push(c.group ? { id: `group:${c.group}:${c.key}`, header: c.group, columns: [def(c)] } : def(c));
    }
    return out;
  }, [cols, lead.key, lead.label]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: {
      sorting: state.sort,
      columnVisibility: Object.fromEntries(cols.map((c) => [c.key, visibleKeys.has(c.key)])),
    },
    onSortingChange: (u) => setState((s) => ({ ...s, sort: typeof u === 'function' ? u(s.sort as SortingState) : u })),
    enableMultiSort: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  const sortedRows = table.getRowModel().rows;
  const grouped = table.getHeaderGroups().length > 1;

  // Past sixty rows only the ones in view are in the DOM; spacer rows hold the scroll height.
  const scroller = useRef<HTMLDivElement>(null);
  const virtual = sortedRows.length > 60;
  const virtualizer = useVirtualizer({ count: sortedRows.length, getScrollElement: () => scroller.current, estimateSize: () => ROW_H, overscan: 12, enabled: virtual });
  const items = virtual ? virtualizer.getVirtualItems() : null;
  // Each shown row with its place in the current sort: the rank it prints and the stripe it gets.
  const shown = items ? items.map((i) => ({ r: sortedRows[i.index], at: i.index })) : sortedRows.map((r, at) => ({ r, at }));
  const padTop = items?.[0]?.start ?? 0;
  const padBottom = items?.length ? virtualizer.getTotalSize() - items[items.length - 1].end : 0;

  const setFilter = (key: string, op: Op, value: string) =>
    setState((s) => ({ ...s, filters: [...s.filters.filter((f) => !(f.key === key && f.op === op)), ...(value ? [{ key, op, value }] : [])] }));
  const filterValue = (key: string, op: Op) => state.filters.find((f) => f.key === key && f.op === op)?.value ?? '';
  const dirty = state.filters.length > 0 || state.q !== '';

  const exportCsv = () => {
    const leafs = table.getVisibleLeafColumns().map((c) => c.id);
    downloadCsv(
      sortedRows.map((r) => Object.fromEntries(leafs.map((k) => [byKey.get(k)?.label ?? lead.label, Array.isArray(r.original[k]) ? (r.original[k] as number[]).join(' ') : r.original[k]]))),
      filename,
    );
    toast(`Exported ${sortedRows.length} rows`);
  };

  if (error) {
    return (
      <div role="alert" className="panel p-8 text-center text-sm" style={{ color: 'var(--ink-2)' }}>
        <strong className="block" style={{ color: 'var(--ink)' }}>
          This table couldn&apos;t be loaded.
        </strong>
        {error}
      </div>
    );
  }

  const leadCell = (row: Row, i: number) => {
    const text = String(row[lead.key] ?? '');
    const id = lead.idKey ? row[lead.idKey] : null;
    return (
      <span className="flex items-center gap-2">
        <span className="w-6 shrink-0 text-right text-[0.6875rem]" style={{ color: 'var(--ink-3)' }}>
          {i + 1}
        </span>
        {lead.logoKey && row[lead.logoKey] && <TeamMark abbr={String(row[lead.logoKey])} size={20} />}
        {lead.photoKey && typeof row[lead.photoKey] === 'number' && (
          <Headshot id={row[lead.photoKey] as number} name="" className="h-6 w-6 shrink-0 rounded-full bg-[var(--panel-2)] object-cover object-top" />
        )}
        {lead.hrefBase === '/players' && typeof id === 'number' ? (
          <PlayerLink id={id} className="link font-medium">
            {text}
          </PlayerLink>
        ) : lead.hrefBase && id !== null ? (
          <Link href={`${lead.hrefBase}/${id}`} className="link font-medium">
            {text}
          </Link>
        ) : (
          <span className="font-medium">{text}</span>
        )}
      </span>
    );
  };

  const numericCols = cols.filter((c) => (c.kind ?? 'num') === 'num');
  return (
    <div>
      {/* Toolbar: search and filters on the left, view controls on the right. */}
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2 pb-2">
        <label className="flex flex-col gap-1">
          <span className="eyebrow">Search</span>
          <input
            type="search"
            value={state.q}
            onChange={(e) => setState((s) => ({ ...s, q: e.target.value }))}
            placeholder={lead.label}
            className="w-40"
          />
        </label>
        {selects.map((key) => {
          const options = [...new Set(rows.map((r) => r[key]).filter((v): v is string => typeof v === 'string' && v !== ''))].sort();
          return (
            <label key={key} className="flex flex-col gap-1">
              <span className="eyebrow">{byKey.get(key)?.label ?? key}</span>
              <select value={filterValue(key, 'eq')} onChange={(e) => setFilter(key, 'eq', e.target.value)}>
                <option value="">All</option>
                {options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </label>
          );
        })}
        {qualifier && (
          <label className="flex flex-col gap-1">
            <span className="eyebrow">{qualifier.label}</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              value={filterValue(qualifier.key, 'gte')}
              onChange={(e) => setFilter(qualifier.key, 'gte', e.target.value)}
              placeholder="Any"
              className="w-24"
            />
          </label>
        )}
        <div className="relative">
          <button type="button" className="btn-ghost flex h-[30px] items-center gap-1.5" aria-expanded={panel === 'filter'} onClick={() => setPanel(panel === 'filter' ? null : 'filter')}>
            <Icon name="filter" size={12} />
            Add filter
          </button>
          {panel === 'filter' && (
            <FilterForm
              cols={numericCols}
              onAdd={(f) => {
                setFilter(f.key, f.op, f.value);
                setPanel(null);
              }}
            />
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="tnum text-xs" style={{ color: 'var(--ink-2)' }} role="status">
            {filtered.length === rows.length ? `${rows.length} rows` : `${filtered.length} of ${rows.length}`}
          </span>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs" style={{ color: 'var(--ink-2)' }}>
            <input type="checkbox" checked={state.shade} onChange={(e) => setState((s) => ({ ...s, shade: e.target.checked }))} className="p-0" />
            Percentile shading
          </label>
          <div className="relative">
            <button type="button" className="btn-ghost flex items-center gap-1.5" aria-expanded={panel === 'cols'} onClick={() => setPanel(panel === 'cols' ? null : 'cols')}>
              <Icon name="columns" size={12} />
              Columns
            </button>
            {panel === 'cols' && (
              <div className="panel absolute right-0 top-full z-30 mt-1 max-h-80 w-56 overflow-auto p-2 shadow-2">
                {cols.map((c, i) => (
                  <div key={c.key}>
                    {c.group && c.group !== cols[i - 1]?.group && <div className="eyebrow px-1 pb-0.5 pt-2">{c.group}</div>}
                    <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-[var(--panel-2)]">
                      <input
                        type="checkbox"
                        className="p-0"
                        checked={visibleKeys.has(c.key)}
                        onChange={(e) => {
                          const next = new Set(visibleKeys);
                          if (e.target.checked) next.add(c.key);
                          else next.delete(c.key);
                          setState((s) => ({ ...s, preset: null, cols: cols.map((x) => x.key).filter((k) => next.has(k)) }));
                        }}
                      />
                      {c.label}
                      {c.title && <span className="truncate" style={{ color: 'var(--ink-3)' }}>{c.title}</span>}
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="btn-ghost flex items-center gap-1.5" onClick={exportCsv}>
            <Icon name="download" size={12} />
            CSV
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pb-2">
        {presets.length > 0 && (
          <Segmented
            label="Column presets"
            items={[{ value: '', label: 'All' }, ...presets.map((p) => ({ value: p.key, label: p.label }))]}
            current={state.cols ? '__custom' : state.preset ?? ''}
            onChange={(v) => setState((s) => ({ ...s, preset: v || null, cols: null }))}
          />
        )}
        {state.filters.map((f) => (
          <button
            key={`${f.key}${f.op}`}
            type="button"
            onClick={() => setFilter(f.key, f.op, '')}
            aria-label={`Remove filter: ${byKey.get(f.key)?.label ?? f.key} ${OPS[f.op]} ${f.value}`}
            className="tnum flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs hover:bg-[var(--panel-2)]"
            style={{ borderColor: 'var(--line-2)', background: 'var(--panel)' }}
          >
            {byKey.get(f.key)?.label ?? f.key} {OPS[f.op]} {f.value}
            <Icon name="close" size={10} />
          </button>
        ))}
        {dirty && (
          <button type="button" className="link text-xs" onClick={() => setState((s) => ({ ...s, filters: [], q: '' }))}>
            Clear filters
          </button>
        )}
      </div>

      <div ref={scroller} className="panel relative max-h-[72vh] overflow-auto">
        <table className="stat-table adv">
          <thead>
            {table.getHeaderGroups().map((hg, level) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const c = byKey.get(h.column.id);
                  const isGroupRow = grouped && level === 0;
                  if (isGroupRow) {
                    return (
                      <th
                        key={h.id}
                        colSpan={h.colSpan}
                        scope="colgroup"
                        className={h.isPlaceholder ? 'group-th' : 'group-th group-th-on'}
                        style={{ height: GROUP_H, cursor: 'default' }}
                      >
                        {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                      </th>
                    );
                  }
                  const sorted = h.column.getIsSorted();
                  const order = state.sort.length > 1 ? h.column.getSortIndex() + 1 : 0;
                  const sortable = h.column.getCanSort();
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      title={c?.title ?? c?.label}
                      style={{ top: grouped ? GROUP_H : 0, cursor: sortable ? 'pointer' : 'default' }}
                      aria-sort={sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : sortable ? 'none' : undefined}
                      tabIndex={sortable ? 0 : undefined}
                      onClick={sortable ? h.column.getToggleSortingHandler() : undefined}
                      onKeyDown={(e) => {
                        if (!sortable || (e.key !== 'Enter' && e.key !== ' ')) return;
                        e.preventDefault();
                        h.column.toggleSorting(undefined, e.shiftKey);
                      }}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {sorted && order > 0 && <sup className="ml-0.5">{order}</sup>}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {padTop > 0 && (
              <tr aria-hidden style={{ height: padTop }}>
                <td colSpan={99} style={{ padding: 0, border: 0 }} />
              </tr>
            )}
            {shown.map(({ r, at }) => (
              <tr key={r.id} className={at % 2 ? 'alt' : undefined} style={{ height: ROW_H }}>
                {r.getVisibleCells().map((cell) => {
                  const c = byKey.get(cell.column.id);
                  const v = r.original[cell.column.id];
                  if (!c) return <td key={cell.id}>{leadCell(r.original, at)}</td>;
                  return (
                    <td key={cell.id} className={c.kind === 'text' || c.kind === 'team' ? 'divide' : undefined} style={{ background: shadeOf(c, v) }}>
                      {c.kind === 'spark' ? (
                        Array.isArray(v) && v.length > 1 ? (
                          <span className="inline-flex align-middle">
                            <Sparkline values={v} width={64} height={18} label={c.title ?? c.label} />
                          </span>
                        ) : (
                          '—'
                        )
                      ) : c.kind === 'team' && v ? (
                        <span className="inline-flex align-middle" title={String(v)}>
                          <TeamMark abbr={String(v)} size={20} />
                          <span className="sr-only">{String(v)}</span>
                        </span>
                      ) : (
                        fmtCell(c, v)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {padBottom > 0 && (
              <tr aria-hidden style={{ height: padBottom }}>
                <td colSpan={99} style={{ padding: 0, border: 0 }} />
              </tr>
            )}
            {!sortedRows.length && (
              <tr>
                <td colSpan={99} style={{ textAlign: 'center', color: 'var(--ink-2)', padding: '2.5rem 1rem' }}>
                  {empty}{' '}
                  {dirty && (
                    <button type="button" className="link" onClick={() => setState((s) => ({ ...s, filters: [], q: '' }))}>
                      Clear filters
                    </button>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[0.6875rem]" style={{ color: 'var(--ink-3)' }}>
        Click a header to sort; shift-click to sort by several. This view is in the address bar, so the link shares it.
      </p>
    </div>
  );
}

/** The "add filter" popover: pick a stat, at least or at most, and a number. */
function FilterForm({ cols, onAdd }: { cols: ACol[]; onAdd: (f: Filter) => void }) {
  const [key, setKey] = useState(cols[0]?.key ?? '');
  const [op, setOp] = useState<Op>('gte');
  const [value, setValue] = useState('');
  return (
    <form
      className="panel absolute left-0 top-full z-30 mt-1 flex items-end gap-2 p-2 shadow-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (key && value !== '' && Number.isFinite(Number(value))) onAdd({ key, op, value });
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="eyebrow">Stat</span>
        <select value={key} onChange={(e) => setKey(e.target.value)} className="max-w-[9rem]">
          {cols.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="eyebrow">Is</span>
        <select value={op} onChange={(e) => setOp(e.target.value as Op)}>
          <option value="gte">at least</option>
          <option value="lte">at most</option>
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="eyebrow">Value</span>
        <input type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} className="w-20" autoFocus />
      </label>
      <button type="submit" className="btn-ghost h-[30px]">
        Add
      </button>
    </form>
  );
}
