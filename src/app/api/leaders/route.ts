import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { json } from '@/lib/api';

const CATEGORIES = {
  ppg: 'Points', rpg: 'Rebounds', apg: 'Assists',
  tsPct: 'True Shooting %', usgPct: 'Usage %', efgPct: 'Effective FG%',
} as const;

/** GET /api/leaders?season=2024-25&minGp=15&limit=5 — dashboard top performers. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const season = sp.get('season');
  const minGp = Number(sp.get('minGp')) || 15;
  const limit = Math.min(20, Number(sp.get('limit')) || 5);

  const boards = await Promise.all(
    (Object.keys(CATEGORIES) as (keyof typeof CATEGORIES)[]).map(async (key) => ({
      key,
      label: CATEGORIES[key],
      leaders: (
        await prisma.playerStats.findMany({
          where: {
            gp: { gte: minGp },
            ...(season ? { season: { key: season } } : {}),
            // Rate-stat leaderboards need a volume floor or bench players win them.
            ...(key === 'tsPct' || key === 'efgPct' ? { fga: { gte: 150 } } : {}),
          },
          orderBy: { [key]: 'desc' },
          take: limit,
          include: {
            player: { select: { id: true, fullName: true, team: { select: { abbreviation: true } } } },
          },
        })
      ).map((r) => ({
        playerId: r.player.id,
        player: r.player.fullName,
        team: r.player.team?.abbreviation ?? '',
        value: r[key],
      })),
    })),
  );

  return json(boards);
}
