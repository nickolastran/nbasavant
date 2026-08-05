import { NextResponse } from 'next/server';

export const json = (data: unknown, init?: ResponseInit) =>
  NextResponse.json(data, {
    ...init,
    headers: {
      // Public stats: serve stale instantly, refresh in the background.
      'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
      ...init?.headers,
    },
  });

export const bad = (message: string, status = 400) =>
  NextResponse.json({ error: message }, { status });

/** Parse and clamp pagination params. Keeps a bad `limit` from table-scanning. */
export function page(sp: URLSearchParams, defLimit = 50, maxLimit = 500) {
  const limit = Math.min(maxLimit, Math.max(1, Number(sp.get('limit')) || defLimit));
  const offset = Math.max(0, Number(sp.get('offset')) || 0);
  return { limit, offset };
}

/** Whitelist a sort column so `orderBy` can never take arbitrary input. */
export function sortBy<T extends string>(
  sp: URLSearchParams, allowed: readonly T[], fallback: T,
): { [k in T]?: 'asc' | 'desc' } {
  const raw = sp.get('sort') ?? fallback;
  const col = (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const dir = sp.get('dir') === 'asc' ? 'asc' : 'desc';
  return { [col]: dir } as { [k in T]?: 'asc' | 'desc' };
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
}

/** Return rows as JSON or, with ?format=csv, as a download. */
export function respond(rows: Record<string, unknown>[], sp: URLSearchParams, name: string) {
  if (sp.get('format') === 'csv') {
    return new NextResponse(toCsv(rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${name}.csv"`,
      },
    });
  }
  return json(rows);
}
