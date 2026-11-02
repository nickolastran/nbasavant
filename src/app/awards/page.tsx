import { Suspense } from 'react';
import { getSeason, prisma } from '@/lib/db';
import { FilterBar } from '@/components/FilterBar';
import { LeaderBoard, type Board } from '@/components/LeaderBoard';
import { fmt, pct3 } from '@/lib/format';
import { leaderBoards, type Line } from '@/lib/leaders';
import { seasonOptions } from '@/lib/options';
import { minGames, scaledFloor, winPct, zLadder } from '@/lib/stats';

export const metadata = { title: 'Awards Race' };
export const revalidate = 60;

const TOP = 10;
const signed = (v: number | null, dp = 0) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(dp)}`);

export default async function AwardsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const [seasons, active] = await Promise.all([
    prisma.season.findMany({ where: { active: true }, orderBy: { startYear: 'desc' } }),
    getSeason(),
  ]);
  const season = seasons.find((s) => s.key === sp.season) ?? active;
  const prevSeason = seasons.find((s) => season && s.startYear === season.startYear - 1);

  const [{ lines, teamStats, games }, prev] = await Promise.all([
    leaderBoards(season?.id, 0),
    leaderBoards(prevSeason?.id, 0),
  ]);
  // As /leaders holds BPM: 70% of his team's games and 1000 minutes prorated, so a cameo can't top a ladder.
  const qualified = lines.filter((l) => l.gp >= minGames(games(l)) && (l.min ?? 0) >= scaledFloor(1000, games(l)));

  // Rookies: no season on file before this one.
  const veterans = new Set(
    season
      ? (await prisma.playerStats.findMany({
          where: { playerId: { in: lines.map((l) => l.playerId) }, season: { startYear: { lt: season.startYear } } },
          select: { playerId: true },
          distinct: ['playerId'],
        })).map((r) => r.playerId)
      : [],
  );
  const lastYear = new Map(prev.lines.filter((l) => l.gp >= 41).map((l) => [l.playerId, l]));
  const less = (a: number | null, b: number | null | undefined) => (a === null || b === null || b === undefined ? null : a - b);
  const improved = qualified
    .filter((l) => lastYear.has(l.playerId))
    .map((l) => ({ ...l, dPpg: less(l.ppg, lastYear.get(l.playerId)!.ppg), dBpm: less(l.bpm, lastYear.get(l.playerId)!.bpm) }));

  // Clutch: points from the clutch lines, +/- from the stints (2026-27 on).
  const [clutchPts, clutchStints] = season
    ? await Promise.all([
        prisma.clutchLog.groupBy({ by: ['playerId'], where: { seasonId: season.id }, _sum: { pts: true } }),
        prisma.stint.findMany({ where: { seasonId: season.id, clutch: true }, select: { players: true, pts: true, oppPts: true } }),
      ])
    : [[], []];
  const clutchPm = new Map<number, number>();
  for (const s of clutchStints) for (const id of s.players) clutchPm.set(id, (clutchPm.get(id) ?? 0) + s.pts - s.oppPts);
  const byId = new Map(lines.map((l) => [l.playerId, l]));
  const clutch = clutchPts
    .filter((c) => byId.has(c.playerId))
    .map((c) => ({ ...byId.get(c.playerId)!, cPts: c._sum.pts ?? 0, cPm: clutchPm.get(c.playerId) ?? 0 }));

  const record = new Map(teamStats.map((t) => [t.teamId, { w: t.wins, l: t.losses }]));
  const teamPct = (l: Line) => {
    const r = record.get(l.teamId ?? -1);
    return r && r.w + r.l ? winPct(r.w, r.l) : null;
  };

  const board = <T extends Line>(
    key: string, label: string, note: string, pool: T[],
    stats: ((r: T) => number | null)[], value: (r: T) => string, empty: string,
  ): Board => ({
    key, label, note, empty,
    rows: zLadder(pool, stats).slice(0, TOP).map(({ row }) => ({
      playerId: row.playerId, name: row.name, abbr: row.abbr, color: row.color, value: value(row),
    })),
  });

  const none = `Not enough on file for ${season?.key ?? 'this season'}.`;
  const boards: Board[] = [
    board('mvp', 'Most Valuable Player', 'BPM · win shares · team W%', qualified,
      [(r) => r.bpm, (r) => r.ws, teamPct],
      (r) => `${fmt(r.bpm)} · ${fmt(r.ws)} · ${pct3(teamPct(r) ?? 0)}`, none),
    board('dpoy', 'Defensive Player of the Year', 'DBPM · DWS · STL+BLK', qualified,
      [(r) => r.dbpm, (r) => r.dws, (r) => (r.spg === null || r.bpg === null ? null : r.spg + r.bpg)],
      (r) => `${fmt(r.dbpm)} · ${fmt(r.dws)} · ${fmt((r.spg ?? 0) + (r.bpg ?? 0))}`, none),
    board('roy', 'Rookie of the Year', 'PTS · BPM · win shares', qualified.filter((l) => !veterans.has(l.playerId)),
      [(r) => r.ppg, (r) => r.bpm, (r) => r.ws],
      (r) => `${fmt(r.ppg)} · ${fmt(r.bpm)} · ${fmt(r.ws)}`, qualified.some((l) => !veterans.has(l.playerId)) ? none : 'No qualified rookies yet.'),
    // The NBA's rule: more games off the bench than started.
    board('6moy', 'Sixth Man of the Year', 'PTS · BPM · win shares', qualified.filter((l) => l.gs !== null && l.gs * 2 < l.gp),
      [(r) => r.ppg, (r) => r.bpm, (r) => r.ws],
      (r) => `${fmt(r.ppg)} · ${fmt(r.bpm)} · ${fmt(r.ws)}`, none),
    board('mip', 'Most Improved Player', `PTS · BPM, change on ${prevSeason?.key ?? 'last season'}`, improved,
      [(r) => r.dPpg, (r) => r.dBpm],
      (r) => `${signed(r.dPpg, 1)} · ${signed(r.dBpm, 1)}`, none),
    board('clutch', 'Clutch Player of the Year', 'clutch PTS · clutch +/-', clutch,
      [(r) => r.cPts, (r) => r.cPm],
      (r) => `${r.cPts} · ${signed(r.cPm)}`, 'Clutch stats start with 2026-27.'),
  ];

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold tracking-tight">Awards Race</h1>
      <p className="mb-4 max-w-3xl text-sm" style={{ color: 'var(--ink-2)' }}>
        {season?.key}. Our ladders from the numbers, not a forecast of the vote: each player is ranked by his
        average z-score across the stats under each award, weighted equally, against the eligible field. To be
        eligible: 70% of his team&apos;s games and about 12 minutes a game; Most Improved also 41 games last
        season. Early in a season, a
        couple of games can top a ladder.
      </p>
      <Suspense>
        <FilterBar
          fields={[{ kind: 'select', name: 'season', label: 'Season', options: seasonOptions(seasons), defaultValue: season?.key }]}
        />
      </Suspense>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {boards.map((b) => (
          <LeaderBoard key={b.key} board={b} />
        ))}
      </div>
    </div>
  );
}
