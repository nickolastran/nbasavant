import Link from 'next/link';
import { Suspense } from 'react';
import { prisma, getSeason } from '@/lib/db';
import { FilterBar } from '@/components/FilterBar';
import { seasonOptions } from '@/lib/options';

export const metadata = { title: 'Stat Leaders' };
export const revalidate = 60;

/** `minFga` keeps bench players with four efficient shots off the rate boards. */
const BOARDS = [
  { key: 'ppg', label: 'Points', unit: '' },
  { key: 'rpg', label: 'Rebounds', unit: '' },
  { key: 'apg', label: 'Assists', unit: '' },
  { key: 'tsPct', label: 'True Shooting', unit: '%', minFga: 300 },
  { key: 'efgPct', label: 'Effective FG', unit: '%', minFga: 300 },
  { key: 'fg3Pct', label: 'Three-Point', unit: '%', minFg3a: 100 },
  { key: 'ftPct', label: 'Free Throw', unit: '%', minFta: 100 },
  { key: 'usgPct', label: 'Usage', unit: '%' },
] as const;

export default async function LeadersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const active = await getSeason();
  const seasonKey = sp.season || active?.key;
  const seasons = await prisma.season.findMany({ orderBy: { startYear: 'desc' } });
  const minGp = Number(sp.minGp) || 20;

  const boards = await Promise.all(
    BOARDS.map(async (b) => ({
      ...b,
      rows: await prisma.playerStats.findMany({
        where: {
          season: { key: seasonKey },
          gp: { gte: minGp },
          ...('minFga' in b ? { fga: { gte: b.minFga } } : {}),
          ...('minFg3a' in b ? { fg3a: { gte: b.minFg3a } } : {}),
          ...('minFta' in b ? { fta: { gte: b.minFta } } : {}),
        },
        orderBy: { [b.key]: 'desc' },
        take: 10,
        include: {
          player: {
            select: { id: true, fullName: true, team: { select: { abbreviation: true } } },
          },
        },
      }),
    })),
  );

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold tracking-tight">Stat Leaders</h1>
      <p className="mb-4 text-sm" style={{ color: 'var(--ink-2)' }}>
        {seasonKey}, minimum {minGp} games played. Rate boards carry their own volume floor.
      </p>

      <Suspense>
        <FilterBar
          fields={[
            { kind: 'select', name: 'season', label: 'Season', options: seasonOptions(seasons), defaultValue: seasonKey },
            { kind: 'number', name: 'minGp', label: 'Min games', min: 1, max: 82, step: 1, defaultValue: String(minGp) },
          ]}
        />
      </Suspense>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {boards.map((b) => (
          <section key={b.key} className="panel overflow-hidden">
            <h2
              className="border-b px-3 py-2 text-[0.6875rem] font-bold uppercase tracking-[0.12em]"
              style={{ borderColor: 'var(--line)' }}
            >
              {b.label}
            </h2>
            <ol className="p-1">
              {b.rows.map((r, i) => (
                <li key={r.id} className="flex items-baseline gap-2 px-2 py-1 text-sm">
                  <span className="tnum w-4 text-right text-[0.6875rem]" style={{ color: 'var(--ink-3)' }}>
                    {i + 1}
                  </span>
                  <Link href={`/players/${r.player.id}`} className="link flex-1 truncate">
                    {r.player.fullName}
                  </Link>
                  <span className="eyebrow">{r.player.team?.abbreviation ?? ''}</span>
                  <span className="tnum w-12 text-right font-semibold">
                    {(r[b.key] as number).toFixed(1)}
                    {b.unit}
                  </span>
                </li>
              ))}
              {!b.rows.length && (
                <li className="px-2 py-3 text-sm" style={{ color: 'var(--ink-3)' }}>
                  No qualifiers.
                </li>
              )}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
