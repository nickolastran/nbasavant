import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { bad, json } from '@/lib/api';
import { liveGame } from '@/lib/live';

/**
 * GET /api/games/42 — one game. From 2026-27 on: the NBA's live box score,
 * team stats and play-by-play (updating while the game is on). Before that:
 * the final score, plus any player lines on file.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return bad('Invalid game id');

  const game = await prisma.game.findUnique({
    where: { id },
    include: {
      homeTeam: true,
      awayTeam: true,
      season: { select: { key: true } },
      gameLogs: {
        include: { player: { select: { id: true, fullName: true } } },
        orderBy: { min: 'desc' },
      },
    },
  });
  if (!game) return bad('Game not found', 404);

  const base = {
    id: game.id,
    gameCode: game.gameCode,
    date: game.date.toISOString().slice(0, 10),
    season: game.season.key,
    kind: game.kind,
    label: game.label,
    home: team(game.homeTeam),
    away: team(game.awayTeam),
  };

  const final = game.status.startsWith('Final');
  const live = game.gameCode.startsWith('00') ? await liveGame(game.gameCode, final) : null;
  if (live) {
    return json(
      {
        ...base,
        state: live.state,
        status: live.status,
        home: { ...base.home, score: live.home.score, periods: live.home.periods, stats: live.home.stats },
        away: { ...base.away, score: live.away.score, periods: live.away.periods, stats: live.away.stats },
        box: live.logs,
        plays: live.plays,
      },
      { headers: { 'Cache-Control': `s-maxage=${final ? 3600 : 10}` } },
    );
  }

  return json({
    ...base,
    state: final ? 'final' : 'pre',
    status: game.status,
    home: { ...base.home, score: game.homeScore },
    away: { ...base.away, score: game.awayScore },
    box: game.gameLogs.map((l) => ({
      playerId: l.player.id, name: l.player.fullName, teamId: l.teamId, started: l.started,
      min: l.min, pts: l.pts, reb: l.reb, oreb: l.oreb, dreb: l.dreb, ast: l.ast, stl: l.stl,
      blk: l.blk, tov: l.tov, pf: l.pf, fgm: l.fgm, fga: l.fga, fg3m: l.fg3m, fg3a: l.fg3a,
      ftm: l.ftm, fta: l.fta, plusMinus: l.plusMinus,
    })),
    plays: [],
  });
}

const team = (t: { id: number; abbreviation: string; city: string; name: string; primaryColor: string }) => ({
  id: t.id, abbreviation: t.abbreviation, name: `${t.city} ${t.name}`, color: t.primaryColor,
});
