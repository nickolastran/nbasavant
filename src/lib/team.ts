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

/** Every pair inside a five, each once: ten of them. */
const pairsOf = (ids: number[]) => ids.flatMap((a, i) => ids.slice(i + 1).map((b) => [a, b]));

/**
 * Every unit a team, or with no `teamId` the whole league, used in a season,
 * from the play-by-play (2026-27 on). `size` 5 is the lineup; 2 is each pair
 * of teammates, summed over every lineup they shared.
 */
export async function lineups(seasonId: number, { teamId, size = 5 }: { teamId?: number; size?: 2 | 5 } = {}) {
  const stints = await prisma.stint.findMany({
    where: { seasonId, ...(teamId ? { teamId } : {}) },
    select: { teamId: true, players: true, gameId: true, seconds: true, pts: true, oppPts: true, poss: true, oppPoss: true },
  });
  const surnames = shortNames(
    await prisma.player.findMany({ where: { id: { in: [...new Set(stints.flatMap((s) => s.players))] } }, select: { id: true, firstName: true, lastName: true } }),
  );
  type Unit = { teamId: number; players: number[]; games: Set<number>; seconds: number; pts: number; oppPts: number; poss: number; oppPoss: number };
  const units = new Map<string, Unit>();
  for (const s of stints) {
    for (const players of size === 5 ? [s.players] : pairsOf(s.players)) {
      const key = `${s.teamId}:${players.join()}`;
      const u = units.get(key) ?? { teamId: s.teamId, players, games: new Set(), seconds: 0, pts: 0, oppPts: 0, poss: 0, oppPoss: 0 };
      u.games.add(s.gameId);
      u.seconds += s.seconds;
      u.pts += s.pts;
      u.oppPts += s.oppPts;
      u.poss += s.poss;
      u.oppPoss += s.oppPoss;
      units.set(key, u);
    }
  }
  return [...units.values()].map((u) => {
    const r = stintRatings([u]);
    return {
      teamId: u.teamId,
      players: u.players,
      lineup: u.players.map((id) => surnames.get(id) ?? id).join(' · '),
      gp: u.games.size,
      min: r.min, poss: r.poss, plusMinus: r.plusMinus, ortg: r.ortg, drtg: r.drtg, net: r.net,
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
