'use client';

import { useState } from 'react';

export type WinPoint = {
  /** Seconds since tip-off. */
  t: number;
  /** The home team's chance, 0-1. */
  p: number;
  /** "Q2 5:21" */
  when: string;
  /** "45-40", away first. */
  score: string;
};

const W = 320;
const H = 140;
const PAD = { top: 8, bottom: 18, left: 30, right: 6 };

/**
 * The home team's win chance through the game: one line, 50% dashed across the
 * middle, home's name along the top edge and away's along the bottom (a line
 * near the top means home is likely). Quarter lines underneath; hover for any
 * moment. `length` is the game's full length in seconds (overtime included).
 */
export function WinProbability({
  points, length, home, away,
}: {
  points: WinPoint[];
  length: number;
  home: string;
  away: string;
}) {
  const [hover, setHover] = useState<WinPoint | null>(null);
  if (!points.length) return null;
  const x = (t: number) => PAD.left + (t / length) * (W - PAD.left - PAD.right);
  const y = (p: number) => PAD.top + (1 - p) * (H - PAD.top - PAD.bottom);
  const path = points.map((d, i) => `${i ? 'L' : 'M'}${x(d.t).toFixed(1)},${y(d.p).toFixed(1)}`).join('');
  const now = points.at(-1)!;
  const quarters = [720, 1440, 2160, 2880].filter((t) => t < length);
  const pct = (p: number) => `${Math.round(p * 100)}%`;
  const shown = hover ?? now;
  const leader = shown.p >= 0.5 ? home : away;

  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const t = (((e.clientX - box.left) / box.width) * W - PAD.left) / (W - PAD.left - PAD.right) * length;
    // The last point at or before the pointer: the probability as it stood then.
    let best = points[0];
    for (const d of points) if (d.t <= t) best = d;
    setHover(best);
  };

  return (
    <figure>
      <figcaption className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-semibold">
          {leader} {pct(Math.max(shown.p, 1 - shown.p))}
        </span>
        <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
          {shown.when} · {shown.score}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        role="img"
        aria-label={`Win probability: ${home} ${pct(now.p)}, ${away} ${pct(1 - now.p)}`}
        onPointerMove={move}
        onPointerLeave={() => setHover(null)}
      >
        {quarters.map((t) => (
          <line key={t} x1={x(t)} x2={x(t)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--line)" />
        ))}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0.5)} y2={y(0.5)} stroke="var(--line-2)" strokeDasharray="3 3" />
        <text x={PAD.left - 4} y={y(1) + 4} textAnchor="end" fontSize="9" fill="var(--ink-2)" fontWeight="600">
          {home}
        </text>
        <text x={PAD.left - 4} y={y(0.5) + 3} textAnchor="end" fontSize="9" fill="var(--ink-3)">
          50%
        </text>
        <text x={PAD.left - 4} y={y(0) + 2} textAnchor="end" fontSize="9" fill="var(--ink-2)" fontWeight="600">
          {away}
        </text>
        {['Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => (
          <text key={q} x={x(i * 720 + 360)} y={H - 4} textAnchor="middle" fontSize="9" fill="var(--ink-3)">
            {q}
          </text>
        ))}
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" />
        {hover && (
          <>
            <line x1={x(hover.t)} x2={x(hover.t)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--ink-3)" />
            <circle cx={x(hover.t)} cy={y(hover.p)} r={4} fill="var(--accent)" stroke="var(--panel)" strokeWidth={2} />
          </>
        )}
      </svg>
      <p className="mt-1 text-[0.6875rem]" style={{ color: 'var(--ink-3)' }}>
        Our estimate from the score and time left, with a home edge; it doesn&apos;t know who&apos;s the better team.
      </p>
    </figure>
  );
}
