import { Suspense } from 'react';
import { getSeason, prisma } from '@/lib/db';
import { FilterBar } from '@/components/FilterBar';
import { StatTable, type Col } from '@/components/StatTable';
import { TrendChart } from '@/components/TrendChart';
import { ViewTabs } from '@/components/ViewTabs';
import { perGame } from '@/lib/format';
import { seasonOptions } from '@/lib/options';

export const metadata = { title: 'Team Stats' };
export const revalidate = 60;

type Row = Record<string, string | number | null>;

const VIEWS = [
  { value: 'pergame', label: 'Per Game' },
  { value: 'advanced', label: 'Advanced' },
];

const LEAD: Col<Row>[] = [
  { key: 'team', label: 'Team' },
  { key: 'conf', label: 'Conf' },
  { key: 'wins', label: 'W' },
  { key: 'losses', label: 'L' },
];

const COLS: Record<string, Col<Row>[]> = {
  pergame: [
    { key: 'ppg', label: 'PTS', dp: 1, shade: true },
    { key: 'oppg', label: 'OPP', dp: 1, shade: true, lowerIsBetter: true, title: 'Points allowed per game' },
    { key: 'diff', label: 'DIFF', dp: 1, shade: true, title: 'Point differential per game' },
    { key: 'fgPct', label: 'FG%', dp: 1, shade: true },
    { key: 'fg3pg', label: '3PM', dp: 1, shade: true },
    { key: 'fg3Pct', label: '3P%', dp: 1, shade: true },
    { key: 'ftPct', label: 'FT%', dp: 1, shade: true },
    { key: 'rpg', label: 'REB', dp: 1, shade: true },
    { key: 'orpg', label: 'OREB', dp: 1, shade: true },
    { key: 'apg', label: 'AST', dp: 1, shade: true },
    { key: 'spg', label: 'STL', dp: 1, shade: true },
    { key: 'bpg', label: 'BLK', dp: 1, shade: true },
    { key: 'topg', label: 'TOV', dp: 1, shade: true, lowerIsBetter: true },
  ],
  advanced: [
    { key: 'ortg', label: 'ORtg', dp: 1, shade: true, title: 'Points scored per 100 possessions' },
    { key: 'drtg', label: 'DRtg', dp: 1, shade: true, lowerIsBetter: true, title: 'Points allowed per 100 possessions' },
    { key: 'netRtg', label: 'NetRtg', dp: 1, shade: true },
    { key: 'pace', label: 'Pace', dp: 1, shade: true, title: 'Possessions per 48 minutes' },
    { key: 'efgPct', label: 'eFG%', dp: 1, shade: true },
    { key: 'tovPct', label: 'TOV%', dp: 1, shade: true, lowerIsBetter: true },
    { key: 'orebPct', label: 'OREB%', dp: 1, shade: true },
    { key: 'ftRate', label: 'FT Rate', dp: 3, shade: true, title: 'Free throws attempted per field goal attempt' },
    { key: 'oppEfgPct', label: 'Opp eFG%', dp: 1, shade: true, lowerIsBetter: true },
    { key: 'oppTovPct', label: 'Opp TOV%', dp: 1, shade: true },
    { key: 'drebPct', label: 'DREB%', dp: 1, shade: true },
    { key: 'sos', label: 'SOS', dp: 2, shade: true, title: 'Strength of schedule, points per game above average' },
  ],
};

export default async function TeamStatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const active = await getSeason();
  const seasonKey = sp.season || active?.key;
  const seasons = await prisma.season.findMany({ where: { active: true }, orderBy: { startYear: 'desc' } });
  const view = sp.view === 'advanced' ? 'advanced' : 'pergame';

  const teams = await prisma.teamStats.findMany({
    where: { season: { key: seasonKey }, ...(sp.conference ? { conference: sp.conference } : {}) },
    include: { team: true },
  });

  const pct = (m: number | null, a: number | null) => (m !== null && a ? (m / a) * 100 : null);
  const rows: Row[] = teams.map((t) => ({
    abbr: t.team.abbreviation,
    link: `${t.team.abbreviation}?season=${seasonKey}`,
    team: t.name ?? `${t.team.city} ${t.team.name}`,
    conf: t.conference ?? t.division ?? '',
    wins: t.wins, losses: t.losses,
    ppg: perGame(t.pts, t.gp), oppg: perGame(t.oppPts, t.gp),
    diff: t.pts !== null && t.oppPts !== null && t.gp ? (t.pts - t.oppPts) / t.gp : null,
    fgPct: pct(t.fgm, t.fga), fg3pg: perGame(t.fg3m, t.gp), fg3Pct: pct(t.fg3m, t.fg3a), ftPct: pct(t.ftm, t.fta),
    rpg: perGame(t.reb, t.gp), orpg: perGame(t.oreb, t.gp), apg: perGame(t.ast, t.gp),
    spg: perGame(t.stl, t.gp), bpg: perGame(t.blk, t.gp), topg: perGame(t.tov, t.gp),
    pace: t.pace, ortg: t.ortg, drtg: t.drtg, netRtg: t.netRtg,
    efgPct: t.efgPct, tovPct: t.tovPct, orebPct: t.orebPct, ftRate: t.ftRate,
    oppEfgPct: t.oppEfgPct, oppTovPct: t.oppTovPct, drebPct: t.drebPct, sos: t.sos,
  }));

  const paced = rows.filter((r) => r.pace !== null);
  const paceData = [...paced]
    .sort((a, b) => (b.pace as number) - (a.pace as number))
    .map((r) => ({ label: r.abbr, pace: r.pace }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-xl font-bold tracking-tight">Team Stats</h1>
        <p className="mb-4 text-sm" style={{ color: 'var(--ink-2)' }}>
          {seasonKey}, regular season. Ratings are per 100 possessions, so they compare cleanly across teams that
          play at different speeds.
        </p>
        <Suspense>
          <FilterBar
            fields={[
              { kind: 'select', name: 'season', label: 'Season', options: seasonOptions(seasons), defaultValue: seasonKey },
              {
                kind: 'select', name: 'conference', label: 'Conference',
                options: [
                  { value: '', label: 'Both' },
                  { value: 'East', label: 'East' },
                  { value: 'West', label: 'West' },
                ],
              },
            ]}
          />
        </Suspense>
        <ViewTabs views={VIEWS} current={view} params={Object.fromEntries(Object.entries(sp).filter(([k]) => k !== 'view'))} />
        <StatTable
          rows={rows}
          cols={[...LEAD, ...COLS[view]]}
          initialSort={view === 'advanced' ? 'netRtg' : 'ppg'}
          href={{ base: '/teams', key: 'link' }}
          filename={`teams-${view}-${seasonKey}`}
          pageSize={40}
          empty="No team stats for this season."
        />
      </div>

      {view === 'advanced' && paceData.length > 0 && (
        // Pace alone: net rating shares no scale with it, so it gets the table
        // rather than a second y-axis.
        <TrendChart
          title="Pace, fastest to slowest"
          data={paceData}
          series={[{ key: 'pace', label: 'Possessions per 48 minutes' }]}
          height={420}
        />
      )}
    </div>
  );
}
