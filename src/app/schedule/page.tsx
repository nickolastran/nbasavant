import { Suspense } from 'react';
import Link from 'next/link';
import { latestSeason, prisma } from '@/lib/db';
import { FilterBar } from '@/components/FilterBar';
import { TeamMark } from '@/components/TeamMark';
import { Tip } from '@/components/Tip';
import { ViewTabs } from '@/components/ViewTabs';
import { todayEt } from '@/lib/dates';
import { TEAM_OPTIONS, seasonOptions } from '@/lib/options';

export const metadata = { title: 'Schedule' };
export const revalidate = 60;

const VIEWS = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'results', label: 'Results' },
];

const tag = (g: { kind: string; label: string | null }) =>
  g.kind === 'preseason' ? 'Preseason' : g.kind === 'playoffs' ? 'Playoffs' : g.kind === 'play-in' ? 'Play-In' : g.label;

/**
 * The season's games by day. The current season opens on what's next, in
 * order; a finished one opens on its results, newest first.
 */
export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const [seasons, newest] = await Promise.all([
    prisma.season.findMany({ orderBy: { startYear: 'desc' } }),
    latestSeason(),
  ]);
  const season = seasons.find((s) => s.key === sp.season) ?? newest;
  const today = new Date(`${todayEt()}T00:00:00Z`);
  const upcomingLeft = season
    ? await prisma.game.count({ where: { seasonId: season.id, date: { gte: today } } })
    : 0;
  const view = sp.view === 'results' || sp.view === 'upcoming' ? sp.view : upcomingLeft ? 'upcoming' : 'results';
  const upcoming = view === 'upcoming';

  const games = season
    ? await prisma.game.findMany({
        where: {
          seasonId: season.id,
          date: upcoming ? { gte: today } : { lt: today },
          ...(sp.team
            ? { OR: [{ homeTeam: { abbreviation: sp.team } }, { awayTeam: { abbreviation: sp.team } }] }
            : {}),
        },
        include: { homeTeam: true, awayTeam: true },
        orderBy: [{ date: upcoming ? 'asc' : 'desc' }, { id: 'asc' }],
        take: sp.team ? 100 : 150,
      })
    : [];

  const byDate = new Map<string, typeof games>();
  for (const g of games) {
    const key = g.date.toISOString().slice(0, 10);
    byDate.set(key, [...(byDate.get(key) ?? []), g]);
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold tracking-tight">Schedule</h1>
      <p className="mb-4 text-sm" style={{ color: 'var(--ink-2)' }}>
        {season?.key}, {upcoming ? `the next ${games.length} games` : `${games.length} most recent results`}
        {sp.team ? ` for ${sp.team}` : ''}. Tip-off times are Eastern. Open a game for its box score.
      </p>

      <Suspense>
        <FilterBar
          fields={[
            { kind: 'select', name: 'season', label: 'Season', options: seasonOptions(seasons), defaultValue: season?.key },
            { kind: 'select', name: 'team', label: 'Team', options: TEAM_OPTIONS },
          ]}
        />
      </Suspense>
      <ViewTabs views={VIEWS} current={view} params={Object.fromEntries(Object.entries(sp).filter(([k]) => k !== 'view'))} />

      {!games.length && (
        <p className="panel p-6 text-center text-sm" style={{ color: 'var(--ink-2)' }}>
          {upcoming ? 'Nothing left on this schedule.' : 'No results yet.'} Try the other tab or another season.
        </p>
      )}

      <div className="space-y-6">
        {[...byDate].map(([date, list]) => (
          <section key={date}>
            <h2 className="eyebrow mb-2">
              {new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
              })}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((g) => {
                const final = g.status.startsWith('Final');
                const homeWon = g.homeScore > g.awayScore;
                return (
                  <Link
                    key={g.id}
                    href={`/games/${g.id}`}
                    className="panel block overflow-hidden no-underline transition-transform hover:-translate-y-0.5"
                    style={{ color: 'var(--ink)' }}
                  >
                    <div className="flex">
                      <span className="w-1" style={{ background: g.awayTeam.primaryColor }} />
                      <span className="w-1" style={{ background: g.homeTeam.primaryColor }} />
                      <div className="flex-1 p-3">
                        {[
                          { t: g.awayTeam, score: g.awayScore, won: final && !homeWon },
                          { t: g.homeTeam, score: g.homeScore, won: final && homeWon },
                        ].map(({ t, score, won }) => (
                          <div key={t.id} className="flex items-center gap-2 py-0.5">
                            <TeamMark abbr={t.abbreviation} color={t.primaryColor} size={18} />
                            <span className={`flex-1 ${won ? 'font-semibold' : ''}`}>
                              {t.city} {t.name}
                            </span>
                            {final && (
                              <span
                                className={`tnum text-lg ${won ? 'font-bold' : ''}`}
                                style={{ color: won ? 'var(--ink)' : 'var(--ink-2)' }}
                              >
                                {score}
                              </span>
                            )}
                          </div>
                        ))}
                        <div className="mt-1 flex justify-between gap-2">
                          <span className="eyebrow" style={final ? undefined : { color: 'var(--accent)' }}>
                            <Tip day={date} status={g.status} />
                          </span>
                          {tag(g) && <span className="eyebrow truncate">{tag(g)}</span>}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
