import { Suspense } from 'react';
import Link from 'next/link';
import { prisma, getSeason } from '@/lib/db';
import { FilterBar } from '@/components/FilterBar';
import { TEAM_OPTIONS, seasonOptions } from '@/lib/options';

export const metadata = { title: 'Games' };
export const revalidate = 60;

export default async function GamesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const active = await getSeason();
  const seasonKey = sp.season || active?.key;
  const seasons = await prisma.season.findMany({ orderBy: { startYear: 'desc' } });

  const games = await prisma.game.findMany({
    where: {
      season: { key: seasonKey },
      ...(sp.date
        ? { date: { gte: new Date(sp.date), lt: new Date(Date.parse(sp.date) + 864e5) } }
        : {}),
      ...(sp.team
        ? {
            OR: [
              { homeTeam: { abbreviation: sp.team } },
              { awayTeam: { abbreviation: sp.team } },
            ],
          }
        : {}),
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { date: 'desc' },
    take: 120,
  });

  const byDate = new Map<string, typeof games>();
  for (const g of games) {
    const key = g.date.toISOString().slice(0, 10);
    byDate.set(key, [...(byDate.get(key) ?? []), g]);
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold tracking-tight">Games</h1>
      <p className="mb-4 text-sm" style={{ color: 'var(--ink-2)' }}>
        {games.length} games in {seasonKey}. Open one for the box score and play-by-play.
      </p>

      <Suspense>
        <FilterBar
          fields={[
            { kind: 'select', name: 'season', label: 'Season', options: seasonOptions(seasons) },
            { kind: 'select', name: 'team', label: 'Team', options: TEAM_OPTIONS },
            { kind: 'text', name: 'date', label: 'Date', placeholder: 'YYYY-MM-DD' },
          ]}
        />
      </Suspense>

      {!games.length && (
        <p className="panel p-6 text-center text-sm" style={{ color: 'var(--ink-2)' }}>
          No games match these filters. Try another date or clear the team.
        </p>
      )}

      <div className="space-y-6">
        {[...byDate].map(([date, list]) => (
          <section key={date}>
            <h2 className="eyebrow mb-2">
              {new Date(date).toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
              })}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((g) => {
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
                          { t: g.awayTeam, score: g.awayScore, won: !homeWon },
                          { t: g.homeTeam, score: g.homeScore, won: homeWon },
                        ].map(({ t, score, won }) => (
                          <div key={t.id} className="flex items-baseline justify-between py-0.5">
                            <span className={won ? 'font-semibold' : ''}>
                              {t.city} {t.name}
                            </span>
                            <span
                              className={`tnum text-lg ${won ? 'font-bold' : ''}`}
                              style={{ color: won ? 'var(--ink)' : 'var(--ink-2)' }}
                            >
                              {score}
                            </span>
                          </div>
                        ))}
                        <div className="eyebrow mt-1">{g.status}</div>
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
