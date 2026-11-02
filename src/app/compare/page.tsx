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
