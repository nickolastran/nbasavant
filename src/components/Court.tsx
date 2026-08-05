/**
 * Half court in NBA tracking coordinates: tenths of a foot, origin at the
 * basket, +y toward half court. Every real dimension is here so shot marks
 * land where they actually happened.
 */
export const COURT = {
  minX: -250, maxX: 250,
  minY: -55, maxY: 425,
  width: 500, height: 480,
};

export function CourtLines({ stroke = 'var(--hardwood)' }: { stroke?: string }) {
  const s = { stroke, strokeWidth: 2, fill: 'none' as const, vectorEffect: 'non-scaling-stroke' as const };
  return (
    <g aria-hidden="true">
      {/* boundary */}
      <rect x={-250} y={-52.5} width={500} height={470} {...s} />
      {/* paint: 16ft wide, baseline to the free throw line */}
      <rect x={-80} y={-52.5} width={160} height={190} {...s} />
      <rect x={-60} y={-52.5} width={120} height={190} {...s} opacity={0.5} />
      {/* free throw circle: solid on the near side, dashed behind the line */}
      <path d="M -60 137.5 A 60 60 0 0 1 60 137.5" {...s} />
      <path d="M 60 137.5 A 60 60 0 0 1 -60 137.5" {...s} strokeDasharray="10 8" opacity={0.7} />
      {/* backboard and rim */}
      <line x1={-30} y1={-12.5} x2={30} y2={-12.5} {...s} strokeWidth={3} />
      <circle cx={0} cy={0} r={7.5} {...s} />
      {/* restricted area */}
      <path d="M -40 0 A 40 40 0 0 0 40 0" {...s} opacity={0.7} />
      {/* three point line: corners then the arc */}
      <line x1={-220} y1={-52.5} x2={-220} y2={89.5} {...s} />
      <line x1={220} y1={-52.5} x2={220} y2={89.5} {...s} />
      <path d="M -220 89.5 A 237.5 237.5 0 0 0 220 89.5" {...s} />
      {/* half court */}
      <line x1={-250} y1={417.5} x2={250} y2={417.5} {...s} />
      <path d="M -60 417.5 A 60 60 0 0 0 60 417.5" {...s} />
    </g>
  );
}
