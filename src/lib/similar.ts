/**
 * "Most similar seasons": every player-season since 1946-47 as twelve stats,
 * z-scored within its own season, held in memory for an hour.
 */
import { prisma } from './db';
import { cosineSimilarity, nearestSeasons, scaledFloor, zBySeason, type SeasonVector } from './stats';

/**
 * The box score per 36 minutes, efficiency, usage, shot diet and the two
 * all-in-one numbers. Per 36 rather than per 100 possessions: z-scored within
 * one season, the two rank players the same bar small pace gaps between teams,
 * and per-minute counts reach back to when the league started keeping each stat
 * (basketball-reference's REB% and AST% don't start until the late '60s and '70s).
 * Before minutes were kept (1951-52) it's per game; within a season that's fine too.
 */
export const FEATURES = ['PTS', 'REB', 'AST', 'STL', 'BLK', 'TOV', 'TS%', 'USG%', '3PA rate', 'FT rate', 'WS/48', 'BPM'];

/**
 * 500 minutes (20 games before minutes were kept), prorated to the season's
 * length so far, and never under 200 (10 games): two games in, nobody compares.
 */
export const MIN_MINUTES = 500;
const MIN_GAMES = 20;

async function load(): Promise<SeasonVector[]> {
  const [rows, adv] = await Promise.all([
    prisma.playerStats.findMany({
      select: {
        playerId: true, seasonId: true, gp: true, min: true, pts: true, reb: true, ast: true, stl: true, blk: true, tov: true,
        fga: true, fg3a: true, fta: true, tsPct: true, usgPct: true,
      },
    }),
    prisma.advancedStats.findMany({
      select: { playerId: true, seasonId: true, ws48: true, bpm: true },
    }),
  ]);
  const advOf = new Map(adv.map((a) => [`${a.playerId}:${a.seasonId}`, a]));
  const seasonGames = new Map<number, number>();
  for (const r of rows) seasonGames.set(r.seasonId, Math.max(seasonGames.get(r.seasonId) ?? 0, r.gp));
  const eligible = rows.filter((r) => {
    const g = seasonGames.get(r.seasonId)!;
    return r.min !== null ? r.min >= Math.max(200, scaledFloor(MIN_MINUTES, g)) : r.gp >= Math.max(10, scaledFloor(MIN_GAMES, g));
  });
  return zBySeason(
    eligible.map((r) => {
      const a = advOf.get(`${r.playerId}:${r.seasonId}`);
      const rate = (v: number | null) => (v === null ? null : r.min ? (v / r.min) * 36 : r.gp ? v / r.gp : null);
      return {
        playerId: r.playerId,
        seasonId: r.seasonId,
        stats: [
          rate(r.pts), rate(r.reb), rate(r.ast), rate(r.stl), rate(r.blk), rate(r.tov),
          r.tsPct, r.usgPct,
          r.fga && r.fg3a !== null ? r.fg3a / r.fga : null,
          r.fga ? r.fta / r.fga : null,
          a?.ws48 ?? null, a?.bpm ?? null,
        ],
      };
    }),
  );
}

// ponytail: in-process cache, an hour old at most; precompute into a table if cold starts hurt.
let cache: { at: number; rows: Promise<SeasonVector[]> } | undefined;
const seasonVectors = () => {
  if (!cache || Date.now() - cache.at > 3600_000) {
    cache = { at: Date.now(), rows: load() };
    cache.rows.catch(() => (cache = undefined));
  }
  return cache.rows;
};

/** The `n` most similar seasons by other players, or null when this one is too short to compare. */
export async function similarSeasons(playerId: number, seasonId: number, n = 5) {
  const rows = await seasonVectors();
  const target = rows.find((r) => r.playerId === playerId && r.seasonId === seasonId);
  if (!target) return null;
  // A match must share three quarters of his stats: a 2020s center isn't compared
  // to a '60s one on everything but the blocks the league didn't count yet.
  const have = target.stats.filter((x) => x !== null).length;
  return nearestSeasons(rows, target, n, Math.ceil(have * 0.75));
}

/** Stats two profiles must share to be compared. */
const MIN_SHARED = 9;

/**
 * This season's players most like one player, by cosine similarity of the
 * same twelve z-scored stats: who is strong and weak in the same places,
 * whatever their overall level. Null when he hasn't played enough to compare.
 */
export async function similarPlayers(playerId: number, seasonId: number, n = 5) {
  const season = (await seasonVectors()).filter((r) => r.seasonId === seasonId);
  const target = season.find((r) => r.playerId === playerId);
  if (!target) return null;
  return season
    .filter((r) => r.playerId !== playerId)
    .map((r) => ({ playerId: r.playerId, score: cosineSimilarity(target.stats, r.stats, MIN_SHARED) }))
    .filter((r): r is { playerId: number; score: number } => r.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

/** How alike two players' seasons are, -1 to 1, or null if either hasn't played enough. */
export async function similarity(a: number, b: number, seasonId: number) {
  const season = (await seasonVectors()).filter((r) => r.seasonId === seasonId);
  const [x, y] = [season.find((r) => r.playerId === a), season.find((r) => r.playerId === b)];
  return x && y ? cosineSimilarity(x.stats, y.stats, MIN_SHARED) : null;
}
