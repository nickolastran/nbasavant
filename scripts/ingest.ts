/**
 * Pulls real data from stats.nba.com into the same schema the seed writes.
 *
 *   npm run ingest -- --season 2024-25 --shots 60 --pbp 10
 *
 * stats.nba.com is undocumented and unfriendly: it needs browser-ish headers,
 * rate limits aggressively, and occasionally hangs. Every call goes through
 * `nba()` below, which sets the headers, retries, and paces itself.
 */
import { PrismaClient } from '@prisma/client';
import { TEAMS } from '../prisma/teams';
import {
  BoxTotals, LEAGUE_2024_25, TeamTotals, astPct, boxPlusMinus, centerBpm, efgPct,
  normalizePer, playerDrtg, playerOrtg, rebPct, tovPct, tsPct, uPer, usgPct, vorp,
  winShares,
} from '../src/lib/stats';

const prisma = new PrismaClient();

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const SEASON = arg('season', process.env.NBA_SEASON ?? '2024-25')!;
const SHOT_PLAYERS = Number(arg('shots', '60'));
const PBP_GAMES = Number(arg('pbp', '10'));
const DELAY = Number(process.env.NBA_STATS_DELAY_MS ?? 800);

const HEADERS = {
  'User-Agent':
    process.env.NBA_STATS_USER_AGENT ??
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
  Referer: 'https://www.nba.com/',
  Origin: 'https://www.nba.com',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
  Connection: 'keep-alive',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ResultSet = { name: string; headers: string[]; rowSet: (string | number | null)[][] };

/** One stats.nba.com call, returned as objects keyed by the header row. */
async function nba(endpoint: string, params: Record<string, string | number>, tries = 3) {
  const url = `https://stats.nba.com/stats/${endpoint}?${new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  )}`;

  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30_000);
      const res = await fetch(url, { headers: HEADERS, signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const body = (await res.json()) as { resultSets: ResultSet[] };
      await sleep(DELAY);
      return body.resultSets.map((rs) => ({
        name: rs.name,
        rows: rs.rowSet.map((row) =>
          Object.fromEntries(rs.headers.map((h, i) => [h, row[i]])) as Record<string, any>,
        ),
      }));
    } catch (err) {
      if (attempt === tries) throw new Error(`${endpoint} failed after ${tries} tries: ${err}`);
      console.warn(`  ${endpoint} attempt ${attempt} failed (${err}); backing off`);
      await sleep(DELAY * attempt * 3);
    }
  }
  throw new Error('unreachable');
}

const emptyBox = (): BoxTotals => ({
  min: 0, pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
  pf: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
});
const r1 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 10) / 10;
const r2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
const num = (v: unknown) => (typeof v === 'number' ? v : Number(v) || 0);

const chunked = async <T>(rows: T[], size: number, fn: (c: T[]) => Promise<unknown>) => {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
};

