/**
 * `npm run playoffs` — every season's playoff lines from basketball-reference
 * (totals and advanced, two requests a season, paced by bref.ts). The daily
 * sync keeps the current season's up to date once its playoffs start; this
 * fills in history. Re-running a season replaces it.
 *
 *   npm run playoffs                            # 2025-26
 *   npm run playoffs -- --from 1947 --to 2026   # seasons by end year
 */
import { prisma } from '../src/lib/db';
import { fetchPlayoffs } from '../src/lib/bref';
import { writePlayoffs } from '../src/lib/sync';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

async function main() {
  const to = Number(arg('to', '2026'));
  const from = Number(arg('from', String(to)));
  const seasons = await prisma.season.findMany({
    where: { endYear: { gte: from, lte: to } },
    orderBy: { endYear: 'asc' },
  });
  for (const s of seasons) {
    try {
      const players = await fetchPlayoffs(s.endYear);
      console.log(`${s.key}: ${players.length ? `${await writePlayoffs(prisma, s.id, players)} players` : 'no playoffs'}`);
    } catch (e) {
      console.error(`${s.key}: FAILED ${e instanceof Error ? e.message : e}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
