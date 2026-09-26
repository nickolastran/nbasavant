import { Suspense } from 'react';
import { prisma, getSeason } from '@/lib/db';
import { FilterBar } from '@/components/FilterBar';
import { StatTable, type Col } from '@/components/StatTable';
import { TEAM_OPTIONS, POSITION_OPTIONS, seasonOptions } from '@/lib/options';
import { perGame } from '@/lib/format';

export const metadata = { title: 'Stat Explorer' };
export const revalidate = 60;

type Row = Record<string, string | number | null>;

/** Column groups the picker offers; box score is always on. */
const GROUPS = {
  box: [
    { key: 'gp', label: 'GP' },
    { key: 'mpg', label: 'MPG', dp: 1 },
    { key: 'ppg', label: 'PPG', dp: 1, shade: true },
    { key: 'rpg', label: 'RPG', dp: 1, shade: true },
    { key: 'apg', label: 'APG', dp: 1, shade: true },
    { key: 'spg', label: 'SPG', dp: 1 },
    { key: 'bpg', label: 'BPG', dp: 1 },
    { key: 'topg', label: 'TOV', dp: 1, lowerIsBetter: true },
  ],
  shooting: [
    { key: 'fgPct', label: 'FG%', dp: 1, shade: true },
    { key: 'fg3Pct', label: '3P%', dp: 1, shade: true },
    { key: 'ftPct', label: 'FT%', dp: 1 },
    { key: 'efgPct', label: 'eFG%', dp: 1, shade: true },
    { key: 'tsPct', label: 'TS%', dp: 1, shade: true },
    { key: 'fga', label: 'FGA' },
    { key: 'fg3a', label: '3PA' },
  ],
  advanced: [
    { key: 'per', label: 'PER', dp: 1, shade: true, title: 'Player efficiency rating (league average 15)' },
    { key: 'usgPct', label: 'USG%', dp: 1, shade: true },
    { key: 'ortg', label: 'ORtg', dp: 1, shade: true },
    { key: 'drtg', label: 'DRtg', dp: 1, shade: true, lowerIsBetter: true },
    { key: 'ws', label: 'WS', dp: 2, shade: true },
    { key: 'ws48', label: 'WS/48', dp: 3, shade: true },
    { key: 'obpm', label: 'OBPM', dp: 1 },
    { key: 'dbpm', label: 'DBPM', dp: 1 },
    { key: 'bpm', label: 'BPM', dp: 1, shade: true },
    { key: 'vorp', label: 'VORP', dp: 2, shade: true },
    { key: 'astPct', label: 'AST%', dp: 1 },
    { key: 'rebPct', label: 'REB%', dp: 1 },
    { key: 'tovPct', label: 'TOV%', dp: 1, lowerIsBetter: true },
  ],
} as const;

