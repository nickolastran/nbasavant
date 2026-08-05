import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { json } from '@/lib/api';

/**
 * GET /api/shots/zones?player=201939&season=2024-25
 * Per-zone efficiency for the heat map, plus the league baseline each zone is
 * colored against (that relative number is what makes a Savant chart readable).
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const season = sp.get('season');

  const scope: Prisma.ShotDataWhereInput = {
    ...(sp.get('player') ? { playerId: Number(sp.get('player')) } : {}),
    ...(sp.get('team') ? { team: { abbreviation: sp.get('team')!.toUpperCase() } } : {}),
    ...(season ? { season: { key: season } } : {}),
  };

  const [subject, league] = await Promise.all([
    prisma.shotData.groupBy({
      by: ['zone', 'value'],
      where: scope,
      _count: { _all: true },
      _sum: { value: true },
    }),
    prisma.shotData.groupBy({
      by: ['zone', 'value'],
      where: season ? { season: { key: season } } : {},
      _count: { _all: true },
    }),
  ]);

  // groupBy can't count a boolean column directly, so pull makes separately.
  const [subjectMakes, leagueMakes] = await Promise.all([
    prisma.shotData.groupBy({
      by: ['zone'], where: { ...scope, made: true }, _count: { _all: true },
    }),
    prisma.shotData.groupBy({
      by: ['zone'], where: { ...(season ? { season: { key: season } } : {}), made: true }, _count: { _all: true },
    }),
  ]);

  const madeMap = (rows: { zone: string; _count: { _all: number } }[]) =>
    new Map(rows.map((r) => [r.zone, r._count._all]));
  const subjMade = madeMap(subjectMakes);
  const lgMade = madeMap(leagueMakes);

  const lgByZone = new Map<string, { att: number; value: number }>();
  for (const r of league) {
    const cur = lgByZone.get(r.zone) ?? { att: 0, value: r.value };
    lgByZone.set(r.zone, { att: cur.att + r._count._all, value: r.value });
  }

  const zones = new Map<string, { attempts: number; value: number }>();
  for (const r of subject) {
    const cur = zones.get(r.zone) ?? { attempts: 0, value: r.value };
    zones.set(r.zone, { attempts: cur.attempts + r._count._all, value: r.value });
  }

  const rows = [...zones].map(([zone, z]) => {
    const made = subjMade.get(zone) ?? 0;
    const lg = lgByZone.get(zone);
    const lgAtt = lg?.att ?? 0;
    const lgFgPct = lgAtt ? ((lgMade.get(zone) ?? 0) / lgAtt) * 100 : 0;
    const fgPct = z.attempts ? (made / z.attempts) * 100 : 0;
    return {
      zone,
      value: z.value,
      attempts: z.attempts,
      made,
      fgPct,
      pointsPerShot: z.attempts ? (made * z.value) / z.attempts : 0,
      leagueFgPct: lgFgPct,
      // Positive = better than league in this zone. Drives the color ramp.
      relative: fgPct - lgFgPct,
    };
  });

  rows.sort((a, b) => b.attempts - a.attempts);
  const attempts = rows.reduce((s, r) => s + r.attempts, 0);
  const made = rows.reduce((s, r) => s + r.made, 0);
  const pts = rows.reduce((s, r) => s + r.made * r.value, 0);

  return json({
    totals: {
      attempts, made,
      fgPct: attempts ? (made / attempts) * 100 : 0,
      pointsPerShot: attempts ? pts / attempts : 0,
    },
    zones: rows,
  });
}
