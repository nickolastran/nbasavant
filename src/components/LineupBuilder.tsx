'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { CourtLines } from '@/components/Court';
import { Headshot } from '@/components/Headshot';
import { toast } from '@/components/Toast';
import { Segmented } from '@/components/ViewTabs';
import type { LabPlayer } from '@/lib/lab-data';
import { type Unit, confidence, estimate, together } from '@/lib/lineup';

/** Court spots, in the shot chart's coordinates (basket at 0,0; tenths of a foot). */
const SLOTS = [
  { pos: 'PG', x: 20, y: 330 },
  { pos: 'SG', x: -170, y: 240 },
  { pos: 'SF', x: 170, y: 150 },
  { pos: 'PF', x: -115, y: 95 },
  { pos: 'C', x: 30, y: 30 },
] as const;
const NAMES = ['A', 'B', 'C'];
/** Below this many minutes together, a five's own numbers are shown but an estimate is added. */
const THIN_MIN = 12;
/** The estimate's prior: the team's rating, worth this many possessions. */
const PRIOR = 250;
const CONF_LABEL = { none: 'No shared minutes', low: 'Low confidence', medium: 'Medium confidence', high: 'High confidence' } as const;

const signed = (v: number | null, dp = 1) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(dp)}`);
const num = (v: number | null, dp = 1) => (v === null ? '—' : v.toFixed(dp));
type Five = (number | null)[];
const parse = (s: string | null): Five[] => {
  const ls = (s ?? '').split('~').filter(Boolean).slice(0, 3).map((l) => {
    const ids = l.split('.').map((v) => (Number(v) > 0 ? Number(v) : null));
    return Array.from({ length: 5 }, (_, i) => ids[i] ?? null);
  });
  return ls.length ? ls : [Array(5).fill(null)];
};

/**
 * Put five teammates on the floor and see what that unit has done, or, if it
 * has barely played, an estimate from the pairs and trios inside it. Drag a
 * player onto a spot, or click him to fill the next open one; click a spot to
 * clear it. Up to three lineups side by side. Lineups live in the URL.
 */
export function LineupBuilder({ units, roster, team }: { units: Unit[]; roster: LabPlayer[]; team: string }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const nameOf = useMemo(() => new Map(roster.map((p) => [p.id, p])), [roster]);
  const valid = (ls: Five[]) => ls.map((l) => l.map((id) => (id && nameOf.has(id) ? id : null)));
  const [lineups, setLineups] = useState<Five[]>(() => valid(parse(sp.get('l'))));
  const [active, setActive] = useState(0);
  const [minMin, setMinMin] = useState(() => Number(sp.get('min')) || 5);

  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    const l = lineups.map((f) => f.map((id) => id ?? 0).join('.')).join('~');
    if (lineups.some((f) => f.some(Boolean))) next.set('l', l);
    else next.delete('l');
    if (minMin !== 5) next.set('min', String(minMin));
    else next.delete('min');
    const qs = next.toString();
    if (qs !== window.location.search.slice(1)) window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname);
  }, [lineups, minMin, pathname]);

  const five = lineups[active] ?? lineups[0];
  const set = (f: Five) => setLineups((ls) => ls.map((l, i) => (i === active ? f : l)));
  const place = (id: number, slot?: number) => {
    const at = five.indexOf(id);
    const next = [...five];
    if (slot === undefined) {
      // Click: take him off if he's on, else the next open spot.
      if (at >= 0) next[at] = null;
      else {
        const open = next.indexOf(null);
        if (open < 0) return toast('All five spots are filled. Click a spot to clear it.');
        next[open] = id;
      }
    } else {
      // Drop: swap with whoever was there.
      if (at >= 0) next[at] = next[slot];
      next[slot] = id;
    }
    set(next);
  };

  const rated = lineups.map((f) => {
    const ids = f.filter((id): id is number => id !== null);
    return ids.length === 5 ? { ids, ...estimate(units, ids, PRIOR) } : null;
  });
  const used = useMemo(
    () => units.map((u) => ({ u, r: together([u], []) })).filter((x) => x.r.min >= minMin && x.r.net !== null).sort((a, b) => b.r.net! - a.r.net!),
    [units, minMin],
  );
  const short = (id: number) => nameOf.get(id)?.name.split(' ').slice(1).join(' ') || nameOf.get(id)?.name || String(id);

  if (!roster.length) {
    return (
      <p className="panel p-8 text-center text-sm" style={{ color: 'var(--ink-2)' }}>
        No lineup data for {team} this season. Lineups come from play-by-play, 2026-27 on.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Lineup" items={lineups.map((_, i) => ({ value: String(i), label: `Lineup ${NAMES[i]}` }))} current={String(active)} onChange={(v) => setActive(Number(v))} />
        {lineups.length < 3 && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setLineups((ls) => [...ls, Array(5).fill(null)]);
              setActive(lineups.length);
            }}
          >
            Add a lineup to compare
          </button>
        )}
        {lineups.length > 1 && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setLineups((ls) => ls.filter((_, i) => i !== active));
              setActive(0);
            }}
          >
            Remove lineup {NAMES[active]}
          </button>
        )}
        <button
          type="button"
          className="btn-ghost"
          onClick={() => navigator.clipboard.writeText(location.href).then(() => toast('Lineup saved to a link and copied'), () => toast('Could not copy the link'))}
        >
          Save as link
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,26rem)_minmax(0,1fr)]">
        {/* Roster */}
        <section aria-label="Roster">
          <h2 className="eyebrow mb-2">Roster · minutes in tracked games</h2>
          <ul className="panel max-h-[30rem] divide-y overflow-auto">
            {roster.map((p) => {
              const on = five.includes(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', String(p.id))}
                    onClick={() => place(p.id)}
                    aria-pressed={on}
                    className="flex w-full cursor-grab items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-[var(--panel-2)]"
                    style={{ background: on ? 'color-mix(in srgb, var(--accent) 10%, var(--panel))' : undefined }}
                  >
                    <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--panel-2)]">
                      <Headshot id={p.id} name="" className="h-7 w-7 object-cover object-top" />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                    <span className="eyebrow">{p.pos}</span>
                    <span className="tnum w-9 text-right text-xs" style={{ color: 'var(--ink-2)' }}>
                      {p.min}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Court */}
        <section aria-label={`Lineup ${NAMES[active]} on the court`}>
          <h2 className="eyebrow mb-2">Lineup {NAMES[active]}</h2>
          <div className="panel relative overflow-hidden" style={{ aspectRatio: '500 / 470', background: 'color-mix(in srgb, var(--hardwood) 22%, var(--panel))' }}>
            <svg viewBox="-250 -52.5 500 470" className="absolute inset-0 h-full w-full" aria-hidden>
              <CourtLines />
            </svg>
            {SLOTS.map((s, i) => {
              const id = five[i];
              const p = id ? nameOf.get(id) : null;
              return (
                <button
                  key={s.pos}
                  type="button"
                  draggable={!!id}
                  onDragStart={(e) => id && e.dataTransfer.setData('text/plain', String(id))}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const dropped = Number(e.dataTransfer.getData('text/plain'));
                    if (nameOf.has(dropped)) place(dropped, i);
                  }}
                  onClick={() => id && set(five.map((v, j) => (j === i ? null : v)))}
                  aria-label={p ? `${s.pos}: ${p.name}. Click to clear.` : `${s.pos}: empty. Drop a player here.`}
                  className="absolute flex w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
                  style={{ left: `${((s.x + 250) / 500) * 100}%`, top: `${((s.y + 52.5) / 470) * 100}%` }}
                >
                  <span
                    className="grid h-12 w-12 place-items-center overflow-hidden rounded-full border-2 text-xs font-bold"
                    style={{ borderColor: p ? 'var(--ink)' : 'var(--ink-3)', borderStyle: p ? 'solid' : 'dashed', background: 'var(--panel)', color: 'var(--ink-3)' }}
                  >
                    {p ? <Headshot id={p.id} name="" className="h-12 w-12 object-cover object-top" /> : s.pos}
                  </span>
                  <span className="max-w-full truncate rounded bg-[var(--panel)] px-1 text-[0.6875rem] font-semibold" style={{ color: 'var(--ink)' }}>
                    {p ? short(p.id) : 'Empty'}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-xs" style={{ color: 'var(--ink-3)' }}>
            Drag a player onto a spot or click him to fill the next open one. Click a spot to clear it.
          </p>
        </section>

        {/* What the lineups did */}
        <section aria-label="Lineup ratings" className="min-w-0">
          <h2 className="eyebrow mb-2">How {lineups.length > 1 ? 'they have' : 'it has'} played</h2>
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${lineups.length}, minmax(0, 1fr))` }}>
            {rated.map((r, i) => (
              <LineupCard key={i} name={NAMES[i]} r={r} active={i === active} />
            ))}
          </div>
          {lineups.length > 1 && rated.filter(Boolean).length > 1 && <CompareBars rated={rated} />}
        </section>
      </div>

      {/* Best and worst used */}
      <section>
        <div className="mb-2 flex flex-wrap items-end gap-3">
          <h2 className="text-lg font-bold tracking-tight">Most and least effective lineups used</h2>
          <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-2)' }}>
            At least
            <input type="number" min={1} value={minMin} onChange={(e) => setMinMin(Math.max(1, Number(e.target.value) || 1))} className="w-16" />
            minutes together
          </label>
        </div>
        {used.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {([['Best', used.slice(0, 5)], ['Worst', used.slice(-5).reverse()]] as const).map(([label, list]) => (
              <div key={label} className="panel overflow-auto">
                <table className="stat-table">
                  <caption className="eyebrow px-3 py-2 text-left">{label} by net rating</caption>
                  <thead>
                    <tr>
                      {['Lineup', 'MIN', 'Net', ''].map((h) => (
                        <th key={h} scope="col" style={{ cursor: 'default' }}>
                          {h || <span className="sr-only">Load</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map(({ u, r }) => (
                      <tr key={u.players.join()}>
                        <td style={{ whiteSpace: 'normal' }}>{u.players.map(short).join(' · ')}</td>
                        <td>{r.min.toFixed(0)}</td>
                        <td style={{ color: r.net! >= 0 ? 'var(--pos)' : 'var(--neg)', fontWeight: 600 }}>{signed(r.net)}</td>
                        <td>
                          <button type="button" className="link text-xs" onClick={() => set([...u.players])}>
                            Load into {NAMES[active]}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ) : (
          <p className="panel p-6 text-center text-sm" style={{ color: 'var(--ink-2)' }}>
            No five has played {minMin} minutes together yet. Lower the minimum.
          </p>
        )}
      </section>
    </div>
  );
}

type Rated = ({ ids: number[] } & ReturnType<typeof estimate>) | null;

function LineupCard({ name, r, active }: { name: string; r: Rated; active: boolean }) {
  if (!r) {
    return (
      <div className="panel p-3 text-sm" style={{ color: 'var(--ink-3)', outline: active ? '2px solid var(--ink)' : undefined }}>
        <div className="eyebrow mb-1">Lineup {name}</div>
        Fill all five spots.
      </div>
    );
  }
  const a = r.actual;
  const thin = a.min < THIN_MIN;
  const conf = confidence(r.sample);
  const rows: [string, string][] = [
    ['Minutes', a.min.toFixed(1)], ['ORtg', num(a.ortg)], ['DRtg', num(a.drtg)], ['Net', signed(a.net)], ['Pace', num(a.pace)], ['+/-', signed(a.min ? a.plusMinus : null, 0)],
  ];
  return (
    <div className="panel p-3 text-sm" style={{ outline: active ? '2px solid var(--ink)' : undefined }}>
      <div className="eyebrow mb-1">Lineup {name} · actual</div>
      {a.min > 0 ? (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-2">
              <dt style={{ color: 'var(--ink-2)' }}>{k}</dt>
              <dd className="tnum font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p style={{ color: 'var(--ink-2)' }}>These five have not shared the floor.</p>
      )}
      {a.factors && (
        <table className="tnum mt-2 w-full text-xs">
          <caption className="eyebrow pb-0.5 text-left">Four factors</caption>
          <thead>
            <tr style={{ color: 'var(--ink-3)' }}>
              <td />
              <th scope="col" className="text-right font-normal">Ours</th>
              <th scope="col" className="text-right font-normal">Theirs</th>
            </tr>
          </thead>
          <tbody>
            {([['eFG%', a.factors.efg, a.factors.oppEfg, 1], ['TOV%', a.factors.tov, a.factors.oppTov, 1], ['OREB%', a.factors.oreb, a.factors.dreb === null ? null : 100 - a.factors.dreb, 1], ['FT rate', a.factors.ftRate, a.factors.oppFtRate, 3]] as const).map(([k, mine, theirs, dp]) => (
              <tr key={k}>
                <th scope="row" className="text-left font-normal" style={{ color: 'var(--ink-2)' }}>{k}</th>
                <td className="text-right font-semibold">{num(mine, dp)}</td>
                <td className="text-right">{num(theirs, dp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {thin && (
        <div className="mt-3 border-t pt-2" style={{ borderColor: 'var(--line)' }}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow">Estimate</span>
            <span
              className="rounded-full border px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.08em]"
              style={{ borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
              title={`Based on about ${r.sample} possessions from the trios (and the five itself) inside this lineup.`}
            >
              {CONF_LABEL[conf]}
            </span>
          </div>
          <dl className="mt-1 grid grid-cols-3 gap-x-3">
            {([['ORtg', num(r.ortg)], ['DRtg', num(r.drtg)], ['Net', signed(r.net)]] as const).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs" style={{ color: 'var(--ink-2)' }}>{k}</dt>
                <dd className="tnum display text-xl font-bold">{v}</dd>
              </div>
            ))}
          </dl>
          <details className="mt-1 text-xs" style={{ color: 'var(--ink-2)' }}>
            <summary className="link cursor-pointer">How this is estimated</summary>
            <p className="mt-1">
              Under {THIN_MIN} minutes together is too little to trust, so this is our estimate, not a measurement: the possession-weighted average of what
              every trio, pair and single player in this five has done on the floor (bigger groups count for more), blended with the team&apos;s own rating
              as a {PRIOR}-possession prior. Confidence comes from how many possessions those groups have played.
            </p>
          </details>
        </div>
      )}
    </div>
  );
}

/** Lineups against each other, one bar per lineup per rating. The value is printed; length only helps the eye. */
function CompareBars({ rated }: { rated: Rated[] }) {
  const value = (r: NonNullable<Rated>, k: 'ortg' | 'drtg' | 'net') => (r.actual.min >= THIN_MIN ? r.actual[k] : r[k]);
  const rows = [
    { k: 'ortg', label: 'ORtg', lo: 95, hi: 130 },
    { k: 'drtg', label: 'DRtg (lower is better)', lo: 95, hi: 130 },
    { k: 'net', label: 'Net', lo: -25, hi: 25 },
  ] as const;
  return (
    <div className="panel mt-3 p-3">
      <div className="eyebrow mb-2">Side by side</div>
      {rows.map((row) => (
        <div key={row.k} className="mb-2 last:mb-0">
          <div className="mb-0.5 text-xs" style={{ color: 'var(--ink-2)' }}>{row.label}</div>
          {rated.map((r, i) => {
            if (!r) return null;
            const v = value(r, row.k);
            const pct = v === null ? 0 : Math.max(2, Math.min(100, ((v - row.lo) / (row.hi - row.lo)) * 100));
            return (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-4 font-bold">{NAMES[i]}</span>
                <span className="relative h-3 flex-1 rounded-sm" style={{ background: 'var(--line)' }}>
                  <span className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${pct}%`, background: `var(--s${i + 1})` }} />
                </span>
                <span className="tnum w-12 text-right font-semibold">{row.k === 'net' ? signed(v) : num(v)}</span>
                <span className="w-8 text-[0.625rem]" style={{ color: 'var(--ink-3)' }}>{r.actual.min >= THIN_MIN ? 'actual' : 'est.'}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
