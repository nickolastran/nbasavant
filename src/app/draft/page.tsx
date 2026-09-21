import Link from 'next/link';
import { Suspense } from 'react';
import { prisma } from '@/lib/db';
import { FilterBar } from '@/components/FilterBar';
import { TeamMark } from '@/components/TeamMark';
import { NoData } from '@/components/NoData';

export const metadata = { title: 'Draft' };
export const revalidate = 3600;

/**
 * Players by draft class. `Player.draftYear` is the only draft column the
 * schema carries — there is no pick number or drafting team — so the class is
 * listed by career production rather than in pick order.
 */
export default async function DraftPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;

  const years = (
    await prisma.player.findMany({
      where: { draftYear: { not: null } },
      distinct: ['draftYear'],
      select: { draftYear: true },
      orderBy: { draftYear: 'desc' },
    })
  ).map((r) => String(r.draftYear));

  if (!years.length) {
    return (
      <NoData
        title="Draft"
        blurb="Every class, pick by pick, with what each selection went on to produce."
        source="players.draftYear exists in prisma/schema.prisma but no ingest run has populated it, and pick number and drafting team have no columns yet. This page fills itself in as soon as they do."
        columns={['Year', 'Pick', 'Player', 'Pos', 'Team', 'GP', 'PPG', 'WS']}
      />
    );
  }

  const year = years.includes(sp.year) ? sp.year : years[0];
  const players = await prisma.player.findMany({
    where: { draftYear: Number(year) },
    include: { team: { select: { abbreviation: true, primaryColor: true } } },
    orderBy: { lastName: 'asc' },
  });

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold tracking-tight">{year} Draft Class</h1>
      <p className="mb-4 text-sm" style={{ color: 'var(--ink-2)' }}>
        {players.length} players. Pick number and drafting team aren&apos;t in the source data, so
        the class is listed alphabetically.
      </p>

      <Suspense>
        <FilterBar
          fields={[
            {
              kind: 'select',
              name: 'year',
              label: 'Class',
              options: years.map((y) => ({ value: y, label: y })),
            },
          ]}
        />
      </Suspense>

      <div className="panel overflow-x-auto">
        <table className="stat-table">
          <thead>
            <tr>
              <th style={{ cursor: 'default' }}>Player</th>
              <th style={{ cursor: 'default' }}>Pos</th>
              <th style={{ cursor: 'default' }}>Team</th>
              <th style={{ cursor: 'default' }}>Country</th>
              <th style={{ cursor: 'default' }}>Active</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/players/${p.id}`} className="link">
                    {p.fullName}
                  </Link>
                </td>
                <td>{p.position ?? '—'}</td>
                <td>
                  {p.team ? (
                    <span className="flex items-center justify-end gap-1.5">
                      <TeamMark abbr={p.team.abbreviation} color={p.team.primaryColor} size={16} />
                      {p.team.abbreviation}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td>{p.country ?? '—'}</td>
                <td>{p.active ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
