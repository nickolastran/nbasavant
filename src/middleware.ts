import { NextRequest, NextResponse } from 'next/server';

const WINDOW_MS = 60_000;
const MAX_REQUESTS = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 120);

// ponytail: per-instance in-memory counter. Fine for one server or one Vercel
// region; move to Redis/Upstash when you run more than one instance.
const hits = new Map<string, { count: number; resetAt: number }>();

export function middleware(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';
  const now = Date.now();
  const entry = hits.get(ip);

  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else if (++entry.count > MAX_REQUESTS) {
    return NextResponse.json(
      { error: 'Rate limit exceeded' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((entry.resetAt - now) / 1000)) },
      },
    );
  }

  // Cheap sweep so the map can't grow unbounded.
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
  }
  return NextResponse.next();
}

export const config = { matcher: '/api/:path*' };
