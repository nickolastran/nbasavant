'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/icons';
import type { LabPlayer } from '@/lib/lab-data';
import { type FourFactors, type Rating, type Unit, splits, together, wowy } from '@/lib/lineup';

/** Under this many minutes a split is flagged: a handful of possessions can swing a rating by twenty points. */
const LOW_MIN = 25;
const signed = (v: number | null, dp = 1) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(dp)}`);
const num = (v: number | null, dp = 1) => (v === null ? '—' : v.toFixed(dp));
const last = (name: string) => name.split(' ').slice(1).join(' ') || name;

const FACTORS: { key: keyof FourFactors; label: string; low?: boolean; dp?: number }[] = [
  { key: 'efg', label: 'Effective FG%' },
  { key: 'tov', label: 'Turnover %', low: true },
  { key: 'oreb', label: 'Off. rebound %' },
  { key: 'ftRate', label: 'Free throw rate', dp: 3 },
  { key: 'oppEfg', label: 'Opp. eFG%', low: true },
  { key: 'oppTov', label: 'Forced TOV %' },
  { key: 'dreb', label: 'Def. rebound %' },
  { key: 'oppFtRate', label: 'Opp. FT rate', low: true, dp: 3 },
];

const Thin = ({ min }: { min: number }) =>
  min < LOW_MIN ? (
    <span className="inline-flex items-center gap-1 text-[0.625rem] font-semibold uppercase tracking-[0.06em]" style={{ color: 'var(--s4)' }}>
      <Icon name="info" size={11} />
      Small sample
    </span>
  ) : null;

/**
 * A team with a player on the floor and off it; with-or-without splits when
 * one or two teammates are added; and the roster's pairwise grid. Every
 * number carries its minutes, and thin samples are flagged in words.
 */
export function OnOffExplorer({ units, roster, team }: { units: Unit[]; roster: LabPlayer[]; team: string }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const has = (id: number) => roster.some((p) => p.id === id);
  const [player, setPlayer] = useState(() => (has(Number(sp.get('p'))) ? Number(sp.get('p')) : roster[0]?.id ?? 0));
  const [withIds, setWith] = useState<number[]>(() => (sp.get('w') ?? '').split('.').map(Number).filter(has).slice(0, 2));

  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    if (player && player !== roster[0]?.id) next.set('p', String(player));
    else next.delete('p');
    if (withIds.length) next.set('w', withIds.join('.'));
    else next.delete('w');
    const qs = next.toString();
    if (qs !== window.location.search.slice(1)) window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname);
  }, [player, withIds, roster, pathname]);

  const nameOf = useMemo(() => new Map(roster.map((p) => [p.id, p.name])), [roster]);
  const [on, off] = useMemo(() => splits(units, [player]), [units, player]);
  const group = [player, ...withIds.filter((id) => id !== player)];
  const cells = useMemo(() => (group.length > 1 ? splits(units, group) : []), [units, group.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const top = roster.slice(0, 10);
  const grid = useMemo(() => wowy(units, top.map((p) => p.id)), [units, top.map((p) => p.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const teamNet = together(units, []).net;

  if (!roster.length) {
    return (
      <p className="panel p-8 text-center text-sm" style={{ color: 'var(--ink-2)' }}>
        No lineup data for {team} this season. On/off comes from play-by-play, 2026-27 on.
      </p>
    );
  }

  const metrics: { key: 'ortg' | 'drtg' | 'net' | 'pace'; label: string; lowerIsBetter?: boolean; signed?: boolean }[] = [
    { key: 'ortg', label: 'Offensive rating' },
    { key: 'drtg', label: 'Defensive rating', lowerIsBetter: true },
    { key: 'net', label: 'Net rating', signed: true },
    { key: 'pace', label: 'Pace' },
  ];
  const name = nameOf.get(player) ?? '';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="eyebrow">Player</span>
          <select value={player} onChange={(e) => setPlayer(Number(e.target.value))}>
            {roster.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.min} min)
              </option>
            ))}
          </select>
        </label>
        {[0, 1].map((i) => (
          <label key={i} className="flex flex-col gap-1">
            <span className="eyebrow">{i ? 'And' : 'With or without'}</span>
            <select
              value={withIds[i] ?? ''}
              disabled={i === 1 && !withIds[0]}
              onChange={(e) => {
                const v = Number(e.target.value);
                setWith((w) => (i === 0 ? (v ? [v, ...w.slice(1)] : []) : v ? [w[0], v] : w.slice(0, 1)).filter((x, j, a) => x && a.indexOf(x) === j));
              }}
            >
              <option value="">Nobody</option>
              {roster.filter((p) => p.id !== player && p.id !== withIds[1 - i]).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>

      {/* On vs off */}
      <section>
        <h2 className="text-lg font-bold tracking-tight">
          {team} with {name} on and off the floor
        </h2>
        <p className="mb-3 text-xs" style={{ color: 'var(--ink-2)' }}>
          <span className="tnum">{on.min.toFixed(0)}</span> minutes on, <span className="tnum">{off.min.toFixed(0)}</span> off. <Thin min={Math.min(on.min, off.min)} />
        </p>
        <div className="panel divide-y">
          {metrics.map((m) => (
            <Dumbbell key={m.key} label={m.label} on={on[m.key]} off={off[m.key]} lowerIsBetter={m.lowerIsBetter} signedValues={m.signed} />
          ))}
        </div>
        {on.factors && off.factors ? (
          <>
            <h3 className="eyebrow mb-1 mt-4">Four factors, offense then defense</h3>
            <div className="panel divide-y">
              {FACTORS.map((f) => (
                <Dumbbell key={f.key} label={f.label} on={on.factors![f.key]} off={off.factors![f.key]} lowerIsBetter={f.low} dp={f.dp} />
              ))}
            </div>
          </>
        ) : (
          <p className="mt-3 text-xs" style={{ color: 'var(--ink-3)' }}>
            Four factors appear once these games are re-read with shot counts (<code>npm run stints</code>).
          </p>
        )}
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--ink-2)' }}>
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12" aria-hidden><circle cx="6" cy="6" r="5" fill="var(--ink)" /></svg> On the floor
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12" aria-hidden><circle cx="6" cy="6" r="4.5" fill="var(--panel)" stroke="var(--ink)" strokeWidth="1.5" /></svg> Off the floor
          </span>
          <span>Ratings are points per 100 possessions; pace is possessions per 48 minutes.</span>
        </p>
      </section>

      {/* With or without */}
      {cells.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-bold tracking-tight">With or without</h2>
          <div className={`grid gap-2 ${cells.length === 8 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2'}`}>
            {cells.map((c, i) => (
              <div key={i} className="panel p-3 text-sm" style={{ opacity: c.min ? 1 : 0.6 }}>
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs font-semibold">
                  {group.map((id, j) => (
                    <span key={id} style={{ color: c.on[j] ? 'var(--ink)' : 'var(--ink-3)' }}>
                      {last(nameOf.get(id) ?? '')} {c.on[j] ? 'ON' : 'OFF'}
                    </span>
                  ))}
                </div>
                {c.min > 0 ? (
                  <>
                    <div className="tnum display mt-1 text-3xl font-bold" style={{ color: (c.net ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                      {signed(c.net)}
                    </div>
                    <div className="tnum text-xs" style={{ color: 'var(--ink-2)' }}>
                      {c.min.toFixed(0)} min · ORtg {num(c.ortg)} · DRtg {num(c.drtg)}
                    </div>
                    <Thin min={c.min} />
                  </>
                ) : (
                  <p className="mt-2 text-xs" style={{ color: 'var(--ink-3)' }}>
                    Never happened.
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="eyebrow mt-2">Net rating in each combination</p>
        </section>
      )}

      {/* WOWY grid */}
      <section>
        <h2 className="text-lg font-bold tracking-tight">Pairs: net rating with both on the floor</h2>
        <p className="mb-2 text-xs" style={{ color: 'var(--ink-2)' }}>
          The ten players with the most minutes. The team&apos;s overall net rating in these games is <strong className="tnum">{signed(teamNet)}</strong>. Faded cells are
          under {LOW_MIN} minutes together.
        </p>
        <div className="panel overflow-auto">
          <table className="w-full border-collapse text-center text-xs">
            <thead>
              <tr>
                <td />
                {top.map((p) => (
                  <th key={p.id} scope="col" className="px-1 py-2 font-semibold" style={{ color: 'var(--ink-2)' }}>
                    {last(p.name)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {top.map((a, i) => (
                <tr key={a.id}>
                  <th scope="row" className="whitespace-nowrap px-2 py-1 text-left font-semibold" style={{ color: 'var(--ink-2)' }}>
                    {last(a.name)}
                  </th>
                  {top.map((b, j) => {
                    if (i === j) return <td key={b.id} style={{ background: 'var(--panel-2)' }} />;
                    const r = grid.get(i < j ? `${a.id}:${b.id}` : `${b.id}:${a.id}`);
                    return <HeatCell key={b.id} r={r} label={`${a.name} and ${b.name}`} />;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** One metric, two dots on a shared scale: filled is on the floor, hollow is off. The values are printed at both ends. */
function Dumbbell({ label, on, off, lowerIsBetter, signedValues, dp = 1 }: { label: string; on: number | null; off: number | null; lowerIsBetter?: boolean; signedValues?: boolean; dp?: number }) {
  const f = (v: number | null) => (signedValues ? signed(v, dp) : num(v, dp));
  if (on === null || off === null) {
    return (
      <div className="grid grid-cols-[9rem_minmax(0,1fr)] items-center gap-3 px-3 py-3 text-sm">
        <span className="font-semibold">{label}</span>
        <span style={{ color: 'var(--ink-3)' }}>Not enough minutes {on === null ? 'on' : 'off'} the floor.</span>
      </div>
    );
  }
  const [lo, hi] = [Math.min(on, off), Math.max(on, off)];
  // Padding scales with the stat: two points for a rating, a sliver for a rate under one.
  const pad = Math.max(dp > 1 ? 0.02 : 2, (hi - lo) * 0.6);
  const x = (v: number) => ((v - (lo - pad)) / (hi - lo + pad * 2)) * 100;
  const diff = on - off;
  const better = diff === 0 ? null : diff > 0 !== !!lowerIsBetter;
  return (
    <div className="grid grid-cols-[9rem_minmax(0,1fr)_11rem] items-center gap-3 px-3 py-3 text-sm max-sm:grid-cols-[minmax(0,1fr)_auto]">
      <span className="font-semibold">
        {label}
        {lowerIsBetter && <span className="block text-[0.625rem] font-normal" style={{ color: 'var(--ink-3)' }}>lower is better</span>}
      </span>
      <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-8 w-full max-sm:order-last max-sm:col-span-2" role="img" aria-label={`${label}: ${f(on)} on the floor, ${f(off)} off`}>
        <line x1="0" x2="100" y1="12" y2="12" stroke="var(--line)" vectorEffect="non-scaling-stroke" />
        <line x1={x(off)} x2={x(on)} y1="12" y2="12" stroke="var(--ink-2)" strokeWidth="3" vectorEffect="non-scaling-stroke" />
        <ellipse cx={x(off)} cy="12" rx="1.6" ry="6" fill="var(--panel)" stroke="var(--ink)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        <ellipse cx={x(on)} cy="12" rx="1.6" ry="6" fill="var(--ink)" />
      </svg>
      <span className="tnum text-right text-xs">
        <strong>{f(on)}</strong> on · {f(off)} off
        <span className="block font-semibold" style={{ color: better === null ? 'var(--ink-3)' : better ? 'var(--pos)' : 'var(--neg)' }}>
          {signed(diff, dp)} {better === null ? '' : better ? 'better' : 'worse'}
        </span>
      </span>
    </div>
  );
}

function HeatCell({ r, label }: { r: Rating | undefined; label: string }) {
  if (!r || !r.min || r.net === null) {
    return (
      <td className="px-1 py-1.5" style={{ color: 'var(--ink-3)' }} title={`${label}: never on together`}>
        ·
      </td>
    );
  }
  // -20 .. +20 maps onto the blue-to-red scale; the number carries the value either way.
  const t = Math.max(-1, Math.min(1, r.net / 20));
  return (
    <td
      className="tnum px-1 py-1.5 font-semibold"
      title={`${label}: ${signed(r.net)} in ${r.min.toFixed(0)} minutes${r.min < LOW_MIN ? ' (small sample)' : ''}`}
      style={{ background: `color-mix(in oklab, var(${t > 0 ? '--hot' : '--cold'}) ${Math.round(Math.abs(t) * 60)}%, transparent)`, opacity: r.min < LOW_MIN ? 0.45 : 1 }}
    >
      {signed(r.net, 0)}
      <span className="block text-[0.5625rem] font-normal" style={{ color: 'var(--ink-2)' }}>
        {r.min.toFixed(0)}m
      </span>
    </td>
  );
}
