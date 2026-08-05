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
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const { limit, offset } = page(sp, 100, 1000);
  const season = sp.get('season');
  const sortKey = sp.get('sort') ?? 'ppg';
  const isAdvSort = (ADV_SORTS as readonly string[]).includes(sortKey);

  const where: Prisma.PlayerStatsWhereInput = {
    ...(season ? { season: { key: season } } : {}),
    ...(sp.get('team') ? { player: { team: { abbreviation: sp.get('team')!.toUpperCase() } } } : {}),
    ...(sp.get('position') ? { player: { position: { contains: sp.get('position')! } } } : {}),
    ...(sp.get('q') ? { player: { fullName: { contains: sp.get('q')!, mode: 'insensitive' } } } : {}),
    gp: { gte: Number(sp.get('minGp')) || 1 },
    min: { gte: Number(sp.get('minMin')) || 0 },
  };

  const rows = await prisma.playerStats.findMany({
    where,
    include: {
      season: { select: { key: true } },
      player: {
        select: {
          id: true, fullName: true, position: true,
          team: { select: { abbreviation: true } },
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
    orderBy: isAdvSort ? { min: 'desc' } : sortBy(sp, BOX_SORTS, 'ppg'),
    take: isAdvSort ? 1000 : limit,
    skip: isAdvSort ? 0 : offset,
  });

  let out = rows.map((r) => {
    const a = r.player.advancedStats.find((x) => x.seasonId === r.seasonId);
    return {
      playerId: r.player.id,
      player: r.player.fullName,
      team: r.player.team?.abbreviation ?? '',
      pos: r.player.position ?? '',
      season: r.season.key,
      gp: r.gp, min: Number(r.min.toFixed(1)),
      ppg: r.ppg, rpg: r.rpg, apg: r.apg,
      pts: r.pts, reb: r.reb, ast: r.ast, stl: r.stl, blk: r.blk, tov: r.tov,
      fgPct: r.fgPct, fg3Pct: r.fg3Pct, ftPct: r.ftPct,
      tsPct: r.tsPct, efgPct: r.efgPct, usgPct: r.usgPct,
      per: a?.per ?? 0, ortg: a?.ortg ?? 0, drtg: a?.drtg ?? 0, netRtg: a?.netRtg ?? 0,
      ws: a?.ws ?? 0, ws48: a?.ws48 ?? 0,
      obpm: a?.obpm ?? 0, dbpm: a?.dbpm ?? 0, bpm: a?.bpm ?? 0, vorp: a?.vorp ?? 0,
      astPct: a?.astPct ?? 0, rebPct: a?.rebPct ?? 0, tovPct: a?.tovPct ?? 0,
    };
  });

  if (isAdvSort) {
    const dir = sp.get('dir') === 'asc' ? 1 : -1;
    const k = sortKey as (typeof ADV_SORTS)[number];
    out.sort((a, b) => (a[k] - b[k]) * dir);
    out = out.slice(offset, offset + limit);
  }

  return respond(out, sp, `stats-${season ?? 'all'}`);
}
