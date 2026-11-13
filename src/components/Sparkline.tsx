/**
 * A word-sized trend line. No axes: the shape is the message, the last point
 * is marked, and the label says in words where it started and ended.
 */
export function Sparkline({
  values, width = 72, height = 20, label, color = 'var(--ink-2)', zero,
}: {
  values: number[];
  width?: number;
  height?: number;
  /** What the series is: "Points per game, last 10 game days". */
  label: string;
  color?: string;
  /** Draw a baseline at this value (0 for a plus/minus series). */
  zero?: number;
}) {
  if (values.length < 2) return null;
  const [lo, hi] = [Math.min(...values, zero ?? Infinity), Math.max(...values, zero ?? -Infinity)];
  const pad = 2.5;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => (hi === lo ? height / 2 : height - pad - ((v - lo) / (hi - lo)) * (height - pad * 2));
  const last = values.length - 1;
  const dp = Math.abs(values[last]) < 10 ? 1 : 0;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={`${label}: from ${values[0].toFixed(dp)} to ${values[last].toFixed(dp)}`}
      className="shrink-0 overflow-visible"
    >
      {zero !== undefined && <line x1={pad} x2={width - pad} y1={y(zero)} y2={y(zero)} stroke="var(--line-2)" strokeDasharray="2 2" />}
      <polyline
        points={values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={x(last)} cy={y(values[last])} r="2.5" fill={color} />
    </svg>
  );
}
