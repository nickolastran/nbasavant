'use client';

import { forceCollide, forceSimulation, forceX, forceY } from 'd3-force';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { ShareMenu } from '@/components/ShareMenu';
import { useWidth } from '@/components/TrendChart';
import { Segmented } from '@/components/ViewTabs';
import { type Quadrant, inZone, quadrant, rotate, zonePolygon } from '@/lib/title-zone';
import { TITLE_ZONE as cfg } from '@/lib/title-zone.config';
import type { Dot, Frame, ZoneTeam } from '@/lib/title-zone-data';

type Mode = 'season' | 'recent';
type Node = { id: number; o: number; d: number; gp: number; w: number; l: number; tx: number; ty: number; x: number; y: number };

const signed = (v: number, dp = 1) => `${v > 0 ? '+' : ''}${v.toFixed(dp)}`;
const LEVEL_COLOR = { easy: 'var(--pos)', medium: 'var(--s4)', hard: 'var(--neg)' } as const;
const QUAD_LABEL: Record<Quadrant, string> = { both: 'Good offense, good defense', offense: 'Offense-led', defense: 'Defense-led', neither: 'Bad at both' };
const fmtDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * The Title Zone: every team's offense and defense against league average,
 * turned 45 degrees so good-at-both is up, offense-led is right and
 * defense-led is left. The hatched region is where title teams live.
 *
 * Point at or tab to a logo for its line; click or press Enter to focus a
 * team; scrub the season by day. `mini` is the static home-page version.
 */
