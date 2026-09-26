import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { page, respond, sortBy } from '@/lib/api';

const BOX_SORTS = [
  'ppg', 'rpg', 'apg', 'pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'min', 'gp',
  'fgPct', 'fg3Pct', 'ftPct', 'tsPct', 'efgPct', 'usgPct',
] as const;
const ADV_SORTS = ['per', 'bpm', 'obpm', 'dbpm', 'vorp', 'ws', 'ws48', 'ortg', 'drtg', 'netRtg'] as const;

/**
 * GET /api/stats?season=2024-25&team=BOS&minGp=20&sort=tsPct&dir=desc&format=csv
 * The Advanced Stats Explorer's backing query: one row per player-season with
 * box score and advanced metrics joined.
 */
/** Columns that are null in seasons the league didn't keep them; sort those last. */
const REQUIRED = new Set(['ppg', 'pts', 'gp']);
const nullsLast = (o: Record<string, 'asc' | 'desc' | undefined>) =>
  Object.fromEntries(
    Object.entries(o).map(([k, dir]) => [k, REQUIRED.has(k) ? dir : { sort: dir!, nulls: 'last' as const }]),
  );

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const { limit, offset } = page(sp, 100, 1000);
  const season = sp.get('season');
  const sortKey = sp.get('sort') ?? 'ppg';
  const isAdvSort = (ADV_SORTS as readonly string[]).includes(sortKey);

  const where: Prisma.PlayerStatsWhereInput = {
    ...(season ? { season: { key: season } } : {}),
    // The team he played for that season, not the one he's on now.
    ...(sp.get('team') ? { team: { abbreviation: sp.get('team')!.toUpperCase() } } : {}),
    player: {
      ...(sp.get('position') ? { position: { contains: sp.get('position')! } } : {}),
      ...(sp.get('q') ? { fullName: { contains: sp.get('q')!, mode: 'insensitive' as const } } : {}),
    },
    gp: { gte: Number(sp.get('minGp')) || 1 },
    min: { gte: Number(sp.get('minMin')) || 0 },
  };

  const rows = await prisma.playerStats.findMany({
    where,
    include: {
      season: { select: { key: true } },
      team: { select: { abbreviation: true } },
      player: {
        select: {
          id: true, fullName: true, position: true,
          advancedStats: { select: {
            seasonId: true, per: true, ortg: true, drtg: true, netRtg: true,
            ws: true, ws48: true, obpm: true, dbpm: true, bpm: true, vorp: true,
            astPct: true, rebPct: true, tovPct: true,
          } },
        },
      },
    },
    // Advanced columns live on another table; sort those in memory over the
    // filtered set, which stays small because minGp/season narrow it first.
    orderBy: isAdvSort ? { gp: 'desc' } : nullsLast(sortBy(sp, BOX_SORTS, 'ppg')),
    take: isAdvSort ? 1000 : limit,
    skip: isAdvSort ? 0 : offset,
  });

  let out = rows.map((r) => {
    const a = r.player.advancedStats.find((x) => x.seasonId === r.seasonId);
    return {
      playerId: r.player.id,
      player: r.player.fullName,
      team: r.team?.abbreviation ?? '',
      pos: r.player.position ?? '',
      season: r.season.key,
      gp: r.gp, min: r.min,
      ppg: r.ppg, rpg: r.rpg, apg: r.apg,
      pts: r.pts, reb: r.reb, ast: r.ast, stl: r.stl, blk: r.blk, tov: r.tov,
      fgPct: r.fgPct, fg3Pct: r.fg3Pct, ftPct: r.ftPct,
      tsPct: r.tsPct, efgPct: r.efgPct, usgPct: r.usgPct,
      per: a?.per ?? null, ortg: a?.ortg ?? null, drtg: a?.drtg ?? null, netRtg: a?.netRtg ?? null,
      ws: a?.ws ?? null, ws48: a?.ws48 ?? null,
      obpm: a?.obpm ?? null, dbpm: a?.dbpm ?? null, bpm: a?.bpm ?? null, vorp: a?.vorp ?? null,
      astPct: a?.astPct ?? null, rebPct: a?.rebPct ?? null, tovPct: a?.tovPct ?? null,
    };
  });

  if (isAdvSort) {
    const dir = sp.get('dir') === 'asc' ? 1 : -1;
    const k = sortKey as (typeof ADV_SORTS)[number];
    // Stats the league didn't keep that season sort last either way.
    out.sort((a, b) => (a[k] === null ? 1 : b[k] === null ? -1 : (a[k]! - b[k]!) * dir));
    out = out.slice(offset, offset + limit);
  }

  return respond(out, sp, `stats-${season ?? 'all'}`);
}
