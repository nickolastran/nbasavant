import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { bad, json } from '@/lib/api';

/** GET /api/players/201939 — profile, career stats and advanced metrics. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id)) return bad('Invalid player id');

  const player = await prisma.player.findUnique({
    where: { id },
    include: {
      team: true,
      stats: { include: { season: true }, orderBy: { season: { startYear: 'asc' } } },
      advancedStats: { include: { season: true }, orderBy: { season: { startYear: 'asc' } } },
    },
  });
  if (!player) return bad('Player not found', 404);

  const advBySeason = new Map(player.advancedStats.map((a) => [a.seasonId, a]));

  return json({
    id: player.id,
    name: player.fullName,
    position: player.position,
    jersey: player.jersey,
    heightIn: player.heightIn,
    weightLb: player.weightLb,
    birthDate: player.birthDate,
    country: player.country,
    draftYear: player.draftYear,
    team: player.team && {
      id: player.team.id,
      abbreviation: player.team.abbreviation,
      name: `${player.team.city} ${player.team.name}`,
      color: player.team.primaryColor,
    },
    seasons: player.stats.map((s) => {
      const a = advBySeason.get(s.seasonId);
      return {
        season: s.season.key,
        gp: s.gp, min: s.min,
        ppg: s.ppg, rpg: s.rpg, apg: s.apg,
        fgPct: s.fgPct, fg3Pct: s.fg3Pct, ftPct: s.ftPct,
        tsPct: s.tsPct, efgPct: s.efgPct, usgPct: s.usgPct,
        totals: {
          pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk, tov: s.tov,
          fgm: s.fgm, fga: s.fga, fg3m: s.fg3m, fg3a: s.fg3a, ftm: s.ftm, fta: s.fta,
        },
        advanced: a && {
          per: a.per, ortg: a.ortg, drtg: a.drtg, netRtg: a.netRtg,
          ws: a.ws, ws48: a.ws48, obpm: a.obpm, dbpm: a.dbpm, bpm: a.bpm, vorp: a.vorp,
          astPct: a.astPct, rebPct: a.rebPct, tovPct: a.tovPct,
        },
      };
    }),
  });
}
