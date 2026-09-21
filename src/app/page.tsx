import Link from 'next/link';
import { prisma, getSeason } from '@/lib/db';
import { ShotChart, type Shot } from '@/components/ShotChart';

export const revalidate = 60;

const LEADER_CATS = [
  { key: 'ppg', label: 'Points per game', fmt: (v: number) => v.toFixed(1) },
  { key: 'rpg', label: 'Rebounds per game', fmt: (v: number) => v.toFixed(1) },
  { key: 'apg', label: 'Assists per game', fmt: (v: number) => v.toFixed(1) },
  { key: 'tsPct', label: 'True shooting %', fmt: (v: number) => `${v.toFixed(1)}%`, minFga: 150 },
  { key: 'usgPct', label: 'Usage %', fmt: (v: number) => `${v.toFixed(1)}%` },
] as const;

export default async function Home() {
  const season = await getSeason();
  if (!season) return <EmptyState />;

  const [leaders, games, topTeams, shots, totals] = await Promise.all([
    Promise.all(
      LEADER_CATS.map(async (c) => ({
        ...c,
        rows: await prisma.playerStats.findMany({
          where: {
            seasonId: season.id,
            gp: { gte: 10 },
            ...('minFga' in c && c.minFga ? { fga: { gte: c.minFga } } : {}),
          },
          orderBy: { [c.key]: 'desc' },
          take: 5,
          include: {
            player: { select: { id: true, fullName: true, team: { select: { abbreviation: true } } } },
          },
        }),
      })),
    ),
    prisma.game.findMany({
      where: { seasonId: season.id },
      orderBy: { date: 'desc' },
      take: 6,
      include: {
        homeTeam: { select: { abbreviation: true } },
        awayTeam: { select: { abbreviation: true } },
      },
    }),
    prisma.teamStats.findMany({
      where: { seasonId: season.id },
      orderBy: { netRtg: 'desc' },
      take: 5,
      include: { team: true },
    }),
    // Every 6th shot: a spread-out sample of the season, and the hex bins look
    // the same as plotting all 50k.
    prisma.$queryRaw<Shot[]>`
      SELECT x, y, made, value, "distanceFt", zone
      FROM shot_data WHERE "seasonId" = ${season.id} AND id % 6 = 0
      LIMIT 9000`,
    prisma.shotData.aggregate({ where: { seasonId: season.id }, _count: { _all: true } }),
  ]);

  return (
    <div className="space-y-8">
      <section className="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Where the {season.key} league shoots</h1>
          <p className="mt-1 max-w-prose text-sm" style={{ color: 'var(--ink-2)' }}>
            Every attempt binned by location and colored by points per shot — red beats the league
            average from that spot, blue trails it. This is the same chart every player and team page
            is built on.
          </p>
          <div className="mt-3">
            <ShotChart
              shots={shots}
              title="League shot profile"
              subtitle={`${totals._count._all.toLocaleString()} attempts · sampled for speed`}
              height={460}
            />
          </div>
        </div>

        <div className="space-y-4">
          <Panel title="Top of the league" href="/team-stats" hrefLabel="All teams">
            <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
              {topTeams.map((t, i) => (
                <li key={t.teamId} className="flex items-center gap-3 py-2">
                  <span className="eyebrow w-4 tnum">{i + 1}</span>
                  <span className="h-6 w-1 rounded-sm" style={{ background: t.team.primaryColor }} />
                  <Link href={`/team-stats?team=${t.team.abbreviation}`} className="link flex-1 text-sm font-medium">
                    {t.team.city} {t.team.name}
                  </Link>
                  <span className="tnum text-sm">
                    {t.wins}-{t.losses}
                  </span>
                  <span className="tnum w-14 text-right text-sm font-semibold" style={{ color: 'var(--hot)' }}>
                    {t.netRtg > 0 ? '+' : ''}
                    {t.netRtg.toFixed(1)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="eyebrow mt-2">Sorted by net rating (points per 100 possessions)</p>
          </Panel>

          <Panel title="Latest games" href="/scores" hrefLabel="All games">
            <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
              {games.map((g) => (
                <li key={g.id}>
                  <Link href={`/games/${g.id}`} className="flex items-center gap-2 py-2 text-sm no-underline" style={{ color: 'var(--ink)' }}>
                    <span className="eyebrow w-16">{g.date.toISOString().slice(5, 10)}</span>
                    <span className="tnum flex-1">
                      {g.awayTeam.abbreviation} {g.awayScore} @ {g.homeTeam.abbreviation} {g.homeScore}
                    </span>
                    <span className="eyebrow">Box score</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold tracking-tight">Season leaders</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {leaders.map((cat) => (
            <div key={cat.key} className="panel p-3">
              <div className="eyebrow mb-2">{cat.label}</div>
              <ol className="space-y-1.5">
                {cat.rows.map((r, i) => (
                  <li key={r.id} className="flex items-baseline gap-2 text-sm">
                    <span className="eyebrow w-3 tnum">{i + 1}</span>
                    <Link href={`/players/${r.player.id}`} className="link flex-1 truncate">
                      {r.player.fullName}
                    </Link>
                    <span className="eyebrow">{r.player.team?.abbreviation}</span>
                    <span className="tnum font-semibold">{cat.fmt(r[cat.key] as number)}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
        <p className="eyebrow mt-2">Minimum 10 games; true shooting also requires 150 attempts.</p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { href: '/explorer', title: 'Stat Explorer', body: 'Sort and filter every player-season, then export it.' },
          { href: '/shots', title: 'Shot Chart Analyzer', body: 'Filter shots by zone, distance, defender and period.' },
          { href: '/compare', title: 'Compare Players', body: 'Up to four players side by side, box score and advanced.' },
          { href: '/teams', title: 'Team Analytics', body: 'Ratings, pace, four factors and defense by position.' },
        ].map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="panel block p-4 no-underline transition-transform hover:-translate-y-0.5"
            style={{ color: 'var(--ink)' }}
          >
            <div className="text-sm font-semibold">{c.title}</div>
            <div className="mt-1 text-xs" style={{ color: 'var(--ink-2)' }}>
              {c.body}
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}

function Panel({
  title, children, href, hrefLabel,
}: {
  title: string; children: React.ReactNode; href?: string; hrefLabel?: string;
}) {
  return (
    <div className="panel p-3">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        {href && (
          <Link href={href} className="link text-xs">
            {hrefLabel}
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="panel p-8 text-center">
      <h1 className="text-lg font-semibold">No seasons in the database yet</h1>
      <p className="mt-2 text-sm" style={{ color: 'var(--ink-2)' }}>
        Run <code>npm run db:seed</code> to load the sample league, or <code>npm run ingest</code> to
        pull live data from stats.nba.com.
      </p>
    </div>
  );
}
