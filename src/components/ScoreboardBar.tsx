'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

type Game = {
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
};

const mmdd = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
const today = () => new Date().toISOString().slice(0, 10);
const shift = (iso: string, days: number) =>
  new Date(Date.parse(iso) + days * 864e5).toISOString().slice(0, 10);

/**
 * The three relocated franchises predate nba.com's logo CDN, so they fall back
 * to a colour block. Everyone else gets the real mark from `public/logos`.
 */
function TeamMark({ abbr, color }: { abbr: string; color: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <span className="h-6 w-6 shrink-0 rounded" style={{ background: color }} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/logos/${abbr}.svg`}
      alt=""
      width={24}
      height={24}
      className="h-6 w-6 shrink-0 object-contain"
      onError={() => setBroken(true)}
    />
  );
}

function GameTile({ g }: { g: Game }) {
  const played = g.status.startsWith('Final'); // 'Final', or 'Final/2OT'
  const side = (abbr: string, score: number, color: string, won: boolean) => (
    <div className="flex items-center gap-2">
      <TeamMark abbr={abbr} color={color} />
      <span
        className="w-9 text-sm"
        style={{ fontWeight: won ? 700 : 500, color: won ? 'var(--ink)' : 'var(--ink-2)' }}
      >
        {abbr}
      </span>
      <span className="tnum w-7 text-right text-sm" style={{ fontWeight: won ? 700 : 400 }}>
        {played ? score : ''}
      </span>
    </div>
  );

  return (
    <Link
      href={`/games/${g.id}`}
      title={`${g.awayName} at ${g.homeName}`}
      className="flex shrink-0 items-center gap-3 border-r px-4 py-2 no-underline transition-colors hover:bg-[var(--panel-2)]"
      style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}
    >
      <div className="space-y-1">
        {side(g.away, g.awayScore, g.awayColor, played && g.awayScore > g.homeScore)}
        {side(g.home, g.homeScore, g.homeColor, played && g.homeScore > g.awayScore)}
      </div>
      <span
        className="self-end whitespace-nowrap text-[0.6875rem] font-semibold uppercase tracking-wide"
        style={{ color: played ? 'var(--accent)' : 'var(--ink-3)' }}
      >
        {g.status}
      </span>
    </Link>
  );
}

/**
 * One day's slate under the nav: date on the left, games in schedule order,
 * arrows scrolling the strip. The date cell is a native date input laid over
 * its own label, so clicking it opens the OS calendar.
 */
export function ScoreboardBar() {
  const [date, setDate] = useState('');
  const [games, setGames] = useState<Game[]>([]);
  const [busy, setBusy] = useState(true);
  const picker = useRef<HTMLInputElement>(null);
  const strip = useRef<HTMLDivElement>(null);

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
        strip.current?.scrollTo({ left: 0 });
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

  const scroll = (dir: 1 | -1) =>
    strip.current?.scrollBy({ left: dir * (strip.current.clientWidth * 0.8), behavior: 'smooth' });

  const arrow =
    'px-3 text-lg leading-none transition-colors hover:bg-[var(--panel-2)] disabled:opacity-30';

  return (
    <div className="border-b" style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}>
      {/* A tile is 68px tall (two 24px marks + 4px gap + 8px padding each side);
          pin the row to that so an empty or loading day is the same height. */}
      <div className="mx-auto flex min-h-[68px] max-w-[1440px] items-stretch">
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
          className="relative flex shrink-0 items-center border-r px-4"
          style={{ borderColor: 'var(--line)' }}
          title="Pick a date"
        >
          <span className="tnum text-base font-bold">{date ? mmdd(date) : '—'}</span>
          <input
            ref={picker}
            type="date"
            value={date}
            onChange={(e) => e.target.value && load(`date=${e.target.value}`)}
            aria-label="Show games from this date"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </div>

        <div ref={strip} className="no-scrollbar flex flex-1 items-stretch overflow-x-auto">
          {games.map((g) => (
            <GameTile key={g.id} g={g} />
          ))}
          {!games.length && (
            <div className="flex items-center px-4 text-sm" style={{ color: 'var(--ink-3)' }}>
              {busy ? 'Loading…' : 'No games on this date'}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-stretch border-l" style={{ borderColor: 'var(--line)' }}>
          <button onClick={() => scroll(-1)} disabled={busy} aria-label="Scroll games left" className={arrow}>
            ‹
          </button>
          <button onClick={() => scroll(1)} disabled={busy} aria-label="Scroll games right" className={arrow}>
            ›
          </button>
        </div>
      </div>
    </div>
  );
}
