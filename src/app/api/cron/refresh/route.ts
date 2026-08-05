import { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { bad, json } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/refresh — invalidates the cached pages after an ingest run.
 * Guarded by CRON_SECRET so the public internet can't stampede the database.
 *
 * The ingest itself runs as a process (`npm run ingest`), not here: pulling a
 * season takes minutes and would blow any serverless request budget.
 */
async function handler(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    req.nextUrl.searchParams.get('secret');

  if (!secret || secret === 'change-me') return bad('CRON_SECRET is not configured', 503);
  if (given !== secret) return bad('Unauthorized', 401);

  for (const path of ['/', '/players', '/explorer', '/shots', '/teams', '/games']) {
    revalidatePath(path);
  }
  revalidatePath('/players/[id]', 'page');
  revalidatePath('/games/[id]', 'page');

  return json({ revalidated: true, at: new Date().toISOString() });
}

// Vercel Cron issues GET; keep POST for manual triggers and other schedulers.
export const GET = handler;
export const POST = handler;
