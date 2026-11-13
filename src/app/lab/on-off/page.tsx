import { Suspense } from 'react';
import { FilterBar } from '@/components/FilterBar';
import { OnOffExplorer } from '@/components/OnOffExplorer';
import { labTeam } from '@/lib/lab-page';

export const metadata = { title: 'On/Off Explorer' };
export const revalidate = 60;

export default async function OnOffLab({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { season, team, options, lab } = await labTeam(sp.team);
  return (
    <div>
      <p className="eyebrow">Lab</p>
      <h1 className="text-2xl font-bold tracking-tight">On/Off explorer</h1>
      <p className="mb-3 mt-1 max-w-prose text-sm" style={{ color: 'var(--ink-2)' }}>
        {season?.key} · {team?.city} {team?.name}, {lab.games} games with lineup data.
      </p>
      <Suspense>
        <div className="mb-4">
          <FilterBar bare fields={[{ kind: 'select', name: 'team', label: 'Team', options, logos: true, defaultValue: team?.abbreviation }]} />
        </div>
        <OnOffExplorer key={team?.abbreviation} units={lab.units} roster={lab.roster} team={team?.abbreviation ?? ''} />
      </Suspense>
    </div>
  );
}
