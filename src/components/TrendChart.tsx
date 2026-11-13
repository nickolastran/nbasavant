'use client';

import { scaleLinear } from 'd3-scale';
import { curveMonotoneX, line, symbol, symbolCircle, symbolDiamond, symbolSquare, symbolTriangle } from 'd3-shape';
import { useEffect, useRef, useState } from 'react';
import { ShareMenu } from '@/components/ShareMenu';

/** Fixed hue and marker order: a series keeps both when others come and go, and never relies on hue alone. */
const COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];
const SHAPES = [symbolCircle, symbolSquare, symbolTriangle, symbolDiamond];

export type Series = { key: string; label: string };

/** The rendered width of an element, tracked as it resizes, so SVG text stays at its real size. */
export function useWidth<T extends Element>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Lines over an ordered category axis (seasons, games). Point at a column, or
 * focus the chart and use the arrow keys, to read every series at that x.
 */
export function TrendChart({
  data, series, xKey = 'label', height = 260, title, unit = '',
}: {
  data: Record<string, any>[];
  series: Series[];
  xKey?: string;
  height?: number;
  title?: string;
  unit?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [at, setAt] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const m = { top: 10, right: 14, bottom: 24, left: 40 };
  const values = data.flatMap((d) => series.map((s) => d[s.key])).filter((v): v is number => typeof v === 'number');
  const y = scaleLinear()
    .domain(values.length ? [Math.min(...values), Math.max(...values)] : [0, 1])
    .nice(5)
    .range([height - m.bottom, m.top]);
  const x = (i: number) => (data.length < 2 ? (m.left + width - m.right) / 2 : m.left + (i / (data.length - 1)) * (width - m.left - m.right));
  // As many x labels as fit at ~56px each, always including the last.
  const every = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor((width - m.left - m.right) / 56))));
  const nearest = (px: number) => Math.max(0, Math.min(data.length - 1, Math.round(((px - m.left) / Math.max(1, width - m.left - m.right)) * (data.length - 1))));

  return (
    <figure className="panel m-0 p-3">
      <figcaption className="mb-2 flex items-center justify-between gap-2 text-sm font-semibold">
        <span>{title}</span>
        {values.length > 0 && <ShareMenu svg={() => svgRef.current} title={title ?? 'Trend'} subtitle={series.map((s) => s.label).join(' · ')} filename="trend" />}
      </figcaption>
      {series.length > 1 && (
        <ul className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-[0.6875rem]" style={{ color: 'var(--ink-2)' }}>
          {series.map((s, i) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden>
                <path d={symbol(SHAPES[i % 4], 50)()!} fill={COLORS[i % 4]} />
              </svg>
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div ref={ref} className="relative" style={{ height }}>
        {!values.length ? (
          <p className="grid h-full place-items-center text-sm" style={{ color: 'var(--ink-3)' }}>
            Nothing to chart yet.
          </p>
        ) : (
          width > 0 && (
            <svg
              ref={svgRef}
              width={width}
              height={height}
              role="img"
              tabIndex={0}
              aria-label={`${title ?? 'Trend'}: ${series.map((s) => s.label).join(', ')} over ${data.length} points. Use the arrow keys to read values.`}
              className="block rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              onPointerMove={(e) => setAt(nearest(e.clientX - e.currentTarget.getBoundingClientRect().left))}
              onPointerLeave={() => setAt(null)}
              onBlur={() => setAt(null)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                e.preventDefault();
                setAt((a) => Math.max(0, Math.min(data.length - 1, (a ?? (e.key === 'ArrowRight' ? -1 : data.length)) + (e.key === 'ArrowRight' ? 1 : -1))));
              }}
            >
              {y.ticks(5).map((t) => (
                <g key={t}>
                  <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray="2 4" />
                  <text x={m.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="var(--ink-2)" className="tnum">
                    {t}
                    {unit}
                  </text>
                </g>
              ))}
              {data.map((d, i) =>
                i % every === 0 || i === data.length - 1 ? (
                  // Skip a regular label that would collide with the always-shown last one.
                  i !== data.length - 1 && data.length - 1 - i < every / 2 ? null : (
                    <text key={i} x={x(i)} y={height - 6} textAnchor="middle" fontSize="11" fill="var(--ink-2)">
                      {d[xKey]}
                    </text>
                  )
                ) : null,
              )}
              {at !== null && <line x1={x(at)} x2={x(at)} y1={m.top} y2={height - m.bottom} stroke="var(--line-2)" />}
              {series.map((s, si) => {
                const pts = data.map((d, i) => [i, d[s.key]] as const).filter((p): p is readonly [number, number] => typeof p[1] === 'number');
                return (
                  <g key={s.key}>
                    <path
                      d={line<readonly [number, number]>().x((p) => x(p[0])).y((p) => y(p[1])).curve(curveMonotoneX)(pts) ?? ''}
                      fill="none"
                      stroke={COLORS[si % 4]}
                      strokeWidth="2"
                    />
                    {pts.map(([i, v]) => (
                      <path
                        key={i}
                        d={symbol(SHAPES[si % 4], i === at ? 70 : 32)()!}
                        transform={`translate(${x(i)},${y(v)})`}
                        fill={COLORS[si % 4]}
                      />
                    ))}
                  </g>
                );
              })}
            </svg>
          )
        )}
        {at !== null && data[at] && (
          <div
            role="status"
            className="panel pointer-events-none absolute top-1 z-10 px-2.5 py-1.5 text-xs shadow-2"
            style={x(at) > width / 2 ? { right: width - x(at) + 10 } : { left: x(at) + 10 }}
          >
            <div className="font-semibold" style={{ color: 'var(--ink-2)' }}>
              {data[at][xKey]}
            </div>
            {series.map((s) => (
              <div key={s.key} className="tnum flex justify-between gap-3">
                <span>{s.label}</span>
                <strong>
                  {typeof data[at][s.key] === 'number' ? `${data[at][s.key]}${unit}` : '—'}
                </strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}
