import { prisma } from '@/lib/db';
import { json } from '@/lib/api';

/** GET /api/seasons */
export async function GET() {
  const seasons = await prisma.season.findMany({ orderBy: { startYear: 'desc' } });
  return json(seasons.map((s) => ({ key: s.key, startYear: s.startYear, active: s.active })));
}
