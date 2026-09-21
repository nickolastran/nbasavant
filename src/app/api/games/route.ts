import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { page, respond } from '@/lib/api';

/** GET /api/games?season=2024-25&team=BOS&date=2025-01-15&before=&after= */
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

  const games = await prisma.game.findMany({
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
      date: g.date.toISOString().slice(0, 10),
      status: g.status,
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
