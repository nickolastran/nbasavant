import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { bad, json } from '@/lib/api';

/** GET /api/compare?ids=201939,2544&season=2024-25 — side-by-side player rows. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const ids = (sp.get('ids') ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter(Number.isFinite)
    .slice(0, 4);
  if (!ids.length) return bad('Pass ?ids=1,2');

  const season = sp.get('season');
  const rows = await prisma.playerStats.findMany({
    where: { playerId: { in: ids }, ...(season ? { season: { key: season } } : {}) },
    include: {
      season: { select: { key: true } },
      player: {
        select: {
          id: true, fullName: true, position: true,
          team: { select: { abbreviation: true, primaryColor: true } },
          advancedStats: { select: { seasonId: true, per: true, ws: true, bpm: true, vorp: true, ortg: true, drtg: true } },
        },
      },
    },
    orderBy: { season: { startYear: 'desc' } },
  });

  // One row per player: their latest season inside the filter.
  const seen = new Set<number>();
  const players = rows
    .filter((r) => !seen.has(r.playerId) && seen.add(r.playerId))
    .sort((a, b) => ids.indexOf(a.playerId) - ids.indexOf(b.playerId))
    .map((r) => {
      const a = r.player.advancedStats.find((x) => x.seasonId === r.seasonId);
      return {
        playerId: r.playerId,
        name: r.player.fullName,
        team: r.player.team?.abbreviation ?? '',
        color: r.player.team?.primaryColor ?? '#173a5e',
        pos: r.player.position,
        season: r.season.key,
        stats: {
          gp: r.gp, min: r.min, ppg: r.ppg, rpg: r.rpg, apg: r.apg,
          fgPct: r.fgPct, fg3Pct: r.fg3Pct, ftPct: r.ftPct,
          tsPct: r.tsPct, efgPct: r.efgPct, usgPct: r.usgPct,
          per: a?.per ?? null, ws: a?.ws ?? null, bpm: a?.bpm ?? null, vorp: a?.vorp ?? null,
          ortg: a?.ortg ?? null, drtg: a?.drtg ?? null,
        },
      };
    });

  return json(players);
}
