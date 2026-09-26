import { Suspense } from 'react';
import { getSeason, prisma } from '@/lib/db';
import { FilterBar } from '@/components/FilterBar';
import { StatTable, type Col } from '@/components/StatTable';
import { ViewTabs } from '@/components/ViewTabs';
import { perGame } from '@/lib/format';
import { POSITION_OPTIONS, TEAM_OPTIONS, seasonOptions } from '@/lib/options';

export const metadata = { title: 'Player Stats' };
export const revalidate = 60;

type Row = Record<string, string | number | null>;

const VIEWS = [
  { value: 'pergame', label: 'Per Game' },
  { value: 'totals', label: 'Totals' },
  { value: 'advanced', label: 'Advanced' },
];

const LEAD: Col<Row>[] = [
  { key: 'player', label: 'Player' },
  { key: 'team', label: 'Team' },
  { key: 'pos', label: 'Pos' },
  { key: 'gp', label: 'GP' },
];

const COLS: Record<string, Col<Row>[]> = {
  pergame: [
    { key: 'gs', label: 'GS' },
    { key: 'mpg', label: 'MIN', dp: 1, shade: true },
    { key: 'ppg', label: 'PTS', dp: 1, shade: true },
    { key: 'rpg', label: 'REB', dp: 1, shade: true },
    { key: 'apg', label: 'AST', dp: 1, shade: true },
    { key: 'spg', label: 'STL', dp: 1, shade: true },
    { key: 'bpg', label: 'BLK', dp: 1, shade: true },
    { key: 'topg', label: 'TOV', dp: 1, shade: true, lowerIsBetter: true },
    { key: 'fgPct', label: 'FG%', dp: 1, shade: true },
    { key: 'fg3Pct', label: '3P%', dp: 1, shade: true },
    { key: 'ftPct', label: 'FT%', dp: 1, shade: true },
    { key: 'tsPct', label: 'TS%', dp: 1, shade: true, title: 'True shooting percentage' },
  ],
  totals: [
    { key: 'gs', label: 'GS' },
    { key: 'min', label: 'MIN', dp: 0 },
    { key: 'pts', label: 'PTS', shade: true },
    { key: 'reb', label: 'REB', shade: true },
    { key: 'ast', label: 'AST', shade: true },
    { key: 'stl', label: 'STL', shade: true },
    { key: 'blk', label: 'BLK', shade: true },
    { key: 'tov', label: 'TOV', shade: true, lowerIsBetter: true },
    { key: 'fgm', label: 'FGM' },
    { key: 'fga', label: 'FGA' },
    { key: 'fg3m', label: '3PM', shade: true },
    { key: 'fg3a', label: '3PA' },
    { key: 'ftm', label: 'FTM' },
    { key: 'fta', label: 'FTA' },
  ],
  advanced: [
    { key: 'per', label: 'PER', dp: 1, shade: true, title: 'Player efficiency rating; league average is 15' },
    { key: 'tsPct', label: 'TS%', dp: 1, shade: true },
    { key: 'usgPct', label: 'USG%', dp: 1, shade: true, title: 'Share of team possessions used' },
    { key: 'astPct', label: 'AST%', dp: 1, shade: true },
    { key: 'rebPct', label: 'REB%', dp: 1, shade: true },
    { key: 'ows', label: 'OWS', dp: 1, shade: true },
    { key: 'dws', label: 'DWS', dp: 1, shade: true },
    { key: 'ws', label: 'WS', dp: 1, shade: true, title: 'Win shares' },
    { key: 'ws48', label: 'WS/48', dp: 3, shade: true },
    { key: 'obpm', label: 'OBPM', dp: 1, shade: true },
    { key: 'dbpm', label: 'DBPM', dp: 1, shade: true },
    { key: 'bpm', label: 'BPM', dp: 1, shade: true, title: 'Box plus/minus' },
    { key: 'vorp', label: 'VORP', dp: 1, shade: true, title: 'Value over replacement player' },
  ],
};

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const active = await getSeason();
  const seasonKey = sp.season || active?.key;
  const seasons = await prisma.season.findMany({ where: { active: true }, orderBy: { startYear: 'desc' } });
  const view = sp.view in COLS ? sp.view : 'pergame';

  const rows = await prisma.playerStats.findMany({
    where: {
      season: { key: seasonKey },
      gp: { gte: Number(sp.minGp) || 1 },
      // The team he played for that season, not the one he's on now.
      ...(sp.team ? { team: { abbreviation: sp.team } } : {}),
      player: {
        ...(sp.q ? { fullName: { contains: sp.q, mode: 'insensitive' } } : {}),
        ...(sp.position ? { position: sp.position } : {}),
      },
    },
    include: {
      team: { select: { abbreviation: true } },
      player: {
        select: {
          id: true, fullName: true, position: true,
          advancedStats: { where: { season: { key: seasonKey } } },
        },
      },
    },
    orderBy: { ppg: 'desc' },
    take: 700,
  });

  const data: Row[] = rows.map((r) => {
    const a = r.player.advancedStats[0];
    return {
      playerId: r.playerId,
      player: r.player.fullName,
      team: r.team?.abbreviation ?? '',
      pos: r.player.position ?? '',
      gp: r.gp, gs: r.gs,
      mpg: perGame(r.min, r.gp), ppg: r.ppg, rpg: r.rpg, apg: r.apg,
      spg: perGame(r.stl, r.gp), bpg: perGame(r.blk, r.gp), topg: perGame(r.tov, r.gp),
      min: r.min, pts: r.pts, reb: r.reb, ast: r.ast, stl: r.stl, blk: r.blk, tov: r.tov,
      fgm: r.fgm, fga: r.fga, fg3m: r.fg3m, fg3a: r.fg3a, ftm: r.ftm, fta: r.fta,
      fgPct: r.fgPct, fg3Pct: r.fg3Pct, ftPct: r.ftPct, tsPct: r.tsPct, usgPct: r.usgPct,
      per: a?.per ?? null, astPct: a?.astPct ?? null, rebPct: a?.rebPct ?? null,
      ows: a?.ows ?? null, dws: a?.dws ?? null, ws: a?.ws ?? null, ws48: a?.ws48 ?? null,
      obpm: a?.obpm ?? null, dbpm: a?.dbpm ?? null, bpm: a?.bpm ?? null, vorp: a?.vorp ?? null,
    };
  });

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold tracking-tight">Player Stats</h1>
      <p className="mb-4 text-sm" style={{ color: 'var(--ink-2)' }}>
        {data.length} players in {seasonKey}. Click a column to sort; cells are shaded by percentile against
        everyone shown. A dash is a stat the league didn&apos;t keep yet that season.
      </p>

      <Suspense>
        <FilterBar
          fields={[
            { kind: 'select', name: 'season', label: 'Season', options: seasonOptions(seasons), defaultValue: seasonKey },
            { kind: 'text', name: 'q', label: 'Name', placeholder: 'Search' },
            { kind: 'select', name: 'team', label: 'Team', options: TEAM_OPTIONS },
            { kind: 'select', name: 'position', label: 'Position', options: POSITION_OPTIONS },
            { kind: 'number', name: 'minGp', label: 'Min games', min: 0 },
          ]}
        />
      </Suspense>
      <ViewTabs views={VIEWS} current={view} params={Object.fromEntries(Object.entries(sp).filter(([k]) => k !== 'view'))} />

      <StatTable
        rows={data}
        cols={[...LEAD, ...COLS[view]]}
        initialSort={view === 'advanced' ? 'per' : view === 'totals' ? 'pts' : 'ppg'}
        href={{ base: '/players', key: 'playerId' }}
        filename={`players-${view}-${seasonKey}`}
      />
    </div>
  );
}