export function TitleZone({
  teams, frames, mini = false, ghosts = [],
}: {
  teams: ZoneTeam[];
  frames: Frame[];
  mini?: boolean;
  /** Hypothetical teams to place among the real ones (Build-a-Roster): a dashed ring with a letter. */
  ghosts?: { label: string; relOff: number; relDef: number }[];
}) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const [ref, width] = useWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const teamOf = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const lastIdx = frames.length - 1;

  const [mode, setMode] = useState<Mode>(() => (!mini && sp.get('mode') === 'recent' ? 'recent' : 'season'));
  const [idx, setIdx] = useState(() => {
    const i = mini ? -1 : frames.findIndex((f) => f.date === sp.get('day'));
    return i >= 0 ? i : lastIdx;
  });
  const [selected, setSelected] = useState<number | null>(() => (mini ? null : teams.find((t) => t.abbr === sp.get('team'))?.id ?? null));
  const [hover, setHover] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  // The view is in the URL: mode, day and focused team.
  useEffect(() => {
    if (mini) return;
    const next = new URLSearchParams(window.location.search);
    const put = (k: string, v: string | null) => (v ? next.set(k, v) : next.delete(k));
    put('mode', mode === 'recent' ? 'recent' : null);
    put('day', idx === lastIdx ? null : frames[idx]?.date ?? null);
    put('team', selected ? teamOf.get(selected)?.abbr ?? null : null);
    const qs = next.toString();
    if (qs !== window.location.search.slice(1)) window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname);
  }, [mini, mode, idx, selected, lastIdx, frames, teamOf, pathname]);

  // The side panels focus a team by linking to ?team=; follow the URL when it names one.
  const urlTeam = sp.get('team');
  useEffect(() => {
    const t = mini ? undefined : teams.find((x) => x.abbr === urlTeam);
    if (t) setSelected(t.id);
  }, [mini, teams, urlTeam]);

  useEffect(() => {
    if (!playing) return;
    if (idx >= lastIdx) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setIdx((i) => Math.min(lastIdx, i + 1)), 650);
    return () => clearTimeout(t);
  }, [playing, idx, lastIdx]);

  // The axes stay put while the days change: sized to today's spread, never under 8 points.
  const extent = useMemo(() => {
    const last = frames[lastIdx];
    const peak = last ? Math.max(0, ...[...last.season, ...last.recent].flatMap((d) => [Math.abs(d[1]), Math.abs(d[2])])) : 0;
    return Math.max(8, Math.ceil(peak / 2) * 2);
  }, [frames, lastIdx]);

  const size = Math.max(0, Math.min(width, mini ? 340 : 760));
  const small = size < 480;
  const logo = mini ? 16 : small ? 17 : 30;
  const margin = mini ? 14 : small ? 30 : 46;
  const c = size / 2;
  const k = (c - margin) / (extent * Math.SQRT2);
  const clamp = (v: number) => Math.max(-extent, Math.min(extent, v));
  const pt = (o: number, d: number): [number, number] => {
    const r = rotate(clamp(o), clamp(d));
    return [c + r.x * k, c - r.y * k];
  };
  const path = (pts: [number, number][]) => `M${pts.map(([o, d]) => pt(o, d).map((v) => v.toFixed(1)).join(',')).join('L')}Z`;

  const frame = frames[idx];
  const dots: Dot[] = useMemo(() => frame?.[mode] ?? [], [frame, mode]);
  const prevOf = useMemo(() => new Map((frames[idx - 1]?.[mode] ?? []).map((d) => [d[0], d])), [frames, idx, mode]);

  // Logos sit on their true point unless that overlaps a neighbor; then a short simulation nudges them apart.
  const nodes = useMemo(() => {
    if (!size) return [];
    const ns: Node[] = dots.map((d) => {
      const [tx, ty] = pt(d[1], d[2]);
      return { id: d[0], o: d[1], d: d[2], gp: d[3], w: d[4], l: d[5], tx, ty, x: tx, y: ty };
    });
    const sim = forceSimulation(ns)
      .force('x', forceX<Node>((n) => n.tx).strength(0.08))
      .force('y', forceY<Node>((n) => n.ty).strength(0.08))
      // A weak pull home and a firm collision: in a crowd, not overlapping wins over being exact.
      .force('collide', forceCollide<Node>(logo / 2 + 1.5).strength(1).iterations(6))
      .stop();
    for (let i = 0; i < 300; i++) sim.tick();
    return ns;
    // pt depends only on size and extent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dots, size, extent, logo]);

  const counts = useMemo(() => {
    const n: Record<Quadrant, number> = { both: 0, offense: 0, defense: 0, neither: 0 };
    for (const d of dots) n[quadrant({ relOff: d[1], relDef: d[2] })]++;
    return n;
  }, [dots]);
  const zoneCount = dots.filter((d) => inZone({ relOff: d[1], relDef: d[2] }, cfg)).length;
  const live = idx === lastIdx && mode === 'season';

  const line = (n: Node) => {
    const t = teamOf.get(n.id);
    return `${t?.name ?? n.id}, ${n.w}-${n.l}: offense ${signed(n.o)}, defense ${signed(n.d)}, net ${signed(n.o + n.d)} per 100 possessions${inZone({ relOff: n.o, relDef: n.d }, cfg) ? ', in the Title Zone' : ''}`;
  };
  const active = hover ?? selected;
  const activeNode = nodes.find((n) => n.id === active);
  const sel = selected ? teamOf.get(selected) : null;
  const selNode = nodes.find((n) => n.id === selected);
  const ticks = Array.from({ length: extent / 2 + 1 }, (_, i) => i * 2).flatMap((v) => (v ? [-v, v] : [0]));
  const title = mode === 'recent' ? `Title Zone: last ${cfg.recentGames} games` : 'Title Zone';
  const subtitle = frame ? `Offense and defense vs. league average, per 100 possessions · through ${fmtDay(frame.date)}` : '';

  if (!frames.length) {
    return (
      <div className="panel grid min-h-48 place-items-center p-6 text-center text-sm" style={{ color: 'var(--ink-2)' }}>
        No finished regular-season games yet. The chart fills in once the season tips off.
      </div>
    );
  }

  const chart = (
    <div ref={ref} className="relative mx-auto w-full" style={{ maxWidth: mini ? 340 : 760 }}>
      {/* Reserve the square before the width is known, so nothing below jumps. */}
      {!size && <span aria-hidden className="skeleton block aspect-square w-full rounded-md" />}
      {size > 0 && (
        <svg
          ref={svgRef}
          width={size}
          height={size}
          role="group"
          aria-label={`${title}. ${zoneCount} of ${dots.length} teams are in the zone. ${subtitle}`}
          className="block select-none"
          onClick={() => !mini && setSelected(null)}
        >
          <defs>
            <pattern id="tz-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="7" stroke="var(--ink)" strokeOpacity="0.28" strokeWidth="1.2" />
            </pattern>
            {(['gray', 'easy', 'medium', 'hard'] as const).map((n) => (
              <marker key={n} id={`tz-arrow-${n}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0,0L8,4L0,8Z" fill={n === 'gray' ? 'var(--ink-3)' : LEVEL_COLOR[n]} />
              </marker>
            ))}
          </defs>

          {/* Quadrant washes */}
          <path d={path([[0, 0], [extent, 0], [extent, extent], [0, extent]])} fill="var(--zone-good)" />
          <path d={path([[0, 0], [extent, 0], [extent, -extent], [0, -extent]])} fill="var(--zone-mixed)" />
          <path d={path([[0, 0], [0, extent], [-extent, extent], [-extent, 0]])} fill="var(--zone-mixed)" />
          <path d={path([[0, 0], [-extent, 0], [-extent, -extent], [0, -extent]])} fill="var(--zone-bad)" />

          {/* Gridlines every two points; the league-average lines are heavier. */}
          {ticks.map((v) => (
            <g key={v} stroke={v ? 'var(--line-2)' : 'var(--ink-3)'} strokeWidth={v ? 0.6 : 1} strokeOpacity={v ? 0.7 : 1}>
              <line x1={pt(v, -extent)[0]} y1={pt(v, -extent)[1]} x2={pt(v, extent)[0]} y2={pt(v, extent)[1]} />
              <line x1={pt(-extent, v)[0]} y1={pt(-extent, v)[1]} x2={pt(extent, v)[0]} y2={pt(extent, v)[1]} />
            </g>
          ))}
          <path d={path([[extent, extent], [extent, -extent], [-extent, -extent], [-extent, extent]])} fill="none" stroke="var(--ink-3)" />
          <path d={`M${c - 6},${c}h12M${c},${c - 6}v12`} stroke="var(--ink)" strokeWidth="1.5" />

          {/* The zone: hatched, bold outline, labelled along its lower edge (a line of constant net rating). */}
          <path d={path(zonePolygon(cfg, extent))} fill="url(#tz-hatch)" stroke="var(--ink)" strokeWidth={mini ? 1.5 : 2.2} strokeLinejoin="round" />
          {!mini && (
            // Under the top tip, the one part of the zone logos rarely reach.
            <text x={c} y={pt(extent, extent)[1] + (small ? 30 : 44)} textAnchor="middle" fontSize={small ? 8 : 11} fontWeight="700" letterSpacing="0.12em" fill="var(--ink)" stroke="var(--zone-good)" strokeWidth="3" paintOrder="stroke">
              TITLE ZONE
            </text>
          )}

          {/* Axis ticks and titles along the two lower edges. */}
          {!mini &&
            ticks.filter((v) => v % 4 === 0 && Math.abs(v) < extent).map((v) => (
              <g key={v} fontSize="10" fill="var(--ink-2)" className="tnum">
                <text x={pt(v, -extent)[0] + 9} y={pt(v, -extent)[1] + 12} textAnchor="middle">
                  {signed(v, 0)}
                </text>
                <text x={pt(-extent, v)[0] - 9} y={pt(-extent, v)[1] + 12} textAnchor="middle">
                  {signed(v, 0)}
                </text>
              </g>
            ))}
          {!mini && (
            <g fontSize={small ? 10 : 12} fontWeight="600" fill="var(--ink-2)" textAnchor="middle">
              <text transform={`translate(${pt(0, -extent)[0] + 26},${pt(0, -extent)[1] + 26}) rotate(-45)`}>Offensive Rating →</text>
              <text transform={`translate(${pt(-extent, 0)[0] - 26},${pt(-extent, 0)[1] + 26}) rotate(45)`}>← Defensive Rating</text>
            </g>
          )}

          {/* Quadrant names with live counts, in the empty corners beside each tip. */}
          <g fontSize={mini ? 9 : small ? 9.5 : 11} fill="var(--ink-2)" fontWeight="600">
            <text x={c} y={mini ? 10 : 14} textAnchor="middle">
              {mini ? `Good both (n=${counts.both})` : `${QUAD_LABEL.both} (n=${counts.both})`}
            </text>
            <text x={c} y={size - 4} textAnchor="middle">
              {QUAD_LABEL.neither} (n={counts.neither})
            </text>
            {!mini && (
              <>
                <text x={2} y={c - 62}>
                  <tspan x={2}>{QUAD_LABEL.defense}</tspan>
                  <tspan x={2} dy="1.25em">(n={counts.defense})</tspan>
                </text>
                <text x={size - 2} y={c - 62} textAnchor="end">
                  <tspan x={size - 2}>{QUAD_LABEL.offense}</tspan>
                  <tspan x={size - 2} dy="1.25em">(n={counts.offense})</tspan>
                </text>
              </>
            )}
          </g>

          {/* Movement since the previous game day: a ring where the team was, an arrow to where it is. */}
          {!mini &&
            nodes.map((n) => {
              const p = prevOf.get(n.id);
              if (!p || (p[1] === n.o && p[2] === n.d)) return null;
              const [px, py] = pt(p[1], p[2]);
              if (Math.hypot(px - n.tx, py - n.ty) < logo * 0.7) return null;
              return (
                <g key={n.id} opacity={active && active !== n.id ? 0.12 : 0.9}>
                  <circle cx={px} cy={py} r="3.5" fill="none" stroke="var(--ink-3)" strokeWidth="1.2" />
                  <line x1={px} y1={py} x2={n.tx} y2={n.ty} stroke="var(--ink-3)" strokeWidth="1.2" markerEnd="url(#tz-arrow-gray)" />
                </g>
              );
            })}

          {/* The projected push from the next five games: dashed, straight up (easier) or down (harder). */}
          {!mini &&
            live &&
            nodes.map((n) => {
              const next = teamOf.get(n.id)?.next;
              if (!next || Math.abs(next.push) < 0.3) return null;
              const [x2, y2] = pt(n.o + next.push / 2, n.d + next.push / 2);
              return (
                <line
                  key={n.id}
                  x1={n.tx} y1={n.ty} x2={x2} y2={y2}
                  stroke={LEVEL_COLOR[next.level]} strokeWidth="1.6" strokeDasharray="4 3"
                  markerEnd={`url(#tz-arrow-${next.level})`}
                  opacity={active && active !== n.id ? 0.12 : 1}
                />
              );
            })}

          {/* Teams. Each is a button: focusable, labelled with its full line. */}
          {nodes.map((n) => {
            const t = teamOf.get(n.id);
            if (!t) return null;
            const moved = Math.hypot(n.x - n.tx, n.y - n.ty) > 4;
            return (
              <g key={n.id} opacity={active && active !== n.id ? 0.22 : 1} style={{ transition: 'opacity 150ms' }}>
                {moved && <line x1={n.tx} y1={n.ty} x2={n.x} y2={n.y} stroke="var(--ink-3)" strokeWidth="0.8" />}
                <g
                  className="tz-node"
                  style={{ transform: `translate(${n.x}px, ${n.y}px)` }}
                  {...(mini
                    ? { 'aria-hidden': true }
                    : {
                        role: 'button',
                        tabIndex: 0,
                        'aria-label': line(n),
                        'aria-pressed': selected === n.id,
                        onClick: (e: React.MouseEvent) => {
                          e.stopPropagation();
                          setSelected(selected === n.id ? null : n.id);
                        },
                        onKeyDown: (e: React.KeyboardEvent) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelected(selected === n.id ? null : n.id);
                          }
                          if (e.key === 'Escape') setSelected(null);
                        },
                        onPointerEnter: () => setHover(n.id),
                        onPointerLeave: () => setHover(null),
                        onFocus: () => setHover(n.id),
                        onBlur: () => setHover(null),
                        cursor: 'pointer',
                      })}
                >
                  <circle r={logo / 2 + 1} fill="var(--panel)" fillOpacity="0.85" stroke={selected === n.id ? 'var(--ink)' : 'none'} strokeWidth="2" />
                  <image href={`/logos/${t.abbr}.svg`} x={-logo / 2 + 2} y={-logo / 2 + 2} width={logo - 4} height={logo - 4} />
                  {live && t.star && (
                    <text x={logo / 2 - 1} y={-logo / 2 + 5} fontSize={mini ? 9 : 12} textAnchor="middle" fill="var(--ink)" stroke="var(--panel)" strokeWidth="2.5" paintOrder="stroke">
                      ★
                    </text>
                  )}
                </g>
              </g>
            );
          })}
          {ghosts.map((g) => {
            const [gx, gy] = pt(g.relOff, g.relDef);
            return (
              <g key={g.label} transform={`translate(${gx},${gy})`} role="img" aria-label={`Build ${g.label}: offense ${signed(g.relOff)}, defense ${signed(g.relDef)}`}>
                <circle r={logo / 2 + 4} fill="var(--panel)" stroke="var(--ink)" strokeWidth="2" strokeDasharray="4 3" />
                <text textAnchor="middle" dy="0.35em" fontSize={logo * 0.6} fontWeight="800" fill="var(--ink)">
                  {g.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}

      {!mini && activeNode && (
        <div
          role="status"
          className="panel pointer-events-none absolute z-10 w-56 px-2.5 py-2 text-xs shadow-2"
          style={{
            top: Math.min(size - 96, Math.max(0, activeNode.y + logo / 2 + 4)),
            ...(activeNode.x > size / 2 ? { right: size - activeNode.x + logo / 2 } : { left: activeNode.x + logo / 2 }),
          }}
        >
          <TeamLine n={activeNode} t={teamOf.get(activeNode.id)!} live={live} />
        </div>
      )}
    </div>
  );

  if (mini) return chart;

  return (
    <figure className="m-0">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented
          label="Sample"
          items={[{ value: 'season', label: 'Season' }, { value: 'recent', label: `Last ${cfg.recentGames}` }]}
          current={mode}
          onChange={(v) => setMode(v as Mode)}
        />
        <div className="order-last flex min-w-0 basis-full items-center gap-2 sm:order-none sm:flex-1 sm:basis-0">
          <button
            type="button"
            className="btn-ghost h-[30px] shrink-0"
            onClick={() => {
              if (!playing && idx >= lastIdx) setIdx(0);
              setPlaying((p) => !p);
            }}
            aria-label={playing ? 'Pause the season replay' : 'Play the season day by day'}
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <input
            type="range"
            min={0}
            max={lastIdx}
            value={idx}
            onChange={(e) => {
              setPlaying(false);
              setIdx(Number(e.target.value));
            }}
            aria-label="Game day"
            aria-valuetext={frame ? fmtDay(frame.date) : undefined}
            className="min-w-24 flex-1 border-0 bg-transparent p-0"
          />
          <span className="tnum w-14 shrink-0 whitespace-nowrap text-xs font-semibold" aria-hidden>
            {frame ? fmtDay(frame.date) : ''}
          </span>
        </div>
        <ShareMenu svg={() => svgRef.current} title={title} subtitle={subtitle} filename="title-zone" />
      </div>

      {chart}

      <figcaption className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[0.6875rem]" style={{ color: 'var(--ink-2)' }}>
        <span className="flex items-center gap-1.5">
          <svg width="26" height="8" aria-hidden>
            <circle cx="4" cy="4" r="3" fill="none" stroke="var(--ink-3)" />
            <line x1="7" y1="4" x2="24" y2="4" stroke="var(--ink-3)" markerEnd="url(#tz-arrow-gray)" />
          </svg>
          Move since the previous game day
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="26" height="8" aria-hidden>
            <line x1="1" y1="4" x2="24" y2="4" stroke="var(--ink-2)" strokeDasharray="4 3" />
          </svg>
          Next five: up is an easier stretch, down is harder
        </span>
        <span>★ In the zone with {cfg.starAt} of 3 title marks</span>
      </figcaption>

      {sel && selNode && (
        <div className="panel mx-auto mt-3 max-w-xl p-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <TeamLine n={selNode} t={sel} live={live} full />
            <button type="button" className="btn-ghost shrink-0" onClick={() => setSelected(null)} aria-label="Clear the focused team">
              <Icon name="close" size={12} />
            </button>
          </div>
          <Link href={`/teams/${sel.abbr}`} className="link mt-2 inline-block text-xs">
            {sel.name} team page →
          </Link>
        </div>
      )}

      <details className="mt-3 text-sm">
        <summary className="link cursor-pointer text-xs">View this chart as a table</summary>
        <div className="panel mt-2 overflow-auto">
          <table className="stat-table">
            <thead>
              <tr>
                {['Team', 'W-L', 'Offense', 'Defense', 'Net', 'Title Zone', 'Marks'].map((h) => (
                  <th key={h} scope="col" style={{ cursor: 'default' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...nodes].sort((a, b) => b.o + b.d - (a.o + a.d)).map((n) => {
                const t = teamOf.get(n.id);
                return (
                  <tr key={n.id}>
                    <td>{t?.name}</td>
                    <td>
                      {n.w}-{n.l}
                    </td>
                    <td>{signed(n.o)}</td>
                    <td>{signed(n.d)}</td>
                    <td>{signed(n.o + n.d)}</td>
                    <td>{inZone({ relOff: n.o, relDef: n.d }, cfg) ? 'In' : '—'}</td>
                    <td>{live && t ? `${t.marks.count} of 3` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** One team's line: the tooltip's short form, or the focused card's long one with marks and schedule. */
function TeamLine({ n, t, live, full }: { n: Node; t: ZoneTeam; live: boolean; full?: boolean }) {
  const zone = inZone({ relOff: n.o, relDef: n.d }, cfg);
  const mark = (ok: boolean, text: string) => (
    <li className="flex items-center gap-1.5">
      <Icon name={ok ? 'check' : 'close'} size={12} label={ok ? 'Met' : 'Not met'} />
      {text}
    </li>
  );
  return (
    <div className="min-w-0">
      <div className="font-bold" style={{ color: 'var(--ink)' }}>
        {t.name} <span className="tnum font-normal">{n.w}-{n.l}</span>
      </div>
      <div className="tnum mt-0.5" style={{ color: 'var(--ink-2)' }}>
        Off {signed(n.o)} · Def {signed(n.d)} · <strong style={{ color: 'var(--ink)' }}>Net {signed(n.o + n.d)}</strong>
      </div>
      <div className="mt-0.5" style={{ color: 'var(--ink-2)' }}>
        {zone ? 'In the Title Zone' : 'Outside the Title Zone'}
        {live && t.star ? ' ★' : ''}
      </div>
      {live && t.next && (
        <div className="mt-0.5" style={{ color: 'var(--ink-2)' }}>
          Next {t.next.games}: <strong style={{ color: 'var(--ink)' }}>{t.next.level}</strong> ({t.next.home} home, {t.next.away} away, opp. net{' '}
          <span className="tnum">{signed(t.next.oppNet)}</span>)
        </div>
      )}
      {full && live && (
        <ul className="mt-2 grid gap-0.5 text-xs" style={{ color: 'var(--ink-2)' }}>
          {mark(t.marks.pace, `40-20 pace (${n.w}-${n.l})`)}
          {mark(t.marks.srs, `SRS at least ${signed(cfg.minSrs)} (${t.srs === null ? 'none yet' : signed(t.srs, 2)})`)}
          {mark(t.marks.seed, `Top-${cfg.maxSeed} seed (${t.seed ? `No. ${t.seed} in the ${t.conference}` : 'unseeded'})`)}
        </ul>
      )}
    </div>
  );
}
