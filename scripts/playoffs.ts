/**
 * `npm run playoffs` — every season's playoff lines from basketball-reference,
 * players and teams (three requests a season, paced by bref.ts). Also fills
 * the regular-season team columns the original ingest didn't keep (personal
 * fouls, defensive rebounds) from the league page, one more request. The daily
 * sync keeps the current season's playoffs up to date once they start; this
 * fills in history. Re-running a season replaces it.
 *
 *   npm run playoffs                            # 2025-26
 *   npm run playoffs -- --from 1947 --to 2026   # seasons by end year
 */
import { prisma } from '../src/lib/db';
import { fetchPage, fetchPlayoffs, parseTeams, seasonPath } from '../src/lib/bref';
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
