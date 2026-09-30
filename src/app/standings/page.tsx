import Link from 'next/link';
import { Suspense } from 'react';
import { byRecord, getSeason, latestSeason, prisma, seasonStandings, type Standing } from '@/lib/db';
import { FilterBar } from '@/components/FilterBar';
import { TeamMark } from '@/components/TeamMark';
import { ViewTabs } from '@/components/ViewTabs';
import { fmt, pct3 } from '@/lib/format';
import { seasonOptions } from '@/lib/options';
import { gamesBehind } from '@/lib/stats';

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const season = (sp.season && (await getSeason(sp.season))) || (await latestSeason());
  return { title: `NBA ${sp.tab === 'cup' ? 'Cup ' : ''}Standings ${season?.key ?? ''}`.trim() };
}
export const revalidate = 60;

const TABS = [
  { value: 'standings', label: 'Standings' },
  { value: 'cup', label: 'NBA Cup' },
];
const VIEWS = [
  { value: 'league', label: 'League' },
  { value: 'conference', label: 'Conference' },
  { value: 'division', label: 'Division' },
];
const TYPES = [
  { value: 'regular', label: 'Regular Season' },
  { value: 'preseason', label: 'Preseason' },
];

type Col = { h: string; tip: string; cell: (r: Standing, i: number, lead: Standing) => React.ReactNode };

const wl = ([w, l]: [number, number]) => `${w}-${l}`;
const signed = (v: number, digits = 1) => `${v > 0 ? '+' : ''}${v.toFixed(digits)}`;
const tone = (v: number | null, text: string) => (
  <span style={{ color: v === null ? undefined : v >= 0 ? 'var(--hot)' : 'var(--cold)' }}>{text}</span>
);
const gp = (r: Standing) => r.wins + r.losses;

const RECORD: Col[] = [
  { h: 'W', tip: 'Wins', cell: (r) => r.wins },
  { h: 'L', tip: 'Losses', cell: (r) => r.losses },
  { h: 'PCT', tip: 'Winning percentage', cell: (r) => pct3(r.pct) },
  { h: 'GB', tip: 'Games behind the leader', cell: (r, i, lead) => (i === 0 ? '—' : gamesBehind(lead, r).toFixed(1)) },
  { h: 'HOME', tip: 'Home record', cell: (r) => wl(r.home) },
  { h: 'AWAY', tip: 'Road record', cell: (r) => wl(r.away) },
];
const STREAK: Col = { h: 'STRK', tip: 'Current streak', cell: (r) => r.streak || '—' };

const STANDINGS_COLS: Col[] = [
  ...RECORD,
  { h: 'DIV', tip: 'Record against the division', cell: (r) => (r.division ? wl(r.div) : '—') },
  { h: 'CONF', tip: 'Record against the conference', cell: (r) => (r.conference ? wl(r.conf) : '—') },
  { h: 'PPG', tip: 'Points per game', cell: (r) => (gp(r) ? fmt(r.pf / gp(r)) : '—') },
  { h: 'OPP PPG', tip: 'Points allowed per game', cell: (r) => (gp(r) ? fmt(r.pa / gp(r)) : '—') },
  {
    h: 'DIFF', tip: 'Point differential per game',
    cell: (r) => (gp(r) ? tone((r.pf - r.pa) / gp(r), signed((r.pf - r.pa) / gp(r))) : '—'),
  },
  STREAK,
  { h: 'L10', tip: 'Last ten games', cell: (r) => (gp(r) ? wl(r.l10) : '—') },
];
// Both come from the regular season, so preseason tables leave them off.
const RATING_COLS: Col[] = [
  {
    h: 'xW-L', tip: 'Expected record from points scored and allowed (Pythagorean, exponent 14)',
    cell: (r) => (gp(r) ? `${Math.round(r.xWins)}-${gp(r) - Math.round(r.xWins)}` : '—'),
  },
  {
    h: 'NET', tip: 'Net rating: points per 100 possessions, scored minus allowed',
    cell: (r) => (r.netRtg === null ? '—' : tone(r.netRtg, signed(r.netRtg))),
  },
];
const CUP_COLS: Col[] = [
  ...RECORD,
  { h: 'PF', tip: 'Points scored', cell: (r) => (gp(r) ? r.pf : '—') },
  { h: 'PA', tip: 'Points allowed', cell: (r) => (gp(r) ? r.pa : '—') },
  { h: 'DIFF', tip: 'Point differential, the first group-stage tiebreaker after head-to-head', cell: (r) => (gp(r) ? tone(r.pf - r.pa, signed(r.pf - r.pa, 0)) : '—') },
  STREAK,
];

