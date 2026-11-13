import { PrismaClient } from '@prisma/client';
import { pythagWins, standings, winPct } from './stats';

// Next dev reloads modules on every edit; reuse one client so we don't exhaust
// Postgres connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/** Season key -> row, cached per request path by Next's fetch-less data cache. */
export async function getSeason(key?: string) {
  if (key) return prisma.season.findUnique({ where: { key } });
  return prisma.season.findFirst({ where: { active: true }, orderBy: { startYear: 'desc' } });
}

/** The newest season on file, played or not: what schedule and standings open on. */
export const latestSeason = () => prisma.season.findFirst({ orderBy: { startYear: 'desc' } });

/**
 * One season's standings, every split computed from its finals, so any season
 * since 1946-47 works and a season that hasn't tipped off shows each scheduled
 * team at 0-0. Names and alignment are that season's own. `cup` counts only
 * NBA Cup group games and tags each team with its group ("East Group A").
 */
export async function seasonStandings(seasonId: number, kind: 'regular' | 'preseason' | 'cup' = 'regular') {
  const [games, stats, teams] = await Promise.all([
    prisma.game.findMany({
      where: {
        seasonId,
        kind: kind === 'preseason' ? 'preseason' : 'regular',
        // "Emirates NBA Cup · East Group A": the group stage, not the knockouts.
        ...(kind === 'cup' && { label: { contains: ' Group ' } }),
      },
      select: { date: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, status: true, label: true },
    }),
    prisma.teamStats.findMany({ where: { seasonId } }),
    prisma.team.findMany(),
  ]);
  const byId = new Map(teams.map((t) => [t.id, t]));
  const season = new Map(stats.map((s) => [s.teamId, s]));
  const group = new Map<number, string>();
  for (const g of games) {
    const name = g.label?.match(/(East|West) Group [A-Z]/)?.[0];
    if (name) group.set(g.homeTeamId, name).set(g.awayTeamId, name);
  }
  const ids =
    kind === 'regular'
      ? new Set([...games.flatMap((g) => [g.homeTeamId, g.awayTeamId]), ...season.keys()])
      : new Set(games.flatMap((g) => [g.homeTeamId, g.awayTeamId]));
  // A season BR hasn't published stats for yet (this one, early on) falls
  // back to the franchise's current alignment.
  const alignment = new Map(
    [...ids].map((id) => {
      const s = season.get(id);
      const t = byId.get(id)!;
      return [id, s ? { conference: s.conference, division: s.division } : { conference: t.conference, division: t.division }];
    }),
  );
  const rows = standings(
    games
      .filter((g) => g.status.startsWith('Final'))
      .map((g) => ({
        date: g.date.toISOString().slice(0, 10),
        home: g.homeTeamId, away: g.awayTeamId, homeScore: g.homeScore, awayScore: g.awayScore,
      })),
    alignment,
  );
  return rows.map((r) => {
    const t = byId.get(r.teamId)!;
    const s = season.get(r.teamId);
    return {
      ...r,
      ...alignment.get(r.teamId)!,
      group: group.get(r.teamId) ?? null,
      abbr: t.abbreviation,
      name: s?.name ?? `${t.city} ${t.name}`,
      color: t.primaryColor,
      pct: winPct(r.wins, r.losses),
      xWins: pythagWins(r.pf, r.pa, r.wins + r.losses),
      ortg: s?.ortg ?? null,
      drtg: s?.drtg ?? null,
      netRtg: s?.netRtg ?? null,
    };
  });
}
export type Standing = Awaited<ReturnType<typeof seasonStandings>>[number];

/** Best record first; ties go to the better point differential. */
export const byRecord = (a: Standing, b: Standing) =>
  b.pct - a.pct || b.wins - a.wins || b.pf - b.pa - (a.pf - a.pa);

/** "11/13, 4:02 AM PT": when the daily sync last finished, or null before the first one (or with the database down). */
export async function lastUpdated() {
  try {
    const run = await prisma.syncRun.findFirst({ orderBy: { at: 'desc' }, select: { at: true } });
    if (!run) return null;
    const t = run.at.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    return `${t} PT`;
  } catch {
    // No table yet (migration not applied) or no database: the stamp is simply left out.
    return null;
  }
}
