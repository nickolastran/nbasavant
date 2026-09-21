import { Suspense } from 'react';
import { prisma, getSeason } from '@/lib/db';
import { FilterBar } from '@/components/FilterBar';
import { StatTable, type Col } from '@/components/StatTable';
import { TEAM_OPTIONS, POSITION_OPTIONS, seasonOptions } from '@/lib/options';

export const metadata = { title: 'Players' };
export const revalidate = 60;

type Row = {
  playerId: number; player: string; team: string; pos: string;
  gp: number; min: number; ppg: number; rpg: number; apg: number;
  fgPct: number; fg3Pct: number; tsPct: number; usgPct: number;
};

const COLS: Col<Row>[] = [
  { key: 'player', label: 'Player' },
  { key: 'team', label: 'Team' },
  { key: 'pos', label: 'Pos' },
  { key: 'gp', label: 'GP' },
  { key: 'min', label: 'MPG', dp: 1, shade: true },
  { key: 'ppg', label: 'PPG', dp: 1, shade: true },
  { key: 'rpg', label: 'RPG', dp: 1, shade: true },
  { key: 'apg', label: 'APG', dp: 1, shade: true },
  { key: 'fgPct', label: 'FG%', dp: 1, shade: true },
  { key: 'fg3Pct', label: '3P%', dp: 1, shade: true },
  { key: 'tsPct', label: 'TS%', dp: 1, shade: true, title: 'True shooting percentage' },
  { key: 'usgPct', label: 'USG%', dp: 1, shade: true, title: 'Share of team possessions used' },
];

export default async function PlayersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const active = await getSeason();
  const seasonKey = sp.season || active?.key;
  const seasons = await prisma.season.findMany({ orderBy: { startYear: 'desc' } });

  const rows = await prisma.playerStats.findMany({
    where: {
      season: { key: seasonKey },
      ...(sp.q ? { player: { fullName: { contains: sp.q, mode: 'insensitive' } } } : {}),
      ...(sp.team ? { player: { team: { abbreviation: sp.team } } } : {}),
      ...(sp.position ? { player: { position: sp.position } } : {}),
      gp: { gte: Number(sp.minGp) || 1 },
    },
    include: {
      player: { select: { id: true, fullName: true, position: true, team: { select: { abbreviation: true } } } },
    },
    orderBy: { ppg: 'desc' },
    take: 600,
  });

  const data: Row[] = rows.map((r) => ({
    playerId: r.playerId,
    player: r.player.fullName,
    team: r.player.team?.abbreviation ?? '',
    pos: r.player.position ?? '',
    gp: r.gp,
    min: r.gp ? r.min / r.gp : 0,
    ppg: r.ppg, rpg: r.rpg, apg: r.apg,
    fgPct: r.fgPct, fg3Pct: r.fg3Pct, tsPct: r.tsPct, usgPct: r.usgPct,
  }));

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold tracking-tight">Players</h1>
      <p className="mb-4 text-sm" style={{ color: 'var(--ink-2)' }}>
        {data.length} players in {seasonKey}. Click a column to sort; cells are shaded by percentile
        against everyone shown.
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

      <StatTable
        rows={data}
        cols={COLS}
        initialSort="ppg"
        href={{ base: '/players', key: 'playerId' }}
        filename={`players-${seasonKey}`}
      />
    </div>
  );
}
