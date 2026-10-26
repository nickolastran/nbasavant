/**
 * `npm run playoffs` — every season's playoff lines from basketball-reference,
 * players and teams (three requests a season, paced by bref.ts). Also fills
 * the regular-season team columns the original ingest didn't keep (personal
 * fouls, defensive rebounds) from the league page, one more request. The daily
 * sync keeps the current season's playoffs up to date once they start; this
 * fills in history. Re-running a season replaces it.
 *
 * `--games` loads each season's playoff games instead (one request a season),
 * for the bracket on /playoffs. From 2026-27 on the NBA feed brings them.
 *
 *   npm run playoffs                            # 2025-26
 *   npm run playoffs -- --from 1947 --to 2026   # seasons by end year
 *   npm run playoffs -- --from 1947 --games     # every season's playoff games
 */
import { prisma } from '../src/lib/db';
import { fetchPage, fetchPlayoffs, gameRow, parseTeams, seasonPath, table } from '../src/lib/bref';
import { writePlayoffs } from '../src/lib/sync';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

/** One season's playoff games from BR's playoff schedule, replacing any already saved. */
async function games(s: { id: number; key: string; endYear: number }) {
  const rows = table(await fetchPage(`/playoffs/${seasonPath(s.endYear)}_games.html`), 'schedule');
  const data = rows.filter((r) => Number(r.home_pts) > 0).map((r) => gameRow(r, s.id, 'playoffs'));
  await prisma.$transaction([
    prisma.game.deleteMany({ where: { seasonId: s.id, kind: 'playoffs' } }),
    prisma.game.createMany({ data }),
  ]);
  console.log(`${s.key}: ${data.length} playoff games`);
}

async function main() {
  // The NBA feed owns games from 2026-27 (end year 2027) on.
  const to = Math.min(Number(arg('to', '2026')), process.argv.includes('--games') ? 2026 : Infinity);
  const from = Number(arg('from', String(to)));
  const seasons = await prisma.season.findMany({
    where: { endYear: { gte: from, lte: to } },
    orderBy: { endYear: 'asc' },
  });
  for (const s of seasons) {
    try {
      if (process.argv.includes('--games')) {
        await games(s);
        continue;
      }
      const league = parseTeams(await fetchPage(`/leagues/${seasonPath(s.endYear)}.html`));
      await prisma.$transaction(
        league.map((t) =>
          prisma.teamStats.updateMany({ where: { teamId: t.teamId, seasonId: s.id }, data: { dreb: t.box.dreb, pf: t.box.pf } }),
        ),
      );
      const playoffs = await fetchPlayoffs(s.endYear);
      console.log(
        `${s.key}: ${playoffs.players.length ? `${await writePlayoffs(prisma, s.id, playoffs)} players, ${playoffs.teams.length} teams` : 'no playoffs'}`,
      );
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
