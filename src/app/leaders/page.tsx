import Link from 'next/link';
import { Suspense } from 'react';
import { getSeason, prisma } from '@/lib/db';
import { FilterBar } from '@/components/FilterBar';
import { Headshot } from '@/components/Headshot';
import { TeamMark } from '@/components/TeamMark';
import { ViewTabs } from '@/components/ViewTabs';
import { fmt } from '@/lib/format';
import { isPerGame, leaderBoards, rank, type Stat } from '@/lib/leaders';
import { seasonOptions } from '@/lib/options';
import { minGames } from '@/lib/stats';

export const metadata = { title: 'Stat Leaders' };
export const revalidate = 60;

const TEAM_CATS: { key: Stat; label: string }[] = [
  { key: 'ppg', label: 'PTS' }, { key: 'rpg', label: 'REB' }, { key: 'apg', label: 'AST' },
  { key: 'spg', label: 'STL' }, { key: 'bpg', label: 'BLK' }, { key: 'tpm', label: '3PM' },
  { key: 'per', label: 'PER' },
];

/** "Nickeil Alexander-Walker" -> "N. Alexander-Walker", so seven columns of names fit across the page. */
const short = (name: string) => name.replace(/^(\S)\S*\s+(?=\S)/, '$1.\u00a0');

const VIEWS = [
  { value: 'players', label: 'Players' },
  { value: 'teams', label: 'Team Leaders' },
];

export default async function LeadersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const [seasons, active] = await Promise.all([
    prisma.season.findMany({ where: { active: true }, orderBy: { startYear: 'desc' } }),
    getSeason(),
  ]);
  const season = seasons.find((s) => s.key === sp.season) ?? active;
  const view = sp.view === 'teams' ? 'teams' : 'players';

  const { lines, teamStats, teamGames, minGp, boards } = await leaderBoards(season?.id, 10, Number(sp.minGp));

  // Each team's best qualified player per category; if nobody on a team
  // qualifies yet, its best player regardless.
  const teams = teamStats
    .map((t) => {
      const roster = lines.filter((l) => l.teamId === t.teamId);
      const qualified = roster.filter((l) => l.gp >= minGames(t.gp));
      const pool = qualified.length ? qualified : roster;
      return { t, leaders: TEAM_CATS.map((c) => rank(pool, c.key)[0] ?? null) };
    })
    .sort((a, b) => (a.t.name ?? a.t.team.city).localeCompare(b.t.name ?? b.t.team.city));

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold tracking-tight">Stat Leaders</h1>
      <p className="mb-4 text-sm" style={{ color: 'var(--ink-2)' }}>
        {season?.key}. To qualify: {sp.minGp ? `${minGp} games` : teamGames ? "70% of the team's games so far" : 'no games yet'}; rate
        boards also need their attempts, and usage, PER and BPM their minutes, prorated to games played. Win shares and VORP are season totals and rank
        everyone.
      </p>

      <Suspense>
        <FilterBar
          fields={[
            { kind: 'select', name: 'season', label: 'Season', options: seasonOptions(seasons), defaultValue: season?.key },
            { kind: 'number', name: 'minGp', label: 'Min games', min: 1, max: 82, step: 1, defaultValue: String(minGp) },
          ]}
        />
      </Suspense>
      <ViewTabs views={VIEWS} current={view} params={Object.fromEntries(Object.entries(sp).filter(([k]) => k !== 'view'))} />

      {view === 'players' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {boards.map((b) => (
            <section key={b.key} className="panel overflow-hidden">
              <h2
                className="border-b px-3 py-2 text-[0.6875rem] font-bold uppercase tracking-[0.12em]"
                style={{ borderColor: 'var(--line)' }}
              >
                {b.label}
                {isPerGame(b) && (
                  <span className="ml-1 font-normal normal-case tracking-normal" style={{ color: 'var(--ink-3)' }}>
                    per game
                  </span>
                )}
              </h2>
              <ol className="p-1">
                {b.rows.map((r, i) => (
                  <li key={r.playerId} className="flex items-center gap-2 px-2 py-1 text-sm">
                    <span className="tnum w-4 text-right text-[0.6875rem]" style={{ color: 'var(--ink-3)' }}>
                      {i + 1}
                    </span>
                    <Headshot
                      id={r.playerId}
                      name=""
                      className="h-6 w-6 shrink-0 rounded-full bg-[var(--panel-2)] object-cover object-top"
                    />
                    <Link href={`/players/${r.playerId}`} className="link flex-1 truncate">
                      {r.name}
                    </Link>
                    <span className="eyebrow">{r.abbr}</span>
                    <span className="tnum w-12 text-right font-semibold">{fmt(r[b.key], 1, b.unit)}</span>
                  </li>
                ))}
                {!b.rows.length && (
                  <li className="px-2 py-3 text-sm" style={{ color: 'var(--ink-3)' }}>
                    {b.tracked ? 'No qualifiers yet.' : `Not tracked in ${season?.key}.`}
                  </li>
                )}
              </ol>
            </section>
          ))}
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          {/* Fixed columns that fit the page; a name too long for its column ends in an ellipsis. Phones still scroll. */}
          <table className="stat-table min-w-[56rem] table-fixed">
            <thead>
              <tr>
                <th style={{ cursor: 'default', width: '11rem' }}>Team</th>
                {TEAM_CATS.map((c) => (
                  <th key={c.key} style={{ cursor: 'default', textAlign: 'left' }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teams.map(({ t, leaders }) => (
                <tr key={t.teamId}>
                  <td>
                    <span className="flex items-center gap-2">
                      <TeamMark abbr={t.team.abbreviation} color={t.team.primaryColor} size={18} />
                      <Link href={`/teams/${t.team.abbreviation}?season=${season?.key}`} className="link min-w-0 truncate font-medium">
                        {t.name ?? `${t.team.city} ${t.team.name}`}
                      </Link>
                    </span>
                  </td>
                  {leaders.map((l, i) => (
                    <td key={TEAM_CATS[i].key} style={{ textAlign: 'left' }}>
                      {l ? (
                        <span className="flex items-baseline gap-1.5">
                          <Link href={`/players/${l.playerId}`} title={l.name} className="link min-w-0 flex-1 truncate">
                            {short(l.name)}
                          </Link>
                          <span className="tnum shrink-0 font-semibold">{fmt(l[TEAM_CATS[i].key])}</span>
                        </span>
                      ) : (
                        <span style={{ color: 'var(--ink-3)' }}>—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
