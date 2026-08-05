'use client';

import { useMemo, useRef, useState } from 'react';
import { COURT, CourtLines } from './Court';
import { downloadSvgAsPng } from '@/lib/export';

export type Shot = {
  x: number; y: number; made: boolean; value: number; distanceFt: number;
  zone: string; action?: string; player?: string; defender?: string | null;
  clock?: string; period?: number;
};

type Mode = 'hex' | 'scatter';

/** League points-per-shot; the midpoint the diverging color scale pivots on. */
const LEAGUE_PPS = 1.08;
const HEX_R = 17;

/** Cube-round an axial hex coordinate. */
function hexBin(x: number, y: number, r: number) {
  const q = ((2 / 3) * x) / r;
  const rr = ((-1 / 3) * x + (Math.sqrt(3) / 3) * y) / r;
  let [cx, cy, cz] = [q, -q - rr, rr];
  let [rx, ry, rz] = [Math.round(cx), Math.round(cy), Math.round(cz)];
  const [dx, dy, dz] = [Math.abs(rx - cx), Math.abs(ry - cy), Math.abs(rz - cz)];
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz, cx: r * 1.5 * rx, cy: r * Math.sqrt(3) * (rz + rx / 2) };
}

const hexPath = (cx: number, cy: number, r: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i);
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(' ');

/**
 * Diverging cold -> neutral -> hot, pivoting on league average.
 * Thin bins get pulled toward neutral: one miss in one attempt is not evidence
 * of a cold spot, and coloring it deep blue makes the whole chart lie.
 */
function heat(pps: number, attempts = 999) {
  const confidence = attempts / (attempts + 4);
  const shrunk = LEAGUE_PPS + (pps - LEAGUE_PPS) * confidence;
  const t = Math.max(-1, Math.min(1, (shrunk - LEAGUE_PPS) / 0.45));
  if (t >= 0) return `color-mix(in oklab, var(--hot) ${Math.round(20 + t * 80)}%, var(--mid))`;
  return `color-mix(in oklab, var(--cold) ${Math.round(20 + -t * 80)}%, var(--mid))`;
}

