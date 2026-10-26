import { Suspense } from 'react';
import { prisma } from '@/lib/db';
import { FilterBar } from '@/components/FilterBar';
import { StatTable, type Col } from '@/components/StatTable';
import { ViewTabs } from '@/components/ViewTabs';
import { seasonDefense } from '@/lib/leaders';
import { perGame } from '@/lib/format';
import { scaledFloor } from '@/lib/stats';
import { seasonOptions } from '@/lib/options';

export const metadata = { title: 'Defense' };
export const revalidate = 60;

type Row = Record<string, string | number | null>;

const VIEWS = [
  { value: 'overall', label: 'Opponent shooting' },
  { value: 'rim', label: 'Rim protection' },
];

/** Opponent attempts faced on the floor over 82 games: about 14 minutes a night. */
const FLOOR = { overall: 2000, rim: 600 };

const LEAD: Col<Row>[] = [
  { key: 'player', label: 'Player' },
  { key: 'team', label: 'Team', divide: true, logo: true },
  { key: 'gp', label: 'GP' },
  { key: 'mpg', label: 'MIN', dp: 1 },
];

const COLS: Record<string, Col<Row>[]> = {
  overall: [
    { key: 'oppFga', label: 'Opp FGA', title: 'Opponent field goal attempts with him on the floor' },
    { key: 'oppEfg', label: 'Opp eFG%', dp: 1, shade: true, lowerIsBetter: true, title: 'What opponents shot with him on the floor' },
    { key: 'oppXEfg', label: 'Opp xeFG%', dp: 1, shade: true, lowerIsBetter: true, title: 'What the league makes from those same shots: the quality of looks allowed' },
    { key: 'diff', label: 'Diff', dp: 1, shade: true, lowerIsBetter: true, title: 'Opp eFG% minus Opp xeFG%: below zero, opponents shot worse than their looks deserved' },
    { key: 'spg', label: 'STL', dp: 1, shade: true },
    { key: 'bpg', label: 'BLK', dp: 1, shade: true },
  ],
  rim: [
    { key: 'rimFga', label: 'Rim FGA', title: 'Opponent attempts in the restricted area with him on the floor' },
    { key: 'rimPerGame', label: 'Rim FGA/G', dp: 1, shade: true, lowerIsBetter: true, title: 'Rim attempts faced per game: fewer can mean drivers stay away' },
    { key: 'rimFg', label: 'Rim FG%', dp: 1, shade: true, lowerIsBetter: true, title: 'What opponents shot at the rim with him on the floor' },
    { key: 'rimXFg', label: 'Rim xFG%', dp: 1, shade: true, lowerIsBetter: true, title: 'What the league makes from those same rim shots (a dunk beats a contested layup)' },
    { key: 'rimDiff', label: 'Diff', dp: 1, shade: true, lowerIsBetter: true, title: 'Rim FG% minus Rim xFG%' },
    { key: 'bpg', label: 'BLK', dp: 1, shade: true },
  ],
};

export default async function DefensePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  // Lineup stints, and with them this page, start in 2026-27.
  const seasons = await prisma.season.findMany({ where: { stints: { some: {} } }, orderBy: { startYear: 'desc' } });
  const season = seasons.find((s) => s.key === sp.season) ?? seasons[0];
  const view = sp.view === 'rim' ? 'rim' : 'overall';

  const [defense, lines, teams] = season
    ? await Promise.all([
        seasonDefense(season.id),
        prisma.playerStats.findMany({
          where: { seasonId: season.id },
          include: { team: { select: { abbreviation: true } }, player: { select: { fullName: true, team: { select: { abbreviation: true } } } } },
          orderBy: { gp: 'desc' },
        }),
        prisma.teamStats.findMany({ where: { seasonId: season.id }, select: { gp: true } }),
      ])
    : [new Map(), [], []];
  const games = Math.max(0, ...teams.map((t) => t.gp));
  const floor = scaledFloor(FLOOR[view], games);

  // One line a player: a traded player's busiest one, which is his combined line when he has one.
  const seen = new Set<number>();
  const rows: Row[] = [];
  for (const l of lines) {
    const d = defense.get(l.playerId);
    if (seen.has(l.playerId) || !d) continue;
    seen.add(l.playerId);
    if ((view === 'rim' ? d.rimFga : d.oppFga) < floor) continue;
    rows.push({
      playerId: l.playerId,
      player: l.player.fullName,
      team: l.team?.abbreviation ?? l.player.team?.abbreviation ?? null,
      gp: l.gp,
      mpg: perGame(l.min, l.gp),
      spg: perGame(l.stl, l.gp),
      bpg: perGame(l.blk, l.gp),
      ...d,
      rimPerGame: perGame(d.rimFga, l.gp),
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Defense {season?.key}</h1>
        <p className="mt-1 max-w-3xl text-sm" style={{ color: 'var(--ink-2)' }}>
          What opponents shot with each player on the floor, against what the league makes from those same shots. The
          play-by-play doesn&apos;t say who contested a shot, so this is all five defenders sharing every attempt:
          it says as much about teammates and luck as about him, and it steadies over a season. Qualifiers faced{' '}
          {floor.toLocaleString()} {view === 'rim' ? 'rim attempts' : 'attempts'} so far ({FLOOR[view].toLocaleString()} over 82 games).
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-x-3">
        <ViewTabs views={VIEWS} current={view} params={Object.fromEntries(Object.entries(sp).filter(([k]) => k !== 'view'))} />
        <Suspense>
          <FilterBar
            bare
            fields={[{ kind: 'select', name: 'season', label: 'Season', defaultValue: season?.key, options: seasonOptions(seasons) }]}
          />
        </Suspense>
      </div>

      <StatTable
        key={view}
        rows={rows}
        cols={[...LEAD, ...COLS[view]]}
        initialSort={view === 'rim' ? 'rimFg' : 'diff'}
        href={{ base: '/players', key: 'playerId' }}
        photo="playerId"
        ranked
        tall
        filename={`defense-${view}-${season?.key ?? ''}`}
        empty="No one has faced enough shots yet. Lineup data starts with 2026-27."
      />
    </div>
  );
}
