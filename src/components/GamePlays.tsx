'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { FullCourt, type CourtShot } from '@/components/FullCourt';
import { Headshot } from '@/components/Headshot';
import { TeamMark } from '@/components/TeamMark';
import type { playsFromPbp } from '@/lib/nba';
import { gameClock, winProbability } from '@/lib/stats';

type Play = ReturnType<typeof playsFromPbp>[number];
type Side = { abbr: string; name: string; color: string };

const periodName = (p: number) =>
  p <= 4 ? `${p}${['st', 'nd', 'rd', 'th'][p - 1]} Quarter` : p === 5 ? 'Overtime' : `${p - 4}OT`;
const periodShort = (p: number) => (p <= 4 ? `${p}${['st', 'nd', 'rd', 'th'][p - 1]}` : p === 5 ? 'OT' : `${p - 4}OT`);
const fg = (p: Play) => p.type === '2pt' || p.type === '3pt';

/** Play types, each with the test that picks it out; only the ones in this game are offered. */
const TYPES: { value: string; label: string; test: (p: Play) => boolean }[] = [
  { value: '3pt', label: '3-pointers', test: (p) => p.type === '3pt' },
  { value: '2pt', label: '2-pointers', test: (p) => p.type === '2pt' },
  { value: 'layup', label: 'Layups', test: (p) => fg(p) && /layup/i.test(p.subType) },
  { value: 'dunk', label: 'Dunks', test: (p) => fg(p) && /dunk/i.test(p.subType) },
  { value: 'jump', label: 'Jump shots', test: (p) => fg(p) && /jump/i.test(p.subType) },
  { value: 'hook', label: 'Hook shots', test: (p) => fg(p) && /hook/i.test(p.subType) },
  { value: 'freethrow', label: 'Free throws', test: (p) => p.type === 'freethrow' },
  ...(['rebound', 'turnover', 'steal', 'block', 'foul', 'violation', 'substitution', 'timeout'] as const).map((t) => ({
    value: t,
    label: `${t.charAt(0).toUpperCase()}${t.slice(1)}s`,
    test: (p: Play) => p.type === t,
  })),
];

/** Key plays: every basket, block and steal. */
const key = (p: Play) => (fg(p) && p.made) || p.type === 'block' || p.type === 'steal';

function title(p: Play) {
  if (fg(p)) return p.made ? `+${p.shot!.value} Points` : `Missed ${p.type === '3pt' ? 'three' : 'shot'}`;
  if (p.type === 'freethrow') return p.made ? '+1 Point' : 'Missed free throw';
  if (p.type === 'period') return `${p.subType === 'start' ? 'Start' : 'End'} of ${periodName(p.period).toLowerCase()}`;
  if (p.type === 'game') return 'End of game';
  if (p.type === 'jumpball') return 'Jump ball';
  return p.type ? p.type.charAt(0).toUpperCase() + p.type.slice(1) : 'Play';
}

/**
 * The play-by-play tab. One row of filters (all or key plays, quarter or half,
 * play type, player) drives both the full-court shot chart and the list of
 * plays under it. A shot's row opens to who took it, who assisted or blocked
 * it, and where on the floor it was. Newest first while the game is live.
 */
