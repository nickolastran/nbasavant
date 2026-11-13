import { Suspense } from 'react';
import { RosterBuilder, type PoolPlayer } from '@/components/RosterBuilder';
import { getSeason } from '@/lib/db';
import { playerLeaderboard } from '@/lib/leaderboard';
import { percentileOf } from '@/lib/stats';
import { titleZoneData } from '@/lib/title-zone-data';

export const metadata = { title: 'Build-a-Roster' };
export const revalidate = 60;

/** Minutes a player needs to be in the pool and to count toward the skill percentiles. */
const SKILL_MIN = 100;

export default async function RosterLab() {
  const season = await getSeason();
  const [rows, zone] = season ? await Promise.all([playerLeaderboard(season.id, 'game'), titleZoneData(season.id)]) : [[], null];
  const n = (v: unknown) => (typeof v === 'number' ? v : null);

  // Each skill as one number per player, then a percentile against the qualified field.
  const raw = rows.map((r) => {
    const mpg = n(r.mpg);
    const per36 = (v: number | null) => (v === null || !mpg ? null : (v / mpg) * 36);
    const threes = n(r.fg3a) !== null && n(r.fg3Pct) !== null ? per36((n(r.fg3a)! * n(r.fg3Pct)!) / 100) : null;
    return { r, mpg, skills: { shooting: threes, creation: n(r.astPct), rim: n(r.blkPct), rebounding: per36(n(r.reb)), perimeter: n(r.stlPct) } };
  });
  const keys = ['shooting', 'creation', 'rim', 'rebounding', 'perimeter'] as const;
  const fields = Object.fromEntries(keys.map((k) => [k, raw.filter((x) => (n(x.r.min) ?? 0) >= SKILL_MIN).map((x) => x.skills[k]).filter((v): v is number => v !== null)]));
  const pool: PoolPlayer[] = raw
    // A box plus/minus on a few dozen minutes is noise, so the pool starts at the same floor as the percentiles.
    .filter((x) => x.mpg && (n(x.r.min) ?? 0) >= SKILL_MIN && n(x.r.obpm) !== null && n(x.r.dbpm) !== null)
    .map((x) => ({
      id: x.r.playerId as number, name: String(x.r.player), team: String(x.r.team ?? ''), pos: String(x.r.pos ?? ''),
      mpg: x.mpg!, obpm: n(x.r.obpm)!, dbpm: n(x.r.dbpm)!,
      skills: Object.fromEntries(keys.map((k) => [k, x.skills[k] === null || fields[k].length < 2 ? null : percentileOf(x.skills[k]!, fields[k])])) as PoolPlayer['skills'],
    }))
    .sort((a, b) => b.obpm + b.dbpm - (a.obpm + a.dbpm));

  return (
    <div>
      <p className="eyebrow">Lab</p>
      <h1 className="text-2xl font-bold tracking-tight">Build-a-Roster</h1>
      <p className="mb-4 mt-1 max-w-prose text-sm" style={{ color: 'var(--ink-2)' }}>
        {season?.key}. Pick eight to ten players from across the league and see the team they project to. There is no salary cap here: the site has no
        contract data yet.
      </p>
      {pool.length ? (
        <Suspense fallback={<span aria-hidden className="skeleton block h-96 w-full rounded-md" />}>
          <RosterBuilder pool={pool} teams={zone?.teams ?? []} frames={zone?.frames.slice(-1) ?? []} />
        </Suspense>
      ) : (
        <p className="panel p-8 text-center text-sm" style={{ color: 'var(--ink-2)' }}>
          No player ratings for this season yet.
        </p>
      )}
    </div>
  );
}
