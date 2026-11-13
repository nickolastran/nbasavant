import { Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import { prisma, getSeason } from '@/lib/db';
import { ComparePicker } from '@/components/ComparePicker';
import { ShotChart, type Shot } from '@/components/ShotChart';
import { TeamMark } from '@/components/TeamMark';
import { TrendChart } from '@/components/TrendChart';
import { FilterBar } from '@/components/FilterBar';
import { ViewTabs } from '@/components/ViewTabs';
import { seasonOptions } from '@/lib/options';
import { fmt, pct3, perGame } from '@/lib/format';
import { MirrorBars } from '@/components/MirrorBars';
import { PercentileBars } from '@/components/PercentileBars';
import { PlayerLink } from '@/components/PlayerLink';
import { faceoff, percentileCard, teamMirror } from '@/lib/compare';
import { playerLeaderboard } from '@/lib/leaderboard';
import { similarPlayers, similarity } from '@/lib/similar';

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  return { title: (await searchParams).view === 'teams' ? 'Compare Teams' : 'Compare Players' };
}
export const revalidate = 60;

const SERIES_COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];

const VIEWS = [
  { value: 'players', label: 'Players' },
  { value: 'teams', label: 'Teams' },
];

const ROWS = [
  { key: 'gp', label: 'Games', dp: 0 },
  { key: 'mpg', label: 'Minutes per game', dp: 1 },
  { key: 'ppg', label: 'Points per game', dp: 1 },
  { key: 'rpg', label: 'Rebounds per game', dp: 1 },
  { key: 'apg', label: 'Assists per game', dp: 1 },
  { key: 'fgPct', label: 'Field goal %', dp: 1 },
  { key: 'fg3Pct', label: 'Three point %', dp: 1 },
  { key: 'ftPct', label: 'Free throw %', dp: 1 },
  { key: 'tsPct', label: 'True shooting %', dp: 1 },
  { key: 'usgPct', label: 'Usage %', dp: 1 },
  { key: 'per', label: 'PER', dp: 1 },
  { key: 'ortg', label: 'Offensive rating', dp: 1 },
  { key: 'drtg', label: 'Defensive rating', dp: 1, lowerIsBetter: true },
  { key: 'ws', label: 'Win shares', dp: 2 },
  { key: 'bpm', label: 'Box plus/minus', dp: 2 },
  { key: 'vorp', label: 'VORP', dp: 2 },
] as const;

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const view = sp.view === 'teams' ? 'teams' : 'players';
  const active = await getSeason();
  const seasonKey = sp.season || active?.key;
  const seasons = await prisma.season.findMany({ orderBy: { startYear: 'desc' } });
  const season = seasons.find((s) => s.key === seasonKey);
  const body = view === 'teams' ? await teamCompare(sp, seasonKey) : await playerCompare(sp, seasonKey, season?.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-xl font-bold tracking-tight">Compare {view}</h1>
        <p className="mb-4 text-sm" style={{ color: 'var(--ink-2)' }}>
          Up to four {view}, {seasonKey} season. The better value in each row is bold.
        </p>
        {/* Switching sides starts a fresh comparison; the season carries over. */}
        <ViewTabs views={VIEWS} current={view} params={sp.season ? { season: sp.season } : {}} />
        <Suspense>
          <ComparePicker kind={view} selected={body.picked} />
          <FilterBar fields={[{ kind: 'select', name: 'season', label: 'Season', options: seasonOptions(seasons), defaultValue: seasonKey }]} />
        </Suspense>
      </div>
      {body.content}
    </div>
  );
}

type Column = { key: string; label: ReactNode; color: string };
type Line = { label: string; values: (number | null)[]; dp?: number; lowerIsBetter?: boolean; neutral?: boolean; text?: string[] };

