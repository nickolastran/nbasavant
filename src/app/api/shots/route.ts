import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { json, page, respond } from '@/lib/api';

/**
 * GET /api/shots?player=201939&season=2024-25&zone=Above%20the%20Break%203
 *   &minDist=0&maxDist=30&result=made&team=GSW&game=42
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const { limit, offset } = page(sp, 2000, 20_000);

  const where: Prisma.ShotDataWhereInput = {
    ...(sp.get('player') ? { playerId: Number(sp.get('player')) } : {}),
    ...(sp.get('game') ? { gameId: Number(sp.get('game')) } : {}),
    ...(sp.get('season') ? { season: { key: sp.get('season')! } } : {}),
    ...(sp.get('team') ? { team: { abbreviation: sp.get('team')!.toUpperCase() } } : {}),
    ...(sp.get('zone') ? { zone: sp.get('zone')! } : {}),
    ...(sp.get('period') ? { period: Number(sp.get('period')) } : {}),
    ...(sp.get('result') ? { made: sp.get('result') === 'made' } : {}),
    ...(sp.get('minDist') || sp.get('maxDist')
      ? {
          distanceFt: {
            ...(sp.get('minDist') ? { gte: Number(sp.get('minDist')) } : {}),
            ...(sp.get('maxDist') ? { lte: Number(sp.get('maxDist')) } : {}),
          },
        }
      : {}),
  };

  const [shots, total] = await Promise.all([
    prisma.shotData.findMany({
      where,
      select: {
        id: true, x: true, y: true, made: true, value: true, distanceFt: true,
        zone: true, zoneArea: true, actionType: true, period: true,
        minsLeft: true, secsLeft: true, date: true,
        player: { select: { id: true, fullName: true } },
      },
      orderBy: { id: 'asc' },
      take: limit,
      skip: offset,
    }),
    prisma.shotData.count({ where }),
  ]);

  const rows = shots.map((s) => ({
    id: s.id, x: s.x, y: s.y, made: s.made, value: s.value, distanceFt: s.distanceFt,
    zone: s.zone, area: s.zoneArea, action: s.actionType,
    period: s.period, clock: `${s.minsLeft}:${String(s.secsLeft).padStart(2, '0')}`,
    date: s.date.toISOString().slice(0, 10),
    player: s.player.fullName, playerId: s.player.id,
  }));

  if (sp.get('format') === 'csv') return respond(rows, sp, 'shots');

  const made = rows.filter((s) => s.made).length;
  const pts = rows.reduce((sum, s) => sum + (s.made ? s.value : 0), 0);
  return json({
    total,
    returned: rows.length,
    summary: {
      fga: rows.length,
      fgm: made,
      fgPct: rows.length ? (made / rows.length) * 100 : 0,
      pointsPerShot: rows.length ? pts / rows.length : 0,
    },
    shots: rows,
  });
}
