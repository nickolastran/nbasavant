/**
 * The stat leader boards, shared by /leaders and the home page: every player's
 * season line, advanced numbers included, and who qualifies for each board.
 */
import { prisma } from './db';
import { perGame } from './format';
import { expectedShooting, minGames, scaledFloor, stintRatings } from './stats';

export type Line = {
  playerId: number; name: string; abbr: string; color: string; teamId: number | null; gp: number; gs: number | null;
  min: number | null; fga: number; fg3a: number | null; fta: number;
  ppg: number | null; rpg: number | null; apg: number | null; spg: number | null; bpg: number | null;
  tpm: number | null; fgPct: number | null; fg3Pct: number | null; ftPct: number | null;
  tsPct: number | null; efgPct: number | null; usgPct: number | null;
  per: number | null; ws: number | null; bpm: number | null; vorp: number | null;
  dws: number | null; dbpm: number | null;
  // From the real shots and lineup stints, 2026-27 on; null before (and off /leaders).
  xEfg: number | null; shotMaking: number | null; onOff: number | null; clutchPts: number | null; clutchPm: number | null;
};
export type Stat = Exclude<keyof Line, 'playerId' | 'name' | 'abbr' | 'color' | 'teamId' | 'gp' | 'gs' | 'min' | 'fga' | 'fg3a' | 'fta' | 'dws' | 'dbpm'>;

/**
 * Each board, and what it takes to be on it. Per-game and rate boards need
 * 70% of the player's team's games; rate boards also an attempt floor (the 82-game number,
 * prorated); usage, PER and BPM a minutes floor (1000, about 12 a game), so a
 * two-minute cameo can't top them. Season totals (WS, VORP) rank everyone.
 */
export const BOARDS: { key: Stat; label: string; unit?: string; dp?: number; total?: boolean; floor?: ['min' | 'fga' | 'fg3a' | 'fta', number] }[] = [
  { key: 'ppg', label: 'Points' },
  { key: 'rpg', label: 'Rebounds' },
  { key: 'apg', label: 'Assists' },
  { key: 'spg', label: 'Steals' },
  { key: 'bpg', label: 'Blocks' },
  { key: 'tpm', label: 'Threes made' },
  { key: 'fgPct', label: 'Field goal %', unit: '%', floor: ['fga', 300] },
  { key: 'fg3Pct', label: 'Three-point %', unit: '%', floor: ['fg3a', 100] },
  { key: 'ftPct', label: 'Free throw %', unit: '%', floor: ['fta', 100] },
  { key: 'tsPct', label: 'True shooting %', unit: '%', floor: ['fga', 300] },
  { key: 'efgPct', label: 'Effective FG %', unit: '%', floor: ['fga', 300] },
  { key: 'usgPct', label: 'Usage %', unit: '%', floor: ['min', 1000] },
  { key: 'per', label: 'Player efficiency rating (PER)', floor: ['min', 1000] },
  { key: 'bpm', label: 'Box plus/minus (BPM)', floor: ['min', 1000] },
  { key: 'ws', label: 'Win shares', total: true },
  { key: 'vorp', label: 'Value over replacement (VORP)', total: true },
  { key: 'shotMaking', label: 'Shot-making (eFG% over expected)', floor: ['fga', 300] },
  { key: 'xEfg', label: 'Shot quality (expected eFG%)', unit: '%', floor: ['fga', 300] },
  { key: 'onOff', label: 'On/off net rating', floor: ['min', 1000] },
  { key: 'clutchPts', label: 'Clutch points', dp: 0, total: true },
  { key: 'clutchPm', label: 'Clutch +/-', dp: 0, total: true },
];

/** Boards that rank a per-game average (points, rebounds...), not a rate, a rating or a season total. */
export const isPerGame = (b: (typeof BOARDS)[number]) => !b.total && !b.unit && !b.floor;

export const rank = (pool: Line[], key: Stat) =>
  pool.filter((l) => l[key] !== null).sort((a, b) => (b[key] as number) - (a[key] as number));

/** Expected shooting for every player with real shots in a season (2026-27 on). */
export async function seasonShooting(seasonId: number) {
  const groups = await prisma.shotData.groupBy({
    by: ['playerId', 'value', 'distanceFt', 'made'],
    where: { seasonId, eventNum: { not: null } },
    _count: true,
  });
  return expectedShooting(groups.map((g) => ({ ...g, n: g._count })));
}

type Totals = { seconds: number; pts: number; oppPts: number; poss: number; oppPoss: number };
const add = (a: Totals, b: Totals): Totals => ({
  seconds: a.seconds + b.seconds, pts: a.pts + b.pts, oppPts: a.oppPts + b.oppPts, poss: a.poss + b.poss, oppPoss: a.oppPoss + b.oppPoss,
});
const minus = (a: Totals, b: Totals): Totals => add(a, { seconds: -b.seconds, pts: -b.pts, oppPts: -b.oppPts, poss: -b.poss, oppPoss: -b.oppPoss });
const none: Totals = { seconds: 0, pts: 0, oppPts: 0, poss: 0, oppPoss: 0 };