export function ShotChart({
  shots,
  title,
  subtitle,
  height = 520,
}: {
  shots: Shot[];
  title?: string;
  subtitle?: string;
  height?: number;
}) {
  const [mode, setMode] = useState<Mode>('hex');
  const [hover, setHover] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const bins = useMemo(() => {
    const map = new Map<string, { cx: number; cy: number; att: number; made: number; pts: number }>();
    for (const s of shots) {
      const b = hexBin(s.x, s.y, HEX_R);
      const key = `${b.q},${b.r}`;
      const cur = map.get(key) ?? { cx: b.cx, cy: b.cy, att: 0, made: 0, pts: 0 };
      cur.att++;
      if (s.made) {
        cur.made++;
        cur.pts += s.value;
      }
      map.set(key, cur);
    }
    return [...map.values()];
  }, [shots]);

  const maxAtt = Math.max(1, ...bins.map((b) => b.att));
  const made = shots.filter((s) => s.made).length;
  const pts = shots.reduce((s, x) => s + (x.made ? x.value : 0), 0);

  return (
    <figure className="panel m-0 overflow-hidden">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2 border-b px-3 py-2" style={{ borderColor: 'var(--line)' }}>
        <div>
          <div className="text-sm font-semibold">{title ?? 'Shot chart'}</div>
          {subtitle && <div className="eyebrow mt-0.5">{subtitle}</div>}
        </div>
        <div className="flex items-center gap-1">
          {(['hex', 'scatter'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className="rounded px-2 py-1 text-xs font-medium"
              style={{
                background: mode === m ? 'var(--chrome)' : 'transparent',
                color: mode === m ? 'var(--on-chrome)' : 'var(--ink-2)',
                border: '1px solid var(--line)',
              }}
            >
              {m === 'hex' ? 'Heat map' : 'Every shot'}
            </button>
          ))}
          <button
            onClick={() => svgRef.current && downloadSvgAsPng(svgRef.current, 'shot-chart')}
            className="rounded px-2 py-1 text-xs font-medium"
            style={{ border: '1px solid var(--line)', color: 'var(--ink-2)' }}
            title="Download this chart as a PNG"
          >
            PNG
          </button>
        </div>
      </figcaption>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`${COURT.minX} ${-COURT.maxY} ${COURT.width} ${COURT.height}`}
          style={{ width: '100%', height, display: 'block', background: 'var(--panel)' }}
          role="img"
          aria-label={`${shots.length} shot attempts plotted on a half court${title ? ` for ${title}` : ''}`}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            {/* Hex corners and shot markers would otherwise bleed past the sideline. */}
            <clipPath id="court-clip">
              <rect x={-250} y={-52.5} width={500} height={470} />
            </clipPath>
          </defs>
          <g transform="scale(1,-1)">
            <CourtLines />

            <g clipPath="url(#court-clip)">
            {mode === 'hex'
              ? bins.map((b, i) => {
                  const pps = b.pts / b.att;
                  // Area scales with volume; the floor keeps single shots visible.
                  const r = HEX_R * (0.32 + 0.68 * Math.sqrt(b.att / maxAtt));
                  return (
                    <polygon
                      key={i}
                      points={hexPath(b.cx, b.cy, r)}
                      fill={heat(pps, b.att)}
                      stroke="var(--panel)"
                      strokeWidth={1}
                      onMouseEnter={(e) =>
                        setHover({
                          x: e.clientX,
                          y: e.clientY,
                          lines: [
                            `${b.made}/${b.att} — ${((b.made / b.att) * 100).toFixed(1)}%`,
                            `${pps.toFixed(2)} pts per shot`,
                            `${(Math.hypot(b.cx, b.cy) / 10).toFixed(0)} ft from the rim`,
                          ],
                        })
                      }
                    />
                  );
                })
              : shots.map((s, i) =>
                  s.made ? (
                    <circle
                      key={i}
                      cx={s.x}
                      cy={s.y}
                      r={5}
                      fill="var(--hot)"
                      fillOpacity={0.75}
                      stroke="var(--panel)"
                      strokeWidth={1}
                      onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY, lines: shotLines(s) })}
                    />
                  ) : (
                    <g
                      key={i}
                      onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY, lines: shotLines(s) })}
                    >
                      <line x1={s.x - 4} y1={s.y - 4} x2={s.x + 4} y2={s.y + 4} stroke="var(--cold)" strokeWidth={1.6} strokeOpacity={0.75} />
                      <line x1={s.x - 4} y1={s.y + 4} x2={s.x + 4} y2={s.y - 4} stroke="var(--cold)" strokeWidth={1.6} strokeOpacity={0.75} />
                    </g>
                  ),
                )}
            </g>
          </g>
        </svg>

        {hover && (
          <div
            role="tooltip"
            className="panel pointer-events-none fixed z-50 px-2.5 py-1.5 text-xs"
            style={{ left: hover.x + 12, top: hover.y + 12, boxShadow: 'var(--shadow)' }}
          >
            {hover.lines.map((l, i) => (
              <div key={i} className={i === 0 ? 'font-semibold tnum' : 'tnum'} style={i > 0 ? { color: 'var(--ink-2)' } : undefined}>
                {l}
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2 text-xs"
        style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}
      >
        <span className="tnum">
          <strong>{made}</strong>/<strong>{shots.length}</strong> ·{' '}
          {shots.length ? ((made / shots.length) * 100).toFixed(1) : '0.0'}% ·{' '}
          {shots.length ? (pts / shots.length).toFixed(2) : '0.00'} pts/shot
        </span>
        {mode === 'hex' ? (
          <span className="flex items-center gap-2">
            Colder
            <span className="flex h-3 w-40 overflow-hidden rounded-sm">
              {[-1, -0.6, -0.2, 0.2, 0.6, 1].map((t) => (
                <span key={t} className="flex-1" style={{ background: heat(LEAGUE_PPS + t * 0.45) }} />
              ))}
            </span>
            Hotter
            <span className="hidden sm:inline">(vs. {LEAGUE_PPS} league pts/shot; hex size = volume)</span>
          </span>
        ) : (
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <svg width="10" height="10" aria-hidden="true">
                <circle cx="5" cy="5" r="4" fill="var(--hot)" />
              </svg>
              Made
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="10" height="10" aria-hidden="true">
                <line x1="1" y1="1" x2="9" y2="9" stroke="var(--cold)" strokeWidth="1.6" />
                <line x1="1" y1="9" x2="9" y2="1" stroke="var(--cold)" strokeWidth="1.6" />
              </svg>
              Missed
            </span>
          </span>
        )}
      </div>
    </figure>
  );
}

const shotLines = (s: Shot) =>
  [
    `${s.made ? 'Made' : 'Missed'} ${s.value}PT — ${s.distanceFt} ft`,
    s.action ?? s.zone,
    s.player ?? '',
    s.defender ? `Closest defender: ${s.defender}` : '',
    s.period ? `Q${s.period} ${s.clock ?? ''}` : '',
  ].filter(Boolean);
