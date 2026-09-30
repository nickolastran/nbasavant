/**
 * `npm run cuplabels` — tag past seasons' games with the NBA's labels
 * ("Emirates NBA Cup · East Group A"), so their NBA Cup standings can be built.
 * Those seasons came from basketball-reference, which doesn't mark Cup games;
 * the daily sync labels the current season itself. stats.nba.com turns away
 * most cloud IPs, so run it from your own machine. Safe to rerun.
 *
 *   npm run cuplabels                             # 2023-24 (the first Cup) .. 2025-26
 *   npm run cuplabels -- --from 2024 --to 2024    # seasons by start year
 */
import { prisma } from '../src/lib/db';
import { nbaJson } from '../src/lib/nba';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

async function main() {
  const from = Number(arg('from', '2023'));
  const to = Number(arg('to', '2025'));
  for (let y = from; y <= to; y++) {
    const key = `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
    const { leagueSchedule } = await nbaJson(`https://stats.nba.com/stats/scheduleleaguev2?LeagueID=00&Season=${key}`);
    const labeled = (leagueSchedule.gameDates as any[])
      .flatMap((d) => d.games)
      .filter((g) => /NBA Cup/.test(g.gameLabel))
      .map((g) => ({
        date: new Date(`${String(g.gameDateEst).slice(0, 10)}T12:00:00Z`),
        homeTeamId: g.homeTeam.teamId as number,
        label: [g.gameLabel, g.gameSubLabel].filter(Boolean).join(' · '),
      }));
    const results = await prisma.$transaction(
      labeled.map(({ date, homeTeamId, label }) =>
        prisma.game.updateMany({ where: { season: { key }, date, homeTeamId }, data: { label } }),
      ),
    );
    const missed = labeled.filter((_, i) => !results[i].count);
    console.log(`${key}: ${labeled.length - missed.length}/${labeled.length} labeled`);
    for (const m of missed) console.warn('  no game for', m.date.toISOString().slice(0, 10), m.homeTeamId, m.label);
  }
}

main().finally(() => prisma.$disconnect());
