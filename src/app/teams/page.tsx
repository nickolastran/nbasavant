import { Suspense } from 'react';
import { prisma, getSeason } from '@/lib/db';
import { FilterBar } from '@/components/FilterBar';
import { StatTable } from '@/components/StatTable';
import { TrendChart } from '@/components/TrendChart';
import { seasonOptions } from '@/lib/options';

export const metadata = { title: 'Team Analytics' };
export const revalidate = 60;


export default async function TeamsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const active = await getSeason();
  const seasonKey = sp.season || active?.key;
  const seasons = await prisma.season.findMany({ orderBy: { startYear: 'desc' } });

  const teams = await prisma.teamStats.findMany({
    where: {
      season: { key: seasonKey },
      ...(sp.conference ? { team: { conference: sp.conference } } : {}),
    },
    include: { team: true },
    orderBy: { netRtg: 'desc' },
  });

  const rows = teams.map((t) => ({
    team: `${t.team.city} ${t.team.name}`,
    abbr: t.team.abbreviation,
    conf: t.team.conference,
    div: t.team.division,
    wins: t.wins, losses: t.losses,
    pace: t.pace, ortg: t.ortg, drtg: t.drtg, netRtg: t.netRtg,
    efgPct: t.efgPct, tovPct: t.tovPct, orebPct: t.orebPct, ftRate: t.ftRate,
    oppEfgPct: t.oppEfgPct, oppTovPct: t.oppTovPct, drebPct: t.drebPct,
    sos: t.sos,
  }));

  const paceData = [...rows]
    .sort((a, b) => b.pace - a.pace)
    .map((r) => ({ label: r.abbr, pace: r.pace, netRtg: r.netRtg }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-xl font-bold tracking-tight">Team Analytics</h1>
        <p className="mb-4 text-sm" style={{ color: 'var(--ink-2)' }}>
          Ratings are per 100 possessions, so they compare cleanly across teams that play at
          different speeds.
        </p>
        <Suspense>
          <FilterBar
            fields={[
              { kind: 'select', name: 'season', label: 'Season', options: seasonOptions(seasons) },
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
        <StatTable
          rows={rows}
          cols={[
            { key: 'team', label: 'Team' },
            { key: 'conf', label: 'Conf' },
            { key: 'div', label: 'Division' },
            { key: 'wins', label: 'W' },
            { key: 'losses', label: 'L' },
            { key: 'ortg', label: 'ORtg', dp: 1, shade: true, title: 'Points scored per 100 possessions' },
            { key: 'drtg', label: 'DRtg', dp: 1, shade: true, lowerIsBetter: true, title: 'Points allowed per 100 possessions' },
            { key: 'netRtg', label: 'NetRtg', dp: 1, shade: true },
            { key: 'pace', label: 'Pace', dp: 1, shade: true, title: 'Possessions per 48 minutes' },
            { key: 'efgPct', label: 'eFG%', dp: 1, shade: true },
            { key: 'tovPct', label: 'TOV%', dp: 1, shade: true, lowerIsBetter: true },
            { key: 'orebPct', label: 'OREB%', dp: 1, shade: true },
            { key: 'ftRate', label: 'FT Rate', dp: 1, shade: true },
            { key: 'oppEfgPct', label: 'Opp eFG%', dp: 1, shade: true, lowerIsBetter: true },
            { key: 'oppTovPct', label: 'Opp TOV%', dp: 1, shade: true },
            { key: 'drebPct', label: 'DREB%', dp: 1, shade: true },
            { key: 'sos', label: 'SOS', dp: 2, shade: true, title: 'Strength of schedule, points per 100 above average' },
          ]}
          initialSort="netRtg"
          filename={`teams-${seasonKey}`}
          pageSize={30}
        />
      </div>

      <div>
        {/* Pace alone: net rating shares no scale with it, so it gets the table
            rather than a second y-axis. */}
        <TrendChart
          title="Pace, fastest to slowest"
          data={paceData}
          series={[{ key: 'pace', label: 'Possessions per 48 minutes' }]}
          height={420}
        />
      </div>
    </div>
  );
}
