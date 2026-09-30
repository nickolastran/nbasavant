'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { animate, motion, useMotionValue } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DatePicker } from '@/components/DatePicker';
import { TeamMark } from '@/components/TeamMark';
import { Tip } from '@/components/Tip';
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
  period?: number;
  /** Points by period, OT included: the live feed for today, the box score for finals (2026-27 on). */
  homeLine?: number[];
  awayLine?: number[];
  homeLeader?: LiveLeader | null;
  awayLeader?: LiveLeader | null;
};

/** Scheduled games carry their tip-off in `status` ("7:30 pm ET"); finals say "Final". */
export const stateOf = (g: Game): LiveState => g.state ?? (g.status.startsWith('Final') ? 'final' : 'pre');

function merge(g: Game, l: LiveGame | undefined): Game {
  if (!l) return g;
  return {
    ...g,
    state: l.state,
    status: l.status,
    period: l.period,
    homeLine: l.home.periods,
    awayLine: l.away.periods,
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

export function GameCard({ g }: { g: Game }) {
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
          <Tip day={g.date} status={g.status} />
        </span>
        {tag && (
          <span className="ml-auto truncate font-normal" style={{ color: 'var(--ink-3)' }}>
            {tag}
          </span>
        )}
      </span>
      {side(g.away, g.awayScore, g.awayRecord, g.awayColor, final && g.awayScore > g.homeScore)}
      {side(g.home, g.homeScore, g.homeRecord, g.homeColor, final && g.homeScore > g.awayScore)}
    </Link>
  );
}

/** Home page only; every other section has its own content up top. */
export function ScoreboardBar() {
  return usePathname() === '/' ? <Bar /> : null;
}

/**
 * One day's slate under the nav: a labelled date picker, the day's cards, and
 * arrows that slide the cards a screenful at a time. Days are New York days,
 * the NBA's calendar.
 */
function Bar() {
  const [date, setDate] = useState('');
  const [games, setGames] = useState<Game[]>([]);
  const [busy, setBusy] = useState(true);
  const view = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const [edge, setEdge] = useState({ start: true, end: true });
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

  /** How far the track can slide, and whether the arrows have anywhere to go from `to`. */
  const limits = useCallback((to: number) => {
    const max = Math.max(0, (track.current?.scrollWidth ?? 0) - (view.current?.clientWidth ?? 0));
    setEdge({ start: to >= 0, end: to <= -max });
    return max;
  }, []);

  // A new day starts back at its first game; a resize can add or remove room to slide.
  useEffect(() => {
    x.set(0);
    limits(0);
    const fit = () => limits(x.get());
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [games, x, limits]);

  // Slide by as many whole cards as fit, so a card never ends up cut off on the left.
  const step = (dir: 1 | -1) => {
    const second = track.current?.children[1] as HTMLElement | undefined;
    const card = second?.offsetLeft ?? 1;
    const page = Math.max(1, Math.floor((view.current?.clientWidth ?? 0) / card)) * card;
    const max = limits(x.get());
    const to = Math.min(0, Math.max(-max, x.get() - dir * page));
    limits(to);
    animate(x, to, { type: 'spring', stiffness: 260, damping: 32 });
  };

  const arrow =
    'flex h-7 w-7 items-center justify-center rounded border text-base leading-none transition-colors hover:bg-[var(--panel-2)] disabled:opacity-30';

  return (
    <div className="border-b" style={{ background: 'var(--surface)', borderColor: 'var(--line)' }}>
      <div className="px-4 py-3">
        <div className="mb-2 flex items-center gap-3">
          <span className="eyebrow">Scoreboard</span>

          <DatePicker value={date} onChange={(d) => load(`date=${d}`)} />

          <div className="ml-auto flex gap-1.5">
            <button
              onClick={() => step(-1)}
              disabled={edge.start}
              aria-label="Earlier games"
              className={arrow}
              style={{ borderColor: 'var(--line-2)', background: 'var(--panel)' }}
            >
              ‹
            </button>
            <button
              onClick={() => step(1)}
              disabled={edge.end}
              aria-label="Later games"
              className={arrow}
              style={{ borderColor: 'var(--line-2)', background: 'var(--panel)' }}
            >
              ›
            </button>
          </div>
        </div>

        {/* A card is 92px tall; pin the row so an empty or loading day doesn't
            shove the page around. */}
        <div
          ref={view}
          className="min-h-[92px] overflow-hidden"
          // Tabbing to an off-screen card makes the browser scroll this box;
          // hand that distance to the track instead so the arrows stay in sync.
          onScroll={(e) => {
            const v = e.currentTarget;
            const to = Math.max(-limits(0), x.get() - v.scrollLeft);
            v.scrollLeft = 0;
            x.set(to);
            limits(to);
          }}
        >
          <motion.div ref={track} style={{ x }} className="flex gap-2.5">
            {shown.map((g, i) => (
              <motion.div
                key={g.id}
                className="w-[14.5rem] shrink-0"
                initial={{ opacity: 0, x: -24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3, ease: 'easeOut' }}
              >
                <GameCard g={g} />
              </motion.div>
            ))}
            {!shown.length && (
              <div className="flex min-h-[92px] items-center text-sm" style={{ color: 'var(--ink-3)' }}>
                {busy ? 'Loading…' : 'No games on this date'}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
