import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { page, respond } from '@/lib/api';

/** GET /api/games?season=2024-25&team=BOS&date=2025-01-15 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const { limit, offset } = page(sp, 25, 200);
  const team = sp.get('team')?.toUpperCase();
  const date = sp.get('date');

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
    orderBy: { date: 'desc' },
    take: limit,
    skip: offset,
  });

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
    })),
    sp,
    'games',
  );
}
