import Link from 'next/link';
import { Suspense } from 'react';
import { byRecord, getSeason, latestSeason, prisma, seasonStandings, type Standing } from '@/lib/db';
import { FilterBar } from '@/components/FilterBar';
import { ViewTabs } from '@/components/ViewTabs';
import { seasonOptions } from '@/lib/options';
import { titleZoneData } from '@/lib/title-zone-data';
import { colsFor } from './columns';
import { StandingsTables } from './StandingsTables';

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

/** Where the postseason line falls in a conference: seeds that play on, and where the play-in ends. */
function cutLines(startYear: number): number[] {
  if (startYear >= 2020) return [6, 10]; // playoffs, then the play-in
  if (startYear >= 1983) return [8]; // sixteen-team playoffs
  return []; // earlier formats changed too often to draw one line
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
  const standings = season ? (await seasonStandings(season.id, cup ? 'cup' : type)).sort(byRecord) : [];
  // Each team's net rating by game day (the Title Zone's series), for the trend sparkline. Regular season only.
  const zone = season && !cup && type === 'regular' ? await titleZoneData(season.id) : null;
  const trendOf = new Map<number, number[]>();
  // The first few game days are one-game samples (plus or minus forty); the line starts once they settle.
  for (const f of (zone?.frames ?? []).slice(3)) for (const [id, off, def] of f.season) trendOf.set(id, [...(trendOf.get(id) ?? []), Math.round((off + def) * 10) / 10]);
  const rows = standings.map((r) => ({ ...r, trend: trendOf.get(r.teamId)?.slice(-20) }));

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
  const set = cup ? 'cup' : type === 'preseason' ? 'preseason' : 'standings';
  const lines =
    !cup && type === 'regular' && view === 'conference' && hasConferences && season ? cutLines(season.startYear) : [];
  // Divisions and Cup groups sit under their conference.
  const confs =
    hasConferences && (cup || view === 'division') ? [...new Set(rows.map((r) => r.conference!))].sort() : [null];
  const sections = confs.map((c) => ({
    title: c && `${c}ern Conference`,
    groups: groups.filter((g) => !c || g.rows[0].conference === c).map((g) => ({ title: titleOf(g.key), rows: g.rows })),
  }));

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
          {/* Keyed by the view, so a new season or view starts back on games behind. */}
          <StandingsTables key={JSON.stringify(sp)} sections={sections} set={set} lines={lines} />
          <p className="text-xs" style={{ color: 'var(--ink-2)' }}>
            Standings are updated with the completion of each game.
            {lines.length === 2 && ' The top six in each conference make the playoffs; seeds seven to ten meet in the play-in.'}
            {!cup && type === 'regular' && ' Ratings are per 100 possessions.'}
            {cup && ' The group winners and the best second-place team in each conference reach the knockout rounds.'}
          </p>
          <section className="panel overflow-hidden">
            <h2
              className="border-b px-3 py-2 text-sm font-bold uppercase tracking-[0.1em]"
              style={{ borderColor: 'var(--line)' }}
            >
              Glossary
            </h2>
            <dl className="gap-x-8 px-3 py-2 text-[0.8125rem] sm:columns-2 lg:columns-3">
              {colsFor(set).map((c) => (
                <div key={c.h} className="break-inside-avoid py-1">
                  <dt className="inline font-bold">{c.h}: </dt>
                  <dd className="inline" style={{ color: 'var(--ink-2)' }}>
                    {c.tip}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      ) : (
        <p className="panel p-6 text-sm" style={{ color: 'var(--ink-2)' }}>
          No {cup ? 'NBA Cup group ' : type === 'preseason' ? 'preseason ' : ''}games on file for {season?.key}.
        </p>
      )}
    </div>
  );
}