export default async function ExplorerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const active = await getSeason();
  const seasonKey = sp.season || active?.key;
  const seasons = await prisma.season.findMany({ orderBy: { startYear: 'desc' } });
  const view = sp.view ?? 'players';
  const minGp = Number(sp.minGp) || 10;

  const filters = (
    <Suspense>
      <FilterBar
        fields={[
          {
            kind: 'select', name: 'view', label: 'Group by',
            options: [
              { value: 'players', label: 'Players' },
              { value: 'teams', label: 'Teams' },
            ],
          },
          { kind: 'select', name: 'season', label: 'Season', options: seasonOptions(seasons), defaultValue: seasonKey },
          { kind: 'select', name: 'team', label: 'Team', options: TEAM_OPTIONS },
          { kind: 'select', name: 'position', label: 'Position', options: POSITION_OPTIONS },
          { kind: 'number', name: 'minGp', label: 'Min games', min: 0 },
          {
            kind: 'select', name: 'cols', label: 'Columns',
            options: [
              { value: '', label: 'Box + advanced' },
              { value: 'box', label: 'Box score only' },
              { value: 'shooting', label: 'Shooting only' },
              { value: 'advanced', label: 'Advanced only' },
            ],
          },
        ]}
      />
    </Suspense>
  );

  if (view === 'teams') {
    const teams = await prisma.teamStats.findMany({
      where: { season: { key: seasonKey }, ...(sp.team ? { team: { abbreviation: sp.team } } : {}) },
      include: { team: true },
    });
    const rows: Row[] = teams.map((t) => ({
      team: t.name ?? `${t.team.city} ${t.team.name}`,
      abbr: t.team.abbreviation,
      conf: t.conference ?? t.division ?? '',
      gp: t.gp, wins: t.wins, losses: t.losses,
      pace: t.pace, ortg: t.ortg, drtg: t.drtg, netRtg: t.netRtg,
      efgPct: t.efgPct, tsPct: t.tsPct, tovPct: t.tovPct,
      orebPct: t.orebPct, drebPct: t.drebPct, ftRate: t.ftRate,
      oppEfgPct: t.oppEfgPct, sos: t.sos,
    }));
    return (
      <div>
        <Header seasonKey={seasonKey} count={rows.length} unit="teams" />
        {filters}
        <StatTable
          rows={rows}
          cols={[
            { key: 'team', label: 'Team' },
            { key: 'conf', label: 'Conf' },
            { key: 'wins', label: 'W' },
            { key: 'losses', label: 'L' },
            { key: 'pace', label: 'Pace', dp: 1, shade: true },
            { key: 'ortg', label: 'ORtg', dp: 1, shade: true },
            { key: 'drtg', label: 'DRtg', dp: 1, shade: true, lowerIsBetter: true },
            { key: 'netRtg', label: 'NetRtg', dp: 1, shade: true },
            { key: 'efgPct', label: 'eFG%', dp: 1, shade: true },
            { key: 'tsPct', label: 'TS%', dp: 1, shade: true },
            { key: 'tovPct', label: 'TOV%', dp: 1, shade: true, lowerIsBetter: true },
            { key: 'orebPct', label: 'OREB%', dp: 1, shade: true },
            { key: 'drebPct', label: 'DREB%', dp: 1, shade: true },
            { key: 'ftRate', label: 'FT Rate', dp: 1 },
            { key: 'oppEfgPct', label: 'Opp eFG%', dp: 1, lowerIsBetter: true, shade: true },
            { key: 'sos', label: 'SOS', dp: 2 },
          ]}
          initialSort="netRtg"
          filename={`team-stats-${seasonKey}`}
        />
      </div>
    );
  }

  const stats = await prisma.playerStats.findMany({
    where: {
      season: { key: seasonKey },
      gp: { gte: minGp },
      // The team he played for that season, not the one he's on now.
      ...(sp.team ? { team: { abbreviation: sp.team } } : {}),
      ...(sp.position ? { player: { position: sp.position } } : {}),
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
    take: 800,
  });

  const rows: Row[] = stats.map((s) => {
    const a = s.player.advancedStats[0];
    return {
      player: s.player.fullName,
      playerId: s.playerId,
      team: s.team?.abbreviation ?? '',
      pos: s.player.position ?? '',
      gp: s.gp, mpg: perGame(s.min, s.gp),
      ppg: s.ppg, rpg: s.rpg, apg: s.apg,
      spg: perGame(s.stl, s.gp), bpg: perGame(s.blk, s.gp), topg: perGame(s.tov, s.gp),
      fgPct: s.fgPct, fg3Pct: s.fg3Pct, ftPct: s.ftPct,
      efgPct: s.efgPct, tsPct: s.tsPct, fga: s.fga, fg3a: s.fg3a,
      per: a?.per ?? null, usgPct: s.usgPct, ortg: a?.ortg ?? null, drtg: a?.drtg ?? null,
      ws: a?.ws ?? null, ws48: a?.ws48 ?? null, obpm: a?.obpm ?? null, dbpm: a?.dbpm ?? null,
      bpm: a?.bpm ?? null, vorp: a?.vorp ?? null,
      astPct: a?.astPct ?? null, rebPct: a?.rebPct ?? null, tovPct: a?.tovPct ?? null,
    };
  });

  const chosen = (sp.cols && sp.cols in GROUPS
    ? [...GROUPS[sp.cols as keyof typeof GROUPS]]
    : [...GROUPS.box, ...GROUPS.shooting, ...GROUPS.advanced]) as Col<Row>[];

  return (
    <div>
      <Header seasonKey={seasonKey} count={rows.length} unit="player-seasons" />
      {filters}
      <StatTable
        rows={rows}
        cols={[
          { key: 'player', label: 'Player' },
          { key: 'team', label: 'Team' },
          { key: 'pos', label: 'Pos' },
          ...chosen,
        ]}
        initialSort="ppg"
        href={{ base: '/players', key: 'playerId' }}
        filename={`explorer-${seasonKey}`}
        pageSize={60}
      />
    </div>
  );
}

function Header({ seasonKey, count, unit }: { seasonKey?: string; count: number; unit: string }) {
  return (
    <>
      <h1 className="mb-1 text-xl font-bold tracking-tight">Stat Explorer</h1>
      <p className="mb-4 text-sm" style={{ color: 'var(--ink-2)' }}>
        {count} {unit} in {seasonKey}. Sort any column, shade shows percentile within the current
        filter, and CSV/JSON export what you see.
      </p>
    </>
  );
}
