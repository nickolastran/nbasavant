/**
 * Re-read this season's finished regular-season games whose lineup stints were
 * saved before the four-factor counts existed, so lineups and on/off can show
 * them. Each game is re-synced whole from the NBA's CDN (box score, shots,
 * stints, clutch lines), the same way the daily sync saves a final.
 *
 *   npm run stints
 */
import { prisma } from '../src/lib/db';
import { syncGame } from '../src/lib/sync';

(async () => {
  const season = await prisma.season.findFirst({ where: { active: true }, orderBy: { startYear: 'desc' } });
  if (!season) throw new Error('No active season.');
  const games = await prisma.game.findMany({
    // A game with no stint that has a shot attempt hasn't been re-read yet.
    where: { seasonId: season.id, kind: 'regular', status: { startsWith: 'Final' }, stints: { none: { fga: { gt: 0 } } } },
    select: { gameCode: true },
    orderBy: { date: 'asc' },
  });
  console.log(`${season.key}: ${games.length} games to re-read`);
  let done = 0, failed = 0;
  for (const g of games) {
    try {
      // syncGame answers in words when it can't save a game ("not final", "unknown game").
      const result = await syncGame(prisma, g.gameCode);
      if (/not final|unknown/.test(String(result))) throw new Error(String(result));
      done++;
    } catch (e) {
      failed++;
      console.error(`${g.gameCode}: ${e instanceof Error ? e.message : e}`);
    }
    // Two requests a game; a short pause keeps this polite to the CDN.
    await new Promise((r) => setTimeout(r, 250));
    if ((done + failed) % 25 === 0) console.log(`  ${done + failed} / ${games.length}`);
  }
  console.log(`Re-read ${done} games${failed ? `, ${failed} failed (run again to retry)` : ''}.`);
  await prisma.$disconnect();
})();
