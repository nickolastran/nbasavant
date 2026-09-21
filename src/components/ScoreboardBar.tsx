'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TeamMark } from '@/components/TeamMark';

export type Game = {
  id: number;
  date: string;
  status: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  homeColor: string;
  awayColor: string;
  homeName: string;
  awayName: string;
  homeRecord: string;
  awayRecord: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const shift = (iso: string, days: number) =>
  new Date(Date.parse(iso) + days * 864e5).toISOString().slice(0, 10);

/** "MON, SEP 21, 2026" — the date the way a scoreboard prints it. */
const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`)
    .toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    })
    .toUpperCase();

/** Scheduled games carry their tip-off in `status` ("7:30p"); finals say "Final". */
const isFinal = (status: string) => status.startsWith('Final');

export function GameCard({ g }: { g: Game }) {
  const played = isFinal(g.status);
  const side = (abbr: string, score: number, record: string, color: string, won: boolean) => (
    <div className="flex items-center gap-2">
      <TeamMark abbr={abbr} color={color} size={22} />
      <span className="text-sm" style={{ fontWeight: won ? 700 : 600 }}>
        {abbr}
      </span>
      <span className="tnum text-[0.6875rem]" style={{ color: 'var(--ink-3)' }}>
        {record}
      </span>
      <span
        className="tnum ml-auto pl-3 text-sm"
        style={{ fontWeight: won ? 700 : 400, color: played ? 'var(--ink)' : 'var(--ink-3)' }}
      >
        {played ? score : '—'}
      </span>
    </div>
  );

  return (
    <Link
      href={`/games/${g.id}`}
      title={`${g.awayName} at ${g.homeName}`}
      className="panel flex h-full w-full flex-col gap-1.5 p-3 no-underline transition-colors hover:bg-[var(--panel-2)]"
      style={{ color: 'var(--ink)' }}
    >
      <span
        className="text-[0.6875rem] font-semibold"
        style={{ color: played ? 'var(--ink-3)' : 'var(--accent)' }}
      >
        {g.status}
      </span>
      {side(g.away, g.awayScore, g.awayRecord, g.awayColor, played && g.awayScore > g.homeScore)}
      {side(g.home, g.homeScore, g.homeRecord, g.homeColor, played && g.homeScore > g.awayScore)}
    </Link>
  );
}

/**
 * One day's slate under the nav: a labelled date picker, the day's cards, and
 * arrows that walk to the previous/next day that actually has games. The date
 * button is a native date input laid over its own label, so clicking it opens
 * the OS calendar.
 */
export function ScoreboardBar() {
  const [date, setDate] = useState('');
  const [games, setGames] = useState<Game[]>([]);
  const [busy, setBusy] = useState(true);
  const picker = useRef<HTMLInputElement>(null);

  /** `query` is one of date=/before=/after=, or '' for the latest slate. */
  const load = useCallback(async (query: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/games?limit=30&${query}`);
      const rows: Game[] = res.ok ? await res.json() : [];
      if (rows.length) {
        // before/after land on whichever day has games; that day is row 0.
        setDate(rows[0].date);
        setGames(rows.filter((g) => g.date === rows[0].date));
        return rows.length;
      }
      if (query.startsWith('date=')) {
        setDate(query.slice(5));
        setGames([]);
      }
      return 0;
    } catch {
      setGames([]);
      return 0;
    } finally {
      setBusy(false);
    }
  }, []);

  // Open on the next day that has games; in the off-season fall back to the
  // last one played.
  useEffect(() => {
    load(`after=${shift(today(), -1)}`).then((n) => {
      if (!n) load(`before=${today()}`);
    });
  }, [load]);

  const step = (dir: 1 | -1) =>
    date && load(dir === 1 ? `after=${date}` : `before=${date}`);

  const arrow =
    'flex h-7 w-7 items-center justify-center rounded border text-base leading-none transition-colors hover:bg-[var(--panel-2)] disabled:opacity-30';

  return (
    <div className="border-b" style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}>
      <div className="mx-auto max-w-[1440px] px-4 py-3">
        <div className="mb-2 flex items-center gap-3">
          <span className="eyebrow">Scoreboard</span>

          <div
            // Chrome only opens the calendar from the input's own icon, and ours
            // is invisible, so ask for it directly on any click in the cell.
            onClick={() => {
              try {
                picker.current?.showPicker();
              } catch {
                picker.current?.focus();
              }
            }}
            className="relative flex items-center gap-1.5 rounded border px-2.5 py-1"
            style={{ borderColor: 'var(--line-2)', background: 'var(--panel)' }}
            title="Pick a date"
          >
            <span aria-hidden className="text-[0.75rem]" style={{ color: 'var(--ink-3)' }}>
              ▦
            </span>
            <span className="tnum text-[0.6875rem] font-semibold tracking-[0.06em]">
              {date ? longDate(date) : '—'}
            </span>
            <input
              ref={picker}
              type="date"
              value={date}
              onChange={(e) => e.target.value && load(`date=${e.target.value}`)}
              aria-label="Show games from this date"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </div>

          <div className="ml-auto flex gap-1.5">
            <button
              onClick={() => step(-1)}
              disabled={busy || !date}
              aria-label="Previous day with games"
              className={arrow}
              style={{ borderColor: 'var(--line-2)', background: 'var(--panel)' }}
            >
              ‹
            </button>
            <button
              onClick={() => step(1)}
              disabled={busy || !date}
              aria-label="Next day with games"
              className={arrow}
              style={{ borderColor: 'var(--line-2)', background: 'var(--panel)' }}
            >
              ›
            </button>
          </div>
        </div>

        {/* A card is 92px tall; pin the row so an empty or loading day doesn't
            shove the page around. */}
        <div className="no-scrollbar flex min-h-[92px] gap-2.5 overflow-x-auto">
          {games.map((g) => (
            <div key={g.id} className="w-[14.5rem] shrink-0">
              <GameCard g={g} />
            </div>
          ))}
          {!games.length && (
            <div className="flex items-center text-sm" style={{ color: 'var(--ink-3)' }}>
              {busy ? 'Loading…' : 'No games on this date'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
