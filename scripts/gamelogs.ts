/**
 * `npm run gamelogs` — every player's line for finished games before 2026-27,
 * when our own box-score sync starts, from stats.nba.com's leaguegamelog: one
 * request per season and season type returns the whole league's game logs.
 * stats.nba.com turns away most cloud IPs, so run it from your own machine.
 * Games that already have logs are skipped, so it resumes and never touches
 * the synced seasons.
 *
 * The feed has no starter flag and rounds minutes to whole numbers, so these
 * logs are all bench rows with whole minutes. Stats the league didn't keep yet
 * (steals and blocks before 1973-74, threes before 1979-80) are saved as 0.
 *
 *   npm run gamelogs                            # 1996-97 .. 2025-26
 *   npm run gamelogs -- --from 1947 --to 2026   # seasons by end year
 */
import { prisma } from '../src/lib/db';
import { nbaJson, rowsOf } from '../src/lib/nba';
import { chunked } from '../src/lib/sync';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const label = (y: number) => `${y - 1}-${String(y % 100).padStart(2, '0')}`;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TYPES = ['Regular Season', 'PlayIn', 'Playoffs'];

async function main() {
  const to = Number(arg('to', '2026'));
  const from = Number(arg('from', '1997'));
  const teams = await prisma.team.findMany({ select: { id: true, abbreviation: true } });
  const byAbbr = new Map(teams.map((t) => [t.abbreviation, t.id]));
  const players = new Set((await prisma.player.findMany({ select: { id: true } })).map((p) => p.id));

  for (let y = from; y <= to; y++) {
    const key = label(y);
    const games = await prisma.game.findMany({
      where: { season: { key }, status: { startsWith: 'Final' }, gameLogs: { none: {} } },
      select: { id: true, seasonId: true, date: true, homeTeamId: true, awayTeamId: true },
    });
    if (!games.length) continue;
    // A team plays once a day, so the date and either side find the game.
    const byDayTeam = new Map<string, (typeof games)[number]>();
    for (const g of games) {
      const day = g.date.toISOString().slice(0, 10);
      byDayTeam.set(`${day}|${g.homeTeamId}`, g);
      byDayTeam.set(`${day}|${g.awayTeamId}`, g);
    }

    const rows: Record<string, any>[] = [];
    for (const type of TYPES) {
      try {
        const url = `https://stats.nba.com/stats/leaguegamelog?Counter=0&Direction=ASC&LeagueID=00&PlayerOrTeam=P&Season=${key}&SeasonType=${encodeURIComponent(type)}&Sorter=DATE`;
        rows.push(...rowsOf((await nbaJson(url)).resultSets[0]));
      } catch (e) {
        if (type !== 'PlayIn') console.warn(key, type, 'skipped:', e instanceof Error ? e.message : e);
      }
      await pause(600); // stay well under stats.nba.com's patience
    }

    // Moved and folded franchises are their own teams here (SEA, VAN, NJN) but share the
    // NBA's current franchise id there, so the abbreviation goes first, the id second.
    const unmatched = new Set<string>();
    const strangers = new Map<number, string>();
    const logs = rows.flatMap((r) => {
      const day = String(r.GAME_DATE).slice(0, 10);
      const teamId = [byAbbr.get(r.TEAM_ABBREVIATION), r.TEAM_ID as number].find((id) => id && byDayTeam.has(`${day}|${id}`));
      if (!teamId) {
        unmatched.add(`${day} ${r.MATCHUP}`);
        return [];
      }
      if (!players.has(r.PLAYER_ID)) {
        strangers.set(r.PLAYER_ID, r.PLAYER_NAME);
        return [];
      }
      const g = byDayTeam.get(`${day}|${teamId}`)!;
      const n = (v: unknown) => (typeof v === 'number' ? v : 0);
      return [{
        playerId: r.PLAYER_ID as number, gameId: g.id, seasonId: g.seasonId, teamId, date: g.date,
        min: n(r.MIN), pts: n(r.PTS), reb: n(r.REB), oreb: n(r.OREB), dreb: n(r.DREB), ast: n(r.AST),
        stl: n(r.STL), blk: n(r.BLK), tov: n(r.TOV), pf: n(r.PF), fgm: n(r.FGM), fga: n(r.FGA),
        fg3m: n(r.FG3M), fg3a: n(r.FG3A), ftm: n(r.FTM), fta: n(r.FTA), plusMinus: n(r.PLUS_MINUS),
      }];
    });

    let saved = 0;
    await chunked(logs, 5000, async (c) => {
      saved += (await prisma.playerGameLog.createMany({ data: c, skipDuplicates: true })).count;
    });
    const filled = new Set(logs.map((l) => l.gameId)).size;
    console.log(
      `${key}: ${saved} lines over ${filled}/${games.length} games` +
        (unmatched.size ? `; ${unmatched.size} feed games unmatched (e.g. ${[...unmatched][0]})` : '') +
        (strangers.size ? `; ${strangers.size} unknown players skipped (e.g. ${[...strangers.values()].slice(0, 3).join(', ')})` : ''),
    );
  }
}

main().finally(() => prisma.$disconnect());
