import Link from 'next/link';
import { Suspense } from 'react';
import { byRecord, latestSeason, prisma, seasonStandings, type Standing } from '@/lib/db';
import { FilterBar } from '@/components/FilterBar';
import { TeamMark } from '@/components/TeamMark';
import { ViewTabs } from '@/components/ViewTabs';
import { fmt, pct3 } from '@/lib/format';
import { seasonOptions } from '@/lib/options';
import { gamesBehind } from '@/lib/stats';

export const metadata = { title: 'Standings' };
export const revalidate = 60;

const VIEWS = [
  { value: 'conference', label: 'Conference' },
  { value: 'division', label: 'Division' },
  { value: 'league', label: 'League' },
];

const COLS: [string, string][] = [
  ['Team', ''], ['W', 'Wins'], ['L', 'Losses'], ['PCT', 'Winning percentage'], ['GB', 'Games behind the leader'],
  ['HOME', 'Home record'], ['AWAY', 'Road record'], ['DIV', 'Record against the division'],
  ['CONF', 'Record against the conference'], ['PPG', 'Points per game'], ['OPP', 'Points allowed per game'],
  ['DIFF', 'Point differential per game'], ['STRK', 'Current streak'], ['L10', 'Last ten games'],
  ['xW-L', 'Expected record from points scored and allowed (Pythagorean, exponent 14)'],
  ['NET', 'Net rating: points per 100 possessions, scored minus allowed'],
];

const wl = ([w, l]: [number, number]) => `${w}-${l}`;
const signed = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`;

/** Where the postseason line falls in a conference: seeds that play on, and where the play-in ends. */
function cutLines(startYear: number): number[] {
  if (startYear >= 2020) return [6, 10]; // playoffs, then the play-in
  if (startYear >= 1983) return [8]; // sixteen-team playoffs
  return []; // earlier formats changed too often to draw one line
}

function Group({ title, rows, lines }: { title: string; rows: Standing[]; lines: number[] }) {
  const lead = rows[0];
  return (
    <section className="panel overflow-hidden">
      <h2
        className="border-b px-3 py-2 text-sm font-bold uppercase tracking-[0.1em]"
        style={{ borderColor: 'var(--line)' }}
      >
        {title}
      </h2>
      <div className="overflow-x-auto">
        <table className="stat-table">
          <thead>
            <tr>
              {COLS.map(([h, tip]) => (
                <th key={h} title={tip || undefined} style={{ cursor: 'default' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const gp = r.wins + r.losses;
              const diff = gp ? (r.pf - r.pa) / gp : 0;
              const xw = Math.round(r.xWins);
              return (
                <tr key={r.teamId} className={lines.includes(i + 1) ? 'cutline' : undefined}>
                  <td>
                    <span className="flex items-center gap-2">
                      <span className="tnum w-5 text-right text-[0.6875rem]" style={{ color: 'var(--ink-3)' }}>
                        {i + 1}
                      </span>
                      <TeamMark abbr={r.abbr} color={r.color} size={18} />
                      <Link href={`/teams/${r.abbr}`} className="link font-medium">
                        {r.name}
                      </Link>
                    </span>
                  </td>
                  <td>{r.wins}</td>
                  <td>{r.losses}</td>
                  <td>{pct3(r.pct)}</td>
                  <td>{i === 0 ? '—' : gamesBehind(lead, r).toFixed(1)}</td>
                  <td>{wl(r.home)}</td>
                  <td>{wl(r.away)}</td>
                  <td>{r.division ? wl(r.div) : '—'}</td>
                  <td>{r.conference ? wl(r.conf) : '—'}</td>
                  <td>{gp ? fmt(r.pf / gp) : '—'}</td>
                  <td>{gp ? fmt(r.pa / gp) : '—'}</td>
                  <td style={{ color: !gp ? undefined : diff >= 0 ? 'var(--hot)' : 'var(--cold)' }}>
                    {gp ? signed(diff) : '—'}
                  </td>
                  <td>{r.streak || '—'}</td>
                  <td>{gp ? wl(r.l10) : '—'}</td>
                  <td>{gp ? `${xw}-${gp - xw}` : '—'}</td>
                  <td style={{ color: r.netRtg === null ? undefined : r.netRtg >= 0 ? 'var(--hot)' : 'var(--cold)' }}>
                    {r.netRtg === null ? '—' : signed(r.netRtg)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function StandingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const [seasons, newest] = await Promise.all([
    prisma.season.findMany({ orderBy: { startYear: 'desc' } }),
    latestSeason(),
  ]);
  const season = seasons.find((s) => s.key === sp.season) ?? newest;
  const view = VIEWS.some((v) => v.value === sp.view) ? sp.view : 'conference';
  const rows = season ? (await seasonStandings(season.id)).sort(byRecord) : [];
  const played = rows.some((r) => r.wins + r.losses > 0);

  // Before 1970-71 there were no conferences: the divisions were the halves.
  const hasConferences = rows.some((r) => r.conference);
  const keyOf = (r: Standing) =>
    view === 'league' ? 'NBA' : view === 'division' || !hasConferences ? r.division ?? 'League' : r.conference!;
  const titleOf = (k: string) =>
    k === 'NBA' ? 'League' : k === 'East' || k === 'West' ? `${k}ern Conference` : `${k} Division`;
  const groups = [...new Set(rows.map(keyOf))].sort().map((k) => ({ key: k, rows: rows.filter((r) => keyOf(r) === k) }));
  const lines = view === 'conference' && hasConferences && season ? cutLines(season.startYear) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-xl font-bold tracking-tight">Standings</h1>
        <p className="mb-4 text-sm" style={{ color: 'var(--ink-2)' }}>
          {season?.key}, regular season, by winning percentage.{' '}
          {played
            ? 'Every column is computed from the final scores; ratings are per 100 possessions.'
            : `${season?.key} hasn't tipped off, so everyone is 0-0.`}
          {lines.length === 2 && ' The top six in each conference make the playoffs; seven to ten meet in the play-in.'}
        </p>
        <Suspense>
          <FilterBar
            fields={[
              { kind: 'select', name: 'season', label: 'Season', options: seasonOptions(seasons), defaultValue: season?.key },
            ]}
          />
        </Suspense>
        <ViewTabs views={VIEWS} current={view} params={Object.fromEntries(Object.entries(sp).filter(([k]) => k !== 'view'))} />
      </div>

      {rows.length ? (
        <div className="space-y-6">
          {groups.map((g) => (
            <Group key={g.key} title={titleOf(g.key)} rows={g.rows} lines={lines} />
          ))}
        </div>
      ) : (
        <p className="panel p-6 text-sm" style={{ color: 'var(--ink-2)' }}>
          No games on file for {season?.key}.
        </p>
      )}
    </div>
  );
}
