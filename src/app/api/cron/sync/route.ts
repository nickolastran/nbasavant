import { NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { bad, json } from '@/lib/api';
import { prisma } from '@/lib/db';
import { runSync } from '@/lib/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET|POST /api/cron/sync — the daily sync: schedule, finals, rosters,
 * transactions and season totals, then every cached page is refreshed.
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; `?secret=` works
 * for a manual run. Each step reports on its own, so one source being down
 * shows up in the response instead of failing the rest.
 */
async function handler(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
    req.nextUrl.searchParams.get('secret');

  if (!secret || secret === 'change-me') return bad('CRON_SECRET is not configured', 503);
  if (given !== secret) return bad('Unauthorized', 401);

  const report = await runSync(prisma);
  revalidatePath('/', 'layout');
  return json({ at: new Date().toISOString(), report }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = handler;
export const POST = handler;
