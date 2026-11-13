import { Suspense } from 'react';
import type { Metric, ScatterPreset } from '@/components/QuadrantScatter';
import { ScatterLab } from '@/components/ScatterLab';
import { getSeason, lastUpdated } from '@/lib/db';
import { PLAYER_PRESETS, playerCols, playerLeaderboard } from '@/lib/leaderboard';

export const metadata = {
  title: 'Player Scatter',
  description: 'Any two player metrics against each other, as percentiles or raw values, with league-average quadrants.',
};
export const revalidate = 60;

/** Caption order: top left, top right, bottom left, bottom right. */
const PRESETS: ScatterPreset[] = [
  { key: 'impact', label: 'Two-way impact', x: 'obpm', y: 'dbpm', scale: 'pct', captions: ['Defense-first', 'Two-way', 'Neither', 'Offense-first'] },
  { key: 'shooting', label: '3PA vs 3P%', x: 'fg3a', y: 'fg3Pct', scale: 'raw', captions: ['Selective, accurate', 'Volume and accuracy', 'Few and cold', 'Volume, cold'] },
  { key: 'rim', label: 'Rim vs on-court defense', x: 'oppDiff', y: 'dRimDiff', scale: 'pct', captions: ['Rim only', 'Locks down both', 'Neither', 'Perimeter only'] },
  { key: 'usage', label: 'Usage vs TS%', x: 'usgPct', y: 'tsPct', scale: 'raw', captions: ['Efficient role', 'Efficient star', 'Low usage, inefficient', 'High usage, inefficient'] },
  { key: 'onoff', label: 'On/Off ORtg vs DRtg', x: 'onOffOrtg', y: 'onOffDrtg', scale: 'pct', captions: ['Defense lifts', 'Lifts both ends', 'Hurts both', 'Offense lifts'] },
];

export default async function ScatterPage() {
  const season = await getSeason();
  const [rows, updated] = await Promise.all([season ? playerLeaderboard(season.id, 'game') : [], lastUpdated()]);
  const cols = playerCols('game');
  const metrics: Metric[] = cols
    .filter((c) => (c.kind ?? 'num') === 'num' && !['gp', 'min'].includes(c.key))
    .map((c) => ({ key: c.key, label: c.label, title: c.title, dp: c.dp, suffix: c.suffix, signed: c.signed, lowerIsBetter: c.lowerIsBetter }));
  // Half the league's heaviest workload, to the nearest ten minutes: regular rotation players, about 150 of them.
  const most = Math.max(0, ...rows.map((r) => (typeof r.min === 'number' ? r.min : 0)));
  const defaultMin = Math.round((most * 0.5) / 10) * 10;

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Player scatter</h1>
      <p className="mb-4 mt-1 max-w-prose text-sm" style={{ color: 'var(--ink-2)' }}>
        {season?.key}. Any two metrics, as percentiles or raw values. The dashed lines are the league average among qualified players.
        The rim preset uses on-court opponent shooting, not matchup data, which the play-by-play doesn&apos;t have.
      </p>
      {rows.length ? (
        <Suspense fallback={<span aria-hidden className="skeleton block h-96 w-full rounded-md" />}>
          <ScatterLab rows={rows} metrics={metrics} presets={PRESETS} defaultMin={defaultMin} cols={cols} tablePresets={PLAYER_PRESETS} />
        </Suspense>
      ) : (
        <p className="panel p-8 text-center text-sm" style={{ color: 'var(--ink-2)' }}>
          No player stats for this season yet.
        </p>
      )}
      <p className="eyebrow mt-5">
        Data: NBA.com, Basketball-Reference{updated && ` / Updated ${updated}`}
      </p>
    </div>
  );
}
