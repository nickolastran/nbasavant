'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { TeamMark } from '@/components/TeamMark';
import { shiftDay, todayEt } from '@/lib/dates';
import type { LiveGame, LiveLeader, LiveState } from '@/lib/live';

export type Game = {
  id: number;
  gameCode: string;
  date: string;
  status: string;
  kind: string;
  label: string | null;
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
  /** Filled in from the live feed, for today's games only. */
  state?: LiveState;
  homeLeader?: LiveLeader | null;
  awayLeader?: LiveLeader | null;
};

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

/** Scheduled games carry their tip-off in `status` ("7:30 pm ET"); finals say "Final". */
const stateOf = (g: Game): LiveState => g.state ?? (g.status.startsWith('Final') ? 'final' : 'pre');

function merge(g: Game, l: LiveGame | undefined): Game {
  if (!l) return g;
  return {
    ...g,
    state: l.state,
    status: l.status,
    homeScore: l.home.score,
    awayScore: l.away.score,
    homeRecord: l.home.record || g.homeRecord,
    awayRecord: l.away.record || g.awayRecord,
    homeLeader: l.home.leader,
    awayLeader: l.away.leader,
  };
}

/**
 * Today's cards with the live feed laid over them. Polls every 15 s while a
 * game is on, every minute before tip-off (to catch it), not at all once
 * everything is final — and never while the tab is hidden.
 */
export function useLive(games: Game[], date: string) {
  const [live, setLive] = useState<Record<string, LiveGame>>({});
  const isToday = date === todayEt();

  useEffect(() => {
    if (!isToday || !games.length) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const tick = async () => {
      let next = 60_000;
      if (document.visibilityState === 'visible') {
        try {
          const res = await fetch('/api/live/scoreboard');
          if (res.ok) {
            const board: { games: LiveGame[] } = await res.json();
            if (stopped) return;
            setLive(Object.fromEntries(board.games.map((g) => [g.gameCode, g])));
            if (board.games.some((g) => g.state === 'live')) next = 15_000;
            else if (board.games.every((g) => g.state === 'final')) return;
          }
        } catch {
          // Offline or the feed is down: the database's version stays on screen.
        }
      }
      if (!stopped) timer = setTimeout(tick, next);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [isToday, games]);

  return games.map((g) => merge(g, live[g.gameCode]));
}

const leaderLine = (l: LiveLeader | null | undefined, abbr: string) =>
  l ? `${abbr} ${l.name.split(' ').at(-1)} ${l.pts}p ${l.reb}r ${l.ast}a` : null;

export function GameCard({ g, leaders = false }: { g: Game; leaders?: boolean }) {
  const state = stateOf(g);
  const scored = state !== 'pre';
  const tag = g.kind === 'preseason' ? 'Preseason' : g.kind === 'playoffs' ? 'Playoffs' : g.kind === 'play-in' ? 'Play-In' : g.label;
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
        style={{ fontWeight: won ? 700 : 400, color: scored ? 'var(--ink)' : 'var(--ink-3)' }}
      >
        {scored ? score : '—'}
      </span>
    </div>
  );
  const final = state === 'final';

  return (
    <Link
      href={`/games/${g.id}`}
      title={`${g.awayName} at ${g.homeName}`}
      className="panel flex h-full w-full flex-col gap-1.5 p-3 no-underline transition-colors hover:bg-[var(--panel-2)]"
      style={{ color: 'var(--ink)' }}
    >
      <span className="flex items-center gap-1.5 text-[0.6875rem] font-semibold">
        {state === 'live' && (
          <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: 'var(--hot)' }} />
        )}
        <span style={{ color: state === 'live' ? 'var(--hot)' : final ? 'var(--ink-3)' : 'var(--accent)' }}>
          {state === 'live' && <span className="sr-only">Live: </span>}
          {g.status}
        </span>
        {tag && (
          <span className="ml-auto truncate font-normal" style={{ color: 'var(--ink-3)' }}>
            {tag}
          </span>
        )}
      </span>
      {side(g.away, g.awayScore, g.awayRecord, g.awayColor, final && g.awayScore > g.homeScore)}
      {side(g.home, g.homeScore, g.homeRecord, g.homeColor, final && g.homeScore > g.awayScore)}
      {leaders && (g.awayLeader || g.homeLeader) && (
        <span className="tnum mt-1 border-t pt-1.5 text-[0.6875rem] leading-relaxed" style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}>
          {[leaderLine(g.awayLeader, g.away), leaderLine(g.homeLeader, g.home)].filter(Boolean).map((l) => (
            <span key={l} className="block truncate">
              {l}
            </span>
          ))}
        </span>
      )}
    </Link>
  );
}

/**
 * One day's slate under the nav: a labelled date picker, the day's cards, and
 * arrows that walk to the previous/next day that actually has games. The date
 * button is a native date input laid over its own label, so clicking it opens
 * the OS calendar. Days are New York days, the NBA's calendar.
 */
/** Home page only; every other section has its own content up top. */
export function ScoreboardBar() {
  return usePathname() === '/' ? <Bar /> : null;
}

function Bar() {
  const [date, setDate] = useState('');
  const [games, setGames] = useState<Game[]>([]);
  const [busy, setBusy] = useState(true);
  const picker = useRef<HTMLInputElement>(null);
  const shown = useLive(games, date);

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
    const today = todayEt();
    load(`after=${shiftDay(today, -1)}`).then((n) => {
      if (!n) load(`before=${today}`);
    });
  }, [load]);

  const step = (dir: 1 | -1) =>
    date && load(dir === 1 ? `after=${date}` : `before=${date}`);

  const arrow =
    'flex h-7 w-7 items-center justify-center rounded border text-base leading-none transition-colors hover:bg-[var(--panel-2)] disabled:opacity-30';

  return (
    <div className="border-b" style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}>
      <div className="px-4 py-3">
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
          {shown.map((g) => (
            <div key={g.id} className="w-[14.5rem] shrink-0">
              <GameCard g={g} />
            </div>
          ))}
          {!shown.length && (
            <div className="flex items-center text-sm" style={{ color: 'var(--ink-3)' }}>
              {busy ? 'Loading…' : 'No games on this date'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
