import Link from 'next/link';
import { Suspense } from 'react';
import { prisma, getSeason } from '@/lib/db';
import { FilterBar } from '@/components/FilterBar';
import { TeamMark } from '@/components/TeamMark';
import { TEAM_OPTIONS, seasonOptions } from '@/lib/options';

export const metadata = { title: 'Depth Charts' };
export const revalidate = 300;

const SLOTS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

/**
 * There is no roster-order column in the data, so the chart is built the way a
 * coach's rotation actually reveals itself: at each listed position, sort by
 * minutes played. Deep bench is anyone past the third name.
 */
export default async function DepthChartsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const active = await getSeason();
  const seasonKey = sp.season || active?.key;
  const seasons = await prisma.season.findMany({ orderBy: { startYear: 'desc' } });

  const season = await prisma.season.findUnique({ where: { key: seasonKey ?? '' } });
  const teamAbbr = sp.team || undefined;

  const teams = await prisma.team.findMany({
    where: {
      ...(teamAbbr ? { abbreviation: teamAbbr } : {}),
      ...(season ? { stats: { some: { seasonId: season.id } } } : {}),
    },
    orderBy: [{ conference: 'asc' }, { city: 'asc' }],
  });

  const rows = season
    ? await prisma.playerStats.findMany({
        where: { seasonId: season.id, teamId: { in: teams.map((t) => t.id) }, gp: { gt: 0 } },
        include: { player: { select: { id: true, fullName: true, position: true, jersey: true } } },
        orderBy: { min: 'desc' },
      })
    : [];

  const byTeam = new Map<number, typeof rows>();
  for (const r of rows) {
    if (r.teamId == null) continue;
    byTeam.set(r.teamId, [...(byTeam.get(r.teamId) ?? []), r]);
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold tracking-tight">Depth Charts</h1>
      <p className="mb-4 text-sm" style={{ color: 'var(--ink-2)' }}>
        {seasonKey} rotations, ordered by minutes played at each listed position — not by an
        official roster order, which the source data doesn&apos;t publish.
      </p>

      <Suspense>
        <FilterBar
          fields={[
            { kind: 'select', name: 'season', label: 'Season', options: seasonOptions(seasons), defaultValue: seasonKey },
            { kind: 'select', name: 'team', label: 'Team', options: TEAM_OPTIONS },
          ]}
        />
      </Suspense>

      <div className="grid gap-4 xl:grid-cols-2">
        {teams.map((t) => {
          const roster = byTeam.get(t.id) ?? [];
          return (
            <section key={t.id} className="panel overflow-hidden">
              <h2
                className="flex items-center gap-2 border-b px-3 py-2"
                style={{ borderColor: 'var(--line)', background: 'var(--panel-2)' }}
              >
                <TeamMark abbr={t.abbreviation} color={t.primaryColor} size={22} />
                <span className="text-sm font-bold">
                  {t.city} {t.name}
                </span>
                <Link href={`/team-stats?team=${t.abbreviation}`} className="link ml-auto text-xs">
                  Team stats
                </Link>
              </h2>
              <table className="stat-table">
                <thead>
                  <tr>
                    <th style={{ cursor: 'default' }}>Pos</th>
                    <th style={{ cursor: 'default', textAlign: 'left' }}>Starter</th>
                    <th style={{ cursor: 'default', textAlign: 'left' }}>2nd</th>
                    <th style={{ cursor: 'default', textAlign: 'left' }}>3rd</th>
                  </tr>
                </thead>
                <tbody>
                  {SLOTS.map((pos) => {
                    const depth = roster.filter((r) => r.player.position === pos).slice(0, 3);
                    return (
                      <tr key={pos}>
                        <td className="font-bold">{pos}</td>
                        {[0, 1, 2].map((i) => (
                          <td key={i} style={{ textAlign: 'left' }}>
                            {depth[i] ? (
                              <Link href={`/players/${depth[i].player.id}`} className="link">
                                {depth[i].player.fullName}
                                <span className="tnum ml-1.5 text-[0.6875rem]" style={{ color: 'var(--ink-3)' }}>
                                  {(depth[i].min / Math.max(1, depth[i].gp)).toFixed(1)}m
                                </span>
                              </Link>
                            ) : (
                              <span style={{ color: 'var(--ink-3)' }}>—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          );
        })}
      </div>

      {!teams.length && (
        <p className="panel p-6 text-sm" style={{ color: 'var(--ink-2)' }}>
          No rosters for {seasonKey}.
        </p>
      )}
    </div>
  );
}
