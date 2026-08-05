'use client';

import { useMemo, useState } from 'react';

export type Play = {
  period: number;
  clock: string;
  description: string;
  eventType: string;
  homeScore: number;
  awayScore: number;
  teamAbbr: string;
};

const TYPES = ['SHOT', 'REBOUND', 'TURNOVER', 'FOUL', 'BLOCK', 'STEAL', 'MISS', 'SUBSTITUTION'];

export function PlayByPlay({ plays }: { plays: Play[] }) {
  const [period, setPeriod] = useState(0);
  const [type, setType] = useState('');
  const [q, setQ] = useState('');

  const filtered = useMemo(
    () =>
      plays.filter(
        (p) =>
          (!period || p.period === period) &&
          (!type || p.eventType === type) &&
          (!q || p.description.toLowerCase().includes(q.toLowerCase())),
      ),
    [plays, period, type, q],
  );

  const periods = [...new Set(plays.map((p) => p.period))].sort();

  return (
    <section className="panel flex max-h-[720px] flex-col overflow-hidden">
      <div className="border-b p-3" style={{ borderColor: 'var(--line)' }}>
        <h2 className="text-sm font-semibold">Play-by-play</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <select value={period} onChange={(e) => setPeriod(Number(e.target.value))} aria-label="Period">
            <option value={0}>All periods</option>
            {periods.map((p) => (
              <option key={p} value={p}>
                Q{p}
              </option>
            ))}
          </select>
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Event type">
            <option value="">All events</option>
            {TYPES.filter((t) => plays.some((p) => p.eventType === t)).map((t) => (
              <option key={t} value={t}>
                {t.charAt(0) + t.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a player or play"
            aria-label="Search plays"
            className="min-w-0 flex-1"
          />
        </div>
      </div>

      <ol className="flex-1 overflow-auto">
        {filtered.map((p, i) => (
          <li
            key={i}
            className="flex items-baseline gap-3 border-b px-3 py-1.5 text-xs"
            style={{ borderColor: 'var(--line)' }}
          >
            <span className="eyebrow w-14 shrink-0 tnum">
              Q{p.period} {p.clock}
            </span>
            <span
              className="w-9 shrink-0 text-[0.6875rem] font-semibold"
              style={{ color: 'var(--ink-3)' }}
            >
              {p.teamAbbr}
            </span>
            <span className="flex-1">{p.description}</span>
            <span className="tnum shrink-0 font-semibold">
              {p.awayScore}-{p.homeScore}
            </span>
          </li>
        ))}
        {!filtered.length && (
          <li className="p-6 text-center text-sm" style={{ color: 'var(--ink-3)' }}>
            No plays match. Clear the search or pick another period.
          </li>
        )}
      </ol>

      <div className="border-t px-3 py-2 text-xs" style={{ borderColor: 'var(--line)', color: 'var(--ink-3)' }}>
        {filtered.length} of {plays.length} events
      </div>
    </section>
  );
}
