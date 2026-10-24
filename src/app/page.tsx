import Link from 'next/link';
import { Suspense } from 'react';
import { prisma, getSeason } from '@/lib/db';
import { Headshot } from '@/components/Headshot';
import { LeaderRail, RailSkeleton, type RailBoard } from '@/components/LeaderRail';
import { Bone } from '@/components/Skeleton';
import { ShotChart, type Shot } from '@/components/ShotChart';
import { TeamMark } from '@/components/TeamMark';
import { todayEt } from '@/lib/dates';
import { fmt } from '@/lib/format';
import type { GameLeaders } from '@/lib/nba';
import { isPerGame, leaderBoards, type Stat } from '@/lib/leaders';

export const revalidate = 60;

/** The hero's two flanks, three boards each dealt at random: box score on the left, advanced on the right. */
const STANDARD: Stat[] = ['ppg', 'rpg', 'apg', 'spg', 'bpg', 'tpm', 'fgPct', 'fg3Pct', 'ftPct'];
const ADVANCED: Stat[] = ['tsPct', 'efgPct', 'usgPct', 'per', 'bpm', 'ws', 'vorp'];

/** The middle column's index of the site, beyond the four tools at the bottom. */
const MODULES = [
  { href: '/scores', title: 'Scores', body: 'Live line scores, box scores, play-by-play and win probability.' },
  { href: '/leaders', title: 'Stat leaders', body: 'Box score and advanced boards for any season, qualified the league’s way.' },
  { href: '/standings', title: 'Standings', body: 'Conference, division and NBA Cup tables, updated after every final.' },
  { href: '/team-stats', title: 'Team stats', body: 'Offensive, defensive and net rating for all thirty teams, per 100 possessions.' },
  { href: '/injuries', title: 'Injury report', body: "Who's out, who's questionable, and why, from the league's own report." },
];

/** Streams: the skeleton paints at once and the page fills in when its queries land. */
export default function Home() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}

