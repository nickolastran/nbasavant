import { CourtLines } from './Court';

export type CourtShot = {
  /** Basket-origin tenths of a foot, as the NBA's play-by-play gives them. */
  x: number;
  y: number;
  made: boolean;
  /** Home shots go at the right basket, away shots at the left, all game. */
  home: boolean;
  /** Hover text. */
  title?: string;
};

/**
 * A full court, 94 by 50 feet, with the home team's logo at center court.
 * Each half is Court.tsx's half court turned to face its basket, so a shot's
 * own coordinates place it: the away team shoots at the left basket, the home
 * team at the right, whichever way they really went that half. Made shots are
 * solid in the team's colour, misses are rings.
 */
export function FullCourt({
  shots, homeAbbr, homeColor, awayColor, label,
}: {
  shots: CourtShot[];
  homeAbbr: string;
  homeColor: string;
  awayColor: string;
  label: string;
}) {
  const mark = (s: CourtShot, i: number) => {
    const color = s.home ? homeColor : awayColor;
    return (
      <circle
        key={i}
        cx={s.x}
        cy={s.y}
        r={7}
        fill={s.made ? color : 'var(--panel)'}
        stroke={s.made ? 'var(--panel)' : color}
        strokeWidth={s.made ? 1.5 : 2.5}
        vectorEffect="non-scaling-stroke"
      >
        {s.title && <title>{s.title}</title>}
      </circle>
    );
  };
  return (
    <svg viewBox="0 0 940 500" className="block w-full" role="img" aria-label={label}>
      <rect width={940} height={500} fill="color-mix(in oklab, var(--hardwood) 38%, var(--panel))" />
      {/* Paint shaded a touch darker, as on a real floor. */}
      <rect x={0} y={170} width={190} height={160} fill="color-mix(in oklab, var(--hardwood) 22%, transparent)" />
      <rect x={750} y={170} width={190} height={160} fill="color-mix(in oklab, var(--hardwood) 22%, transparent)" />
      {/* eslint-disable-next-line @next/next/no-img-element -- an SVG <image>, not an <img> */}
      <image href={`/logos/${homeAbbr}.svg`} x={410} y={190} width={120} height={120} opacity={0.9} />
      <g transform="translate(52.5 250) rotate(-90)">
        <CourtLines />
        {shots.filter((s) => !s.home).map(mark)}
      </g>
      <g transform="translate(887.5 250) rotate(90)">
        <CourtLines />
        {shots.filter((s) => s.home).map(mark)}
      </g>
    </svg>
  );
}
