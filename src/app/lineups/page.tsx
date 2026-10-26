import { Suspense } from 'react';
import { prisma } from '@/lib/db';
import { FilterBar } from '@/components/FilterBar';
import { StatTable, type Col } from '@/components/StatTable';
import { ViewTabs } from '@/components/ViewTabs';
import { lineups } from '@/lib/team';
import { scaledFloor } from '@/lib/stats';
import { TEAM_OPTIONS, seasonOptions } from '@/lib/options';

export const metadata = { title: 'Lineups' };
export const revalidate = 60;

type Row = Record<string, string | number | null>;

const VIEWS = [
  { value: '5', label: '5-man units' },
  { value: '2', label: '2-man pairs' },
];

/** Minutes together over 82 games before a unit's ratings mean much; prorated to games played. */
const FLOOR = { 5: 200, 2: 500 };

const COLS: Col<Row>[] = [
  { key: 'lineup', label: 'Lineup' },
  { key: 'team', label: 'Team', divide: true, logo: true },
  { key: 'gp', label: 'GP' },
  { key: 'min', label: 'MIN', dp: 0 },
  { key: 'poss', label: 'POSS', dp: 0, title: 'Possessions together, the average of both sides' },
  { key: 'plusMinus', label: '+/-', shade: true },
  { key: 'ortg', label: 'ORtg', dp: 1, shade: true, title: 'Points scored per 100 possessions together' },
  { key: 'drtg', label: 'DRtg', dp: 1, shade: true, lowerIsBetter: true, title: 'Points allowed per 100 possessions together' },
  { key: 'net', label: 'Net', dp: 1, shade: true, title: 'ORtg minus DRtg' },
];

export default async function LineupsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  // Lineup stints start in 2026-27.
  const seasons = await prisma.season.findMany({ where: { stints: { some: {} } }, orderBy: { startYear: 'desc' } });
  const season = seasons.find((s) => s.key === sp.season) ?? seasons[0];
  const size = sp.view === '2' ? 2 : 5;
  const team = sp.team ? await prisma.team.findUnique({ where: { abbreviation: sp.team } }) : null;

  const [units, teams, games] = season
    ? await Promise.all([
        lineups(season.id, { size, teamId: team?.id }),
        prisma.team.findMany({ select: { id: true, abbreviation: true } }),
        prisma.teamStats.aggregate({ where: { seasonId: season.id }, _max: { gp: true } }),
      ])
    : [[], [], null];
  const floor = sp.min ? Number(sp.min) || 0 : scaledFloor(FLOOR[size], games?._max.gp ?? 0);
  const abbr = new Map(teams.map((t) => [t.id, t.abbreviation]));
  const rows: Row[] = units
    // Under a possession the estimate can round to zero or below, and so can the ratings.
    .filter((u) => u.min >= floor && u.poss >= 1)
    .map((u) => ({ ...u, team: abbr.get(u.teamId) ?? null, players: u.players.join() }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Lineups {season?.key}</h1>
        <p className="mt-1 max-w-3xl text-sm" style={{ color: 'var(--ink-2)' }}>
          Every {size === 5 ? 'five-man unit' : 'pair of teammates'} in the league, rated per 100 possessions together
          {size === 2 ? ' across every lineup they shared' : ''}. Best first by net rating; click Net again for the worst.
          Showing units with {floor} minutes or more{sp.min ? '' : ` (${FLOOR[size]} over 82 games, prorated)`}.
        </p>
      </div>

      <ViewTabs views={VIEWS} current={String(size)} params={Object.fromEntries(Object.entries(sp).filter(([k]) => k !== 'view' && k !== 'min'))} />
      <Suspense>
        <FilterBar
          fields={[
            { kind: 'select', name: 'season', label: 'Season', defaultValue: season?.key, options: seasonOptions(seasons) },
            { kind: 'select', name: 'team', label: 'Team', options: TEAM_OPTIONS, logos: true },
            { kind: 'number', name: 'min', label: 'Min minutes together', min: 0, step: 10, defaultValue: String(floor) },
          ]}
        />
      </Suspense>

      <StatTable
        key={`${size}-${sp.team ?? ''}`}
        rows={rows}
        cols={COLS}
        initialSort="net"
        href={{ base: '/teams', key: 'team' }}
        ranked
        tall
        firstPage={100}
        filename={`lineups-${size}man-${season?.key ?? ''}`}
        empty="No units have played that many minutes together yet. Lower the minimum, or check back as the season goes."
      />
    </div>
  );
}
