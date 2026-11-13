import type { WinPoint } from '@/components/WinProbability';

const W = 320;
const H = 120;
const PAD = { top: 8, bottom: 18, left: 72, right: 6 };

/**
 * The running score as a margin line: above the middle the home team leads,
 * below it the away team does. Each side's biggest lead is marked and named,
 * so the chart reads without its colors. Shares the win probability chart's
 * time axis and margins, so the two line up when stacked.
 */
export function ScoreWorm({
  points, length, home, away,
}: {
  points: WinPoint[];
  length: number;
  home: { abbr: string; color: string };
  away: { abbr: string; color: string };
}) {
  const series = points.map((p) => {
    const [a, h] = p.score.split('-').map(Number);
    return { t: p.t, m: h - a, when: p.when };
  });
  if (series.length < 2) return null;
  const peak = Math.max(5, ...series.map((s) => Math.abs(s.m)));
  const x = (t: number) => PAD.left + (t / length) * (W - PAD.left - PAD.right);
  const y = (m: number) => PAD.top + (1 - (m + peak) / (peak * 2)) * (H - PAD.top - PAD.bottom);
  // A step line: the margin holds until the next score.
  const line = series.map((s, i) => (i ? `H${x(s.t).toFixed(1)}V${y(s.m).toFixed(1)}` : `M${x(s.t).toFixed(1)},${y(s.m).toFixed(1)}`)).join('');
  const area = `${line}H${x(series.at(-1)!.t).toFixed(1)}V${y(0)}H${x(0)}Z`;
  const best = series.reduce((a, b) => (b.m > a.m ? b : a));
  const worst = series.reduce((a, b) => (b.m < a.m ? b : a));
  const quarters = [720, 1440, 2160, 2880].filter((t) => t < length);
  const id = `worm-${home.abbr}-${away.abbr}`;
  const summary = `${best.m > 0 ? `${home.abbr} led by as many as ${best.m} (${best.when})` : `${home.abbr} never led`}; ${worst.m < 0 ? `${away.abbr} led by as many as ${-worst.m} (${worst.when})` : `${away.abbr} never led`}.`;

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Score margin through the game. ${summary}`}>
        <defs>
          <clipPath id={`${id}-up`}><rect x={PAD.left} y={PAD.top} width={W} height={y(0) - PAD.top} /></clipPath>
          <clipPath id={`${id}-down`}><rect x={PAD.left} y={y(0)} width={W} height={H} /></clipPath>
        </defs>
        {quarters.map((t) => (
          <line key={t} x1={x(t)} x2={x(t)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--line)" />
        ))}
        <path d={area} fill={home.color} fillOpacity="0.28" clipPath={`url(#${id}-up)`} />
        <path d={area} fill={away.color} fillOpacity="0.28" clipPath={`url(#${id}-down)`} />
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--line-2)" />
        <path d={line} pathLength={1} className="draw-in" fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round" />
        <text x={PAD.left - 4} y={y(peak) + 7} textAnchor="end" fontSize="9" fontWeight="600" fill="var(--ink-2)">{home.abbr} +{peak}</text>
        <text x={PAD.left - 4} y={y(0) + 3} textAnchor="end" fontSize="9" fill="var(--ink-3)">Tied</text>
        <text x={PAD.left - 4} y={y(-peak)} textAnchor="end" fontSize="9" fontWeight="600" fill="var(--ink-2)">{away.abbr} +{peak}</text>
        {best.m > 0 && (
          <g>
            <circle cx={x(best.t)} cy={y(best.m)} r="2.5" fill="var(--ink)" />
            <text x={x(best.t)} y={y(best.m) - 4} textAnchor={best.t > length * 0.85 ? 'end' : 'middle'} fontSize="8.5" fontWeight="700" fill="var(--ink)">+{best.m}</text>
          </g>
        )}
        {worst.m < 0 && (
          <g>
            <circle cx={x(worst.t)} cy={y(worst.m)} r="2.5" fill="var(--ink)" />
            <text x={x(worst.t)} y={y(worst.m) + 10} textAnchor={worst.t > length * 0.85 ? 'end' : 'middle'} fontSize="8.5" fontWeight="700" fill="var(--ink)">+{-worst.m}</text>
          </g>
        )}
        {['Q1', 'Q2', 'Q3', 'Q4'].map((q, i) => (
          <text key={q} x={x(i * 720 + 360)} y={H - 4} textAnchor="middle" fontSize="9" fill="var(--ink-3)">{q}</text>
        ))}
      </svg>
      <figcaption className="mt-1 text-xs" style={{ color: 'var(--ink-2)' }}>{summary}</figcaption>
    </figure>
  );
}
