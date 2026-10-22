import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { page, respond } from '@/lib/api';
import { todayEt } from '@/lib/dates';
import { syncGame } from '@/lib/sync';

/** GET /api/games?season=2026-27&team=BOS&date=2026-10-21&before=&after= */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const { limit, offset } = page(sp, 25, 200);
  const team = sp.get('team')?.toUpperCase();
  const [before, after] = [sp.get('before'), sp.get('after')];

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
  const stale = games.filter((g) => !g.status.startsWith('Final') && g.date.toISOString().slice(0, 10) < today);
  if (stale.length) {
    await Promise.all(stale.map((g) => syncGame(prisma, g.gameCode).catch((e) => console.error('heal', g.gameCode, e))));
    games = await query();
  }

  // Records shown beside each team. One lookup for the whole page of games.
  // ponytail: season-final W-L, not as-of-tip-off; swap for a games-played-
  // before-this-date count if in-season back-dating ever needs to be exact.
  const records = new Map<string, string>();
  if (games.length) {
    const rows = await prisma.teamStats.findMany({
      where: { seasonId: { in: [...new Set(games.map((g) => g.seasonId))] } },
      select: { teamId: true, seasonId: true, wins: true, losses: true },
    });
    for (const r of rows) records.set(`${r.seasonId}:${r.teamId}`, `${r.wins}-${r.losses}`);
  }
  const record = (seasonId: number, teamId: number) => records.get(`${seasonId}:${teamId}`) ?? '';

  return respond(
    games.map((g) => ({
      id: g.id,
      gameCode: g.gameCode,
      date: g.date.toISOString().slice(0, 10),
      status: g.status,
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
      homeRecord: record(g.seasonId, g.homeTeamId),
      awayRecord: record(g.seasonId, g.awayTeamId),
    })),
    sp,
    'games',
  );
}