/** One row a stat, one column a pick; the best value in a row is bold unless the stat has no better side. */
function CompareTable({ columns, lines }: { columns: Column[]; lines: Line[] }) {
  return (
    <div className="panel overflow-x-auto">
      <table className="stat-table">
        <thead>
          <tr>
            <th scope="col" style={{ textAlign: 'left' }}>
              Stat
            </th>
            {columns.map((c) => (
              <th key={c.key} scope="col">
                <span className="flex items-center justify-end gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                  {c.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((r) => {
            const known = r.values.filter((v): v is number => v !== null);
            const best = !known.length || r.neutral ? null : r.lowerIsBetter ? Math.min(...known) : Math.max(...known);
            return (
              <tr key={r.label}>
                <td style={{ textAlign: 'left' }}>{r.label}</td>
                {columns.map((c, i) => {
                  const top = r.values[i] === best && columns.length > 1;
                  return (
                    <td key={c.key} style={{ fontWeight: top ? 700 : 400, color: top ? 'var(--hot)' : undefined }}>
                      {r.text?.[i] ?? fmt(r.values[i], r.dp)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const Empty = ({ children }: { children: ReactNode }) => (
  <div className="panel p-8 text-center">
    <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
      {children}
    </p>
  </div>
);

async function playerCompare(sp: Record<string, string>, seasonKey: string | undefined, seasonId: number | undefined) {
  const ids = (sp.ids ?? '')
    .split(',')
    .map(Number)
    .filter(Number.isFinite)
    .slice(0, 4);

  const players = ids.length
    ? await prisma.player.findMany({
        where: { id: { in: ids } },
        include: {
          team: true,
          stats: { include: { season: true }, orderBy: { season: { startYear: 'asc' } } },
          advancedStats: true,
        },
      })
    : [];

  // Keep the order the user picked, not the database's.
  players.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));

  const shotsByPlayer =
    seasonId && players.length
      ? await Promise.all(
          players.map((p) =>
            prisma.shotData.findMany({
              where: { playerId: p.id, seasonId },
              select: {
                x: true, y: true, made: true, value: true, distanceFt: true, zone: true,
                actionType: true,
              },
            }),
          ),
        )
      : [];

  const cards = players.map((p, i) => {
    const s = p.stats.find((x) => x.season.key === seasonKey);
    const a = p.advancedStats.find((x) => x.seasonId === s?.seasonId);
    return {
      id: p.id,
      name: p.fullName,
      team: p.team?.abbreviation ?? '',
      color: SERIES_COLORS[i],
      values: {
        gp: s?.gp ?? null, mpg: s ? perGame(s.min, s.gp) : null,
        ppg: s?.ppg ?? null, rpg: s?.rpg ?? null, apg: s?.apg ?? null,
        fgPct: s?.fgPct ?? null, fg3Pct: s?.fg3Pct ?? null, ftPct: s?.ftPct ?? null,
        tsPct: s?.tsPct ?? null, usgPct: s?.usgPct ?? null,
        per: a?.per ?? null, ortg: a?.ortg ?? null, drtg: a?.drtg ?? null,
        ws: a?.ws ?? null, bpm: a?.bpm ?? null, vorp: a?.vorp ?? null,
      } as Record<string, number | null>,
      seasons: p.stats.map((x) => ({ key: x.season.key, ppg: x.ppg })),
    };
  });

  const trendSeasons = [...new Set(cards.flatMap((c) => c.seasons.map((s) => s.key)))].sort();
  // A season he didn't play is a gap in his line, not a zero.
  const trendData = trendSeasons.map((key) => {
    const row: Record<string, string | number | null> = { label: key };
    for (const c of cards) row[`p${c.id}`] = c.seasons.find((s) => s.key === key)?.ppg ?? null;
    return row;
  });

  // Two players: their percentile cards side by side, and how alike their seasons are.
  const duel =
    cards.length === 2 && seasonId
      ? await (async () => {
          const [rows, score, ...lists] = await Promise.all([
            playerLeaderboard(seasonId, 'game'),
            similarity(cards[0].id, cards[1].id, seasonId),
            similarPlayers(cards[0].id, seasonId, 5),
            similarPlayers(cards[1].id, seasonId, 5),
          ]);
          const nameOf = new Map(rows.map((r) => [r.playerId as number, { name: String(r.player), team: String(r.team ?? '') }]));
          return { score, lists, nameOf, cards: cards.map((c) => percentileCard(rows, c.id)) };
        })()
      : null;

  const picked = cards.map((c) => ({ key: String(c.id), name: c.name, color: c.color }));
  if (!cards.length) {
    return {
      picked,
      content: (
        <Empty>
          Add a player above to start, or{' '}
          <Link href="/players" className="link">
            pick one from the player list
          </Link>
          .
        </Empty>
      ),
    };
  }
  return {
    picked,
    content: (
      <>
        {duel && (
          <>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {cards.map((c, i) => (
                <PercentileBars
                  key={i}
                  title={`${c.name}, ${seasonKey}`}
                  subtitle={`Against ${duel.cards[i].field} players with a regular role. Red beats the field, blue trails it.`}
                  rows={duel.cards[i].rows}
                  empty="No stats this season."
                />
              ))}
            </div>
            <section className="panel p-4">
              <h2 className="text-sm font-semibold">How alike are they?</h2>
              {duel.score === null ? (
                <p className="mt-1 text-sm" style={{ color: 'var(--ink-3)' }}>
                  One of them hasn&apos;t played enough this season to compare.
                </p>
              ) : (
                <p className="mt-1 text-sm" style={{ color: 'var(--ink-2)' }}>
                  <strong className="tnum display text-3xl" style={{ color: 'var(--ink)' }}>
                    {Math.round(((duel.score + 1) / 2) * 100)}
                  </strong>{' '}
                  out of 100.{' '}
                  {duel.score > 0.6 ? 'Strong and weak in the same places.' : duel.score > 0.2 ? 'Some overlap in what they do.' : duel.score > -0.2 ? 'Little in common.' : 'Close to opposites.'}{' '}
                  Cosine similarity of twelve stats, each measured against this season&apos;s average: it compares the shape of their games, not how good they are.
                </p>
              )}
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {cards.map((c, i) => (
                  <div key={c.id}>
                    <h3 className="eyebrow mb-1">Most similar to {c.name}</h3>
                    {duel.lists[i]?.length ? (
                      <ol className="divide-y text-sm">
                        {duel.lists[i]!.map((m) => (
                          <li key={m.playerId} className="flex items-center gap-2 py-1.5">
                            <PlayerLink id={m.playerId} className="link min-w-0 flex-1 truncate">
                              {duel.nameOf.get(m.playerId)?.name ?? m.playerId}
                            </PlayerLink>
                            <span className="eyebrow">{duel.nameOf.get(m.playerId)?.team}</span>
                            <span className="tnum w-8 text-right font-semibold">{Math.round(((m.score + 1) / 2) * 100)}</span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
                        Not enough minutes to compare.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        <CompareTable
          columns={cards.map((c) => ({ key: String(c.id), label: `${c.name} · ${c.team}`, color: c.color }))}
          lines={ROWS.map((r) => ({ ...r, values: cards.map((c) => c.values[r.key]) }))}
        />

        {cards.length > 1 && (
          <TrendChart
            title="Points per game by season"
            data={trendData}
            series={cards.map((c) => ({ key: `p${c.id}`, label: c.name }))}
            height={280}
          />
        )}

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {cards.map((c, i) => (
            <ShotChart
              key={c.id}
              shots={(shotsByPlayer[i] ?? []).map(
                (s): Shot => ({
                  x: s.x, y: s.y, made: s.made, value: s.value,
                  distanceFt: s.distanceFt, zone: s.zone, action: s.actionType,
                  player: c.name,
                }),
              )}
              title={c.name}
              subtitle={`${c.team} · ${seasonKey} · ${(shotsByPlayer[i] ?? []).length} attempts`}
              height={420}
            />
          ))}
        </div>
      </>
    ),
  };
}

/** How many seasons back the net rating trend reaches. */
const TREND_SEASONS = 15;

async function teamCompare(sp: Record<string, string>, seasonKey: string | undefined) {
  const abbrs = [...new Set((sp.teams ?? '').split(',').map((a) => a.trim().toUpperCase()).filter(Boolean))].slice(0, 4);
  const teams = abbrs.length
    ? await prisma.team.findMany({
        where: { abbreviation: { in: abbrs } },
        include: { stats: { include: { season: true }, orderBy: { season: { startYear: 'asc' } } } },
      })
    : [];
  teams.sort((a, b) => abbrs.indexOf(a.abbreviation) - abbrs.indexOf(b.abbreviation));

  const picked = teams.map((t, i) => ({ key: t.abbreviation, name: `${t.city} ${t.name}`, color: SERIES_COLORS[i] }));
  if (!teams.length) {
    return {
      picked,
      content: (
        <Empty>
          Add a team above to start, or open a game preview and compare the two sides from there.
        </Empty>
      ),
    };
  }

  const seasonRows = teams.map((t) => t.stats.find((s) => s.season.key === seasonKey));
  const per = (get: (s: NonNullable<(typeof seasonRows)[number]>) => number | null | undefined) => seasonRows.map((s) => (s ? get(s) ?? null : null));
  const rate = (made: number | null, att: number | null) => (made !== null && att ? (made / att) * 100 : null);
  const lines: Line[] = [
    {
      label: 'Record',
      values: per((s) => (s.wins + s.losses ? s.wins / (s.wins + s.losses) : null)),
      text: seasonRows.map((s) => (s ? `${s.wins}-${s.losses}${s.wins + s.losses ? ` (${pct3(s.wins / (s.wins + s.losses))})` : ''}` : '—')),
    },
    { label: 'Points per game', dp: 1, values: per((s) => perGame(s.pts, s.gp)) },
    { label: 'Points allowed per game', dp: 1, lowerIsBetter: true, values: per((s) => perGame(s.oppPts, s.gp)) },
    { label: 'Net rating', dp: 1, values: per((s) => s.netRtg) },
    { label: 'Offensive rating', dp: 1, values: per((s) => s.ortg) },
    { label: 'Defensive rating', dp: 1, lowerIsBetter: true, values: per((s) => s.drtg) },
    { label: 'Pace', dp: 1, neutral: true, values: per((s) => s.pace) },
    { label: 'Effective FG%', dp: 1, values: per((s) => s.efgPct) },
    { label: 'True shooting %', dp: 1, values: per((s) => s.tsPct) },
    { label: 'Three point %', dp: 1, values: per((s) => rate(s.fg3m, s.fg3a)) },
    { label: 'Threes per shot, %', dp: 1, neutral: true, values: per((s) => rate(s.fg3a, s.fga)) },
    { label: 'Turnover %', dp: 1, lowerIsBetter: true, values: per((s) => s.tovPct) },
    { label: 'Off. rebound %', dp: 1, values: per((s) => s.orebPct) },
    { label: 'Def. rebound %', dp: 1, values: per((s) => s.drebPct) },
    { label: 'Free throw rate', dp: 3, values: per((s) => s.ftRate) },
    { label: 'Opp. eFG%', dp: 1, lowerIsBetter: true, values: per((s) => s.oppEfgPct) },
    { label: 'Forced TOV %', dp: 1, values: per((s) => s.oppTovPct) },
  ];

  // This season's meetings between any two of them.
  const ids = teams.map((t) => t.id);
  const meetings = await prisma.game.findMany({
    where: {
      season: { key: seasonKey },
      kind: { not: 'preseason' },
      status: { startsWith: 'Final' },
      homeTeamId: { in: ids },
      awayTeamId: { in: ids },
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { date: 'desc' },
  });

  // Two teams: league ranks for the mirrored bars, and a sample of each one's shots.
  const duel =
    teams.length === 2 && seasonRows[0] && seasonRows[1]
      ? await (async () => {
          const [league, ...shots] = await Promise.all([
            prisma.teamStats.findMany({ where: { seasonId: seasonRows[0]!.seasonId } }),
            ...teams.map((t) =>
              // Every third shot: plenty for the hex bins, a third of the payload.
              prisma.$queryRaw<Shot[]>`
                SELECT x, y, made, value, "distanceFt", zone FROM shot_data
                WHERE "teamId" = ${t.id} AND "seasonId" = ${seasonRows[0]!.seasonId} AND "eventNum" IS NOT NULL AND id % 3 = 0
                LIMIT 6000`,
            ),
          ]);
          return { groups: teamMirror(seasonRows[0]!, seasonRows[1]!, league), shots };
        })()
      : null;
  const sides = teams.map((t) => ({ name: t.abbreviation, color: t.primaryColor }));

  const trendKeys = [...new Set(teams.flatMap((t) => t.stats.filter((s) => s.netRtg !== null).map((s) => s.season.key)))]
    .sort()
    .slice(-TREND_SEASONS);
  const trendData = trendKeys.map((key) => {
    const row: Record<string, string | number | null> = { label: key };
    for (const t of teams) row[t.abbreviation] = t.stats.find((s) => s.season.key === key)?.netRtg ?? null;
    return row;
  });

  return {
    picked,
    content: (
      <>
        {duel && (
          <>
            <div className="flex items-center justify-between text-sm font-bold">
              {teams.map((t) => (
                <span key={t.id} className="flex items-center gap-2">
                  <TeamMark abbr={t.abbreviation} color={t.primaryColor} size={28} />
                  {t.city} {t.name}
                </span>
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {duel.groups.map((g) => (
                <MirrorBars key={g.title} title={g.title} rows={g.rows} a={sides[0]} b={sides[1]} />
              ))}
            </div>
            <p className="-mt-3 text-xs" style={{ color: 'var(--ink-3)' }}>
              Bar length is the league rank in that stat (first is full width); the number and rank are beside it and the better side is bold.
            </p>

            <section>
              <h2 className="mb-2 text-sm font-semibold">Four factors, offense against defense</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {[[0, 1], [1, 0]].map(([o, d]) => (
                  <div key={o} className="panel overflow-x-auto">
                    <table className="stat-table">
                      <caption className="eyebrow px-3 py-2 text-left">
                        {teams[o].abbreviation} offense vs. {teams[d].abbreviation} defense
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col" style={{ textAlign: 'left', cursor: 'default' }}>Factor</th>
                          <th scope="col" style={{ cursor: 'default' }}>{teams[o].abbreviation} does</th>
                          <th scope="col" style={{ cursor: 'default' }}>{teams[d].abbreviation} allows</th>
                          <th scope="col" style={{ cursor: 'default' }}>Edge</th>
                        </tr>
                      </thead>
                      <tbody>
                        {faceoff(seasonRows[o]!, seasonRows[d]!).map((f) => {
                          const gap = f.off === null || f.def === null ? null : (f.off - f.def) * (f.offBetterHigh ? 1 : -1);
                          return (
                            <tr key={f.label}>
                              <td style={{ textAlign: 'left' }}>{f.label}</td>
                              <td>{fmt(f.off, 1)}</td>
                              <td>{fmt(f.def, 1)}</td>
                              <td style={{ fontWeight: 600 }}>
                                {gap === null ? '—' : Math.abs(gap) < 0.5 ? 'Even' : `${gap > 0 ? teams[o].abbreviation : teams[d].abbreviation} +${Math.abs(gap).toFixed(1)}`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-xs" style={{ color: 'var(--ink-3)' }}>
                What one team&apos;s offense usually does against what the other&apos;s defense usually allows. The edge goes to whichever is further from the other&apos;s norm.
              </p>
            </section>

            <section>
              <h2 className="mb-2 text-sm font-semibold">Shot profiles</h2>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {teams.map((t, i) => (
                  <ShotChart key={t.id} shots={duel.shots[i]} title={`${t.city} ${t.name}`} subtitle={`${seasonKey} · sampled`} height={420} />
                ))}
              </div>
            </section>
          </>
        )}

        <CompareTable
          columns={teams.map((t, i) => ({
            key: t.abbreviation,
            color: SERIES_COLORS[i],
            label: (
              <Link href={`/teams/${t.abbreviation}`} className="flex items-center gap-1.5 no-underline" style={{ color: 'inherit' }}>
                <TeamMark abbr={t.abbreviation} color={t.primaryColor} size={18} />
                {t.abbreviation}
              </Link>
            ),
          }))}
          lines={lines}
        />

        {teams.length > 1 && (
          <section>
            <h2 className="mb-2 text-sm font-semibold">Meetings, {seasonKey}</h2>
            {meetings.length ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {meetings.map((g) => (
                  <Link key={g.id} href={`/games/${g.id}`} className="panel p-2.5 text-sm no-underline hover:bg-[var(--panel-2)]" style={{ color: 'var(--ink)' }}>
                    <div className="eyebrow mb-1">
                      {g.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}
                      {g.kind !== 'regular' && ` · ${g.kind === 'playoffs' ? 'Playoffs' : g.kind === 'play-in' ? 'Play-In' : 'NBA Cup'}`}
                    </div>
                    {g.awayTeam.abbreviation} {g.awayScore}, {g.homeTeam.abbreviation} {g.homeScore}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="panel p-4 text-sm" style={{ color: 'var(--ink-3)' }}>
                They haven&apos;t met yet this season.
              </p>
            )}
          </section>
        )}

        {trendData.length > 1 && (
          <TrendChart
            title={`Net rating by season, last ${trendData.length}`}
            data={trendData}
            series={teams.map((t) => ({ key: t.abbreviation, label: t.abbreviation }))}
            height={280}
          />
        )}
      </>
    ),
  };
}
