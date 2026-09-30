/**
 * `npm run linescores` — quarter-by-quarter scores and each side's top
 * performer for finished games the NBA's box scores never reached (every
 * season before 2026-27), from stats.nba.com's scoreboard: one request per
 * game day. stats.nba.com turns away most cloud IPs, so run it from your own
 * machine. Games that already have a line score are skipped, so it resumes.
 *
 *   npm run linescores                            # 2025-26
 *   npm run linescores -- --from 1947 --to 2026   # seasons by end year
 */
import { prisma } from '../src/lib/db';
import { leaderOf, lineOf, nbaJson, type GameLeaders } from '../src/lib/nba';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const label = (y: number) => `${y - 1}-${String(y % 100).padStart(2, '0')}`;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const to = Number(arg('to', '2026'));
  const from = Number(arg('from', String(to)));
  const keys = Array.from({ length: to - from + 1 }, (_, i) => label(from + i));

  const games = await prisma.game.findMany({
    where: { season: { key: { in: keys } }, status: { startsWith: 'Final' }, homeLine: { isEmpty: true } },
    select: { id: true, date: true, homeTeamId: true, homeTeam: { select: { abbreviation: true } } },
    orderBy: { date: 'asc' },
  });
  const days = new Map<string, typeof games>();
  for (const g of games) {
    const day = g.date.toISOString().slice(0, 10);
    days.set(day, [...(days.get(day) ?? []), g]);
  }
  console.log(`${games.length} games over ${days.size} days (${keys[0]} .. ${keys.at(-1)})`);

  let saved = 0;
  let missed = 0;
  for (const [day, list] of days) {
    let board: any[];
    try {
      board = (await nbaJson(`https://stats.nba.com/stats/scoreboardv3?GameDate=${day}&LeagueID=00`)).scoreboard.games;
    } catch (e) {
      console.warn(day, 'skipped:', e instanceof Error ? e.message : e);
      missed += list.length;
      continue;
    }
    for (const g of list) {
      // Our id is the NBA's for every current franchise; moved and folded teams go by tricode.
      const hit = board.find((b) => b.homeTeam.teamId === g.homeTeamId || b.homeTeam.teamTricode === g.homeTeam.abbreviation);
      const homeLine = hit ? lineOf(hit.homeTeam) : [];
      if (!homeLine.some(Boolean)) {
        missed++;
        continue;
      }
      await prisma.game.update({
        where: { id: g.id },
        data: {
          homeLine,
          awayLine: lineOf(hit.awayTeam),
          leaders: { home: leaderOf(hit.gameLeaders?.homeLeaders), away: leaderOf(hit.gameLeaders?.awayLeaders) } satisfies GameLeaders,
        },
      });
      saved++;
    }
    process.stdout.write(`\r${day}  saved ${saved}  missed ${missed}   `);
    await pause(400); // stay well under stats.nba.com's patience
  }
  console.log(`\ndone: ${saved} saved, ${missed} without a line score`);
}

main().finally(() => prisma.$disconnect());
