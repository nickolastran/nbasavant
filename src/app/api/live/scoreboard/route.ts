import { json } from '@/lib/api';
import { liveScoreboard } from '@/lib/live';

export const dynamic = 'force-dynamic';

/**
 * GET /api/live/scoreboard — today's games as the NBA's feed has them right
 * now: status, clock, score, records and each side's top performer. Cached
 * 5 s at the edge, so traffic never multiplies requests to the NBA.
 */
export async function GET() {
  const board = await liveScoreboard();
  if (!board) {
    return json({ error: 'Live data unavailable' }, { status: 502, headers: { 'Cache-Control': 's-maxage=10' } });
  }
  return json(board, { headers: { 'Cache-Control': 's-maxage=5, stale-while-revalidate=10' } });
}