async function main() {
  const startYear = Number(SEASON.slice(0, 4));
  console.log(`Ingesting ${SEASON} from stats.nba.com`);

  await prisma.team.createMany({ data: TEAMS, skipDuplicates: true });
  const season = await prisma.season.upsert({
    where: { key: SEASON },
    create: { key: SEASON, startYear, endYear: startYear + 1, active: true },
    update: {},
  });

  // --- players ------------------------------------------------------------
  const [players] = await nba('commonallplayers', {
    LeagueID: '00', Season: SEASON, IsOnlyCurrentSeason: 1,
  });
  const teamIds = new Set(TEAMS.map((t) => t.id));
  const roster = players.rows.filter((p) => teamIds.has(num(p.TEAM_ID)));

  await chunked(roster, 200, (c) =>
    prisma.player.createMany({
      data: c.map((p) => {
        const [last, first] = String(p.DISPLAY_LAST_COMMA_FIRST).split(', ');
        return {
          id: num(p.PERSON_ID),
          firstName: first ?? '',
          lastName: last ?? '',
          fullName: String(p.DISPLAY_FIRST_LAST),
          active: true,
          teamId: num(p.TEAM_ID) || null,
          draftYear: num(p.FROM_YEAR) || null,
        };
      }),
      skipDuplicates: true,
    }),
  );
  console.log(`Players: ${roster.length}`);

  // --- season totals ------------------------------------------------------
  const [playerTotals] = await nba('leaguedashplayerstats', {
    LeagueID: '00', Season: SEASON, SeasonType: 'Regular Season', MeasureType: 'Base',
    PerMode: 'Totals', PaceAdjust: 'N', PlusMinus: 'N', Rank: 'N', Outcome: '',
    Location: '', Month: 0, SeasonSegment: '', DateFrom: '', DateTo: '', OpponentTeamID: 0,
    VsConference: '', VsDivision: '', GameSegment: '', Period: 0, LastNGames: 0,
    TeamID: 0, GameScope: '', PlayerExperience: '', PlayerPosition: '', StarterBench: '',
    DraftYear: '', DraftPick: '', College: '', Country: '', Height: '', Weight: '',
    TwoWay: 0, ISTRound: '', ShotClockRange: '', Conference: '', Division: '',
  });

  const [teamTotals] = await nba('leaguedashteamstats', {
    LeagueID: '00', Season: SEASON, SeasonType: 'Regular Season', MeasureType: 'Base',
    PerMode: 'Totals', PaceAdjust: 'N', PlusMinus: 'N', Rank: 'N', Outcome: '',
    Location: '', Month: 0, SeasonSegment: '', DateFrom: '', DateTo: '', OpponentTeamID: 0,
    VsConference: '', VsDivision: '', GameSegment: '', Period: 0, LastNGames: 0,
    TeamID: 0, GameScope: '', PlayerExperience: '', PlayerPosition: '', StarterBench: '',
    Conference: '', Division: '', ShotClockRange: '',
  });

  const toBox = (r: Record<string, any>): BoxTotals => ({
    min: num(r.MIN), pts: num(r.PTS), reb: num(r.REB), oreb: num(r.OREB), dreb: num(r.DREB),
    ast: num(r.AST), stl: num(r.STL), blk: num(r.BLK), tov: num(r.TOV), pf: num(r.PF),
    fgm: num(r.FGM), fga: num(r.FGA), fg3m: num(r.FG3M), fg3a: num(r.FG3A),
    ftm: num(r.FTM), fta: num(r.FTA),
  });

  const teamBox = new Map<number, TeamTotals>();
  for (const t of teamTotals.rows) {
    const b = toBox(t) as TeamTotals;
    b.gp = num(t.GP);
    b.oppPts = 0; // filled from the advanced pull below
    teamBox.set(num(t.TEAM_ID), b);
  }

  const [teamAdvanced] = await nba('leaguedashteamstats', {
    LeagueID: '00', Season: SEASON, SeasonType: 'Regular Season', MeasureType: 'Advanced',
    PerMode: 'PerGame', PaceAdjust: 'N', PlusMinus: 'N', Rank: 'N', Outcome: '',
    Location: '', Month: 0, SeasonSegment: '', DateFrom: '', DateTo: '', OpponentTeamID: 0,
    VsConference: '', VsDivision: '', GameSegment: '', Period: 0, LastNGames: 0,
    TeamID: 0, GameScope: '', Conference: '', Division: '', ShotClockRange: '',
  });

  await Promise.all(
    teamAdvanced.rows.map((t) => {
      const id = num(t.TEAM_ID);
      const b = teamBox.get(id);
      if (b) b.oppPts = num(t.DEF_RATING) * ((num(t.PACE) * b.gp) / 100);
      return prisma.teamStats.upsert({
        where: { teamId_seasonId: { teamId: id, seasonId: season.id } },
        create: {
          teamId: id, seasonId: season.id, gp: num(t.GP), wins: num(t.W), losses: num(t.L),
          pace: r1(num(t.PACE)), ortg: r1(num(t.OFF_RATING)), drtg: r1(num(t.DEF_RATING)),
          netRtg: r1(num(t.NET_RATING)), efgPct: r1(num(t.EFG_PCT) * 100),
          tsPct: r1(num(t.TS_PCT) * 100), tovPct: r1(num(t.TM_TOV_PCT) * 100),
          orebPct: r1(num(t.OREB_PCT) * 100), drebPct: r1(num(t.DREB_PCT) * 100),
          ftRate: 0, oppEfgPct: 0, oppTovPct: 0, sos: 0,
        },
        update: {
          gp: num(t.GP), wins: num(t.W), losses: num(t.L),
          pace: r1(num(t.PACE)), ortg: r1(num(t.OFF_RATING)), drtg: r1(num(t.DEF_RATING)),
          netRtg: r1(num(t.NET_RATING)), efgPct: r1(num(t.EFG_PCT) * 100),
          tsPct: r1(num(t.TS_PCT) * 100), tovPct: r1(num(t.TM_TOV_PCT) * 100),
          orebPct: r1(num(t.OREB_PCT) * 100), drebPct: r1(num(t.DREB_PCT) * 100),
        },
      });
    }),
  );
  console.log(`Team stats: ${teamAdvanced.rows.length}`);

  // --- player season + advanced stats -------------------------------------
  const rows = playerTotals.rows
    .map((r) => {
      const b = toBox(r);
      const tm = teamBox.get(num(r.TEAM_ID));
      return tm ? { r, b, tm, playerId: num(r.PLAYER_ID) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x && x.b.min > 0);

  const pers = normalizePer(rows.map((x) => ({ uPer: uPer(x.b, x.tm, LEAGUE_2024_25), min: x.b.min })));
  const bpms = centerBpm(
    rows.map((x) => ({ ...boxPlusMinus(x.b, x.tm, LEAGUE_2024_25), min: x.b.min })),
  );

  await chunked(rows, 200, (c) =>
    prisma.playerStats.createMany({
      data: c.map(({ r, b, tm, playerId }) => ({
        playerId, seasonId: season.id, teamId: num(r.TEAM_ID),
        gp: num(r.GP), gs: num(r.GS), min: b.min,
        pts: b.pts, reb: b.reb, oreb: b.oreb, dreb: b.dreb, ast: b.ast, stl: b.stl,
        blk: b.blk, tov: b.tov, pf: b.pf, fgm: b.fgm, fga: b.fga, fg3m: b.fg3m,
        fg3a: b.fg3a, ftm: b.ftm, fta: b.fta,
        ppg: r1(b.pts / Math.max(1, num(r.GP))),
        rpg: r1(b.reb / Math.max(1, num(r.GP))),
        apg: r1(b.ast / Math.max(1, num(r.GP))),
        fgPct: r1(num(r.FG_PCT) * 100), fg3Pct: r1(num(r.FG3_PCT) * 100),
        ftPct: r1(num(r.FT_PCT) * 100),
        tsPct: r1(tsPct(b)), efgPct: r1(efgPct(b)), usgPct: r1(usgPct(b, tm)),
      })),
      skipDuplicates: true,
    }),
  );

  await chunked(
    rows.map((x, i) => ({ ...x, per: pers[i], bpm: bpms[i] })),
    200,
    (c) =>
      prisma.advancedStats.createMany({
        data: c.map(({ b, tm, playerId, per, bpm }) => {
          const ws = winShares(b, tm, LEAGUE_2024_25);
          const ortg = playerOrtg(b, tm, LEAGUE_2024_25);
          const drtg = playerDrtg(b, tm);
          return {
            playerId, seasonId: season.id,
            per: r2(per), ortg: r1(ortg), drtg: r1(drtg), netRtg: r1(ortg - drtg),
            ows: r2(ws.ows), dws: r2(ws.dws), ws: r2(ws.ws), ws48: r2(ws.ws48),
            obpm: r2(bpm.obpm), dbpm: r2(bpm.dbpm), bpm: r2(bpm.bpm),
            vorp: r2(vorp(bpm.bpm, b.min, tm.min, tm.gp)),
            astPct: r1(astPct(b, tm)), rebPct: r1(rebPct(b, tm, tm.reb)),
            stlPct: 0, blkPct: 0, tovPct: r1(tovPct(b)),
          };
        }),
        skipDuplicates: true,
      }),
  );
  console.log(`Player stats: ${rows.length}`);

  // --- games and game logs ------------------------------------------------
  const [gameLog] = await nba('leaguegamelog', {
    LeagueID: '00', Season: SEASON, SeasonType: 'Regular Season', PlayerOrTeam: 'T',
    Counter: 1000, Sorter: 'DATE', Direction: 'ASC', DateFrom: '', DateTo: '',
  });

  // Two rows per game (one per team); pair them by GAME_ID.
  const pairs = new Map<string, Record<string, any>[]>();
  for (const g of gameLog.rows) {
    pairs.set(String(g.GAME_ID), [...(pairs.get(String(g.GAME_ID)) ?? []), g]);
  }

  const games = [...pairs.entries()]
    .filter(([, sides]) => sides.length === 2)
    .map(([gameId, sides]) => {
      const home = sides.find((s) => !String(s.MATCHUP).includes('@'))!;
      const away = sides.find((s) => String(s.MATCHUP).includes('@'))!;
      return {
        gameCode: gameId,
        seasonId: season.id,
        date: new Date(String(home.GAME_DATE)),
        homeTeamId: num(home.TEAM_ID),
        awayTeamId: num(away.TEAM_ID),
        homeScore: num(home.PTS),
        awayScore: num(away.PTS),
        status: 'Final',
      };
    });

  await chunked(games, 500, (c) => prisma.game.createMany({ data: c, skipDuplicates: true }));
  console.log(`Games: ${games.length}`);

  const gameIdByCode = new Map(
    (await prisma.game.findMany({ where: { seasonId: season.id }, select: { id: true, gameCode: true } }))
      .map((g) => [g.gameCode, g.id]),
  );

  const [playerLog] = await nba('leaguegamelog', {
    LeagueID: '00', Season: SEASON, SeasonType: 'Regular Season', PlayerOrTeam: 'P',
    Counter: 1000, Sorter: 'DATE', Direction: 'ASC', DateFrom: '', DateTo: '',
  });

  const knownPlayers = new Set(
    (await prisma.player.findMany({ select: { id: true } })).map((p) => p.id),
  );
  const logs = playerLog.rows
    .filter((l) => gameIdByCode.has(String(l.GAME_ID)) && knownPlayers.has(num(l.PLAYER_ID)))
    .map((l) => ({
      playerId: num(l.PLAYER_ID),
      gameId: gameIdByCode.get(String(l.GAME_ID))!,
      seasonId: season.id,
      teamId: num(l.TEAM_ID),
      date: new Date(String(l.GAME_DATE)),
      started: false,
      min: num(l.MIN), pts: num(l.PTS), reb: num(l.REB), oreb: num(l.OREB),
      dreb: num(l.DREB), ast: num(l.AST), stl: num(l.STL), blk: num(l.BLK),
      tov: num(l.TOV), pf: num(l.PF), fgm: num(l.FGM), fga: num(l.FGA),
      fg3m: num(l.FG3M), fg3a: num(l.FG3A), ftm: num(l.FTM), fta: num(l.FTA),
      plusMinus: num(l.PLUS_MINUS),
    }));

  await chunked(logs, 2000, (c) =>
    prisma.playerGameLog.createMany({ data: c, skipDuplicates: true }),
  );
  console.log(`Game logs: ${logs.length}`);

  // --- shot charts --------------------------------------------------------
  // One call per player, so pull the highest-minute players first.
  const shotTargets = [...rows].sort((a, b) => b.b.min - a.b.min).slice(0, SHOT_PLAYERS);
  let shotCount = 0;

  for (const [i, target] of shotTargets.entries()) {
    const name = String(target.r.PLAYER_NAME);
    try {
      const sets = await nba('shotchartdetail', {
        LeagueID: '00', Season: SEASON, SeasonType: 'Regular Season',
        PlayerID: target.playerId, TeamID: 0, GameID: '', Outcome: '', Location: '',
        Month: 0, SeasonSegment: '', DateFrom: '', DateTo: '', OpponentTeamID: 0,
        VsConference: '', VsDivision: '', Position: '', RookieYear: '', GameSegment: '',
        Period: 0, LastNGames: 0, ContextMeasure: 'FGA', PlayerPosition: '',
        StartPeriod: 1, EndPeriod: 4, StartRange: 0, EndRange: 28800, RangeType: 0,
        ClutchTime: '', AheadBehind: '', PointDiff: '', ContextFilter: '',
      });
      const detail = sets.find((s) => s.name === 'Shot_Chart_Detail');
      if (!detail) continue;

      const shots = detail.rows
        .filter((s) => gameIdByCode.has(String(s.GAME_ID)))
        .map((s) => ({
          playerId: target.playerId,
          gameId: gameIdByCode.get(String(s.GAME_ID))!,
          seasonId: season.id,
          teamId: num(s.TEAM_ID),
          x: num(s.LOC_X),
          y: num(s.LOC_Y),
          distanceFt: num(s.SHOT_DISTANCE),
          made: num(s.SHOT_MADE_FLAG) === 1,
          value: String(s.SHOT_TYPE).startsWith('3') ? 3 : 2,
          zone: String(s.SHOT_ZONE_BASIC),
          zoneArea: String(s.SHOT_ZONE_AREA),
          actionType: String(s.ACTION_TYPE),
          period: num(s.PERIOD),
          minsLeft: num(s.MINUTES_REMAINING),
          secsLeft: num(s.SECONDS_REMAINING),
          date: new Date(
            `${String(s.GAME_DATE).slice(0, 4)}-${String(s.GAME_DATE).slice(4, 6)}-${String(s.GAME_DATE).slice(6, 8)}`,
          ),
        }));

      await chunked(shots, 2000, (c) => prisma.shotData.createMany({ data: c }));
      shotCount += shots.length;
      console.log(`  [${i + 1}/${shotTargets.length}] ${name}: ${shots.length} shots`);
    } catch (err) {
      console.warn(`  skipped ${name}: ${err}`);
    }
  }
  console.log(`Shots: ${shotCount}`);

  // --- play-by-play for the most recent games -----------------------------
  const recent = [...games].sort((a, b) => +b.date - +a.date).slice(0, PBP_GAMES);
  for (const g of recent) {
    try {
      const [pbp] = await nba('playbyplayv2', {
        GameID: g.gameCode, StartPeriod: 1, EndPeriod: 10,
      });
      const gameId = gameIdByCode.get(g.gameCode)!;
      const plays = pbp.rows.map((p) => {
        const clock = String(p.PCTIMESTRING ?? '0:00');
        const [m, s] = clock.split(':').map(Number);
        return {
          gameId,
          eventNum: num(p.EVENTNUM),
          period: num(p.PERIOD),
          clock,
          elapsedSec: (num(p.PERIOD) - 1) * 720 + (720 - (m * 60 + s)),
          teamId: num(p.PLAYER1_TEAM_ID) || null,
          playerId: knownPlayers.has(num(p.PLAYER1_ID)) ? num(p.PLAYER1_ID) : null,
          description: String(
            p.HOMEDESCRIPTION ?? p.VISITORDESCRIPTION ?? p.NEUTRALDESCRIPTION ?? '',
          ),
          homeScore: num(String(p.SCORE ?? '0 - 0').split(' - ')[1]),
          awayScore: num(String(p.SCORE ?? '0 - 0').split(' - ')[0]),
          eventType: String(p.EVENTMSGTYPE),
        };
      });
      await chunked(plays, 2000, (c) =>
        prisma.playByPlay.createMany({ data: c, skipDuplicates: true }),
      );
      console.log(`  play-by-play ${g.gameCode}: ${plays.length} events`);
    } catch (err) {
      console.warn(`  skipped play-by-play ${g.gameCode}: ${err}`);
    }
  }

  console.log('Ingest complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
