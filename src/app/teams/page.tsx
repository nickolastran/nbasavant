import Link from 'next/link';
import { prisma, getSeason } from '@/lib/db';
import { TeamMark } from '@/components/TeamMark';

export const metadata = { title: 'Teams' };
export const revalidate = 300;

/** All 30 franchises by conference and division, each with this season's record. */
export default async function TeamsPage() {
  const season = await getSeason();
  const [teams, stats] = await Promise.all([
    prisma.team.findMany({ orderBy: [{ conference: 'asc' }, { division: 'asc' }, { city: 'asc' }] }),
    season
      ? prisma.teamStats.findMany({
          where: { seasonId: season.id },
          select: { teamId: true, wins: true, losses: true, netRtg: true },
        })
      : [],
  ]);

  const record = new Map(stats.map((s) => [s.teamId, s]));
  // Only franchises with a row for the current season are active ones.
  const current = teams.filter((t) => record.has(t.id));

  const byConf = ['East', 'West'].map((conference) => ({
    conference,
    divisions: [...new Set(current.filter((t) => t.conference === conference).map((t) => t.division))]
      .sort()
      .map((division) => ({
        division,
        teams: current.filter((t) => t.conference === conference && t.division === division),
      })),
  }));

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold tracking-tight">Teams</h1>
      <p className="mb-5 text-sm" style={{ color: 'var(--ink-2)' }}>
        {current.length} franchises, {season?.key ?? 'current'} records. Open one for its full
        analytics profile.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        {byConf.map((c) => (
          <section key={c.conference}>
            <h2 className="eyebrow mb-2">{c.conference}ern Conference</h2>
            <div className="space-y-4">
              {c.divisions.map((d) => (
                <div key={d.division} className="panel overflow-hidden">
                  <h3
                    className="border-b px-3 py-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.12em]"
                    style={{ borderColor: 'var(--line)', background: 'var(--panel-2)' }}
                  >
                    {d.division}
                  </h3>
                  <ul>
                    {d.teams.map((t) => {
                      const r = record.get(t.id);
                      return (
                        <li key={t.id}>
                          <Link
                            href={`/team-stats?team=${t.abbreviation}`}
                            className="flex items-center gap-3 border-b px-3 py-2 no-underline transition-colors last:border-b-0 hover:bg-[var(--panel-2)]"
                            style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}
                          >
                            <TeamMark abbr={t.abbreviation} color={t.primaryColor} size={26} />
                            <span className="text-sm font-semibold">{t.abbreviation}</span>
                            <span className="flex-1 text-sm" style={{ color: 'var(--ink-2)' }}>
                              {t.city} {t.name}
                            </span>
                            <span className="tnum text-sm">
                              {r ? `${r.wins}-${r.losses}` : '—'}
                            </span>
                            <span
                              className="tnum w-12 text-right text-[0.75rem]"
                              style={{ color: (r?.netRtg ?? 0) >= 0 ? 'var(--hot)' : 'var(--cold)' }}
                            >
                              {r ? `${r.netRtg > 0 ? '+' : ''}${r.netRtg.toFixed(1)}` : ''}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