export function GamePlays({
  plays, live, home, away, players,
}: {
  plays: Play[];
  live: boolean;
  home: Side;
  away: Side;
  players: { id: number; name: string; team: string }[];
}) {
  const [onlyKey, setOnlyKey] = useState(false);
  const [period, setPeriod] = useState('');
  const [type, setType] = useState('');
  const [player, setPlayer] = useState(0);

  const periods = [...new Set(plays.map((p) => p.period))].sort((a, b) => a - b);
  const names = new Map(players.map((p) => [p.id, p.name]));
  const types = TYPES.filter((t) => plays.some(t.test));

  const shown = useMemo(() => {
    const test = TYPES.find((t) => t.value === type)?.test;
    const inPeriod = (p: number) =>
      !period || (period === 'h1' ? p <= 2 : period === 'h2' ? p === 3 || p === 4 : p === Number(period));
    const out = plays.filter(
      (p) =>
        (!onlyKey || key(p)) &&
        inPeriod(p.period) &&
        (!test || test(p)) &&
        (!player || p.playerId === player || p.assistId === player || p.blockId === player),
    );
    return live ? out.reverse() : out;
  }, [plays, live, onlyKey, period, type, player]);

  const shots: CourtShot[] = shown
    .filter((p) => p.shot)
    .map((p) => ({
      x: p.shot!.x, y: p.shot!.y, made: p.made, home: p.teamAbbr === home.abbr,
      title: `${p.description} · ${periodShort(p.period)} ${p.clock}`,
    }));
  const sideOf = (abbr: string) => (abbr === home.abbr ? home : abbr === away.abbr ? away : null);

  const legend = (s: Side) => (
    <div className="flex items-center gap-3">
      <TeamMark abbr={s.abbr} color={s.color} size={32} />
      <div className="space-y-1 text-[0.75rem]" style={{ color: 'var(--ink-2)' }}>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} /> Made
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: s.color }} /> Missed
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Filters: one row, above everything they drive. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded border p-0.5" style={{ borderColor: 'var(--line-2)', background: 'var(--panel)' }}>
          {[
            [false, 'All plays'],
            [true, 'Key plays'],
          ].map(([k, label]) => (
            <button
              key={String(k)}
              type="button"
              aria-pressed={onlyKey === k}
              onClick={() => setOnlyKey(k as boolean)}
              className="rounded px-3 py-1 text-[0.75rem] font-semibold"
              style={onlyKey === k ? { background: 'var(--ink)', color: 'var(--panel)' } : { color: 'var(--ink-2)' }}
            >
              {label as string}
            </button>
          ))}
        </div>
        <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Quarter">
          <option value="">All quarters</option>
          {periods.map((p) => (
            <option key={p} value={p}>
              {periodName(p)}
            </option>
          ))}
          <option value="h1">1st half</option>
          <option value="h2">2nd half</option>
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Play type">
          <option value="">All play types</option>
          {types.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select value={player} onChange={(e) => setPlayer(Number(e.target.value))} aria-label="Player">
          <option value={0}>All players</option>
          {[away, home].map((s) => (
            <optgroup key={s.abbr} label={s.name}>
              {players
                .filter((p) => p.team === s.abbr)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>

      <section className="panel p-3">
        <h2 className="mb-3 border-b pb-2 text-[0.6875rem] font-bold uppercase tracking-[0.12em]" style={{ borderColor: 'var(--line)' }}>
          Shot chart <span className="font-normal normal-case tracking-normal" style={{ color: 'var(--ink-3)' }}>· {shots.length} shots</span>
        </h2>
        <div className="grid items-center gap-4 md:grid-cols-[auto_minmax(0,1fr)_auto]">
          {legend(away)}
          <FullCourt
            shots={shots}
            homeAbbr={home.abbr}
            homeColor={home.color}
            awayColor={away.color}
            label={`${shots.length} shots: ${away.abbr} at the left basket, ${home.abbr} at the right`}
          />
          <div className="md:justify-self-end">{legend(home)}</div>
        </div>
      </section>

      <section className="panel p-3">
        <h2 className="border-b pb-2 text-[0.6875rem] font-bold uppercase tracking-[0.12em]" style={{ borderColor: 'var(--line)' }}>
          Plays <span className="font-normal normal-case tracking-normal" style={{ color: 'var(--ink-3)' }}>· {shown.length} of {plays.length}</span>
        </h2>
        <ol>
          {shown.map((p, i) => {
            const side = sideOf(p.teamAbbr);
            const scored = p.made && (fg(p) || p.type === 'freethrow');
            const homeScored = scored && side === home;
            const { left } = gameClock(p.period, p.clock);
            const chance = winProbability(p.homeScore - p.awayScore, left);
            const fav = chance >= 0.5 ? home : away;
            const newPeriod = i === 0 || shown[i - 1].period !== p.period;
            const body = (
              <div className="flex gap-3 py-2.5">
                <span className="w-6 shrink-0 pt-0.5">{side && <TeamMark abbr={side.abbr} color={side.color} size={22} />}</span>
                {/* A scoring play gets a bar in the scorer's colour. */}
                <span className="w-1 shrink-0 rounded" style={{ background: scored && side ? side.color : 'transparent' }} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{title(p)}</div>
                  <div className="text-[0.6875rem]" style={{ color: 'var(--ink-3)' }}>
                    {p.clock} - {periodShort(p.period)}
                  </div>
                  <div className="text-[0.8125rem]">{p.description}</div>
                  {scored && (
                    <div className="text-[0.6875rem]" style={{ color: 'var(--ink-3)' }}>
                      Win %: {fav.abbr} {(Math.max(chance, 1 - chance) * 100).toFixed(1)}
                    </div>
                  )}
                </div>
                {scored && (
                  <span className="tnum shrink-0 text-sm">
                    <span style={{ fontWeight: homeScored ? 400 : 700 }}>{p.awayScore}</span>
                    <span className="ml-2" style={{ fontWeight: homeScored ? 700 : 400 }}>
                      {p.homeScore}
                    </span>
                  </span>
                )}
                {p.shot && (
                  <span aria-hidden className="shrink-0 pt-0.5 text-xs" style={{ color: 'var(--ink-3)' }}>
                    ▾
                  </span>
                )}
              </div>
            );
            return (
              <li key={p.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
                {newPeriod && (
                  <div className="eyebrow -mx-3 px-3 py-1.5" style={{ background: 'var(--panel-2)' }}>
                    {periodName(p.period)}
                  </div>
                )}
                {p.shot ? (
                  <details>
                    <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">{body}</summary>
                    <div className="mb-3 ml-12 flex flex-wrap items-center gap-3">
                      {[
                        p.playerId && { id: p.playerId, what: p.made ? `+${p.shot.value} PTS` : `Missed ${p.shot.value}PT` },
                        p.assistId && { id: p.assistId, what: 'AST' },
                        p.blockId && { id: p.blockId, what: 'BLK' },
                      ]
                        .filter((c): c is { id: number; what: string } => !!c)
                        .map((c) => (
                          <Link
                            key={c.id}
                            href={`/players/${c.id}`}
                            className="flex w-56 items-center gap-3 rounded p-2.5 no-underline"
                            style={{ background: 'var(--panel-2)', color: 'var(--ink)' }}
                          >
                            <Headshot id={c.id} name="" className="h-11 w-11 shrink-0 rounded-full bg-[var(--panel)] object-cover object-top" />
                            <span>
                              <span className="block text-[0.8125rem] font-semibold">{names.get(c.id) ?? p.player}</span>
                              <span className="text-[0.75rem]" style={{ color: 'var(--ink-2)' }}>
                                {c.what}
                              </span>
                            </span>
                          </Link>
                        ))}
                      <div className="w-72">
                        <FullCourt
                          shots={[{ x: p.shot.x, y: p.shot.y, made: p.made, home: side === home }]}
                          homeAbbr={home.abbr}
                          homeColor={home.color}
                          awayColor={away.color}
                          label={`Where the shot was taken: ${p.description}`}
                        />
                      </div>
                    </div>
                  </details>
                ) : (
                  body
                )}
              </li>
            );
          })}
          {!shown.length && (
            <li className="py-8 text-center text-sm" style={{ color: 'var(--ink-3)' }}>
              No plays match these filters.
            </li>
          )}
        </ol>
      </section>
    </div>
  );
}
