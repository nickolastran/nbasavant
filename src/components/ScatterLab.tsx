'use client';

import { useCallback, useState } from 'react';
import { type ACol, AdvancedTable, type Preset, type Row } from '@/components/AdvancedTable';
import { type Metric, QuadrantScatter, type ScatterPreset } from '@/components/QuadrantScatter';

/** The scatter and the comparison table it feeds: players clicked or lassoed on the chart become the table's rows. */
export function ScatterLab({
  rows, metrics, presets, defaultMin, cols, tablePresets,
}: {
  rows: Row[];
  metrics: Metric[];
  presets: ScatterPreset[];
  defaultMin: number;
  cols: ACol[];
  tablePresets: Preset[];
}) {
  const [ids, setIds] = useState<number[]>([]);
  const onSelect = useCallback((next: number[]) => setIds(next), []);
  const picked = rows.filter((r) => ids.includes(r.playerId as number));
  return (
    <>
      <QuadrantScatter rows={rows} metrics={metrics} presets={presets} defaultMin={defaultMin} onSelect={onSelect} />
      <section className="mt-6">
        <h2 className="mb-1 text-lg font-bold tracking-tight">Comparison table</h2>
        {picked.length ? (
          <AdvancedTable
            rows={picked}
            cols={cols}
            presets={tablePresets}
            defaultPreset="overview"
            lead={{ key: 'player', label: 'Player', hrefBase: '/players', idKey: 'playerId', photoKey: 'playerId' }}
            initialSort="pts"
            filename="scatter-selection"
          />
        ) : (
          <p className="panel p-6 text-center text-sm" style={{ color: 'var(--ink-2)' }}>
            Click players on the chart, or switch the pointer tool to Lasso and circle a group, to compare them here.
          </p>
        )}
      </section>
    </>
  );
}
