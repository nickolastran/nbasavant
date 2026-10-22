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
  { key: 'gp', label: 'GP' },
];

const COLS: Record<string, Col<Row>[]> = {
  pergame: [
    { key: 'ppg', label: 'PTS', dp: 1, shade: true },
    { key: 'fgmpg', label: 'FGM', dp: 1, shade: true },
    { key: 'fgapg', label: 'FGA', dp: 1 },
    { key: 'fgPct', label: 'FG%', dp: 1, shade: true },
    { key: 'fg3pg', label: '3PM', dp: 1, shade: true },
    { key: 'fg3apg', label: '3PA', dp: 1 },
    { key: 'fg3Pct', label: '3P%', dp: 1, shade: true },
    { key: 'ftmpg', label: 'FTM', dp: 1, shade: true },
    { key: 'ftapg', label: 'FTA', dp: 1 },
    { key: 'ftPct', label: 'FT%', dp: 1, shade: true },
    { key: 'orpg', label: 'OR', dp: 1, shade: true, title: 'Offensive rebounds' },
    { key: 'drpg', label: 'DR', dp: 1, shade: true, title: 'Defensive rebounds' },
    { key: 'rpg', label: 'REB', dp: 1, shade: true },
    { key: 'apg', label: 'AST', dp: 1, shade: true },
    { key: 'spg', label: 'STL', dp: 1, shade: true },
    { key: 'bpg', label: 'BLK', dp: 1, shade: true },
    { key: 'topg', label: 'TO', dp: 1, shade: true, lowerIsBetter: true, title: 'Turnovers per game' },
    { key: 'pfpg', label: 'PF', dp: 1, shade: true, lowerIsBetter: true, title: 'Personal fouls per game' },
  ],
  advanced: [
    { key: 'wins', label: 'W' },
    { key: 'losses', label: 'L' },
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
  // Regular season lives in TeamStats; playoffs and preseason in TeamSplitStats.
  const kind = sp.type === 'playoffs' || sp.type === 'preseason' ? sp.type : 'regular';

  const where = { season: { key: seasonKey } };
  const teams =
    kind === 'regular'
      ? await prisma.teamStats.findMany({ where, include: { team: true } })
      : await prisma.teamSplitStats.findMany({ where: { ...where, kind }, include: { team: true } });

  const pct = (m: number | null, a: number | null) => (m !== null && a ? (m / a) * 100 : null);
  const rows: Row[] = teams.map((t) => ({
    abbr: t.team.abbreviation,
    link: `${t.team.abbreviation}?season=${seasonKey}`,
    team: t.name ?? `${t.team.city} ${t.team.name}`,
    gp: t.gp, wins: t.wins, losses: t.losses,
    ppg: perGame(t.pts, t.gp),
    fgmpg: perGame(t.fgm, t.gp), fgapg: perGame(t.fga, t.gp), fgPct: pct(t.fgm, t.fga),
    fg3pg: perGame(t.fg3m, t.gp), fg3apg: perGame(t.fg3a, t.gp), fg3Pct: pct(t.fg3m, t.fg3a),
    ftmpg: perGame(t.ftm, t.gp), ftapg: perGame(t.fta, t.gp), ftPct: pct(t.ftm, t.fta),
    // Seasons loaded before DREB was kept: total minus offensive.
    orpg: perGame(t.oreb, t.gp),
    drpg: perGame(t.dreb ?? (t.reb !== null && t.oreb !== null ? t.reb - t.oreb : null), t.gp),
    rpg: perGame(t.reb, t.gp), apg: perGame(t.ast, t.gp),
    spg: perGame(t.stl, t.gp), bpg: perGame(t.blk, t.gp), topg: perGame(t.tov, t.gp), pfpg: perGame(t.pf, t.gp),
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
          {seasonKey} {kind === 'regular' ? 'regular season' : kind}. Ratings are per 100 possessions, so they compare cleanly across teams that
          play at different speeds.
        </p>
        <Suspense>
          <FilterBar
            fields={[
              { kind: 'select', name: 'season', label: 'Season', options: seasonOptions(seasons), defaultValue: seasonKey },
              {
                kind: 'select', name: 'type', label: 'Season type',
                options: [
                  { value: '', label: 'Regular season' },
                  { value: 'playoffs', label: 'Playoffs' },
                  { value: 'preseason', label: 'Preseason' },
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
          teamLogo="abbr"
          ranked
          tall
          filename={`teams-${kind}-${view}-${seasonKey}`}
          pageSize={40}
          empty={
            kind === 'preseason'
              ? 'No preseason stats for this season: they start with 2026-27, the first season saved from NBA box scores.'
              : `No ${kind === 'playoffs' ? 'playoff' : 'team'} stats for this season.`
          }
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
