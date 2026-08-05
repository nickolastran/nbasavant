import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { page, respond } from '@/lib/api';

/** GET /api/players?q=curry&team=GSW&position=G&limit=50 */
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
      ...(sp.get('active') === 'false' ? {} : { active: true }),
    },
    include: { team: { select: { abbreviation: true, city: true, name: true } } },
    orderBy: { lastName: 'asc' },
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
    })),
    sp,
    'players',
  );
}
