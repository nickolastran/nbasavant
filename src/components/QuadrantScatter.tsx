'use client';

import { brush as d3brush } from 'd3-brush';
import { polygonContains } from 'd3-polygon';
import { scaleLinear } from 'd3-scale';
import { select } from 'd3-selection';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Row } from '@/components/AdvancedTable';
import { ShareMenu } from '@/components/ShareMenu';
import { useWidth } from '@/components/TrendChart';
import { Segmented } from '@/components/ViewTabs';
import { percentileStep } from '@/lib/colors';
import { placeLabels } from '@/lib/labels';
import { TEAMS } from '../../prisma/teams';

export type Metric = { key: string; label: string; title?: string; dp?: number; suffix?: string; signed?: boolean; lowerIsBetter?: boolean };
export type ScatterPreset = { key: string; label: string; x: string; y: string; scale: 'pct' | 'raw'; captions: [string, string, string, string] };

type P = { id: number; name: string; team: string; pos: string; min: number; rx: number; ry: number; px: number; py: number; vx: number; vy: number };
type Domain = [number, number, number, number];

const CONF = new Map(TEAMS.map((t) => [t.abbreviation, t.conference]));
const COLOR = new Map(TEAMS.map((t) => [t.abbreviation, t.primaryColor]));
const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];
const fmt = (m: Metric, v: number) => `${m.signed && v > 0 ? '+' : ''}${v.toFixed(m.dp ?? 1)}${m.suffix ?? ''}`;
const surname = (name: string) => name.split(' ').slice(1).join(' ') || name;

/** Percentile (0-100) of each value among `pool`, flipped where lower is better. */
function percentiles(pool: number[], lowerIsBetter?: boolean) {
  const sorted = [...pool].sort((a, b) => a - b);
  return (v: number) => {
    let lo = 0;
    while (lo < sorted.length && sorted[lo] < v) lo++;
    let hi = lo;
    while (hi < sorted.length && sorted[hi] === v) hi++;
    const p = sorted.length > 1 ? ((lo + hi - 1) / 2 / (sorted.length - 1)) * 100 : 50;
    return lowerIsBetter ? 100 - p : p;
  };
}

/**
 * Any two player metrics against each other, as percentiles or raw values,
 * with dashed league-average lines cutting the field into quadrants.
 *
 * Drag to zoom (double-click or Reset to go back), or switch the tool to
 * Lasso and circle a group to send it to the table below. Click a player, or
 * focus the chart and use the arrow keys and Enter, to add him one at a time.
 * Everything here is in the URL.
 */
