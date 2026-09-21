import Link from 'next/link';
import { Suspense } from 'react';
import { prisma, getSeason } from '@/lib/db';
import { FilterBar } from '@/components/FilterBar';
import { TeamMark } from '@/components/TeamMark';
import { seasonOptions } from '@/lib/options';
import { gamesBehind, winPct } from '@/lib/stats';

export const metadata = { title: 'Standings' };
export const revalidate = 60;

type Row = {
  abbr: string;
  name: string;
  wins: number;
  losses: number;
  netRtg: number;
  ortg: number;
  drtg: number;
};

function Conference({ title, rows }: { title: string; rows: Row[] }) {
  const lead = rows[0];
  return (
    <section className="panel overflow-hidden">
      <h2 className="border-b px-3 py-2 text-sm font-bold uppercase tracking-[0.1em]" style={{ borderColor: 'var(--line)' }}>
        {title}
      </h2>
      <table className="stat-table">
        <thead>
          <tr>
            <th style={{ cursor: 'default' }}>Team</th>
            <th style={{ cursor: 'default' }}>W</th>
            <th style={{ cursor: 'default' }}>L</th>
            <th style={{ cursor: 'default' }}>Pct</th>
            <th style={{ cursor: 'default' }}>GB</th>
            <th style={{ cursor: 'default' }}>Ortg</th>
            <th style={{ cursor: 'default' }}>Drtg</th>
            <th style={{ cursor: 'default' }}>Net</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.abbr}>
              <td>
                <span className="flex items-center gap-2">
                  <span className="tnum w-5 text-right text-[0.6875rem]" style={{ color: 'var(--ink-3)' }}>
                    {i + 1}
                  </span>
                  <TeamMark abbr={r.abbr} size={18} />
                  <Link href={`/team-stats?team=${r.abbr}`} className="link font-medium">
                    {r.name}
                  </Link>
                  {/* Ten teams per conference make the play-in field. */}
                  {i === 5 || i === 9 ? (
                    <span className="eyebrow" style={{ letterSpacing: '0.1em' }}>
                      {i === 5 ? 'play-in' : 'cut'}
                    </span>
                  ) : null}
                </span>
              </td>
              <td>{r.wins}</td>
              <td>{r.losses}</td>
              <td>{winPct(r.wins, r.losses).toFixed(3).replace(/^0/, '')}</td>
              <td>{i === 0 ? '—' : gamesBehind(lead, r).toFixed(1)}</td>
              <td>{r.ortg.toFixed(1)}</td>
              <td>{r.drtg.toFixed(1)}</td>
              <td style={{ color: r.netRtg >= 0 ? 'var(--hot)' : 'var(--cold)' }}>
                {r.netRtg > 0 ? '+' : ''}
                {r.netRtg.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default async function StandingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const active = await getSeason();
  const seasonKey = sp.season || active?.key;
  const seasons = await prisma.season.findMany({ orderBy: { startYear: 'desc' } });

  const stats = await prisma.teamStats.findMany({
    where: { season: { key: seasonKey } },
    include: { team: true },
  });

  const rows: (Row & { conference: string })[] = stats
    .map((s) => ({
      abbr: s.team.abbreviation,
      name: `${s.team.city} ${s.team.name}`,
      conference: s.team.conference,
      wins: s.wins,
      losses: s.losses,
      netRtg: s.netRtg,
      ortg: s.ortg,
      drtg: s.drtg,
    }))
    .sort((a, b) => winPct(b.wins, b.losses) - winPct(a.wins, a.losses) || b.netRtg - a.netRtg);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-xl font-bold tracking-tight">Standings</h1>
        <p className="mb-4 text-sm" style={{ color: 'var(--ink-2)' }}>
          {seasonKey} by winning percentage. Ratings are per 100 possessions.
        </p>
        <Suspense>
          <FilterBar
            fields={[
              { kind: 'select', name: 'season', label: 'Season', options: seasonOptions(seasons), defaultValue: seasonKey },
            ]}
          />
        </Suspense>
      </div>

      {rows.length ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <Conference title="Eastern Conference" rows={rows.filter((r) => r.conference === 'East')} />
          <Conference title="Western Conference" rows={rows.filter((r) => r.conference === 'West')} />
        </div>
      ) : (
        <p className="panel p-6 text-sm" style={{ color: 'var(--ink-2)' }}>
          No team records for {seasonKey}.
        </p>
      )}
    </div>
  );
}
