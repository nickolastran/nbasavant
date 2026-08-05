import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { bad, json } from '@/lib/api';

/** GET /api/games/42 — box score plus play-by-play for the Game Viewer. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id)) return bad('Invalid game id');

  const game = await prisma.game.findUnique({
    where: { id },
    include: {
      homeTeam: true,
      awayTeam: true,
      season: { select: { key: true } },
      gameLogs: {
        include: { player: { select: { id: true, fullName: true, position: true } } },
        orderBy: { min: 'desc' },
      },
      plays: { orderBy: { elapsedSec: 'asc' } },
    },
  });
  if (!game) return bad('Game not found', 404);

  const box = (teamId: number) =>
    game.gameLogs
      .filter((l) => l.teamId === teamId)
      .map((l) => ({
        playerId: l.player.id, player: l.player.fullName, pos: l.player.position,
        started: l.started, min: l.min, pts: l.pts, reb: l.reb, oreb: l.oreb,
        dreb: l.dreb, ast: l.ast, stl: l.stl, blk: l.blk, tov: l.tov, pf: l.pf,
        fgm: l.fgm, fga: l.fga, fg3m: l.fg3m, fg3a: l.fg3a, ftm: l.ftm, fta: l.fta,
        plusMinus: l.plusMinus,
      }));

  const leaders = [...game.gameLogs]
    .sort((a, b) => b.pts + b.reb + b.ast - (a.pts + a.reb + a.ast))
    .slice(0, 3)
    .map((l) => ({
      player: l.player.fullName,
      team: l.teamId === game.homeTeamId ? game.homeTeam.abbreviation : game.awayTeam.abbreviation,
      line: `${l.pts} pts / ${l.reb} reb / ${l.ast} ast`,
    }));

  return json({
    id: game.id,
    gameCode: game.gameCode,
    date: game.date.toISOString().slice(0, 10),
    season: game.season.key,
    status: game.status,
    home: { ...team(game.homeTeam), score: game.homeScore, box: box(game.homeTeamId) },
    away: { ...team(game.awayTeam), score: game.awayScore, box: box(game.awayTeamId) },
    leaders,
    plays: game.plays.map((p) => ({
      period: p.period, clock: p.clock, elapsedSec: p.elapsedSec,
      description: p.description, eventType: p.eventType,
      score: `${p.awayScore}-${p.homeScore}`,
      teamId: p.teamId, playerId: p.playerId,
    })),
  });
}

const team = (t: { id: number; abbreviation: string; city: string; name: string; primaryColor: string }) => ({
  id: t.id, abbreviation: t.abbreviation, name: `${t.city} ${t.name}`, color: t.primaryColor,
});
