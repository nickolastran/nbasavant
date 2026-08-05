import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { bad, page, respond } from '@/lib/api';

/** GET /api/players/201939/gamelogs?season=2024-25&opponent=LAL&minPts=20 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id)) return bad('Invalid player id');

  const sp = req.nextUrl.searchParams;
  const { limit, offset } = page(sp, 82);
  const season = sp.get('season');
  const opponent = sp.get('opponent')?.toUpperCase();
  const minPts = Number(sp.get('minPts')) || undefined;

  const logs = await prisma.playerGameLog.findMany({
    where: {
      playerId: id,
      ...(season ? { season: { key: season } } : {}),
      ...(minPts ? { pts: { gte: minPts } } : {}),
      ...(opponent
        ? {
            game: {
              OR: [
                { homeTeam: { abbreviation: opponent } },
                { awayTeam: { abbreviation: opponent } },
              ],
            },
          }
        : {}),
    },
    include: {
      game: {
        include: {
          homeTeam: { select: { abbreviation: true } },
          awayTeam: { select: { abbreviation: true } },
        },
      },
    },
    orderBy: { date: 'desc' },
    take: limit,
    skip: offset,
  });

  return respond(
    logs.map((l) => {
      const home = l.teamId === l.game.homeTeamId;
      return {
        gameId: l.gameId,
        date: l.date.toISOString().slice(0, 10),
        matchup: `${home ? l.game.homeTeam.abbreviation : l.game.awayTeam.abbreviation} ${home ? 'vs' : '@'} ${home ? l.game.awayTeam.abbreviation : l.game.homeTeam.abbreviation}`,
        result:
          (home ? l.game.homeScore > l.game.awayScore : l.game.awayScore > l.game.homeScore)
            ? 'W' : 'L',
        min: l.min, pts: l.pts, reb: l.reb, ast: l.ast, stl: l.stl, blk: l.blk,
        tov: l.tov, fgm: l.fgm, fga: l.fga, fg3m: l.fg3m, fg3a: l.fg3a,
        ftm: l.ftm, fta: l.fta, plusMinus: l.plusMinus,
      };
    }),
    sp,
    `gamelogs-${id}`,
  );
}
