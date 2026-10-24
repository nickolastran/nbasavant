/**
 * The stat leader boards, shared by /leaders and the home page: every player's
 * season line, advanced numbers included, and who qualifies for each board.
 */
import { prisma } from './db';
import { perGame } from './format';
import { minGames, scaledFloor } from './stats';

export type Line = {
  playerId: number; name: string; abbr: string; color: string; teamId: number | null; gp: number; gs: number | null;
  min: number | null; fga: number; fg3a: number | null; fta: number;
  ppg: number | null; rpg: number | null; apg: number | null; spg: number | null; bpg: number | null;
  tpm: number | null; fgPct: number | null; fg3Pct: number | null; ftPct: number | null;
  tsPct: number | null; efgPct: number | null; usgPct: number | null;
  per: number | null; ws: number | null; bpm: number | null; vorp: number | null;
  dws: number | null; dbpm: number | null;
};
export type Stat = Exclude<keyof Line, 'playerId' | 'name' | 'abbr' | 'color' | 'teamId' | 'gp' | 'gs' | 'min' | 'fga' | 'fg3a' | 'fta' | 'dws' | 'dbpm'>;

/**
 * Each board, and what it takes to be on it. Per-game and rate boards need
 * 70% of the player's team's games; rate boards also an attempt floor (the 82-game number,
 * prorated); usage, PER and BPM a minutes floor (1000, about 12 a game), so a
 * two-minute cameo can't top them. Season totals (WS, VORP) rank everyone.
 */
export const BOARDS: { key: Stat; label: string; unit?: string; total?: boolean; floor?: ['min' | 'fga' | 'fg3a' | 'fta', number] }[] = [
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
];

/** Boards that rank a per-game average (points, rebounds...), not a rate, a rating or a season total. */
export const isPerGame = (b: (typeof BOARDS)[number]) => !b.total && !b.unit && b.key !== 'per' && b.key !== 'bpm';

export const rank = (pool: Line[], key: Stat) =>
  pool.filter((l) => l[key] !== null).sort((a, b) => (b[key] as number) - (a[key] as number));

/** A season's lines and teams, and each board's top `n` qualifiers. `minGpOverride` replaces the 70% rule. */
export async function leaderBoards(seasonId: number | undefined, n = 10, minGpOverride?: number) {
  const [stats, teamStats] = seasonId === undefined
    ? [[], []]
    : await Promise.all([
        prisma.playerStats.findMany({
          where: { seasonId },
          include: {
            player: { select: { fullName: true, advancedStats: { where: { seasonId } } } },
            team: { select: { abbreviation: true, primaryColor: true } },
          },
        }),
        prisma.teamStats.findMany({ where: { seasonId }, include: { team: true } }),
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
