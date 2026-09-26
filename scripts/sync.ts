/**
 * `npm run sync` — the daily sync, by hand: this season's schedule and finals,
 * rosters, transactions and season totals. The same steps /api/cron/sync runs
 * on Vercel; use this locally, after an ingest, or if a source blocks Vercel.
 */
import { prisma } from '../src/lib/db';
import { runSync } from '../src/lib/sync';

runSync(prisma)
  .then((report) => {
    console.table(report);
    if (Object.values(report).some((r) => r.startsWith('FAILED'))) process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
