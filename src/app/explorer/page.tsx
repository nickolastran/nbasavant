import { Suspense } from 'react';
import { AdvancedTable } from '@/components/AdvancedTable';
import { FilterBar } from '@/components/FilterBar';
import { TableSkeleton } from '@/components/Skeleton';
import { ViewTabs } from '@/components/ViewTabs';
import { prisma, getSeason, lastUpdated } from '@/lib/db';
import { PLAYER_PRESETS, RATE_MODES, type RateMode, TEAM_COLS, playerCols, playerLeaderboard, teamLeaderboard } from '@/lib/leaderboard';
import { seasonOptions } from '@/lib/options';

export const metadata = { title: 'Leaderboards' };
export const revalidate = 60;

const VIEWS = [
  { value: 'players', label: 'Players' },
  { value: 'teams', label: 'Teams' },
];

/**
 * The Savant leaderboards. The server picks the season, players or teams, and
 * the rate; everything else (sort, columns, filters, search) is the table's
 * own state, kept in the URL.
 */
export default async function ExplorerPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const [seasons, active, updated] = await Promise.all([prisma.season.findMany({ orderBy: { startYear: 'desc' } }), getSeason(), lastUpdated()]);
  const season = seasons.find((s) => s.key === sp.season) ?? active;
  const view = sp.view === 'teams' ? 'teams' : 'players';
  const mode: RateMode = RATE_MODES.some((m) => m.value === sp.per) ? (sp.per as RateMode) : 'game';
  // Tabs keep every other param, the table's included, except ones that only fit the other view.
  const keep = (drop: string[]) => Object.fromEntries(Object.entries(sp).filter(([k]) => !drop.includes(k)));

  const rows = season ? await (view === 'teams' ? teamLeaderboard(season.id) : playerLeaderboard(season.id, mode)) : [];

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold tracking-tight">Leaderboards</h1>
      <p className="mb-4 max-w-prose text-sm" style={{ color: 'var(--ink-2)' }}>
        {rows.length} {view === 'teams' ? 'teams' : 'players'} in {season?.key ?? 'no season'}. Shot profile, defense and on/off columns come from
        play-by-play and start in 2026-27. Formulas are in <code>docs/METRICS.md</code>.
      </p>

      <div className="flex flex-wrap items-start gap-x-4">
        <ViewTabs views={VIEWS} current={view} params={keep(['view', 'sort', 'preset', 'cols', 'f', 'q', 'per'])} />
        {view === 'players' && <ViewTabs views={RATE_MODES} current={mode} params={keep(['per'])} name="per" />}
        <Suspense>
          <FilterBar bare fields={[{ kind: 'select', name: 'season', label: 'Season', options: seasonOptions(seasons), defaultValue: season?.key }]} />
        </Suspense>
      </div>

      <Suspense fallback={<TableSkeleton />}>
        {view === 'teams' ? (
          <AdvancedTable
            key="teams"
            rows={rows}
            cols={TEAM_COLS}
            lead={{ key: 'team', label: 'Team', hrefBase: '/teams', idKey: 'abbr', logoKey: 'abbr' }}
            selects={['conf']}
            initialSort="netRtg"
            filename={`teams-${season?.key}`}
            empty="No teams match."
          />
        ) : (
          <AdvancedTable
            key="players"
            rows={rows}
            cols={playerCols(mode)}
            presets={PLAYER_PRESETS}
            defaultPreset="overview"
            lead={{ key: 'player', label: 'Player', hrefBase: '/players', idKey: 'playerId', photoKey: 'playerId' }}
            selects={['team', 'pos']}
            qualifier={{ key: 'min', label: 'Min minutes' }}
            initialSort="pts"
            filename={`players-${season?.key}-per-${mode}`}
            empty="No players match these filters."
          />
        )}
      </Suspense>

      <p className="eyebrow mt-4">
        Data: NBA.com, Basketball-Reference{updated && ` · Updated ${updated}`}
      </p>
    </div>
  );
}