export function QuadrantScatter({
  rows, metrics, presets, defaultMin, onSelect,
}: {
  rows: Row[];
  metrics: Metric[];
  presets: ScatterPreset[];
  /** The minutes qualifier used when the URL names none. */
  defaultMin: number;
  /** Told which players are selected, for the comparison table. */
  onSelect?: (ids: number[]) => void;
}) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const [ref, width] = useWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const brushRef = useRef<SVGGElement>(null);
  const metricOf = useMemo(() => new Map(metrics.map((m) => [m.key, m])), [metrics]);
  const has = (k: string | null): k is string => !!k && metricOf.has(k);

  const first = presets[0];
  const urlPreset = presets.find((p) => p.key === sp.get('view'));
  const [x, setX] = useState(() => (has(sp.get('x')) ? sp.get('x')! : (urlPreset ?? first).x));
  const [y, setY] = useState(() => (has(sp.get('y')) ? sp.get('y')! : (urlPreset ?? first).y));
  const [scale, setScale] = useState<'pct' | 'raw'>(() => (sp.get('scale') === 'raw' || sp.get('scale') === 'pct' ? (sp.get('scale') as 'pct' | 'raw') : (urlPreset ?? first).scale));
  const [marks, setMarks] = useState<'logo' | 'photo'>(() => (sp.get('marks') === 'photo' ? 'photo' : 'logo'));
  const [pos, setPos] = useState(() => sp.get('pos') ?? '');
  const [team, setTeam] = useState(() => sp.get('team') ?? '');
  const [conf, setConf] = useState(() => sp.get('conf') ?? '');
  const [min, setMin] = useState(() => (sp.get('min') !== null && Number.isFinite(Number(sp.get('min'))) ? Number(sp.get('min')) : defaultMin));
  const [hl, setHl] = useState(() => sp.get('hl') ?? '');
  const [spot, setSpot] = useState(() => sp.get('spot') ?? '');
  const [sel, setSel] = useState<number[]>(() => (sp.get('sel') ?? '').split('.').map(Number).filter((n) => Number.isInteger(n) && n > 0));
  const [zoom, setZoom] = useState<Domain | null>(() => {
    const z = (sp.get('zoom') ?? '').split(',').map(Number);
    return z.length === 4 && z.every(Number.isFinite) ? (z as Domain) : null;
  });
  const [captions, setCaptions] = useState<string[] | null>(() => (sp.get('cap') ? sp.get('cap')!.split('|').slice(0, 4) : null));
  const [tool, setTool] = useState<'zoom' | 'lasso'>('zoom');
  const [hover, setHover] = useState<number | null>(null);
  const [lasso, setLasso] = useState<[number, number][] | null>(null);

  const preset = presets.find((p) => p.x === x && p.y === y && p.scale === scale);
  const caps = captions ?? preset?.captions ?? ['', '', '', ''];

  // The view is the URL. Defaults are left out so a plain link stays plain.
  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    const put = (k: string, v: string | null) => (v ? next.set(k, v) : next.delete(k));
    // "view", not "preset": the comparison table below keeps its own column preset in the same URL.
    put('view', preset && preset !== first ? preset.key : null);
    put('x', preset ? null : x);
    put('y', preset ? null : y);
    put('scale', preset ? null : scale);
    put('marks', marks === 'photo' ? 'photo' : null);
    put('pos', pos); put('team', team); put('conf', conf); put('hl', hl); put('spot', spot);
    put('min', min === defaultMin ? null : String(min));
    put('sel', sel.length ? sel.join('.') : null);
    put('zoom', zoom ? zoom.map((v) => +v.toFixed(2)).join(',') : null);
    put('cap', captions ? captions.join('|') : null);
    const qs = next.toString();
    if (qs !== window.location.search.slice(1)) window.history.replaceState(null, '', qs ? `${pathname}?${qs}` : pathname);
  }, [preset, first, x, y, scale, marks, pos, team, conf, hl, spot, min, defaultMin, sel, zoom, captions, pathname]);

  useEffect(() => onSelect?.(sel), [sel, onSelect]);

  const mx = metricOf.get(x)!;
  const my = metricOf.get(y)!;

  // The qualified pool sets the percentiles and the averages; the other filters only decide who is drawn.
  const { points, pool, avg } = useMemo(() => {
    const pool = rows.filter((r) => typeof r[x] === 'number' && typeof r[y] === 'number' && typeof r.min === 'number' && r.min >= min);
    const [pctX, pctY] = [percentiles(pool.map((r) => r[x] as number), mx.lowerIsBetter), percentiles(pool.map((r) => r[y] as number), my.lowerIsBetter)];
    const all: P[] = pool.map((r) => {
      const [rx, ry] = [r[x] as number, r[y] as number];
      const [px, py] = [pctX(rx), pctY(ry)];
      return { id: r.playerId as number, name: String(r.player), team: String(r.team ?? ''), pos: String(r.pos ?? ''), min: r.min as number, rx, ry, px, py, vx: scale === 'pct' ? px : rx, vy: scale === 'pct' ? py : ry };
    });
    const mean = (f: (p: P) => number) => (all.length ? all.reduce((s, p) => s + f(p), 0) / all.length : 0);
    const points = all.filter((p) => (!pos || p.pos === pos) && (!team || p.team === team) && (!conf || CONF.get(p.team) === conf));
    return { points, pool: all, avg: { x: mean((p) => p.vx), y: mean((p) => p.vy) } };
  }, [rows, x, y, min, scale, pos, team, conf, mx.lowerIsBetter, my.lowerIsBetter]);

  const small = width < 520;
  const height = Math.round(small ? Math.min(width * 1.05, 520) : Math.min(width * 0.68, 660));
  const m = { top: 14, right: 14, bottom: 38, left: small ? 36 : 46 };
  const r = small ? 8 : 11;

  const full: Domain = useMemo(() => {
    if (scale === 'pct') return [0, 100, 0, 100];
    const ext = (f: (p: P) => number): [number, number] => {
      const v = pool.map(f);
      const [lo, hi] = v.length ? [Math.min(...v), Math.max(...v)] : [0, 1];
      const pad = (hi - lo || 1) * 0.06;
      return [lo - pad, hi + pad];
    };
    return [...ext((p) => p.vx), ...ext((p) => p.vy)] as Domain;
  }, [scale, pool]);
  const dom = zoom ?? full;
  const sx = scaleLinear().domain([dom[0], dom[1]]).range([m.left, width - m.right]);
  const sy = scaleLinear().domain([dom[2], dom[3]]).range([height - m.bottom, m.top]);
  const inView = (p: P) => p.vx >= dom[0] && p.vx <= dom[1] && p.vy >= dom[2] && p.vy <= dom[3];
  const shown = points.filter(inView);

  const spotIds = useMemo(() => {
    const q = spot.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return q.length < 2 ? new Set<number>() : new Set(points.filter((p) => p.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q)).map((p) => p.id));
  }, [spot, points]);
  const lit = (p: P) => (spotIds.size ? spotIds.has(p.id) : hl ? p.team === hl : true);

  // Labels: spotlighted and selected players first, then the ones furthest from the middle of the field.
  const labels = useMemo(() => {
    if (!width) return [];
    const fs = small ? 9 : 10.5;
    return placeLabels(
      shown.map((p) => ({
        id: p.id, x: sx(p.vx), y: sy(p.vy), r: r + 1, w: surname(p.name).length * fs * 0.56 + 6, h: fs + 3,
        priority: (spotIds.has(p.id) ? 1e6 : 0) + (sel.includes(p.id) ? 1e5 : 0) + (lit(p) ? 1e3 : 0) + Math.hypot(p.px - 50, p.py - 50),
      })),
      { width, height: height - m.bottom },
    );
    // sx/sy/lit are derived from the listed inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.map((p) => p.id).join(), width, height, dom.join(), scale, x, y, small, sel.join(), [...spotIds].join(), hl]);
  const byId = new Map(shown.map((p) => [p.id, p]));

  // Drag to zoom (d3-brush). The brush layer only exists while the zoom tool is on.
  useEffect(() => {
    const g = brushRef.current;
    if (!g || !width || tool !== 'zoom') return;
    const b = d3brush()
      .extent([[m.left, m.top], [width - m.right, height - m.bottom]])
      .on('end', (e) => {
        if (!e.selection || !e.sourceEvent) return;
        const [[x0, y0], [x1, y1]] = e.selection as [[number, number], [number, number]];
        select(g).call(b.move, null);
        if (x1 - x0 < 8 || y1 - y0 < 8) return;
        setZoom([sx.invert(x0), sx.invert(x1), sy.invert(y1), sy.invert(y0)]);
      });
    select(g).call(b);
    return () => void select(g).on('.brush', null).selectAll('*').remove();
    // Rebuilt whenever the scales change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, width, height, dom.join()]);

  const toggle = (id: number) => setSel((s) => (s.includes(id) ? s.filter((v) => v !== id) : [...s, id]));
  const local = (e: React.PointerEvent): [number, number] => {
    const b = svgRef.current!.getBoundingClientRect();
    return [e.clientX - b.left, e.clientY - b.top];
  };
  const endLasso = () => {
    if (lasso && lasso.length > 3) {
      const inside = shown.filter((p) => polygonContains(lasso, [sx(p.vx), sy(p.vy)])).map((p) => p.id);
      if (inside.length) setSel((s) => [...new Set([...s, ...inside])]);
    }
    setLasso(null);
  };

  // Arrow keys walk the points left to right; Enter adds the focused one to the table.
  const order = useMemo(() => [...shown].sort((a, b) => a.vx - b.vx).map((p) => p.id), [shown]);
  const onKey = (e: React.KeyboardEvent) => {
    if (!order.length) return;
    const at = hover === null ? -1 : order.indexOf(hover);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setHover(order[(at + (e.key === 'ArrowRight' ? 1 : -1) + order.length) % order.length]);
    } else if ((e.key === 'Enter' || e.key === ' ') && hover !== null) {
      e.preventDefault();
      toggle(hover);
    } else if (e.key === 'Escape') setHover(null);
  };

  const tip = hover !== null ? byId.get(hover) : null;
  const title = `${my.label} vs. ${mx.label}`;
  const subtitle = `${scale === 'pct' ? 'Percentile among' : 'Among'} ${pool.length} players with ${min}+ minutes`;
  const teamsHere = [...new Set(pool.map((p) => p.team).filter(Boolean))].sort();
  const pick = (p: ScatterPreset) => {
    setX(p.x); setY(p.y); setScale(p.scale); setCaptions(null); setZoom(null);
  };
  const axisLabel = (mt: Metric) => `${mt.label}${scale === 'pct' ? ' percentile' : ''}`;

  return (
    <figure className="m-0">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Segmented label="Presets" items={presets.map((p) => ({ value: p.key, label: p.label }))} current={preset?.key ?? ''} onChange={(k) => pick(presets.find((p) => p.key === k)!)} />
      </div>

      <div className="mb-3 flex flex-wrap items-end gap-x-3 gap-y-2">
        {([['X axis', x, setX], ['Y axis', y, setY]] as const).map(([label, value, set]) => (
          <label key={label} className="flex flex-col gap-1">
            <span className="eyebrow">{label}</span>
            <select
              value={value}
              onChange={(e) => {
                set(e.target.value);
                setZoom(null);
                setCaptions(null);
              }}
              className="max-w-[11rem]"
            >
              {metrics.map((mt) => (
                <option key={mt.key} value={mt.key}>
                  {mt.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        <Segmented label="Scale" items={[{ value: 'pct', label: 'Percentile' }, { value: 'raw', label: 'Raw' }]} current={scale} onChange={(v) => { setScale(v as 'pct' | 'raw'); setZoom(null); }} />
        <Segmented label="Markers" items={[{ value: 'logo', label: 'Logos' }, { value: 'photo', label: 'Headshots' }]} current={marks} onChange={(v) => setMarks(v as 'logo' | 'photo')} />
        <label className="flex flex-col gap-1">
          <span className="eyebrow">Position</span>
          <select value={pos} onChange={(e) => setPos(e.target.value)}>
            <option value="">All</option>
            {POSITIONS.map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow">Team</span>
          <select value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">All</option>
            {teamsHere.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow">Conference</span>
          <select value={conf} onChange={(e) => setConf(e.target.value)}>
            <option value="">Both</option>
            <option>East</option>
            <option>West</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow">Min minutes</span>
          <input type="number" min={0} value={min} onChange={(e) => setMin(Math.max(0, Number(e.target.value) || 0))} className="w-20" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow">Highlight team</span>
          <select value={hl} onChange={(e) => setHl(e.target.value)}>
            <option value="">None</option>
            {teamsHere.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow">Spotlight</span>
          <input type="search" value={spot} onChange={(e) => setSpot(e.target.value)} placeholder="Player name" className="w-36" />
        </label>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Segmented label="Pointer tool" items={[{ value: 'zoom', label: 'Drag to zoom' }, { value: 'lasso', label: 'Lasso' }]} current={tool} onChange={(v) => setTool(v as 'zoom' | 'lasso')} />
        {zoom && (
          <button type="button" className="btn-ghost" onClick={() => setZoom(null)}>
            Reset zoom
          </button>
        )}
        {sel.length > 0 && (
          <button type="button" className="btn-ghost" onClick={() => setSel([])}>
            Clear {sel.length} selected
          </button>
        )}
        <span className="tnum text-xs" style={{ color: 'var(--ink-2)' }} role="status">
          {shown.length} of {pool.length} players shown
        </span>
        <span className="ml-auto">
          <ShareMenu svg={() => svgRef.current} title={title} subtitle={subtitle} filename="player-scatter" />
        </span>
      </div>

      <div ref={ref} className="panel relative overflow-hidden" style={{ minHeight: 320 }}>
        {!width ? (
          <span aria-hidden className="skeleton block h-80 w-full" />
        ) : !pool.length ? (
          <p className="grid h-80 place-items-center px-6 text-center text-sm" style={{ color: 'var(--ink-2)' }}>
            No player has both stats with {min}+ minutes. Lower the minutes or pick other metrics.
          </p>
        ) : (
          <svg
            ref={svgRef}
            width={width}
            height={height}
            tabIndex={0}
            role="group"
            aria-label={`${title}. ${subtitle}. ${shown.length} players shown. Use the left and right arrow keys to move between players and Enter to add one to the comparison table.`}
            className="block select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            style={{ touchAction: tool === 'lasso' ? 'none' : undefined, cursor: tool === 'lasso' ? 'crosshair' : undefined }}
            onKeyDown={onKey}
            onDoubleClick={() => setZoom(null)}
            onPointerDown={(e) => tool === 'lasso' && (e.currentTarget.setPointerCapture(e.pointerId), setLasso([local(e)]))}
            onPointerMove={(e) => lasso && setLasso((l) => (l ? [...l, local(e)] : l))}
            onPointerUp={endLasso}
            onPointerCancel={() => setLasso(null)}
          >
            {/* Grid and axes */}
            {sx.ticks(small ? 5 : 10).map((t) => (
              <g key={`x${t}`}>
                <line x1={sx(t)} x2={sx(t)} y1={m.top} y2={height - m.bottom} stroke="var(--line)" />
                <text x={sx(t)} y={height - m.bottom + 13} textAnchor="middle" fontSize="10" fill="var(--ink-2)" className="tnum">{t}</text>
              </g>
            ))}
            {sy.ticks(small ? 5 : 8).map((t) => (
              <g key={`y${t}`}>
                <line x1={m.left} x2={width - m.right} y1={sy(t)} y2={sy(t)} stroke="var(--line)" />
                <text x={m.left - 6} y={sy(t)} dy="0.32em" textAnchor="end" fontSize="10" fill="var(--ink-2)" className="tnum">{t}</text>
              </g>
            ))}
            <text x={(m.left + width - m.right) / 2} y={height - 6} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--ink-2)">
              {axisLabel(mx)} →{scale === 'raw' && mx.lowerIsBetter ? ' (lower is better)' : ''}
            </text>
            <text transform={`translate(12,${(m.top + height - m.bottom) / 2}) rotate(-90)`} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--ink-2)">
              {axisLabel(my)} →{scale === 'raw' && my.lowerIsBetter ? ' (lower is better)' : ''}
            </text>

            {/* League-average lines and the quadrant captions they create */}
            {avg.x >= dom[0] && avg.x <= dom[1] && (
              <g>
                <line x1={sx(avg.x)} x2={sx(avg.x)} y1={m.top} y2={height - m.bottom} stroke="var(--ink-3)" strokeDasharray="5 4" />
                <text x={sx(avg.x) + 4} y={m.top + 10} fontSize="10" fill="var(--ink-2)" className="tnum">avg {avg.x.toFixed(1)}</text>
              </g>
            )}
            {avg.y >= dom[2] && avg.y <= dom[3] && (
              <g>
                <line x1={m.left} x2={width - m.right} y1={sy(avg.y)} y2={sy(avg.y)} stroke="var(--ink-3)" strokeDasharray="5 4" />
                <text x={width - m.right - 4} y={sy(avg.y) - 4} textAnchor="end" fontSize="10" fill="var(--ink-2)" className="tnum">avg {avg.y.toFixed(1)}</text>
              </g>
            )}
            {caps.map((c, i) =>
              c ? (
                <text
                  key={i}
                  x={i % 2 ? width - m.right - 8 : m.left + 8}
                  y={i < 2 ? m.top + 24 : height - m.bottom - 10}
                  textAnchor={i % 2 ? 'end' : 'start'}
                  fontSize={small ? 10 : 12}
                  fontWeight="700"
                  letterSpacing="0.08em"
                  fill="var(--ink-3)"
                  style={{ textTransform: 'uppercase' }}
                >
                  {c}
                </text>
              ) : null,
            )}

            <g ref={brushRef} />

            {/* Leader lines, then markers, then names */}
            {labels.filter((l) => l.leader).map((l) => {
              const p = byId.get(l.id as number);
              return p ? <line key={l.id} x1={sx(p.vx)} y1={sy(p.vy)} x2={l.x + l.w / 2} y2={l.y + l.h / 2} stroke="var(--ink-3)" strokeWidth="0.7" opacity={lit(p) ? 0.8 : 0.2} /> : null;
            })}
            {shown.map((p) => {
              const on = sel.includes(p.id);
              const color = COLOR.get(p.team) ?? 'var(--mid)';
              return (
                <g
                  key={p.id}
                  transform={`translate(${sx(p.vx)},${sy(p.vy)})`}
                  opacity={lit(p) ? 1 : 0.2}
                  style={{ cursor: 'pointer' }}
                  onPointerEnter={() => setHover(p.id)}
                  onPointerLeave={() => setHover(null)}
                  onClick={() => tool === 'zoom' && toggle(p.id)}
                >
                  {/* The team-colored disc is the marker; the image sits on top, so a missing image still leaves a mark. */}
                  <circle r={r} fill={marks === 'photo' ? color : 'var(--panel)'} stroke={on || hover === p.id ? 'var(--ink)' : marks === 'photo' ? color : 'var(--line-2)'} strokeWidth={on ? 2.5 : hover === p.id ? 2 : 1} />
                  {marks === 'photo' ? (
                    <image href={`https://cdn.nba.com/headshots/nba/latest/260x190/${p.id}.png`} x={-r} y={-r} width={r * 2} height={r * 2} preserveAspectRatio="xMidYMin slice" clipPath="circle(50%)" />
                  ) : (
                    p.team && <image href={`/logos/${p.team}.svg`} x={-r + 2} y={-r + 2} width={r * 2 - 4} height={r * 2 - 4} />
                  )}
                  {on && <circle r={r + 3} fill="none" stroke="var(--ink)" strokeDasharray="2 2" />}
                </g>
              );
            })}
            {labels.map((l) => {
              const p = byId.get(l.id as number);
              return p ? (
                <text key={l.id} x={l.x + 3} y={l.y + l.h - 3} fontSize={small ? 9 : 10.5} fontWeight={spotIds.has(p.id) || sel.includes(p.id) ? 700 : 500} fill="var(--ink)" opacity={lit(p) ? 1 : 0.25} pointerEvents="none">
                  {surname(p.name)}
                </text>
              ) : null;
            })}
            {lasso && <path d={`M${lasso.map((q) => q.join(',')).join('L')}Z`} fill="var(--accent)" fillOpacity="0.08" stroke="var(--accent)" strokeDasharray="4 3" />}
          </svg>
        )}

        {tip && (
          <div
            role="status"
            className="panel pointer-events-none absolute z-10 w-52 px-2.5 py-2 text-xs shadow-2"
            style={{
              top: Math.min(height - 110, Math.max(4, sy(tip.vy) + r + 6)),
              ...(sx(tip.vx) > width / 2 ? { right: width - sx(tip.vx) + r + 4 } : { left: sx(tip.vx) + r + 4 }),
            }}
          >
            <div className="font-bold">{tip.name}</div>
            <div style={{ color: 'var(--ink-2)' }}>
              {[tip.team, tip.pos, `${tip.min} min`].filter(Boolean).join(' · ')}
            </div>
            {([[mx, tip.rx, tip.px], [my, tip.ry, tip.py]] as const).map(([mt, raw, pct]) => (
              <div key={mt.key} className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2">
                <span className="truncate">{mt.label}</span>
                <strong className="tnum">{fmt(mt, raw)}</strong>
                <span className="relative col-span-2 h-1.5 rounded-full" style={{ background: 'var(--line)' }}>
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: `var(--div-${percentileStep(pct) + 1})` }} />
                </span>
                <span className="tnum col-span-2 text-[0.625rem]" style={{ color: 'var(--ink-3)' }}>
                  {Math.round(pct)}th percentile
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <details className="mt-2 text-xs">
        <summary className="link cursor-pointer">Edit quadrant captions</summary>
        <div className="mt-2 grid max-w-xl grid-cols-2 gap-2">
          {['Top left', 'Top right', 'Bottom left', 'Bottom right'].map((label, i) => (
            <label key={label} className="flex flex-col gap-1">
              <span className="eyebrow">{label}</span>
              <input
                value={caps[i] ?? ''}
                maxLength={28}
                onChange={(e) => setCaptions(caps.map((c, j) => (j === i ? e.target.value.replace(/\|/g, '') : c)))}
              />
            </label>
          ))}
        </div>
      </details>
    </figure>
  );
}
