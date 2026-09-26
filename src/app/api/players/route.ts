import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { page, respond } from '@/lib/api';

/**
 * GET /api/players?q=curry&team=GSW&position=G&active=true&limit=50
 * Everyone since 1946-47 by default, current players first; active=true
 * narrows it to today's rosters.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const { limit, offset } = page(sp);
  const q = sp.get('q')?.trim();
  const team = sp.get('team')?.toUpperCase();
  const position = sp.get('position');

  const players = await prisma.player.findMany({
    where: {
      ...(q ? { fullName: { contains: q, mode: 'insensitive' } } : {}),
      ...(team ? { team: { abbreviation: team } } : {}),
      ...(position ? { position: { contains: position } } : {}),
      ...(sp.get('active') === 'true' ? { active: true } : {}),
    },
    include: { team: { select: { abbreviation: true, city: true, name: true } } },
    orderBy: [{ active: 'desc' }, { lastName: 'asc' }, { firstName: 'asc' }],
    take: limit,
    skip: offset,
  });

  return respond(
    players.map((p) => ({
      id: p.id,
      name: p.fullName,
      position: p.position,
      jersey: p.jersey,
      team: p.team?.abbreviation ?? null,
      heightIn: p.heightIn,
      weightLb: p.weightLb,
      active: p.active,
    })),
    sp,
    'players',
  );
}
