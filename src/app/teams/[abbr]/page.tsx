import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { byRecord, latestSeason, prisma, seasonStandings } from '@/lib/db';
import { FilterBar } from '@/components/FilterBar';
import { PercentileBars } from '@/components/PercentileBars';
import { StatTable } from '@/components/StatTable';
import { TeamMark } from '@/components/TeamMark';
import { Tip } from '@/components/Tip';
import { todayEt } from '@/lib/dates';
import { feetInches, fmt, ordinal, pct3, perGame } from '@/lib/format';
import { minGames } from '@/lib/stats';
import { teamLineups, teamPercentiles } from '@/lib/team';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ abbr: string }> }) {
  const team = await prisma.team.findUnique({ where: { abbreviation: (await params).abbr.toUpperCase() } });
  return { title: team ? `${team.city} ${team.name}` : 'Team' };
}

const LEADERS = [
  { key: 'ppg', label: 'Points' },
  { key: 'rpg', label: 'Rebounds' },
  { key: 'apg', label: 'Assists' },
  { key: 'spg', label: 'Steals' },
  { key: 'bpg', label: 'Blocks' },
  { key: 'tpm', label: 'Threes made' },
  { key: 'per', label: 'PER' },
] as const;

export default async function TeamPage({
  params, searchParams,
}: {
  params: Promise<{ abbr: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const abbr = (await params).abbr.toUpperCase();
  const sp = await searchParams;
  const team = await prisma.team.findUnique({ where: { abbreviation: abbr } });
  if (!team) notFound();

  // Every season this franchise row has a record or a game in, newest first.
  const seasons = await prisma.season.findMany({
    where: {
      OR: [
        { teamStats: { some: { teamId: team.id } } },
        { games: { some: { OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }] } } },
      ],
    },
    orderBy: { startYear: 'desc' },
  });
  const season = seasons.find((s) => s.key === sp.season) ?? seasons[0];
  if (!season) notFound();
  const isCurrent = season.id === (await latestSeason())?.id;

  const [table, league, players, games, moves, history, rostered] = await Promise.all([
    seasonStandings(season.id),
    prisma.teamStats.findMany({ where: { seasonId: season.id } }),
    prisma.playerStats.findMany({
      where: { seasonId: season.id, teamId: team.id },
      include: {
        player: {
          select: {
            id: true, fullName: true, position: true, jersey: true, heightIn: true, weightLb: true,
            birthDate: true, college: true, advancedStats: { where: { seasonId: season.id } },
          },
        },
      },
      orderBy: { ppg: 'desc' },
    }),
    prisma.game.findMany({
      where: { seasonId: season.id, OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }] },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { date: 'asc' },
    }),
    prisma.transaction.findMany({
      where: { teamId: team.id, date: { gte: new Date(Date.UTC(season.startYear, 6, 1)), lt: new Date(Date.UTC(season.endYear, 6, 1)) } },
      orderBy: { date: 'desc' },
      take: 15,
    }),
    prisma.teamStats.findMany({ where: { teamId: team.id }, include: { season: true }, orderBy: { season: { startYear: 'desc' } } }),
    // This season's roster is the NBA's current one, before anyone has played.
    isCurrent
      ? prisma.player.findMany({
          where: { teamId: team.id, active: true },
          orderBy: { lastName: 'asc' },
        })
      : Promise.resolve([]),
  ]);

  // Before this season's first games, lean on last season's numbers, labeled:
  // leaders from the players on this roster, ratings from last year's team.
  const prev = isCurrent && !players.length ? seasons[1] : undefined;
  const [prevPlayers, prevLeague] = prev
    ? await Promise.all([
        prisma.playerStats.findMany({
          where: { seasonId: prev.id, playerId: { in: rostered.map((p) => p.id) } },
          include: {
            player: {
              select: {
                id: true, fullName: true, position: true, jersey: true, heightIn: true, weightLb: true,
                birthDate: true, college: true, advancedStats: { where: { seasonId: prev.id } },
              },
            },
          },
        }),
        prisma.teamStats.findMany({ where: { seasonId: prev.id } }),
      ])
    : [[], []];
  const leaderSource = prev ? prevPlayers : players;
  const ratingSource = prev ? prevLeague : league;

  const me = table.find((r) => r.teamId === team.id);
  const conferenceRows = table.filter((r) => (me?.conference ? r.conference === me.conference : r.division === me?.division)).sort(byRecord);
  const rank = me ? conferenceRows.findIndex((r) => r.teamId === team.id) + 1 : 0;
  const stats = league.find((t) => t.teamId === team.id);
  const name = stats?.name ?? `${team.city} ${team.name}`;
  const gp = (me?.wins ?? 0) + (me?.losses ?? 0);
  const today = todayEt();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const next = games.find((g) => !g.status.startsWith('Final') && iso(g.date) >= today);
  const lastGame = [...games].reverse().find((g) => g.status.startsWith('Final'));

  // Leaders: this team's players who played 70% of its games (or everyone, early on).
  const lines = leaderSource.map((p) => ({
    playerId: p.playerId, name: p.player.fullName, gp: p.gp,
    ppg: p.ppg as number | null, rpg: p.rpg, apg: p.apg, spg: perGame(p.stl, p.gp), bpg: perGame(p.blk, p.gp),
    tpm: perGame(p.fg3m, p.gp), per: p.player.advancedStats[0]?.per ?? null,
  }));
  // Last season's lines come from several teams, so each player is held to his own games.
  const pool = prev ? lines.filter((l) => l.gp >= 41) : lines.filter((l) => l.gp >= minGames(stats?.gp ?? gp));
  const leaders = LEADERS.map((c) => ({
    ...c,
    top: [...(pool.length ? pool : lines)].filter((l) => l[c.key] !== null).sort((a, b) => b[c.key]! - a[c.key]!)[0],
  }));

  const rated = ratingSource.find((t) => t.teamId === team.id);
  const ranks = teamPercentiles(team.id, ratingSource);

  // Five-man lineups from the play-by-play (2026-27 on).
  const lineups = await teamLineups(season.id, team.id);

  const seasonLabel = (g: (typeof games)[number]) =>
    g.kind === 'preseason' ? 'Preseason' : g.kind === 'playoffs' ? 'Playoffs' : g.kind === 'play-in' ? 'Play-In' : g.label;

  return (
    <div className="space-y-6">
      <header className="panel overflow-hidden">
        <div className="h-1.5" style={{ background: team.primaryColor }} />
        <div className="flex flex-wrap items-center gap-5 p-4">
          <TeamMark abbr={team.abbreviation} color={team.primaryColor} size={64} />
          <div className="min-w-0 flex-1">
            <div className="eyebrow">
              {season.key}
              {me?.conference ? ` · ${me.conference}ern Conference` : me?.division ? ` · ${me.division} Division` : ''}
              {me?.division && me?.conference ? ` · ${me.division}` : ''}
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
            <div className="mt-1 text-sm" style={{ color: 'var(--ink-2)' }}>
              {me && (
                <>
                  <span className="tnum font-semibold" style={{ color: 'var(--ink)' }}>
                    {me.wins}-{me.losses}
                  </span>
                  {gp > 0 && (
                    <>
                      {' '}· {ordinal(rank)} in the {me.conference ? `${me.conference}` : `${me.division} Division`} · streak {me.streak} · last ten {me.l10[0]}-{me.l10[1]}
                    </>
                  )}
                </>
              )}
              {stats?.pace !== null && stats?.pace !== undefined && <> · pace {stats.pace.toFixed(1)}</>}
            </div>
          </div>
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {next && (
              <div>
                <dt className="eyebrow">Next</dt>
                <dd>
                  <Link href={`/games/${next.id}`} className="link">
                    {next.homeTeamId === team.id ? 'vs' : '@'}{' '}
                    {next.homeTeamId === team.id ? next.awayTeam.abbreviation : next.homeTeam.abbreviation}
                  </Link>{' '}
                  <span className="tnum" style={{ color: 'var(--ink-3)' }}>
                    {iso(next.date).slice(5)} · <Tip day={iso(next.date)} status={next.status} />
                  </span>
                </dd>
              </div>
            )}
            {lastGame && (
              <div>
                <dt className="eyebrow">Last</dt>
                <dd>
                  <Link href={`/games/${lastGame.id}`} className="link">
                    {result(lastGame, team.id)}
                  </Link>
                </dd>
              </div>
            )}
          </dl>
        </div>
      </header>

      <Suspense>
        <FilterBar
          fields={[{
            kind: 'select', name: 'season', label: 'Season',
            options: seasons.map((s) => ({ value: s.key, label: s.key })),
            defaultValue: season.key,
          }]}
        />
      </Suspense>

      <section>
        <h2 className="mb-2 text-lg font-bold tracking-tight">
          Team leaders
          {prev && (
            <span className="ml-2 text-sm font-normal" style={{ color: 'var(--ink-3)' }}>
              {prev.key}, for players on this season&apos;s roster
            </span>
          )}
        </h2>
        {lines.length ? (
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
            {leaders.map((l) => (
              <div key={l.key} className="panel p-3">
                <div className="eyebrow">{l.label}</div>
                {l.top ? (
                  <>
                    <div className="tnum mt-1 text-2xl font-bold">{fmt(l.top[l.key])}</div>
                    <Link href={`/players/${l.top.playerId}`} className="link text-sm">
                      {l.top.name}
                    </Link>
                  </>
                ) : (
                  <div className="mt-1 text-sm" style={{ color: 'var(--ink-3)' }}>
                    Not kept in {season.key}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="panel p-4 text-sm" style={{ color: 'var(--ink-3)' }}>
            No {season.key} stats yet. They arrive the morning after the first games.
          </p>
        )}
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <PercentileBars
          title={`How they rank, ${prev?.key ?? season.key}`}
          subtitle={
            ratingSource.length
              ? `Against the league's ${ratingSource.length} teams, per 100 possessions.${prev ? ` Last season's team; ${season.key} has no games yet.` : ''}`
              : undefined
          }
          rows={ranks}
          empty={rated ? `Ratings weren't kept in ${season.key}.` : 'No ratings until games are played.'}
        />

        <div>
          <h2 className="mb-2 text-sm font-semibold">
            {rostered.length ? 'Roster' : `${season.key} players`}
          </h2>
          <div className="panel overflow-x-auto">
            <table className="stat-table">
              <thead>
                <tr>
                  {(rostered.length
                    ? ['Player', '#', 'Pos', 'Ht', 'Wt', 'Age', 'College']
                    : ['Player', 'Pos', 'GP', 'MIN', 'PTS', 'REB', 'AST', 'TS%']
                  ).map((h) => (
                    <th key={h} style={{ cursor: 'default' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rostered.length
                  ? rostered.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <Link href={`/players/${p.id}`} className="link">
                            {p.fullName}
                          </Link>
                        </td>
                        <td>{p.jersey ?? '—'}</td>
                        <td>{p.position ?? '—'}</td>
                        <td>{feetInches(p.heightIn) ?? '—'}</td>
                        <td>{p.weightLb ?? '—'}</td>
                        <td>{p.birthDate ? Math.floor((Date.now() - p.birthDate.getTime()) / (365.25 * 864e5)) : '—'}</td>
                        <td style={{ textAlign: 'right' }}>{p.college ?? '—'}</td>
                      </tr>
                    ))
                  : players.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <Link href={`/players/${p.playerId}?season=${season.key}`} className="link">
                            {p.player.fullName}
                          </Link>
                        </td>
                        <td>{p.player.position ?? '—'}</td>
                        <td>{p.gp}</td>
                        <td>{fmt(perGame(p.min, p.gp))}</td>
                        <td>{fmt(p.ppg)}</td>
                        <td>{fmt(p.rpg)}</td>
                        <td>{fmt(p.apg)}</td>
                        <td>{fmt(p.tsPct)}</td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {lineups.length > 0 && (
        <section>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold tracking-tight">Lineups</h2>
            <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
              Every five-man unit, from the play-by-play. Ratings per 100 possessions; small samples swing hard.
            </span>
          </div>
          <StatTable
            rows={lineups}
            cols={[
              { key: 'lineup', label: 'Lineup' },
              { key: 'gp', label: 'GP' },
              { key: 'min', label: 'MIN', dp: 1 },
              { key: 'plusMinus', label: '+/-', shade: true },
              { key: 'ortg', label: 'ORtg', dp: 1, shade: true },
              { key: 'drtg', label: 'DRtg', dp: 1, shade: true, lowerIsBetter: true },
              { key: 'net', label: 'Net', dp: 1, shade: true },
            ]}
            initialSort="min"
            filename={`${team.abbreviation}-lineups-${season.key}`}
            pageSize={10}
            empty="No lineups yet."
          />
        </section>
      )}

      <section className="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div>
          <h2 className="mb-2 text-lg font-bold tracking-tight">Schedule and results</h2>
          <div className="panel max-h-[34rem] overflow-auto">
            <table className="stat-table">
              <thead>
                <tr>
                  {['Date', 'Opponent', 'Result', ''].map((h) => (
                    <th key={h} style={{ cursor: 'default' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {games.map((g) => {
                  const home = g.homeTeamId === team.id;
                  const opp = home ? g.awayTeam : g.homeTeam;
                  return (
                    <tr key={g.id}>
                      <td className="tnum">{iso(g.date)}</td>
                      <td style={{ textAlign: 'left' }}>
                        <span className="flex items-center gap-1.5">
                          <span style={{ color: 'var(--ink-3)' }}>{home ? 'vs' : '@'}</span>
                          <TeamMark abbr={opp.abbreviation} color={opp.primaryColor} size={16} />
                          <Link href={`/teams/${opp.abbreviation}?season=${season.key}`} className="link">
                            {opp.abbreviation}
                          </Link>
                        </span>
                      </td>
                      <td>
                        <Link href={`/games/${g.id}`} className="link tnum">
                          {g.status.startsWith('Final') ? result(g, team.id) : <Tip day={iso(g.date)} status={g.status} />}
                        </Link>
                      </td>
                      <td style={{ color: 'var(--ink-3)' }}>{seasonLabel(g) ?? ''}</td>
                    </tr>
                  );
                })}
                {!games.length && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: '2rem' }}>
                      No games on file.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="mb-2 text-lg font-bold tracking-tight">Transactions</h2>
          {moves.length ? (
            <ul className="panel divide-y text-sm" style={{ borderColor: 'var(--line)' }}>
              {moves.map((m) => (
                <li key={m.id} className="px-3 py-2" style={{ borderColor: 'var(--line)' }}>
                  <div className="eyebrow tnum">{iso(m.date)}</div>
                  {m.description}
                </li>
              ))}
            </ul>
          ) : (
            <p className="panel p-4 text-sm" style={{ color: 'var(--ink-3)' }}>
              {season.startYear < 2015 ? 'The transaction log starts with the 2015-16 offseason.' : 'No moves this season.'}
            </p>
          )}
          <Link href={`/transactions?team=${team.abbreviation}&season=${season.key}`} className="link mt-2 inline-block text-sm">
            All {team.abbreviation} transactions →
          </Link>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold tracking-tight">Season by season</h2>
        <div className="panel max-h-[32rem] overflow-auto">
          <table className="stat-table">
            <thead>
              <tr>
                {['Season', 'Team', 'W', 'L', 'PCT', 'PPG', 'OPP', 'ORtg', 'DRtg', 'Net', 'Pace'].map((h) => (
                  <th key={h} style={{ cursor: 'default' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>
                    <Link href={`?season=${h.season.key}`} className="link">
                      {h.season.key}
                    </Link>
                  </td>
                  <td style={{ textAlign: 'left' }}>{h.name ?? name}</td>
                  <td>{h.wins}</td>
                  <td>{h.losses}</td>
                  <td>{pct3(h.wins / Math.max(1, h.wins + h.losses))}</td>
                  <td>{fmt(perGame(h.pts, h.gp))}</td>
                  <td>{fmt(perGame(h.oppPts, h.gp))}</td>
                  <td>{fmt(h.ortg)}</td>
                  <td>{fmt(h.drtg)}</td>
                  <td>{fmt(h.netRtg)}</td>
                  <td>{fmt(h.pace)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function result(g: { homeTeamId: number; homeScore: number; awayScore: number }, teamId: number) {
  const home = g.homeTeamId === teamId;
  const [us, them] = home ? [g.homeScore, g.awayScore] : [g.awayScore, g.homeScore];
  return `${us > them ? 'W' : 'L'} ${us}-${them}`;
}
