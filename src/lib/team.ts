import type { Percentile } from '@/components/PercentileBars';
import { prisma } from '@/lib/db';
import { fmt, ordinal, shortNames } from '@/lib/format';
import { percentileOf, stintRatings } from '@/lib/stats';

/** Team ratings with a direction; pace has none, so it's printed, not ranked. */
export const RATINGS = [
  { key: 'ortg', label: 'Offensive rating' },
  { key: 'drtg', label: 'Defensive rating', low: true },
  { key: 'netRtg', label: 'Net rating' },
  { key: 'efgPct', label: 'Effective FG%', unit: '%' },
  { key: 'tovPct', label: 'Turnover %', unit: '%', low: true },
  { key: 'orebPct', label: 'Off. rebound %', unit: '%' },
  { key: 'ftRate', label: 'Free throw rate', dp: 3 },
  { key: 'oppEfgPct', label: 'Opp. eFG%', unit: '%', low: true },
  { key: 'oppTovPct', label: 'Forced TOV %', unit: '%' },
  { key: 'drebPct', label: 'Def. rebound %', unit: '%' },
] as const;

type Rated = { teamId: number } & Record<(typeof RATINGS)[number]['key'], number | null>;

/** One team's percentile in each rating against `league`, a season's team rows. */
export function teamPercentiles(teamId: number, league: Rated[]): Percentile[] {
  const rated = league.find((t) => t.teamId === teamId);
  if (!rated) return [];
  return RATINGS.flatMap((r) => {
    const mine = rated[r.key];
    const field = league.map((t) => t[r.key]).filter((v): v is number => v !== null);
    if (mine === null || field.length < 2) return [];
    const pct = percentileOf(mine, field, 'low' in r && r.low);
    const value = fmt(mine, 'dp' in r ? r.dp : 1, 'unit' in r ? r.unit : '');
    return [{ label: r.label, value, pct, title: `${r.label}: ${value}, ${ordinal(pct)} percentile of ${field.length} teams` }];
  });
}

/** Every five-man unit a team used in a season, from the play-by-play (2026-27 on). */
export async function teamLineups(seasonId: number, teamId: number) {
  const stints = await prisma.stint.findMany({
    where: { seasonId, teamId },
    select: { players: true, gameId: true, seconds: true, pts: true, oppPts: true, poss: true, oppPoss: true },
  });
  const surnames = shortNames(
    await prisma.player.findMany({ where: { id: { in: [...new Set(stints.flatMap((s) => s.players))] } }, select: { id: true, firstName: true, lastName: true } }),
  );
  const byLineup = new Map<string, typeof stints>();
  for (const s of stints) byLineup.set(s.players.join(), [...(byLineup.get(s.players.join()) ?? []), s]);
  return [...byLineup.values()].map((group) => {
    const r = stintRatings(group);
    return {
      lineup: group[0].players.map((id) => surnames.get(id) ?? id).join(' · '),
      gp: new Set(group.map((s) => s.gameId)).size,
      min: r.min, plusMinus: r.plusMinus, ortg: r.ortg, drtg: r.drtg, net: r.net,
    };
  });
}

/**
 * Who assisted whom on a team's made shots (2026-27 on): each passer-scorer
 * pair with its assists and the points they made. Players are ordered by how
 * involved they are, passing plus finishing, and capped at `top`.
 */
export async function assistNetwork(seasonId: number, teamId: number, top = 10) {
  const pairs = await prisma.shotData.groupBy({
    by: ['assistId', 'playerId'],
    where: { seasonId, teamId, assistId: { not: null } },
    _count: { _all: true },
    _sum: { value: true },
  });
  const involved = new Map<number, number>();
  for (const p of pairs) {
    involved.set(p.assistId!, (involved.get(p.assistId!) ?? 0) + p._count._all);
    involved.set(p.playerId, (involved.get(p.playerId) ?? 0) + p._count._all);
  }
  const ids = [...involved.keys()].sort((a, b) => involved.get(b)! - involved.get(a)!).slice(0, top);
  const names = shortNames(await prisma.player.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }));
  return {
    players: ids.map((id) => ({ id, name: names.get(id) ?? String(id) })),
    pairs: pairs.map((p) => ({ from: p.assistId!, to: p.playerId, ast: p._count._all, pts: p._sum.value ?? 0 })),
  };
}