/**
 * Shot quality and shot-making, on/off net rating and clutch totals for a
 * season, by player. On/off sums his teams' stints rather than filtering them
 * per player: off the floor is his team's totals minus his on-court ones.
 */
async function playByPlay(seasonId: number) {
  const [shooting, clutch, stints] = await Promise.all([
    seasonShooting(seasonId),
    prisma.clutchLog.groupBy({ by: ['playerId'], where: { seasonId }, _sum: { pts: true } }),
    prisma.stint.findMany({ where: { seasonId }, select: { teamId: true, players: true, seconds: true, pts: true, oppPts: true, poss: true, oppPoss: true, clutch: true } }),
  ]);
  const team = new Map<number, Totals>();
  const on = new Map<number, Map<number, Totals>>();
  const clutchPm = new Map<number, number>();
  for (const s of stints) {
    team.set(s.teamId, add(team.get(s.teamId) ?? none, s));
    for (const id of s.players) {
      const mine = on.get(id) ?? new Map<number, Totals>();
      mine.set(s.teamId, add(mine.get(s.teamId) ?? none, s));
      on.set(id, mine);
      if (s.clutch) clutchPm.set(id, (clutchPm.get(id) ?? 0) + s.pts - s.oppPts);
    }
  }
  const onOff = new Map<number, number | null>();
  for (const [id, byTeam] of on) {
    const onT = [...byTeam.values()].reduce(add, none);
    const offT = [...byTeam].reduce((a, [t, mine]) => add(a, minus(team.get(t)!, mine)), none);
    const [r1, r2] = [stintRatings([onT]), stintRatings([offT])];
    onOff.set(id, r1.net === null || r2.net === null ? null : r1.net - r2.net);
  }
  return {
    shooting, onOff, clutchPm,
    clutchPts: new Map(clutch.map((c) => [c.playerId, c._sum.pts ?? 0])),
  };
}

/**
 * A season's lines and teams, and each board's top `n` qualifiers. `minGpOverride`
 * replaces the 70% rule. `withPlayByPlay` fills the shot, on/off and clutch boards,
 * a few more queries that only /leaders shows.
 */
export async function leaderBoards(seasonId: number | undefined, n = 10, minGpOverride?: number, withPlayByPlay = false) {
  const [stats, teamStats, pbp] = seasonId === undefined
    ? [[], [], null]
    : await Promise.all([
        prisma.playerStats.findMany({
          where: { seasonId },
          include: {
            player: { select: { fullName: true, advancedStats: { where: { seasonId } } } },
            team: { select: { abbreviation: true, primaryColor: true } },
          },
        }),
        prisma.teamStats.findMany({ where: { seasonId }, include: { team: true } }),
        withPlayByPlay ? playByPlay(seasonId) : null,
      ]);

  const lines: Line[] = stats.map((s) => {
    const a = s.player.advancedStats[0];
    return {
      playerId: s.playerId, name: s.player.fullName, teamId: s.teamId, gp: s.gp, gs: s.gs,
      abbr: s.team?.abbreviation ?? '', color: s.team?.primaryColor ?? 'var(--mid)',
      min: s.min, fga: s.fga, fg3a: s.fg3a, fta: s.fta,
      ppg: s.ppg, rpg: s.rpg, apg: s.apg,
      spg: perGame(s.stl, s.gp), bpg: perGame(s.blk, s.gp), tpm: perGame(s.fg3m, s.gp),
      fgPct: s.fgPct, fg3Pct: s.fg3Pct, ftPct: s.ftPct, tsPct: s.tsPct, efgPct: s.efgPct, usgPct: s.usgPct,
      per: a?.per ?? null, ws: a?.ws ?? null, bpm: a?.bpm ?? null, vorp: a?.vorp ?? null,
      dws: a?.dws ?? null, dbpm: a?.dbpm ?? null,
      xEfg: pbp?.shooting.get(s.playerId)?.xEfg ?? null,
      shotMaking: pbp?.shooting.get(s.playerId)?.shotMaking ?? null,
      onOff: pbp?.onOff.get(s.playerId) ?? null,
      clutchPts: pbp?.clutchPts.get(s.playerId) ?? null,
      clutchPm: pbp?.clutchPm.get(s.playerId) ?? null,
    };
  });

  const teamGames = Math.max(0, ...teamStats.map((t) => t.gp), ...lines.map((l) => l.gp));
  const minGp = minGpOverride || minGames(teamGames);
  // Floors follow each player's own team: early on, one team two games in
  // mustn't shut out everyone whose team has played once.
  const gpOf = new Map(teamStats.map((t) => [t.teamId, t.gp]));
  const games = (l: Line) => gpOf.get(l.teamId ?? -1) ?? teamGames;
  const boards = BOARDS.map((b) => ({
    ...b,
    tracked: lines.some((l) => l[b.key] !== null),
    rows: rank(
      lines.filter(
        (l) =>
          (b.total || l.gp >= (minGpOverride || minGames(games(l)))) &&
          (!b.floor || (l[b.floor[0]] ?? 0) >= scaledFloor(b.floor[1], games(l))),
      ),
      b.key,
    ).slice(0, n),
  }));
  return { lines, teamStats, teamGames, minGp, games, boards };
}