/** Where the postseason line falls in a conference: seeds that play on, and where the play-in ends. */
function cutLines(startYear: number): number[] {
  if (startYear >= 2020) return [6, 10]; // playoffs, then the play-in
  if (startYear >= 1983) return [8]; // sixteen-team playoffs
  return []; // earlier formats changed too often to draw one line
}

function Group({ title, rows, lines, cols }: { title: string; rows: Standing[]; lines: number[]; cols: Col[] }) {
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
              <th style={{ cursor: 'default' }}>Team</th>
              {cols.map((c) => (
                <th key={c.h} title={c.tip} style={{ cursor: 'default' }}>
                  {c.h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
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
                {cols.map((c) => (
                  <td key={c.h}>{c.cell(r, i, rows[0])}</td>
                ))}
              </tr>
            ))}
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
  const cup = sp.tab === 'cup';
  const type = !cup && sp.type === 'preseason' ? 'preseason' : 'regular';
  const view = VIEWS.some((v) => v.value === sp.view) ? sp.view : 'conference';
  const rows = season ? (await seasonStandings(season.id, cup ? 'cup' : type)).sort(byRecord) : [];

  // Before 1970-71 there were no conferences: the divisions were the halves.
  const hasConferences = rows.some((r) => r.conference);
  const keyOf = (r: Standing) =>
    cup
      ? r.group!
      : view === 'league'
        ? 'NBA'
        : view === 'division' || !hasConferences
          ? r.division ?? 'League'
          : r.conference!;
  const titleOf = (k: string) =>
    cup ? k : k === 'NBA' ? 'League' : k === 'East' || k === 'West' ? `${k}ern Conference` : `${k} Division`;
  const groups = [...new Set(rows.map(keyOf))].sort().map((k) => ({ key: k, rows: rows.filter((r) => keyOf(r) === k) }));
  const lines =
    !cup && type === 'regular' && view === 'conference' && hasConferences && season ? cutLines(season.startYear) : [];
  const cols = cup ? CUP_COLS : type === 'preseason' ? STANDINGS_COLS : [...STANDINGS_COLS, ...RATING_COLS];

  const tabHref = (t: string) =>
    `?${new URLSearchParams({ ...(sp.season && { season: sp.season }), ...(t === 'cup' && { tab: 'cup' }) })}`;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold tracking-tight">
        NBA {cup && 'Cup '}Standings {season?.key}
      </h1>

      <nav className="flex border-b" style={{ borderColor: 'var(--line)' }} aria-label="Standings">
        {TABS.map((t) => {
          const active = t.value === (cup ? 'cup' : 'standings');
          return (
            <Link
              key={t.value}
              href={tabHref(t.value)}
              aria-current={active ? 'page' : undefined}
              scroll={false}
              className="-mb-px border-b-2 px-4 py-2 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] no-underline"
              style={{ borderColor: active ? 'var(--ink)' : 'transparent', color: active ? 'var(--ink)' : 'var(--ink-2)' }}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-wrap items-start gap-x-3">
        {!cup && (
          <ViewTabs
            views={VIEWS}
            current={view}
            params={Object.fromEntries(Object.entries(sp).filter(([k]) => k !== 'view'))}
          />
        )}
        <Suspense>
          <FilterBar
            bare
            fields={[
              {
                kind: 'select', name: 'season', label: 'Season', defaultValue: season?.key,
                // The NBA Cup began in 2023-24.
                options: seasonOptions(cup ? seasons.filter((s) => s.startYear >= 2023) : seasons),
              },
              ...(cup
                ? []
                : [{ kind: 'select' as const, name: 'type', label: 'Season type', options: TYPES, defaultValue: 'regular' }]),
            ]}
          />
        </Suspense>
      </div>

      {rows.length ? (
        <div className="space-y-6">
          {groups.map((g) => (
            <Group key={g.key} title={titleOf(g.key)} rows={g.rows} lines={lines} cols={cols} />
          ))}
          <p className="text-xs" style={{ color: 'var(--ink-2)' }}>
            Standings are updated with the completion of each game.
            {lines.length === 2 && ' The top six in each conference make the playoffs; seeds seven to ten meet in the play-in.'}
            {!cup && type === 'regular' && ' Ratings are per 100 possessions.'}
            {cup && ' The group winners and the best second-place team in each conference reach the knockout rounds.'}
          </p>
        </div>
      ) : (
        <p className="panel p-6 text-sm" style={{ color: 'var(--ink-2)' }}>
          No {cup ? 'NBA Cup group ' : type === 'preseason' ? 'preseason ' : ''}games on file for {season?.key}.
        </p>
      )}
    </div>
  );
}
