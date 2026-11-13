import Link from 'next/link';
import { TeamMark } from '@/components/TeamMark';
import { getSeason, lastUpdated, prisma } from '@/lib/db';
import { ordinal } from '@/lib/format';
import { percentileOf } from '@/lib/stats';

export const metadata = { title: 'Team Fingerprints', description: 'Every NBA team’s style at a glance: pace, threes, rim attempts, turnovers and rebounding.' };
export const revalidate = 300;

const TRAITS = [
  { key: 'pace', label: 'Pace', dp: 1, unit: '' },
  { key: 'fg3ar', label: '3PA rate', dp: 1, unit: '%' },
  { key: 'rim', label: 'Rim rate', dp: 1, unit: '%' },
  { key: 'tovPct', label: 'TOV%', dp: 1, unit: '%' },
  { key: 'orebPct', label: 'OREB%', dp: 1, unit: '%' },
  { key: 'drebPct', label: 'DREB%', dp: 1, unit: '%' },
] as const;
type Trait = (typeof TRAITS)[number]['key'];

/**
 * All thirty teams as small multiples: six style traits, each a bar showing
 * where the team sits in the league. These are styles, not grades, so the bars
 * are one neutral color: a long bar means "more of this", not "better".
 */
export default async function FingerprintsPage() {
  const season = await getSeason();
  const [teams, rim, updated] = season
    ? await Promise.all([
        prisma.teamStats.findMany({ where: { seasonId: season.id, gp: { gt: 0 } }, include: { team: true }, orderBy: { team: { abbreviation: 'asc' } } }),
        prisma.$queryRaw<{ teamId: number; rim: number; all: number }[]>`
          SELECT "teamId", count(*) FILTER (WHERE zone = 'Restricted Area')::int AS rim, count(*)::int AS all
          FROM shot_data WHERE "seasonId" = ${season.id} AND "eventNum" IS NOT NULL GROUP BY 1`,
        lastUpdated(),
      ])
    : [[], [], null];
  const rimOf = new Map(rim.map((r) => [r.teamId, r.all ? (r.rim / r.all) * 100 : null]));
  const rows = teams.map((t) => ({
    t,
    values: {
      pace: t.pace, fg3ar: t.fga && t.fg3a !== null ? (t.fg3a / t.fga) * 100 : null, rim: rimOf.get(t.teamId) ?? null,
      tovPct: t.tovPct, orebPct: t.orebPct, drebPct: t.drebPct,
    } as Record<Trait, number | null>,
  }));
  const field = (k: Trait) => rows.map((r) => r.values[k]).filter((v): v is number => v !== null);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Team fingerprints</h1>
      <p className="mb-4 mt-1 max-w-prose text-sm" style={{ color: 'var(--ink-2)' }}>
        {season?.key}. How each team plays, not how well: the bar is where the team sits among the {rows.length} for that trait (the tick is the
        league&apos;s middle), with the value beside it. Rim rate is the share of shots in the restricted area, from play-by-play.
      </p>
      {rows.length ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {rows.map(({ t, values }) => (
            <li key={t.teamId}>
              <Link href={`/teams/${t.team.abbreviation}`} className="panel block p-3 no-underline transition-transform duration-fast hover:-translate-y-0.5" style={{ color: 'var(--ink)' }}>
                <div className="mb-2 flex items-center gap-2">
                  <TeamMark abbr={t.team.abbreviation} color={t.team.primaryColor} size={22} />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{t.name ?? `${t.team.city} ${t.team.name}`}</span>
                  <span className="tnum text-xs" style={{ color: 'var(--ink-2)' }}>
                    {t.wins}-{t.losses}
                  </span>
                </div>
                <dl className="space-y-1">
                  {TRAITS.map((tr) => {
                    const v = values[tr.key];
                    const f = field(tr.key);
                    const pct = v === null || f.length < 2 ? null : percentileOf(v, f);
                    return (
                      <div key={tr.key} className="grid grid-cols-[3.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 text-[0.6875rem]" title={pct === null ? undefined : `${tr.label}: ${ordinal(pct)} percentile`}>
                        <dt style={{ color: 'var(--ink-2)' }}>{tr.label}</dt>
                        <dd className="relative m-0 h-2 rounded-sm" style={{ background: 'var(--line)' }}>
                          {pct !== null && <span className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${Math.max(3, pct)}%`, background: 'var(--ink-2)' }} />}
                          <span className="absolute inset-y-[-2px] left-1/2 w-px" style={{ background: 'var(--ink-3)' }} />
                        </dd>
                        <dd className="tnum m-0 text-right font-semibold">{v === null ? '—' : `${v.toFixed(tr.dp)}${tr.unit}`}</dd>
                      </div>
                    );
                  })}
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="panel p-8 text-center text-sm" style={{ color: 'var(--ink-2)' }}>
          No team has played yet this season.
        </p>
      )}
      <p className="eyebrow mt-5">
        Data: NBA.com, Basketball-Reference{updated && ` · Updated ${updated}`}
      </p>
    </div>
  );
}
