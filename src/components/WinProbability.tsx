'use client';

import { useState } from 'react';
import type { Rotation } from '@/lib/live';

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

export type RotationTeam = { id: number; abbr: string; color: string };

const W = 320;
const H = 140;
// The left margin holds the rotation's player names; both charts share it so their time axes line up.
const PAD = { top: 8, bottom: 18, left: 48, right: 6 };
const ROW = 8;
const HEAD = 12;

/**
 * The home team's win chance through the game: one line, 50% dashed across the
 * middle, home's name along the top edge and away's along the bottom (a line
 * near the top means home is likely). Quarter lines underneath; hover for any
 * moment. `length` is the game's full length in seconds (overtime included).
 *
 * With `rotation`, each team's players sit underneath on the same clock, a bar
 * for every spell on the floor, so a run lines up with the lineup that made it.
 * `now` cuts a live game's bars at the latest play.
 */
export function WinProbability({
  points, length, home, away, rotation, teams, now = length,
}: {
  points: WinPoint[];
  length: number;
  home: string;
  away: string;
  rotation?: Rotation | null;
  /** Away first, as the page lists them. */
  teams?: RotationTeam[];
  now?: number;
}) {
  const [hover, setHover] = useState<WinPoint | null>(null);
  if (!points.length) return null;
  const x = (t: number) => PAD.left + (t / length) * (W - PAD.left - PAD.right);
  const y = (p: number) => PAD.top + (1 - p) * (H - PAD.top - PAD.bottom);
  const path = points.map((d, i) => `${i ? 'L' : 'M'}${x(d.t).toFixed(1)},${y(d.p).toFixed(1)}`).join('');
  const last = points.at(-1)!;
  const quarters = [720, 1440, 2160, 2880].filter((t) => t < length);
  const pct = (p: number) => `${Math.round(p * 100)}%`;
  const shown = hover ?? last;
  const leader = shown.p >= 0.5 ? home : away;

  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const t = (((e.clientX - box.left) / box.width) * W - PAD.left) / (W - PAD.left - PAD.right) * length;
    // The last point at or before the pointer: the probability as it stood then.
    let best = points[0];
    for (const d of points) if (d.t <= t) best = d;
    setHover(best);
  };
  const pointer = { onPointerMove: move, onPointerLeave: () => setHover(null) };
  const rows = rotation && teams ? rotationRows(rotation, teams, now) : [];

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
        aria-label={`Win probability: ${home} ${pct(last.p)}, ${away} ${pct(1 - last.p)}`}
        {...pointer}
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

      {rows.length > 0 && (
        <Rotations rows={rows} x={x} quarters={quarters} hover={hover?.t ?? null} pointer={pointer} />
      )}
    </figure>
  );
}

type Spell = { from: number; to: number; diff: number };
type Row = { team: RotationTeam; id: number; name: string; spells: Spell[]; secs: number };

/**
 * Each team's players in the order a box score lists them: starters, then the
 * bench by minutes. Back-to-back stints, quarter breaks included, are one spell.
 */
function rotationRows(rotation: Rotation, teams: RotationTeam[], now: number) {
  return teams.map((team) => {
    const rows = new Map<number, Row>();
    for (const s of rotation.stints) {
      if (s.teamId !== team.id) continue;
      const to = Math.min(s.start + s.seconds, now);
      if (to <= s.start) continue;
      for (const id of s.players) {
        if (!rows.has(id)) rows.set(id, { team, id, name: rotation.names[id] ?? '', spells: [], secs: 0 });
        const r = rows.get(id)!;
        const prev = r.spells.at(-1);
        if (prev && s.start - prev.to < 1) {
          prev.to = to;
          prev.diff += s.pts - s.oppPts;
        } else r.spells.push({ from: s.start, to, diff: s.pts - s.oppPts });
        r.secs += to - s.start;
      }
    }
    const started = (r: Row) => Number(r.spells[0].from === 0);
    return { team, rows: [...rows.values()].sort((a, b) => started(b) - started(a) || b.secs - a.secs) };
  });
}

/**
 * "Q3 4:12" for a moment `t` seconds in. A quarter break is the end of one
 * period ("Q3 0:00") or, for a spell's `start`, the beginning of the next ("Q4 12:00").
 */
function clockAt(t: number, start = false) {
  const u = start ? t + 0.5 : t;
  const period = u <= 2880 ? Math.max(1, Math.ceil(u / 720)) : 4 + Math.ceil((u - 2880) / 300);
  const left = Math.max(0, Math.round((period <= 4 ? period * 720 : 2880 + (period - 4) * 300) - t));
  const name = period <= 4 ? `Q${period}` : period === 5 ? 'OT' : `${period - 4}OT`;
  return `${name} ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

function Rotations({
  rows, x, quarters, hover, pointer,
}: {
  rows: { team: RotationTeam; rows: Row[] }[];
  x: (t: number) => number;
  quarters: number[];
  hover: number | null;
  pointer: Pick<React.SVGProps<SVGSVGElement>, 'onPointerMove' | 'onPointerLeave'>;
}) {
  const height = rows.reduce((h, t) => h + HEAD + t.rows.length * ROW, 0);
  let top = 0;
  return (
    <div className="mt-3 border-t pt-2" style={{ borderColor: 'var(--line)' }}>
      <div className="mb-1 text-[0.6875rem] font-bold uppercase tracking-[0.12em]">Rotations</div>
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full touch-none" role="img" aria-label="Each player's time on the floor" {...pointer}>
        {quarters.map((t) => (
          <line key={t} x1={x(t)} x2={x(t)} y1={0} y2={height} stroke="var(--line)" />
        ))}
        {rows.map(({ team, rows: players }) => {
          const y0 = top;
          top += HEAD + players.length * ROW;
          return (
            <g key={team.id}>
              <text x={PAD.left - 4} y={y0 + 9} textAnchor="end" fontSize="8" fontWeight="700" fill="var(--ink)">
                {team.abbr}
              </text>
              {players.map((r, i) => {
                const y = y0 + HEAD + i * ROW;
                const on = hover !== null && r.spells.some((s) => s.from <= hover && hover < s.to);
                return (
                  <g key={r.id}>
                    <text
                      x={PAD.left - 4}
                      y={y + 5.5}
                      textAnchor="end"
                      fontSize="6.5"
                      fill={on ? 'var(--ink)' : 'var(--ink-2)'}
                      fontWeight={on ? 700 : 400}
                    >
                      {r.name.length > 12 ? `${r.name.slice(0, 11)}…` : r.name}
                    </text>
                    {r.spells.map((s) => (
                      <rect
                        key={s.from}
                        x={x(s.from)}
                        y={y + 1}
                        width={Math.max(0.5, x(s.to) - x(s.from))}
                        height={ROW - 2}
                        rx={1}
                        fill={team.color}
                        opacity={hover === null || on ? 0.9 : 0.35}
                      >
                        <title>{`${r.name}: ${clockAt(s.from, true)} to ${clockAt(s.to)}, ${signed(s.diff)}`}</title>
                      </rect>
                    ))}
                  </g>
                );
              })}
            </g>
          );
        })}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={height} stroke="var(--ink-3)" />}
      </svg>
      <p className="mt-1 text-[0.6875rem]" style={{ color: 'var(--ink-3)' }}>
        Every spell on the floor; hover a bar for its plus-minus.
      </p>
    </div>
  );
}
