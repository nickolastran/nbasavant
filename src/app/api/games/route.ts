import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { bad, page, respond } from '@/lib/api';
import { todayEt } from '@/lib/dates';
import { syncGame } from '@/lib/sync';
import { recordThrough, type GameResult } from '@/lib/stats';

/** GET /api/games?season=2026-27&team=BOS&date=2026-10-21&before=&after= */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const { limit, offset } = page(sp, 25, 200);
  const team = sp.get('team')?.toUpperCase();
  const [before, after] = [sp.get('before'), sp.get('after')];
  for (const [k, v] of [['date', sp.get('date')], ['before', before], ['after', after]] as const) {
    if (v && !(/^\d{4}-\d{2}-\d{2}$/.test(v) && Date.parse(v))) return bad(`${k} must be YYYY-MM-DD`);
  }

  // `before`/`after` step to the nearest day that has games, so a caller
  // walking the schedule never lands on an empty off-season date.
  let date = sp.get('date');
  if (before || after) {
    const near = await prisma.game.findFirst({
      where: before
        ? { date: { lt: new Date(before) } }
        : { date: { gte: new Date(Date.parse(after!) + 864e5) } },
      orderBy: { date: before ? 'desc' : 'asc' },
      select: { date: true },
    });
    if (!near) return respond([], sp, 'games');
    date = near.date.toISOString().slice(0, 10);
  }

  const query = () => prisma.game.findMany({
    where: {
      ...(sp.get('season') ? { season: { key: sp.get('season')! } } : {}),
      ...(date ? { date: { gte: new Date(date), lt: new Date(Date.parse(date) + 864e5) } } : {}),
      ...(team
        ? {
            OR: [
              { homeTeam: { abbreviation: team } },
              { awayTeam: { abbreviation: team } },
            ],
          }
        : {}),
    },
    include: {
      homeTeam: { select: { abbreviation: true, city: true, name: true, primaryColor: true } },
      awayTeam: { select: { abbreviation: true, city: true, name: true, primaryColor: true } },
    },
    orderBy: [{ date: 'desc' }, { id: 'asc' }],
    take: limit,
    skip: offset,
  });
  let games = await query();

  // A past day still showing tip-off times means nobody caught those finals
  // (the live write-through only sees today; the cron runs once a day). Save
  // them now so the first visitor sees scores.
  const today = todayEt();
  // Postponed games never go final, so healing them would refetch on every request.
  const stale = games.filter((g) => !g.status.startsWith('Final') && g.status !== 'Postponed' && g.date.toISOString().slice(0, 10) < today);
  if (stale.length) {
    await Promise.all(stale.map((g) => syncGame(prisma, g.gameCode).catch((e) => console.error('heal', g.gameCode, e))));
    games = await query();
  }

  // Records shown beside each team, as of that game's day: the regular-season
  // finals the standings count. One lookup for the whole page of games.
  const finals = new Map<number, GameResult[]>();
  if (games.length) {
    const rows = await prisma.game.findMany({
      where: {
        seasonId: { in: [...new Set(games.map((g) => g.seasonId))] },
        kind: 'regular',
        status: { startsWith: 'Final' },
        date: { lte: games[0].date },
      },
      select: { seasonId: true, date: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
    });
    for (const r of rows) {
      if (!finals.has(r.seasonId)) finals.set(r.seasonId, []);
      finals.get(r.seasonId)!.push({
        date: r.date.toISOString().slice(0, 10),
        home: r.homeTeamId, away: r.awayTeamId, homeScore: r.homeScore, awayScore: r.awayScore,
      });
    }
  }
  // Preseason games show no record; the regular season hasn't started.
  const record = (g: (typeof games)[number], teamId: number) =>
    g.kind === 'preseason' ? '' : recordThrough(finals.get(g.seasonId) ?? [], teamId, g.date.toISOString().slice(0, 10));

  return respond(
    games.map((g) => ({
      id: g.id,
      gameCode: g.gameCode,
      date: g.date.toISOString().slice(0, 10),
      status: g.status,
      start: g.tipoff?.toISOString(),
      kind: g.kind,
      label: g.label,
      home: g.homeTeam.abbreviation,
      away: g.awayTeam.abbreviation,
      homeName: `${g.homeTeam.city} ${g.homeTeam.name}`,
      awayName: `${g.awayTeam.city} ${g.awayTeam.name}`,
      homeColor: g.homeTeam.primaryColor,
      awayColor: g.awayTeam.primaryColor,
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      homeRecord: record(g, g.homeTeamId),
      awayRecord: record(g, g.awayTeamId),
    })),
    sp,
    'games',
  );
}
