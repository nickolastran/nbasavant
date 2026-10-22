'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DatePicker } from '@/components/DatePicker';
import { Headshot } from '@/components/Headshot';
import { stateOf, useLive, type Game } from '@/components/ScoreboardBar';
import { TeamMark } from '@/components/TeamMark';
import { Tip } from '@/components/Tip';
import type { LiveLeader } from '@/lib/live';

/** A day's cards on /scores, two across, following the live feed when the day is today. */
export function LiveCards({ games, date }: { games: Game[]; date: string }) {
  const shown = useLive(games, date);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {shown.map((g) => (
        <ScoreCard key={g.id} g={g} />
      ))}
    </div>
  );
}

/** The calendar button on /scores: picking a day navigates to it. */
export function ScoresDate({ date }: { date: string }) {
  const router = useRouter();
  return <DatePicker value={date} onChange={(d) => router.push(`/scores?date=${d}`)} />;
}

const periodLabel = (i: number) => (i < 4 ? String(i + 1) : i === 4 ? 'OT' : `${i - 3}OT`);

/**
 * One game: status, a line score (a dash before tip-off), each side's top
 * performer, and the way into the game page. Quarters not played yet stay blank.
 */
function ScoreCard({ g }: { g: Game }) {
  const state = stateOf(g);
  const scored = state !== 'pre';
  const final = state === 'final';
  const tag = g.kind === 'preseason' ? 'Preseason' : g.kind === 'playoffs' ? 'Playoffs' : g.kind === 'play-in' ? 'Play-In' : g.label;
  // The feed zero-fills quarters to come; while live, only `period` of them have happened.
  const played = state === 'live' ? g.period ?? 0 : Infinity;
  const periods = Math.max(4, g.homeLine?.length ?? 0, g.awayLine?.length ?? 0);
  // Quarters sit right against the total; an OT game's extra columns push its quarters left.
  const cols = scored ? periods : 0;
  const hasLine = scored && !!(g.homeLine?.length || g.awayLine?.length);

  const row = (abbr: string, color: string, record: string, line: number[] | undefined, score: number, won: boolean) => (
    <tr>
      <td className="py-1.5">
        <span className="flex items-center gap-2">
          <TeamMark abbr={abbr} color={color} size={22} />
          <Link href={`/teams/${abbr}`} className="text-sm leading-none no-underline hover:underline" style={{ color: 'var(--ink)', fontWeight: won ? 700 : 600 }}>
            {abbr}
          </Link>
          <span className="text-[0.6875rem] leading-none" style={{ color: 'var(--ink-3)' }}>
            {record}
          </span>
        </span>
      </td>
      {hasLine &&
        Array.from({ length: cols }, (_, i) => (
          <td key={i} className="w-7 text-center text-[0.8125rem]" style={{ color: won || !final ? 'var(--ink)' : 'var(--ink-2)' }}>
            {i < played ? line?.[i] ?? '' : ''}
          </td>
        ))}
      <td className="whitespace-nowrap text-right">
        <span
          className="text-lg"
          style={{ fontWeight: won ? 800 : 600, color: !scored ? 'var(--ink-3)' : won || !final ? 'var(--ink)' : 'var(--ink-3)' }}
        >
          {scored ? score : '—'}
        </span>
        <span aria-hidden className="inline-block w-3 text-[0.625rem]" style={{ color: 'var(--ink)' }}>
          {won ? '◀' : ''}
        </span>
      </td>
    </tr>
  );

  const leaders = scored
    ? ([
        [g.away, g.awayLeader],
        [g.home, g.homeLeader],
      ] as [string, LiveLeader | null | undefined][]).filter((x): x is [string, LiveLeader] => !!x[1])
    : [];

  // Status and tag; once there's a line score they ride in its header row, level with 1 2 3 4.
  const head = (
    <div className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em]">
      {state === 'live' && (
        <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: 'var(--hot)' }} />
      )}
      <span style={{ color: state === 'live' ? 'var(--hot)' : final ? 'var(--ink-2)' : 'var(--accent)' }}>
        {state === 'live' && <span className="sr-only">Live: </span>}
        <Tip day={g.date} status={g.status} />
      </span>
      {tag && (
        <span className="ml-auto truncate font-normal normal-case tracking-normal" style={{ color: 'var(--ink-3)' }}>
          {tag}
        </span>
      )}
    </div>
  );

  return (
    <article className="panel flex flex-col p-3">
      {!scored && head}

      <table className={`tnum w-full table-fixed border-collapse ${scored ? '' : 'mt-1'}`}>
        <colgroup>
          <col />
          {hasLine && Array.from({ length: cols }, (_, i) => <col key={i} className="w-7" />)}
          <col className="w-14" />
        </colgroup>
        {scored && (
          <thead>
            <tr className="text-[0.625rem] font-semibold" style={{ color: 'var(--ink-3)' }}>
              <th className="text-left">{head}</th>
              {hasLine &&
                Array.from({ length: cols }, (_, i) => (
                  <th key={i} className="text-center">
                    {periodLabel(i)}
                  </th>
                ))}
              <th className="pr-3 text-right">T</th>
            </tr>
          </thead>
        )}
        <tbody>
          {row(g.away, g.awayColor, g.awayRecord, g.awayLine, g.awayScore, final && g.awayScore > g.homeScore)}
          {row(g.home, g.homeColor, g.homeRecord, g.homeLine, g.homeScore, final && g.homeScore > g.awayScore)}
        </tbody>
      </table>

      {leaders.length > 0 && (
        <div className="mt-2 space-y-1.5 border-t pt-2" style={{ borderColor: 'var(--line)' }}>
          <span className="eyebrow">{final ? 'Top performers' : 'Leading'}</span>
          {leaders.map(([abbr, l]) => (
            <div key={abbr} className="flex items-center gap-2 text-[0.8125rem]">
              <span className="eyebrow w-9">{abbr}</span>
              <Headshot
                id={l.playerId}
                name={l.name}
                className="h-7 w-7 shrink-0 rounded-full bg-[var(--panel-2)] object-cover object-top"
              />
              <span>
                <Link href={`/players/${l.playerId}`} className="font-semibold no-underline hover:underline" style={{ color: 'var(--ink)' }}>
                  {l.name}
                </Link>
                {l.jersey && <span style={{ color: 'var(--ink-3)' }}> #{l.jersey}</span>}
              </span>
              <span aria-hidden style={{ color: 'var(--line-2)' }}>
                |
              </span>
              <span className="tnum" style={{ color: 'var(--ink-2)' }}>
                {l.pts} PTS · {l.reb} REB · {l.ast} AST
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-auto grid grid-cols-2 gap-2 pt-3">
        <Link href={`/games/${g.id}`} className="btn-ghost justify-center text-center uppercase tracking-[0.1em] no-underline">
          Gamecast
        </Link>
        <Link href={`/games/${g.id}?tab=box`} className="btn-ghost justify-center text-center uppercase tracking-[0.1em] no-underline">
          Box score
        </Link>
      </div>
    </article>
  );
}
