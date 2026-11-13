'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Headshot } from '@/components/Headshot';
import { TeamMark } from '@/components/TeamMark';
import { TitleZone } from '@/components/TitleZone';
import { toast } from '@/components/Toast';
import { Segmented } from '@/components/ViewTabs';
import { type Pick, SKILLS, SKILL_LABELS, project } from '@/lib/roster-build';
import type { Frame, ZoneTeam } from '@/lib/title-zone-data';

export type PoolPlayer = Pick & { name: string; team: string; pos: string };
const MIN_PICKS = 8;
const MAX_PICKS = 10;
const BUILDS = ['A', 'B'] as const;
const signed = (v: number, dp = 1) => `${v > 0 ? '+' : ''}${v.toFixed(dp)}`;
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Pick eight to ten players from anywhere in the league and see the team they
 * project to: offense and defense against league average, how well the group
 * covers five skills, and where it would sit on the Title Zone chart. Two
 * builds can be compared; both live in the URL.
 */
export function RosterBuilder({ pool, teams, frames }: { pool: PoolPlayer[]; teams: ZoneTeam[]; frames: Frame[] }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const byId = useMemo(() => new Map(pool.map((p) => [p.id, p])), [pool]);
  const parse = (k: string) => [...new Set((sp.get(k) ?? '').split('.').map(Number).filter((id) => byId.has(id)))].slice(0, MAX_PICKS);
  const [builds, setBuilds] = useState<number[][]>(() => [parse('a'), parse('b')]);
  const [active, setActive] = useState(0);
  const [q, setQ] = useState('');

  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    builds.forEach((b, i) => (b.length ? next.set('ab'[i], b.join('.')) : next.delete('ab'[i])));
    const qs = next.toString();
    if (qs !== window.location.search.slice(1)) window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname);
  }, [builds, pathname]);

  const mine = builds[active];
  const toggle = (id: number) =>
    setBuilds((bs) =>
      bs.map((b, i) => {
        if (i !== active) return b;
        if (b.includes(id)) return b.filter((x) => x !== id);
        if (b.length >= MAX_PICKS) {
          toast(`A build holds ${MAX_PICKS} players. Remove one first.`);
          return b;
        }
        return [...b, id];
      }),
    );

  const matches = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean);
    return pool.filter((p) => words.every((w) => fold(`${p.name} ${p.team} ${p.pos}`).includes(w))).slice(0, 40);
  }, [q, pool]);

  const projected = builds.map((b) => (b.length >= MIN_PICKS ? project(b.map((id) => byId.get(id)!)) : null));
  const ghosts = projected.flatMap((p, i) => (p ? [{ label: BUILDS[i], relOff: p.relOff, relDef: p.relDef }] : []));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Build" items={BUILDS.map((b, i) => ({ value: String(i), label: `Build ${b} (${builds[i].length})` }))} current={String(active)} onChange={(v) => setActive(Number(v))} />
        {mine.length > 0 && (
          <button type="button" className="btn-ghost" onClick={() => setBuilds((bs) => bs.map((b, i) => (i === active ? [] : b)))}>
            Clear build {BUILDS[active]}
          </button>
        )}
        <button
          type="button"
          className="btn-ghost"
          onClick={() => navigator.clipboard.writeText(location.href).then(() => toast('Roster saved to a link and copied'), () => toast('Could not copy the link'))}
        >
          Save as link
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)_minmax(0,22rem)]">
        {/* Picker */}
        <section aria-label="Player pool">
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Find a player, team or position</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Curry, BOS, C" />
          </label>
          <ul className="panel mt-2 max-h-[28rem] divide-y overflow-auto">
            {matches.map((p) => {
              const on = mine.includes(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(p.id)}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-[var(--panel-2)]"
                    style={{ background: on ? 'color-mix(in srgb, var(--accent) 10%, var(--panel))' : undefined }}
                  >
                    <TeamMark abbr={p.team} size={16} />
                    <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                    <span className="eyebrow">{p.pos}</span>
                    <span className="tnum w-10 text-right text-xs" style={{ color: 'var(--ink-2)' }} title="Box plus/minus">
                      {signed(p.obpm + p.dbpm)}
                    </span>
                  </button>
                </li>
              );
            })}
            {!matches.length && (
              <li className="p-4 text-center text-sm" style={{ color: 'var(--ink-3)' }}>
                Nobody matches.
              </li>
            )}
          </ul>
          <p className="mt-1.5 text-xs" style={{ color: 'var(--ink-3)' }}>
            {pool.length} players with 100+ minutes this season, best box plus/minus first. The number is BPM.
          </p>
        </section>

        {/* The build */}
        <section aria-label={`Build ${BUILDS[active]}`} className="min-w-0">
          <h2 className="eyebrow mb-2">
            Build {BUILDS[active]} · {mine.length} of {MIN_PICKS} to {MAX_PICKS} players
          </h2>
          {mine.length ? (
            <ul className="panel divide-y">
              {mine.map((id) => {
                const p = byId.get(id)!;
                const m = projected[active]?.minutes.get(id);
                return (
                  <li key={id} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                    <span className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--panel-2)]">
                      <Headshot id={id} name="" className="h-7 w-7 object-cover object-top" />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                    <span className="eyebrow">{p.team} · {p.pos}</span>
                    <span className="tnum w-14 text-right text-xs" style={{ color: 'var(--ink-2)' }}>
                      {m === undefined ? `${p.mpg.toFixed(0)} mpg` : `${m.toFixed(0)} min`}
                    </span>
                    <button type="button" className="link text-xs" onClick={() => toggle(id)} aria-label={`Remove ${p.name}`}>
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="panel p-6 text-center text-sm" style={{ color: 'var(--ink-2)' }}>
              Pick players from the list to start build {BUILDS[active]}.
            </p>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {projected.map((p, i) => (
              <div key={i} className="panel p-3" style={{ outline: i === active ? '2px solid var(--ink)' : undefined }}>
                <div className="eyebrow mb-1">Build {BUILDS[i]} · projected</div>
                {p ? (
                  <>
                    <dl className="grid grid-cols-3 gap-2">
                      {([['Offense', p.relOff], ['Defense', p.relDef], ['Net', p.net]] as const).map(([k, v]) => (
                        <div key={k}>
                          <dt className="text-xs" style={{ color: 'var(--ink-2)' }}>{k}</dt>
                          <dd className="tnum display text-2xl font-bold" style={{ color: k === 'Net' ? (v >= 0 ? 'var(--pos)' : 'var(--neg)') : undefined }}>
                            {signed(v)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    {p.covered < 239.5 && (
                      <p className="mt-1 text-xs" style={{ color: 'var(--s4)' }}>
                        Only {p.covered.toFixed(0)} of 240 minutes are covered with everyone at the {`${38}`}-minute cap.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
                    {builds[i].length ? `${MIN_PICKS - builds[i].length} more to project.` : 'Empty.'}
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs" style={{ color: 'var(--ink-2)' }}>
            Points per 100 possessions against league average. This is our estimate: each player&apos;s offensive and defensive box plus/minus
            (Basketball-Reference), weighted by a share of 240 minutes in proportion to his real minutes. It ignores fit, so it flatters rosters of
            stars who need the ball.
          </p>
        </section>

        {/* Shape and place */}
        <section aria-label="Profile" className="space-y-4">
          <div className="panel p-3">
            <h2 className="eyebrow mb-1">Skill coverage</h2>
            <Radar builds={projected.map((p) => p?.coverage ?? null)} />
            <table className="mt-1 w-full text-xs">
              <thead>
                <tr style={{ color: 'var(--ink-3)' }}>
                  <th scope="col" className="text-left font-normal">Minutes-weighted percentile</th>
                  {BUILDS.map((b) => <th key={b} scope="col" className="w-10 text-right font-semibold">{b}</th>)}
                </tr>
              </thead>
              <tbody>
                {SKILLS.map((k) => (
                  <tr key={k}>
                    <th scope="row" className="text-left font-normal">{SKILL_LABELS[k]}</th>
                    {projected.map((p, i) => (
                      <td key={i} className="tnum text-right font-semibold">
                        {p?.coverage[k] == null ? '—' : Math.round(p.coverage[k]!)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel p-3">
            <h2 className="eyebrow mb-1">Among the real 30</h2>
            {frames.length ? (
              <TitleZone teams={teams} frames={frames} mini ghosts={ghosts} />
            ) : (
              <p className="py-4 text-center text-sm" style={{ color: 'var(--ink-3)' }}>
                Needs finished games.
              </p>
            )}
            <p className="text-xs" style={{ color: 'var(--ink-2)' }}>
              {ghosts.length ? 'The dashed rings are your builds. Up is better at both ends; the hatched region is the Title Zone.' : `Pick ${MIN_PICKS} players to place a build on the chart.`}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Five skills as spokes, 0 at the center to 100 at the rim. Build A is a solid outline, B is dashed; the table beside it has the numbers. */
function Radar({ builds }: { builds: (Record<string, number | null> | null)[] }) {
  const R = 78, C = 110;
  const at = (i: number, v: number): [number, number] => {
    const a = (Math.PI * 2 * i) / SKILLS.length - Math.PI / 2;
    return [C + Math.cos(a) * R * (v / 100), C + Math.sin(a) * R * (v / 100)];
  };
  const ring = (v: number) => SKILLS.map((_, i) => at(i, v).map((n) => n.toFixed(1)).join(',')).join(' ');
  return (
    <svg viewBox="-34 0 288 210" className="mx-auto block w-full max-w-[340px]" role="img" aria-label="Skill coverage radar. The table below lists the same values.">
      {[25, 50, 75, 100].map((v) => (
        <polygon key={v} points={ring(v)} fill="none" stroke={v === 50 ? 'var(--ink-3)' : 'var(--line-2)'} strokeDasharray={v === 50 ? '3 3' : undefined} />
      ))}
      {SKILLS.map((k, i) => {
        const [x, y] = at(i, 122);
        return (
          <g key={k}>
            <line x1={C} y1={C} x2={at(i, 100)[0]} y2={at(i, 100)[1]} stroke="var(--line-2)" />
            <text x={x} y={y} textAnchor="middle" dy="0.35em" fontSize="9.5" fontWeight="600" fill="var(--ink-2)">
              {SKILL_LABELS[k]}
            </text>
          </g>
        );
      })}
      {builds.map((b, bi) =>
        b ? (
          <polygon
            key={bi}
            points={SKILLS.map((k, i) => at(i, b[k] ?? 0).map((n) => n.toFixed(1)).join(',')).join(' ')}
            fill={`var(--s${bi + 1})`}
            fillOpacity="0.14"
            stroke={`var(--s${bi + 1})`}
            strokeWidth="2"
            strokeDasharray={bi ? '5 3' : undefined}
          />
        ) : null,
      )}
    </svg>
  );
}