async function HomeContent() {
  const season = await getSeason();
  if (!season) return <EmptyState />;

  const today = todayEt();
  const [{ boards, teamStats }, games, topTeams, shots, totals, finals, best, onThisDate] = await Promise.all([
    leaderBoards(season.id, 5),
    prisma.game.findMany({
      where: { seasonId: season.id, status: { startsWith: 'Final' } },
      orderBy: { date: 'desc' },
      take: 6,
      include: {
        homeTeam: { select: { abbreviation: true } },
        awayTeam: { select: { abbreviation: true } },
      },
    }),
    prisma.teamStats.findMany({
      where: { seasonId: season.id },
      // A team that hasn't played has no rating; Postgres would rank those first.
      orderBy: { netRtg: { sort: 'desc', nulls: 'last' } },
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
    prisma.game.count({ where: { seasonId: season.id, kind: { not: 'preseason' }, status: { startsWith: 'Final' } } }),
    // The top scorers on the latest day anyone played.
    prisma.playerGameLog
      .findFirst({ where: { seasonId: season.id }, orderBy: { date: 'desc' }, select: { date: true } })
      .then((last) =>
        last
          ? prisma.playerGameLog.findMany({
              where: { seasonId: season.id, date: last.date },
              orderBy: [{ pts: 'desc' }, { reb: 'desc' }],
              take: 4,
              include: {
                player: { select: { fullName: true } },
                team: { select: { abbreviation: true, primaryColor: true } },
              },
            })
          : [],
      ),
    // On this date in past seasons, the most dramatic first: more overtimes, then
    // the closest finish, then the most points. Final scores reach back to 1946-47.
    prisma.$queryRaw<{ id: number; date: Date; homeScore: number; awayScore: number; status: string; homeTeamId: number; awayTeamId: number; leaders: GameLeaders | null }[]>`
      SELECT id, date, "homeScore", "awayScore", status, "homeTeamId", "awayTeamId", leaders
      FROM games
      WHERE to_char(date, 'MM-DD') = ${today.slice(5)} AND date < ${today}::date
        AND status LIKE 'Final%' AND kind <> 'preseason'
      ORDER BY period DESC, abs("homeScore" - "awayScore"), "homeScore" + "awayScore" DESC
      LIMIT 5`.then(async (rows) => {
      const teams = new Map(
        (await prisma.team.findMany({ where: { id: { in: rows.flatMap((g) => [g.homeTeamId, g.awayTeamId]) } } })).map((t) => [t.id, t]),
      );
      return rows.map((g) => ({ ...g, home: teams.get(g.homeTeamId)!, away: teams.get(g.awayTeamId)! }));
    }),
  ]);

  // League averages: the mean of every team that has played.
  const played = teamStats.filter((t) => t.gp > 0);
  const avg = (of: (t: (typeof played)[number]) => number | null) => {
    const v = played.map(of).filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const tiles = [
    { label: 'Games', value: finals.toLocaleString() },
    { label: 'Pts / game', value: fmt(avg((t) => (t.pts === null ? null : t.pts / t.gp))) },
    { label: 'Pace', value: fmt(avg((t) => t.pace)) },
    { label: 'TS%', value: fmt(avg((t) => t.tsPct), 1, '%') },
  ];

  const rail = (keys: Stat[]): RailBoard[] =>
    boards
      .filter((b) => keys.includes(b.key))
      .map((b) => ({
        key: b.key,
        label: b.label,
        note: isPerGame(b) ? 'per game' : '',
        empty: b.tracked ? 'No qualifiers yet.' : `Not tracked in ${season.key}.`,
        rows: b.rows.map((r) => ({ playerId: r.playerId, name: r.name, abbr: r.abbr, color: r.color, value: fmt(r[b.key], b.dp ?? 1, b.unit) })),
      }));

  return (
    <div className="space-y-8">
      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="md:col-span-2 xl:order-2 xl:col-span-1">
          <p className="eyebrow">{season.key} season</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Every game, every shot, every number.</h1>
          <p className="mt-2 max-w-prose text-sm" style={{ color: 'var(--ink-2)' }}>
            Live scores and box scores, standings, leaderboards and player and team pages, built from the
            NBA&apos;s own feeds and basketball-reference. The boards on either side change every visit.
          </p>

          <ol className="panel mt-5 divide-y" style={{ borderColor: 'var(--line)' }}>
            {MODULES.map((m, i) => (
              <li key={m.href}>
                <Link
                  href={m.href}
                  className="flex items-start gap-3 px-4 py-3 no-underline transition-colors hover:bg-[var(--panel-2)]"
                  style={{ color: 'var(--ink)' }}
                >
                  <span className="eyebrow tnum w-5 pt-0.5">{String(i + 1).padStart(2, '0')}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{m.title}</span>
                    <span className="mt-0.5 block text-xs" style={{ color: 'var(--ink-2)' }}>
                      {m.body}
                    </span>
                  </span>
                  <span aria-hidden className="pt-0.5 text-sm" style={{ color: 'var(--accent)' }}>
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ol>

          <p className="eyebrow mt-6">League averages</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {tiles.map((t) => (
              <div key={t.label} className="panel px-3 py-2.5">
                <div className="eyebrow">{t.label}</div>
                <div className="tnum mt-1 text-2xl font-bold tracking-tight">{t.value}</div>
              </div>
            ))}
          </div>

          {best.length > 0 && (
            <>
              <p className="eyebrow mt-6">
                Best games ·{' '}
                {best[0].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
              </p>
              <ol className="panel mt-2 divide-y" style={{ borderColor: 'var(--line)' }}>
                {best.map((l) => (
                  <li key={l.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <TeamMark abbr={l.team.abbreviation} color={l.team.primaryColor} size={18} />
                    <Headshot id={l.playerId} name="" className="h-6 w-6 shrink-0 rounded-full bg-[var(--panel-2)] object-cover object-top" />
                    <Link href={`/players/${l.playerId}`} className="link min-w-0 flex-1 truncate" style={{ color: 'var(--ink)' }}>
                      {l.player.fullName}
                    </Link>
                    <Link href={`/games/${l.gameId}`} className="tnum no-underline hover:underline" style={{ color: 'var(--ink-2)' }}>
                      <strong style={{ color: 'var(--ink)' }}>{l.pts}</strong> pts · {l.reb} reb · {l.ast} ast
                    </Link>
                  </li>
                ))}
              </ol>
            </>
          )}

        </div>

        <LeaderRail heading={`${season.key} leaders`} boards={rail(STANDARD)} className="xl:order-1" />
        <LeaderRail heading={`${season.key} advanced`} boards={rail(ADVANCED)} className="xl:order-3" />
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Where the {season.key} league shoots</h2>
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
              floor
            />
          </div>
        </div>

        <div className="space-y-4">
          <Panel title="Top of the league" href="/team-stats" hrefLabel="All teams">
            <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
              {topTeams.map((t, i) => (
                <li key={t.teamId} className="flex items-center gap-3 py-2">
                  <span className="eyebrow w-4 tnum">{i + 1}</span>
                  <TeamMark abbr={t.team.abbreviation} color={t.team.primaryColor} size={22} />
                  <Link href={`/teams/${t.team.abbreviation}`} className="link flex-1 text-sm font-medium" style={{ color: 'var(--ink)' }}>
                    {t.name ?? `${t.team.city} ${t.team.name}`}
                  </Link>
                  <span className="tnum text-sm">
                    {t.wins}-{t.losses}
                  </span>
                  <span className="tnum w-14 text-right text-sm font-semibold" style={{ color: 'var(--hot)' }}>
                    {t.netRtg === null ? '—' : `${t.netRtg > 0 ? '+' : ''}${t.netRtg.toFixed(1)}`}
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

          {onThisDate.length > 0 && (
            <Panel
              title={`On this date · ${new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`}
            >
              <ul className="divide-y" style={{ borderColor: 'var(--line)' }}>
                {onThisDate.map((g) => {
                  const top = [g.leaders?.away, g.leaders?.home].filter((l) => l).sort((a, b) => b!.pts - a!.pts)[0];
                  return (
                    <li key={g.id}>
                      <Link href={`/games/${g.id}`} className="flex items-center gap-2 py-2 text-sm no-underline" style={{ color: 'var(--ink)' }}>
                        <span className="eyebrow tnum w-10">{g.date.getUTCFullYear()}</span>
                        <TeamMark abbr={g.away.abbreviation} color={g.away.primaryColor} size={18} />
                        <span className="tnum">
                          {g.away.abbreviation} {g.awayScore} @ {g.home.abbreviation} {g.homeScore}
                        </span>
                        <TeamMark abbr={g.home.abbreviation} color={g.home.primaryColor} size={18} />
                        <span className="min-w-0 flex-1 truncate text-right text-xs" style={{ color: 'var(--ink-2)' }}>
                          {top && `${top.name} ${top.pts}`}
                        </span>
                        {g.status !== 'Final' && <span className="eyebrow">{g.status.replace('Final/', '')}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { href: '/explorer', title: 'Stat Explorer', body: 'Sort and filter every player-season, then export it.' },
          { href: '/shots', title: 'Shot Chart Analyzer', body: 'Filter shots by zone, distance, defender and period.' },
          { href: '/compare', title: 'Compare Players', body: 'Up to four players side by side, box score and advanced.' },
          { href: '/teams', title: 'Teams', body: 'Rosters, leaders, schedules and every season since 1946-47.' },
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
        Run <code>npm run ingest</code> to load every season since 1946-47 from basketball-reference, then{' '}
        <code>npm run sync</code> for the current season from the NBA&apos;s feeds.
      </p>
    </div>
  );
}

/** The page's shape while it loads: both rails, the middle column, the shot chart and its two panels, the tool cards. */
function HomeSkeleton() {
  const rows = (n: number, h = 'py-3') =>
    Array.from({ length: n }, (_, i) => (
      <div key={i} className={`flex items-center gap-3 px-4 ${h}`}>
        <Bone width={['72%', '58%', '84%', '64%', '48%', '78%'][i % 6]} />
      </div>
    ));
  return (
    <div className="space-y-8" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-3 md:col-span-2 xl:order-2 xl:col-span-1">
          <Bone width="6rem" className="h-2.5" />
          <Bone width="85%" className="h-8" />
          <Bone width="60%" className="h-8" />
          <Bone width="95%" className="mt-2" />
          <Bone width="80%" />
          <div className="panel mt-5 divide-y" style={{ borderColor: 'var(--line)' }}>
            {rows(5, 'py-5')}
          </div>
          <div className="grid grid-cols-2 gap-2 pt-6 sm:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="panel space-y-2 px-3 py-3">
                <Bone width="3rem" className="h-2" />
                <Bone width="4rem" className="h-6" />
              </div>
            ))}
          </div>
          <div className="panel mt-6 divide-y" style={{ borderColor: 'var(--line)' }}>
            {rows(4)}
          </div>
        </div>
        <RailSkeleton className="xl:order-1" />
        <RailSkeleton className="xl:order-3" />
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
        <div className="space-y-2">
          <Bone width="18rem" className="h-6" />
          <Bone width="90%" />
          <Bone width="70%" />
          {/* The chart panel: header, the half court (500 by 470), the legend. */}
          <span aria-hidden className="skeleton mt-3 aspect-[500/580] w-full rounded-md" />
        </div>
        <div className="space-y-4">
          {[5, 6].map((n) => (
            <div key={n} className="panel divide-y p-0" style={{ borderColor: 'var(--line)' }}>
              <div className="px-4 py-3">
                <Bone width="7rem" />
              </div>
              {rows(n)}
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="panel space-y-2 p-4">
            <Bone width="7rem" />
            <Bone width="90%" className="h-2.5" />
          </div>
        ))}
      </section>
    </div>
  );
}
