import Link from 'next/link';
import { Suspense } from 'react';
import { prisma, getSeason, seasonStandings } from '@/lib/db';
import { Counter } from '@/components/Counter';
import { Headshot } from '@/components/Headshot';
import { LazyMount } from '@/components/LazyMount';
import { LeaderRail, RailSkeleton, type RailBoard } from '@/components/LeaderRail';
import { PlayerLink } from '@/components/PlayerLink';
import { Reveal } from '@/components/Reveal';
import { Bone } from '@/components/Skeleton';
import { Sparkline } from '@/components/Sparkline';
import { ShotChart, type Shot } from '@/components/ShotChart';
import { TeamMark } from '@/components/TeamMark';
import { TitleZone } from '@/components/TitleZone';
import { inZone } from '@/lib/title-zone';
import { TITLE_ZONE } from '@/lib/title-zone.config';
import { titleZoneData } from '@/lib/title-zone-data';
import { todayEt } from '@/lib/dates';
import { fmt } from '@/lib/format';
import type { GameLeaders } from '@/lib/nba';
import { isPerGame, leaderBoards, type Stat } from '@/lib/leaders';

export const revalidate = 60;

/** The hero's two flanks, three boards each dealt at random: box score on the left, advanced on the right. */
const STANDARD: Stat[] = ['ppg', 'rpg', 'apg', 'spg', 'bpg', 'tpm', 'fgPct', 'fg3Pct', 'ftPct'];
const ADVANCED: Stat[] = ['tsPct', 'efgPct', 'usgPct', 'per', 'bpm', 'ws', 'vorp'];

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
  const [{ boards, teamStats }, games, shots, totals, finals, best, onThisDate, days, zone, standings] = await Promise.all([
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
                team: { select: { abbreviation: true, primaryColor: true, city: true, name: true } },
                game: {
                  select: {
                    homeTeamId: true, homeScore: true, awayScore: true,
                    homeTeam: { select: { abbreviation: true } }, awayTeam: { select: { abbreviation: true } },
                  },
                },
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
    // The league by game day, latest twelve: what the tiles' sparklines trace.
    prisma.$queryRaw<{ pts: number; fga: number; fta: number; games: number }[]>`
      SELECT sum(l.pts)::float AS pts, sum(l.fga)::float AS fga, sum(l.fta)::float AS fta, count(DISTINCT l."gameId")::int AS games
      FROM player_game_logs l JOIN games g ON g.id = l."gameId" AND g.kind <> 'preseason'
      WHERE l."seasonId" = ${season.id}
      GROUP BY l.date::date ORDER BY l.date::date DESC LIMIT 12`.then((r) => r.reverse()),
    titleZoneData(season.id),
    seasonStandings(season.id),
  ]);

  // League averages: the mean of every team that has played.
  const played = teamStats.filter((t) => t.gp > 0);
  const avg = (of: (t: (typeof played)[number]) => number | null) => {
    const v = played.map(of).filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const tiles: { label: string; value: number | null; dp: number; suffix?: string; trend?: number[]; trendLabel?: string }[] = [
    { label: 'Games', value: finals, dp: 0, trend: days.map((d) => d.games), trendLabel: 'Games per day, last 12 game days' },
    {
      label: 'Pts / game', value: avg((t) => (t.pts === null ? null : t.pts / t.gp)), dp: 1,
      trend: days.map((d) => d.pts / (2 * d.games)), trendLabel: 'Points per team, last 12 game days',
    },
    { label: 'Pace', value: avg((t) => t.pace), dp: 1 },
    {
      label: 'TS%', value: avg((t) => t.tsPct), dp: 1, suffix: '%',
      trend: days.filter((d) => d.fga).map((d) => (d.pts / (2 * (d.fga + 0.44 * d.fta))) * 100), trendLabel: 'League true shooting, last 12 game days',
    },
  ];

  // Feature cards: the standings' three loudest facts today, each written from the numbers.
  const streakOf = (r: (typeof standings)[number]) => (r.streak ? (r.streak[0] === 'W' ? 1 : -1) * Number(r.streak.slice(1)) : 0);
  const byStreak = [...standings].sort((a, b) => streakOf(b) - streakOf(a));
  const hot = byStreak[0], cold = byStreak[byStreak.length - 1];
  const form = [...standings].filter((r) => r.l10[0] + r.l10[1] >= 5).sort((a, b) => b.l10[0] - b.l10[1] - (a.l10[0] - a.l10[1]))[0];
  const features = [
    hot && streakOf(hot) >= 3 && { kicker: 'Hottest team', team: hot, stat: `${streakOf(hot)}`, unit: 'straight wins', body: `${hot.name} are ${hot.wins}-${hot.losses} and haven't lost in ${streakOf(hot)} games.` },
    cold && streakOf(cold) <= -3 && { kicker: 'Looking for one', team: cold, stat: `${-streakOf(cold)}`, unit: 'straight losses', body: `${cold.name} have dropped ${-streakOf(cold)} in a row and sit at ${cold.wins}-${cold.losses}.` },
    form && form !== hot && { kicker: 'Best recent form', team: form, stat: `${form.l10[0]}-${form.l10[1]}`, unit: `last ${form.l10[0] + form.l10[1]}`, body: `${form.name} have the league's best record over their last ${form.l10[0] + form.l10[1]} games.` },
  ].filter((f): f is Exclude<typeof f, false | undefined> => !!f);

  // The ticker: every board's current leader, one line each.
  const ticker = boards.flatMap((b) => (b.rows[0] ? [{ key: b.key, label: b.label, row: b.rows[0], value: fmt(b.rows[0][b.key], b.dp ?? 1, b.unit) }] : []));

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

  // The Title Zone card shows today's picture only; the full page has the season.
  const zoneNow = zone.frames.slice(-1);
  const zoneCount = (zoneNow[0]?.season ?? []).filter((d) => inZone({ relOff: d[1], relDef: d[2] }, TITLE_ZONE)).length;
  const zoneTeam = new Map(zone.teams.map((t) => [t.id, t]));
  const movers = [...zone.movers.slice(0, 3), ...zone.movers.slice(-3).filter((m) => m.delta < 0 && !zone.movers.slice(0, 3).includes(m))];

  return (
    <div className="space-y-4">
      {ticker.length > 0 && (
        <section aria-label="League leaders" className="panel no-scrollbar overflow-x-auto">
          {/* The list is doubled so the loop has no seam; the copy is hidden from assistive tech and the tab order. */}
          <div className="ticker">
            {[false, true].map((copy) => (
              <ul key={String(copy)} className="flex" aria-hidden={copy || undefined}>
                {ticker.map((t) => (
                  <li key={t.key} className="flex items-center gap-2 whitespace-nowrap border-r px-4 py-2 text-xs" style={{ borderColor: 'var(--line)' }}>
                    <span className="eyebrow">{t.label}</span>
                    <TeamMark abbr={t.row.abbr} color={t.row.color} size={14} />
                    <Link href={`/players/${t.row.playerId}`} tabIndex={copy ? -1 : undefined} className="font-semibold no-underline hover:underline" style={{ color: 'var(--ink)' }}>
                      {t.row.name}
                    </Link>
                    <strong className="tnum">{t.value}</strong>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </section>
      )}

      {features.length > 0 && (
        <section aria-label="Around the league" className={`grid gap-4 ${features.length === 3 ? 'md:grid-cols-3' : features.length === 2 ? 'md:grid-cols-2' : ''}`}>
          {features.map((f) => (
            <Link key={f.kicker} href={`/teams/${f.team.abbr}`} className="panel group block overflow-hidden no-underline" style={{ color: 'var(--ink)' }}>
              <div className="h-1" style={{ background: f.team.color }} />
              <div className="flex items-end gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <p className="eyebrow flex items-center gap-1.5">
                    <TeamMark abbr={f.team.abbr} color={f.team.color} size={14} />
                    {f.kicker}
                  </p>
                  <p className="mt-1.5 text-lg font-bold leading-snug tracking-tight group-hover:underline">{f.body}</p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="tnum display text-5xl font-bold leading-none">{f.stat}</div>
                  <div className="eyebrow mt-1">{f.unit}</div>
                </div>
              </div>
            </Link>
          ))}
        </section>
      )}

      {/* The bento: mixed-size cards on a 12-column grid, collapsing to 6 and then 1. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-6 xl:grid-cols-12">
        <section className="md:col-span-6 xl:col-span-5 xl:row-span-2">
          <p className="eyebrow">{season.key} season</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Every game, every shot, every number.</h1>
          <p className="mt-2 max-w-prose text-sm" style={{ color: 'var(--ink-2)' }}>
            Live scores and box scores, standings, leaderboards and player and team pages, built from the
            NBA&apos;s own feeds and basketball-reference.
          </p>
          {best[0] && <NightsBest line={best[0]} />}
        </section>

        <section aria-label="League averages" className="grid grid-cols-2 gap-2 md:col-span-3 xl:col-span-4">
          {tiles.map((t) => (
            <div key={t.label} className="panel flex flex-col justify-between px-3 py-2.5">
              <div className="eyebrow">{t.label}</div>
              <div className="mt-1 flex items-end justify-between gap-2">
                <span className="tnum display text-3xl font-bold leading-none">
                  {t.value === null ? '—' : <Counter value={t.value} dp={t.dp} suffix={t.suffix} />}
                </span>
                {t.trend && (
                  <span className="max-[420px]:hidden">
                    <Sparkline values={t.trend} label={t.trendLabel!} />
                  </span>
                )}
              </div>
            </div>
          ))}
        </section>

        <div className="md:col-span-3 xl:col-span-3 xl:row-span-2">
          <Panel title="Title Zone" href="/teams/landscape" hrefLabel="Full chart">
            {zoneNow.length ? (
              <>
                <Suspense fallback={<span aria-hidden className="skeleton mx-auto block aspect-square w-full max-w-[340px] rounded-md" />}>
                  <LazyMount className="mx-auto aspect-square max-w-[340px]">
                    <TitleZone teams={zone.teams} frames={zoneNow} mini />
                  </LazyMount>
                </Suspense>
                <p className="mt-1 text-xs" style={{ color: 'var(--ink-2)' }}>
                  <strong className="tnum" style={{ color: 'var(--ink)' }}>
                    {zoneCount} of {zoneNow[0].season.length}
                  </strong>{' '}
                  teams are in the hatched zone: good enough overall, with neither end too weak. Up is better at both ends.
                </p>
              </>
            ) : (
              <p className="py-6 text-center text-sm" style={{ color: 'var(--ink-3)' }}>
                Fills in once the season tips off.
              </p>
            )}
          </Panel>
        </div>

        {best.length > 1 && (
          <section className="md:col-span-6 xl:col-span-4">
            <div className="panel h-full">
              <h2 className="eyebrow border-b px-3 py-2" style={{ borderColor: 'var(--line)' }}>
                Also that night
              </h2>
              <ol className="divide-y" style={{ borderColor: 'var(--line)' }}>
                {best.slice(1).map((l) => (
                  <li key={l.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <TeamMark abbr={l.team.abbreviation} color={l.team.primaryColor} size={18} />
                    <Headshot id={l.playerId} name="" className="h-6 w-6 shrink-0 rounded-full bg-[var(--panel-2)] object-cover object-top" />
                    <PlayerLink id={l.playerId} className="link min-w-0 flex-1 truncate" style={{ color: 'var(--ink)' }}>
                      {l.player.fullName}
                    </PlayerLink>
                    <Link href={`/games/${l.gameId}`} className="tnum whitespace-nowrap no-underline hover:underline" style={{ color: 'var(--ink-2)' }}>
                      <strong style={{ color: 'var(--ink)' }}>{l.pts}</strong> pts · {l.reb} reb · {l.ast} ast
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}

        <LeaderRail heading={`${season.key} leaders`} boards={rail(STANDARD)} className="md:col-span-3 xl:col-span-3" />

        <Reveal className="md:order-last md:col-span-6 xl:order-none xl:col-span-6">
          <h2 className="eyebrow">Where the {season.key} league shoots</h2>
          <div className="mt-3">
            <LazyMount className="aspect-[500/580]">
              <ShotChart
                shots={shots}
                title="League shot profile"
                subtitle={`${totals._count._all.toLocaleString()} attempts · sampled for speed`}
                floor
              />
            </LazyMount>
          </div>
          <p className="mt-2 max-w-prose text-xs" style={{ color: 'var(--ink-2)' }}>
            Every attempt binned by location and colored by points per shot: red beats the league average from that
            spot, blue trails it.
          </p>
        </Reveal>

        <LeaderRail heading={`${season.key} advanced`} boards={rail(ADVANCED)} className="md:col-span-3 xl:col-span-3" />

        <Reveal className="md:col-span-3 xl:col-span-4">
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
        </Reveal>

        {onThisDate.length > 0 && (
          <Reveal className="md:col-span-3 xl:col-span-4">
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
          </Reveal>
        )}

        <Reveal className="md:col-span-6 xl:col-span-4">
          <Panel title="Biggest movers" href="/teams/landscape" hrefLabel="Title Zone">
            {movers.length ? (
              <ul className="divide-y">
                {movers.map((m) => {
                  const t = zoneTeam.get(m.teamId);
                  return (
                    <li key={m.teamId} className="flex items-center gap-2 py-2 text-sm">
                      <TeamMark abbr={t?.abbr ?? ''} color={t?.color} size={18} />
                      <Link href={`/teams/${t?.abbr}`} className="link min-w-0 flex-1 truncate" style={{ color: 'var(--ink)' }}>
                        {t?.name}
                      </Link>
                      <span className="tnum text-xs" style={{ color: 'var(--ink-2)' }}>
                        {m.result}
                      </span>
                      <span className="tnum w-11 text-right font-semibold" style={{ color: m.delta > 0 ? 'var(--pos)' : 'var(--neg)' }}>
                        {m.delta > 0 ? '+' : ''}
                        {m.delta.toFixed(1)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-4 text-sm" style={{ color: 'var(--ink-3)' }}>
                Needs two game days.
              </p>
            )}
            <p className="eyebrow mt-2">Change in net rating on the latest game day</p>
          </Panel>
        </Reveal>
      </div>
    </div>
  );
}

function Panel({
  title, children, href, hrefLabel,
}: {
  title: string; children: React.ReactNode; href?: string; hrefLabel?: string;
}) {
  return (
    <div className="panel h-full p-3">
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

/** The page's shape while it loads: the ticker, then the bento's cards at their sizes. */
function HomeSkeleton() {
  const card = (cls: string, lines: number) => (
    <div className={`panel space-y-3 p-4 ${cls}`}>
      {Array.from({ length: lines }, (_, i) => (
        <Bone key={i} width={['72%', '58%', '84%', '64%', '48%', '78%'][i % 6]} />
      ))}
    </div>
  );
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <span aria-hidden className="skeleton h-9 w-full rounded-md" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-6 xl:grid-cols-12">
        <div className="space-y-3 md:col-span-6 xl:col-span-5 xl:row-span-2">
          <Bone width="6rem" className="h-2.5" />
          <Bone width="85%" className="h-8" />
          <Bone width="95%" className="mt-2" />
          {/* Performance of the night */}
          <div className="panel mt-5 space-y-3 px-4 py-4">
            <Bone width="12rem" className="h-2.5" />
            <Bone width="10rem" className="h-6" />
            <Bone width="14rem" className="mt-2 h-12" />
            <Bone width="100%" className="mt-2 h-4" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 md:col-span-3 xl:col-span-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="panel space-y-2 px-3 py-3">
              <Bone width="3rem" className="h-2" />
              <Bone width="4rem" className="h-6" />
            </div>
          ))}
        </div>
        {card('md:col-span-3 xl:col-span-3 xl:row-span-2', 6)}
        {card('md:col-span-6 xl:col-span-4', 3)}
        <RailSkeleton className="md:col-span-3 xl:col-span-3" />
        <span aria-hidden className="skeleton aspect-[500/580] w-full rounded-md md:order-last md:col-span-6 xl:order-none xl:col-span-6" />
        <RailSkeleton className="md:col-span-3 xl:col-span-3" />
      </div>
    </div>
  );
}

type NightLine = {
  playerId: number; gameId: number; teamId: number; date: Date;
  pts: number; reb: number; ast: number; fgm: number; fga: number; fg3m: number; min: number;
  player: { fullName: string };
  team: { abbreviation: string; primaryColor: string; city: string; name: string };
  game: { homeTeamId: number; homeScore: number; awayScore: number; homeTeam: { abbreviation: string }; awayTeam: { abbreviation: string } };
};

/** The latest night's top scorer, front and centre: the one line worth a click today. */
function NightsBest({ line: l }: { line: NightLine }) {
  const g = l.game;
  const home = l.teamId === g.homeTeamId;
  const [us, them] = home ? [g.homeScore, g.awayScore] : [g.awayScore, g.homeScore];
  const stats = [
    ['Reb', l.reb],
    ['Ast', l.ast],
    ['FG', `${l.fgm}-${l.fga}`],
    ...(l.fg3m ? [['3PM', l.fg3m]] : []),
  ] as [string, string | number][];
  return (
    <article className="panel relative mt-5 overflow-hidden">
      <div className="h-1" style={{ background: l.team.primaryColor }} />
      <div className="flex items-end gap-4 px-4 pt-3">
        <div className="min-w-0 flex-1 pb-3">
          <p className="eyebrow">
            Performance of the night ·{' '}
            {l.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
          </p>
          <PlayerLink id={l.playerId} className="mt-1 block truncate text-xl font-bold no-underline hover:underline" style={{ color: 'var(--ink)' }}>
            {l.player.fullName}
          </PlayerLink>
          <p className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--ink-2)' }}>
            <TeamMark abbr={l.team.abbreviation} color={l.team.primaryColor} size={14} />
            {l.team.city} {l.team.name}
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2">
            <div>
              <div className="tnum display text-5xl font-bold leading-none">
                <Counter value={l.pts} />
              </div>
              <div className="eyebrow mt-1">Points</div>
            </div>
            {stats.map(([k, v]) => (
              <div key={k}>
                <div className="tnum display text-2xl font-bold leading-none">{v}</div>
                <div className="eyebrow mt-1">{k}</div>
              </div>
            ))}
          </div>
        </div>
        <Headshot
          id={l.playerId}
          name={l.player.fullName}
          className="hidden h-[120px] w-[165px] shrink-0 self-end object-contain object-bottom sm:block"
        />
      </div>
      <Link
        href={`/games/${l.gameId}`}
        className="tnum flex items-center justify-between border-t px-4 py-2 text-xs no-underline transition-colors hover:bg-[var(--panel-2)]"
        style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}
      >
        <span>
          <strong style={{ color: 'var(--ink)' }}>{us > them ? 'W' : 'L'} {us}-{them}</strong> · {g.awayTeam.abbreviation} @ {g.homeTeam.abbreviation}
        </span>
        <span style={{ color: 'var(--accent)' }}>Box score →</span>
      </Link>
    </article>
  );
}
