import Link from 'next/link';
import { byRecord, latestSeason, seasonStandings } from '@/lib/db';
import { TeamMark } from '@/components/TeamMark';

export const metadata = { title: 'Teams' };
export const revalidate = 300;

/** Every franchise playing this season, by conference and division, with its record. */
export default async function TeamsPage() {
  const season = await latestSeason();
  const rows = season ? (await seasonStandings(season.id)).sort(byRecord) : [];

  const byConf = ['East', 'West'].map((conference) => ({
    conference,
    divisions: [...new Set(rows.filter((r) => r.conference === conference).map((r) => r.division ?? ''))]
      .sort()
      .map((division) => ({
        division,
        teams: rows.filter((r) => r.conference === conference && (r.division ?? '') === division),
      })),
  }));

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold tracking-tight">Teams</h1>
      <p className="mb-5 text-sm" style={{ color: 'var(--ink-2)' }}>
        {rows.length} franchises, {season?.key} records. Open one for its roster, leaders, schedule and every
        season it has played.
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
                    {d.teams.map((t) => (
                      <li key={t.teamId}>
                        <Link
                          href={`/teams/${t.abbr}`}
                          className="flex items-center gap-3 border-b px-3 py-2 no-underline transition-colors last:border-b-0 hover:bg-[var(--panel-2)]"
                          style={{ borderColor: 'var(--line)', color: 'var(--ink)' }}
                        >
                          <TeamMark abbr={t.abbr} color={t.color} size={26} />
                          <span className="text-sm font-semibold">{t.abbr}</span>
                          <span className="flex-1 text-sm" style={{ color: 'var(--ink-2)' }}>
                            {t.name}
                          </span>
                          <span className="tnum text-sm">
                            {t.wins}-{t.losses}
                          </span>
                          <span
                            className="tnum w-12 text-right text-[0.75rem]"
                            style={{ color: (t.netRtg ?? 0) >= 0 ? 'var(--hot)' : 'var(--cold)' }}
                          >
                            {t.netRtg === null ? '' : `${t.netRtg > 0 ? '+' : ''}${t.netRtg.toFixed(1)}`}
                          </span>
                        </Link>
                      </li>
                    ))}
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
