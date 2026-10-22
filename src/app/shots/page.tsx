import { Suspense } from 'react';
import Link from 'next/link';
import { Prisma } from '@prisma/client';
import { prisma, getSeason } from '@/lib/db';
import { FilterBar } from '@/components/FilterBar';
import { ShotChart, type Shot } from '@/components/ShotChart';
import { StatTable } from '@/components/StatTable';
import { TEAM_OPTIONS, seasonOptions } from '@/lib/options';

export const metadata = { title: 'Shot Chart Analyzer' };
export const revalidate = 60;

const ZONES = [
  'Restricted Area', 'In The Paint (Non-RA)', 'Mid-Range', 'Long Mid-Range',
  'Left Corner 3', 'Right Corner 3', 'Above the Break 3',
];

/** Cap plotted shots; the hex bins look the same and the page stays quick. */
const MAX_PLOTTED = 12_000;

export default async function ShotsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const active = await getSeason();
  const seasonKey = sp.season || active?.key;
  const seasons = await prisma.season.findMany({ orderBy: { startYear: 'desc' } });

  const player = sp.player
    ? await prisma.player.findFirst({
        where: { fullName: { contains: sp.player, mode: 'insensitive' } },
        select: { id: true, fullName: true, team: { select: { abbreviation: true } } },
      })
    : null;
  const defender = sp.defender
    ? await prisma.player.findFirst({
        where: { fullName: { contains: sp.defender, mode: 'insensitive' } },
        select: { id: true, fullName: true },
      })
    : null;

  const where: Prisma.ShotDataWhereInput = {
    season: { key: seasonKey },
    ...(player ? { playerId: player.id } : {}),
    ...(defender ? { defenderId: defender.id } : {}),
    ...(sp.team ? { team: { abbreviation: sp.team } } : {}),
    ...(sp.zone ? { zone: sp.zone } : {}),
    ...(sp.result ? { made: sp.result === 'made' } : {}),
    ...(sp.period ? { period: Number(sp.period) } : {}),
    ...(sp.minDist || sp.maxDist
      ? {
          distanceFt: {
            ...(sp.minDist ? { gte: Number(sp.minDist) } : {}),
            ...(sp.maxDist ? { lte: Number(sp.maxDist) } : {}),
          },
        }
      : {}),
  };

  const [shots, total, zoneRows, leagueRows] = await Promise.all([
    prisma.shotData.findMany({
      where,
      select: {
        x: true, y: true, made: true, value: true, distanceFt: true, zone: true,
        actionType: true, period: true, minsLeft: true, secsLeft: true, defDistFt: true,
        player: { select: { fullName: true } },
        defender: { select: { fullName: true } },
      },
      take: MAX_PLOTTED,
    }),
    prisma.shotData.count({ where }),
    prisma.shotData.groupBy({ by: ['zone', 'value', 'made'], where, _count: { _all: true } }),
    prisma.shotData.groupBy({
      by: ['zone', 'made'],
      where: { season: { key: seasonKey } },
      _count: { _all: true },
    }),
  ]);

  const lg = new Map<string, { att: number; made: number }>();
  for (const r of leagueRows) {
    const cur = lg.get(r.zone) ?? { att: 0, made: 0 };
    cur.att += r._count._all;
    if (r.made) cur.made += r._count._all;
    lg.set(r.zone, cur);
  }

  const byZone = new Map<string, { value: number; att: number; made: number }>();
  for (const r of zoneRows) {
    const cur = byZone.get(r.zone) ?? { value: r.value, att: 0, made: 0 };
    cur.att += r._count._all;
    if (r.made) cur.made += r._count._all;
    byZone.set(r.zone, cur);
  }

  const zoneTable = [...byZone]
    .map(([zone, z]) => {
      const l = lg.get(zone);
      const leagueFg = l && l.att ? (l.made / l.att) * 100 : 0;
      const fg = z.att ? (z.made / z.att) * 100 : 0;
      return {
        zone,
        att: z.att,
        made: z.made,
        fgPct: fg,
        pps: z.att ? (z.made * z.value) / z.att : 0,
        leagueFgPct: leagueFg,
        vsLeague: fg - leagueFg,
      };
    })
    .sort((a, b) => b.att - a.att);

  const subject =
    player?.fullName ??
    (sp.team ? TEAM_OPTIONS.find((t) => t.value === sp.team)?.label : null) ??
    'League';

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold tracking-tight">Shot Chart Analyzer</h1>
      <p className="mb-4 text-sm" style={{ color: 'var(--ink-2)' }}>
        {total.toLocaleString()} attempts match these filters
        {total > MAX_PLOTTED && ` — plotting the first ${MAX_PLOTTED.toLocaleString()}`}.
      </p>

      <Suspense>
        <FilterBar
          fields={[
            { kind: 'select', name: 'season', label: 'Season', options: seasonOptions(seasons), defaultValue: seasonKey },
            { kind: 'text', name: 'player', label: 'Shooter', placeholder: 'Player name' },
            { kind: 'text', name: 'defender', label: 'Defender', placeholder: 'Player name' },
            { kind: 'select', name: 'team', label: 'Team', options: TEAM_OPTIONS, logos: true },
            {
              kind: 'select', name: 'zone', label: 'Zone',
              options: [{ value: '', label: 'All zones' }, ...ZONES.map((z) => ({ value: z, label: z }))],
            },
            {
              kind: 'select', name: 'result', label: 'Result',
              options: [
                { value: '', label: 'All' },
                { value: 'made', label: 'Made' },
                { value: 'missed', label: 'Missed' },
              ],
            },
            {
              kind: 'select', name: 'period', label: 'Period',
              options: [
                { value: '', label: 'All' },
                ...[1, 2, 3, 4].map((p) => ({ value: String(p), label: `Q${p}` })),
              ],
            },
            { kind: 'number', name: 'minDist', label: 'Min ft', min: 0, max: 40 },
            { kind: 'number', name: 'maxDist', label: 'Max ft', min: 0, max: 40 },
          ]}
        />
      </Suspense>

      {sp.player && !player && (
        <p className="panel mb-4 p-3 text-sm">
          No player matches “{sp.player}”. Check the spelling, or{' '}
          <Link href="/players" className="link">
            browse the player list
          </Link>
          .
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <ShotChart
          shots={shots.map(
            (s): Shot => ({
              x: s.x, y: s.y, made: s.made, value: s.value, distanceFt: s.distanceFt,
              zone: s.zone, action: s.actionType, player: s.player.fullName,
              defender: s.defender?.fullName ?? null, period: s.period,
              clock: `${s.minsLeft}:${String(s.secsLeft).padStart(2, '0')}`,
            }),
          )}
          title={subject}
          subtitle={[seasonKey, sp.zone, sp.result, sp.period && `Q${sp.period}`]
            .filter(Boolean)
            .join(' · ')}
          height={560}
        />

        <div>
          <h2 className="mb-2 text-sm font-semibold">Efficiency by zone</h2>
          <StatTable
            rows={zoneTable}
            cols={[
              { key: 'zone', label: 'Zone' },
              { key: 'att', label: 'FGA' },
              { key: 'made', label: 'FGM' },
              { key: 'fgPct', label: 'FG%', dp: 1, shade: true },
              { key: 'pps', label: 'PTS/Shot', dp: 2, shade: true },
              { key: 'leagueFgPct', label: 'Lg FG%', dp: 1 },
              { key: 'vsLeague', label: 'vs Lg', dp: 1, shade: true },
            ]}
            initialSort="att"
            filename="shot-zones"
            caption="Compared against the league in the same zone"
          />
        </div>
      </div>
    </div>
  );
}
