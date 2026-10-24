import { Suspense } from 'react';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { AutoRefresh } from '@/components/AutoRefresh';
import { FilterBar } from '@/components/FilterBar';
import { TeamMark } from '@/components/TeamMark';
import { Tip } from '@/components/Tip';
import { shiftDay, tipAt, todayEt } from '@/lib/dates';
import { liveScoreboard, type LiveGame } from '@/lib/live';
import type { Broadcast, GameLeaders } from '@/lib/nba';
import { TEAM_OPTIONS } from '@/lib/options';
import { ScheduleDate } from './date';

export const metadata = { title: 'Schedule' };
export const revalidate = 60;

const tag = (g: { kind: string; label: string | null }) =>
  g.kind === 'preseason' ? 'Preseason' : g.kind === 'playoffs' ? 'Playoffs' : g.kind === 'play-in' ? 'Play-In' : g.label;

/** "Los Angeles" twice in one row is no help; the Clippers go by LA, as the league prints it. */
const place = (t: { abbreviation: string; city: string }) => (t.abbreviation === 'LAC' ? 'LA' : t.city);

const dayLabel = (day: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });

/**
 * A week of games from `date` (today by default), one table per day: what's
 * still to come or in progress with its tip-off and national TV, then the
 * day's results with each side's top scorer. Picking a team lists its whole
 * season instead. Today's rows follow the live feed.
 */
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const today = todayEt();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? sp.date : today;
  const team = TEAM_OPTIONS.some((o) => o.value && o.value === sp.team) ? sp.team : undefined;

  // A team's schedule is its season: the one this date falls in (seasons tip off in October).
  const [y, m] = date.split('-').map(Number);
  const season = team ? await prisma.season.findFirst({ where: { startYear: m >= 8 ? y : y - 1 } }) : null;

  const games = await prisma.game.findMany({
    where: team
      ? { seasonId: season?.id ?? -1, OR: [{ homeTeam: { abbreviation: team } }, { awayTeam: { abbreviation: team } }] }
      : { date: { gte: new Date(`${date}T00:00:00Z`), lt: new Date(`${shiftDay(date, 7)}T00:00:00Z`) } },
    include: { homeTeam: true, awayTeam: true },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  });

  // The live feed covers today, or last night until the NBA rolls it over.
  const showsToday = games.some((g) => g.date.toISOString().slice(0, 10) >= shiftDay(today, -1) && g.date.toISOString().slice(0, 10) <= today);
  const board = showsToday ? await liveScoreboard() : null;
  const live = new Map<string, LiveGame>((board?.games ?? []).map((l) => [l.gameCode, l]));

  const rows = games.map((g) => {
    const l = live.get(g.gameCode);
    const day = g.date.toISOString().slice(0, 10);
    return {
      ...g,
      day,
      state: l?.state ?? (g.status.startsWith('Final') ? 'final' : 'pre'),
      shown: l?.status ?? g.status,
      awayScore: l?.away.score ?? g.awayScore,
      homeScore: l?.home.score ?? g.homeScore,
      leaders: l?.state === 'final' ? { home: l.home.leader, away: l.away.leader } : (g.leaders as GameLeaders | null),
      // National outlets only; local ones are marked "(home)" or "(away)".
      tv: ((g.broadcast as Broadcast | null)?.tv ?? []).filter((n) => !/\((home|away)\)$/.test(n)),
      // The database keeps the scheduled tip-off until the game is final, so it orders live games too.
      tip: tipAt(day, g.status)?.getTime() ?? Infinity,
    };
  });
  type Row = (typeof rows)[number];

  // A week reads as one section per day; a team's season as its results, then what's left.
  const sections: { title: string; list: Row[] }[] = [];
  if (team) {
    sections.push({ title: 'Results', list: rows.filter((r) => r.state === 'final') });
    sections.push({ title: 'Upcoming', list: rows.filter((r) => r.state !== 'final') });
  } else {
    const byDay = new Map<string, Row[]>();
    for (const r of rows) byDay.set(r.day, [...(byDay.get(r.day) ?? []), r]);
    for (const [day, list] of byDay) sections.push({ title: dayLabel(day, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), list });
  }

  const strip = [-3, -2, -1, 0, 1, 2, 3].map((n) => shiftDay(date, n));
  const href = (d: string) => `/schedule?date=${d}`;
  const th = 'eyebrow border-b px-3 py-2 text-left font-semibold whitespace-nowrap';
  const td = 'border-b px-3 py-2 align-middle';
  const line = { borderColor: 'var(--line)' };

  /** Column widths, shared by every table so the days line up. */
  const W = { date: '7.5rem', matchup: '22rem' };

  const matchup = (r: Row) => (
    <span className="flex items-center gap-2">
      {[r.awayTeam, null, r.homeTeam].map((t, i) =>
        t ? (
          <Link
            key={t.id}
            href={`/teams/${t.abbreviation}`}
            className="flex w-36 shrink-0 items-center gap-2 no-underline hover:underline"
            style={{ color: 'var(--ink)' }}
          >
            <TeamMark abbr={t.abbreviation} color={t.primaryColor} size={20} />
            <span className="truncate">{place(t)}</span>
          </Link>
        ) : (
          <span key={i} style={{ color: 'var(--ink-3)' }}>
            @
          </span>
        ),
      )}
    </span>
  );

  const high = (l: GameLeaders[keyof GameLeaders] | undefined) =>
    l ? (
      <Link href={`/players/${l.playerId}`} className="no-underline hover:underline" style={{ color: 'var(--ink)' }}>
        {l.name} <span style={{ color: 'var(--ink-3)' }}>{l.pts} Pts</span>
      </Link>
    ) : (
      <span style={{ color: 'var(--ink-3)' }}>—</span>
    );

  /** The leading cells every row shares: the date (team view only), the matchup, and any Cup or playoff tag. */
  const lead = (r: Row) => (
    <>
      {team && (
        <td className={`${td} whitespace-nowrap`} style={{ ...line, color: 'var(--ink-2)' }}>
          {dayLabel(r.day, { weekday: 'short', month: 'short', day: 'numeric' })}
        </td>
      )}
      <td className={td} style={line}>
        {matchup(r)}
        {tag(r) && <span className="eyebrow mt-0.5 block truncate">{tag(r)}</span>}
      </td>
    </>
  );
  const head = (cols: string[]) => (
    <thead>
      <tr style={{ background: 'var(--panel-2)' }}>
        {team && <th className={th} style={{ ...line, width: W.date }}>Date</th>}
        <th className={th} style={{ ...line, width: W.matchup }}>Matchup</th>
        {cols.map((c) => (
          <th key={c} className={th} style={line}>
            {c}
          </th>
        ))}
      </tr>
    </thead>
  );
  const table = 'w-full min-w-[46rem] table-fixed text-sm';

  return (
    <div className="mx-auto max-w-5xl">
      <AutoRefresh active={rows.some((r) => r.state === 'live')} seconds={30} />
      <h1 className="mb-1 text-xl font-bold tracking-tight">{team ? `${team} schedule` : 'Schedule'}</h1>
      <p className="mb-4 text-sm" style={{ color: 'var(--ink-2)' }}>
        {team
          ? `Every ${team} game in ${season?.key ?? 'this season'}.`
          : 'A week of games from the day you pick.'}{' '}
        Tip-off times are in your time zone. Open a result for its box score.
      </p>

      <Suspense>
        <FilterBar fields={[{ kind: 'select', name: 'team', label: 'Team schedule', options: TEAM_OPTIONS, logos: true }]} />
      </Suspense>

      {!team && (
        <nav aria-label="Pick a day" className="panel mb-6 flex items-center gap-1 px-2 py-2">
          <Link href={href(shiftDay(date, -7))} aria-label="Previous week" className="px-2 text-lg no-underline" style={{ color: 'var(--accent)' }}>
            ‹
          </Link>
          <ol className="grid flex-1 grid-cols-7">
            {strip.map((d) => {
              const on = d === date;
              return (
                <li key={d}>
                  <Link
                    href={href(d)}
                    aria-current={on ? 'date' : undefined}
                    className="block rounded py-1.5 text-center no-underline transition-colors hover:bg-[var(--panel-2)]"
                    style={{ color: on ? 'var(--ink)' : 'var(--ink-2)', boxShadow: on ? 'inset 0 -2px 0 var(--accent)' : undefined }}
                  >
                    <span className={`block text-xs uppercase ${on ? 'font-bold' : ''}`}>{dayLabel(d, { weekday: 'short' })}</span>
                    <span className="eyebrow block" style={on ? { color: 'var(--ink)' } : undefined}>
                      {dayLabel(d, { month: 'short', day: 'numeric' })}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
          <Link href={href(shiftDay(date, 7))} aria-label="Next week" className="px-2 text-lg no-underline" style={{ color: 'var(--accent)' }}>
            ›
          </Link>
          <ScheduleDate date={date} />
        </nav>
      )}

      {!rows.length && (
        <p className="panel p-6 text-center text-sm" style={{ color: 'var(--ink-2)' }}>
          {team ? `No ${team} games on record for ${season?.key ?? 'this season'}.` : 'No games this week.'}
        </p>
      )}

      <div className="space-y-8">
        {sections
          .filter((sec) => sec.list.length)
          .map(({ title, list }) => {
            const ahead = list.filter((r) => r.state !== 'final').sort((a, b) => a.day.localeCompare(b.day) || a.tip - b.tip || a.id - b.id);
            const done = list.filter((r) => r.state === 'final');
            return (
              <section key={title}>
                <h2 className="mb-2 text-base font-bold tracking-tight">{title}</h2>
                <div className="panel overflow-x-auto">
                  {ahead.length > 0 && (
                    <table className={table}>
                      {head(['Time', 'TV'])}
                      <tbody>
                        {ahead.map((r) => (
                          <tr key={r.id}>
                            {lead(r)}
                            <td className={`${td} whitespace-nowrap`} style={line}>
                              <Link
                                href={`/games/${r.id}`}
                                className="inline-flex items-center gap-1.5 no-underline hover:underline"
                                style={{ color: r.state === 'live' ? 'var(--hot)' : 'var(--ink)' }}
                              >
                                {r.state === 'live' && (
                                  <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: 'var(--hot)' }} />
                                )}
                                {r.state === 'live' && <span className="sr-only">Live: </span>}
                                <Tip day={r.day} status={r.shown} />
                              </Link>
                            </td>
                            <td className={td} style={{ ...line, color: 'var(--ink-2)' }}>
                              {r.tv.join(', ')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {done.length > 0 && (
                    <table className={table}>
                      {head(['Result', 'Winner high', 'Loser high'])}
                      <tbody>
                        {done.map((r) => {
                          const homeWon = r.homeScore > r.awayScore;
                          const [w, l] = homeWon
                            ? [[r.homeTeam.abbreviation, r.homeScore], [r.awayTeam.abbreviation, r.awayScore]]
                            : [[r.awayTeam.abbreviation, r.awayScore], [r.homeTeam.abbreviation, r.homeScore]];
                          return (
                            <tr key={r.id}>
                              {lead(r)}
                              <td className={`${td} tnum whitespace-nowrap`} style={line}>
                                <Link href={`/games/${r.id}`} className="no-underline hover:underline" style={{ color: 'var(--ink)' }}>
                                  <strong>
                                    {w[0]} {w[1]}
                                  </strong>
                                  , {l[0]} {l[1]}
                                  {r.shown !== 'Final' && <span style={{ color: 'var(--ink-3)' }}> ({r.shown.replace('Final/', '')})</span>}
                                </Link>
                              </td>
                              <td className={td} style={line}>
                                {high(homeWon ? r.leaders?.home : r.leaders?.away)}
                              </td>
                              <td className={td} style={line}>
                                {high(homeWon ? r.leaders?.away : r.leaders?.home)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>
            );
          })}
      </div>
    </div>
  );
}
