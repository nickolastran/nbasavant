/** Self-check for the stat formulas: `npm test`. Fails loudly if math drifts. */
import assert from 'node:assert/strict';
import {
  BoxTotals, LEAGUE_2024_25, TeamTotals, astPct, boxPlusMinus, efgPct,
  centerBpm, normalizePer, offRtg, pace, playerDrtg, playerOrtg, possessions, shotDistanceFt, shotZone,
  gameClock, gameScore, gamesBehind, tovPct, winProbability, tsPct, uPer, usgPct, vorp, winPct, winShares,
  careerAdvanced, careerTotals, expectedShooting, MIN_TYPE_ATTEMPTS, nearestSeasons, stintRatings, zBySeason, zLadder, minGames, percentileOf, pythagWins, scaledFloor, standings,
  activeStreak, nextMilestone, onPace, splitLogs,
} from './stats';
import { ordinal, shortNames } from './format';

const near = (a: number, b: number, eps = 0.05, msg = '') =>
  assert.ok(Math.abs(a - b) < eps, `${msg} expected ~${b}, got ${a}`);

const box = (o: Partial<BoxTotals>): BoxTotals => ({
  min: 0, pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
  pf: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, ...o,
});

// --- Shooting -------------------------------------------------------------
near(tsPct(box({ pts: 30, fga: 20, fta: 10 })), 61.475, 0.01, 'TS%');
near(efgPct(box({ fgm: 10, fg3m: 4, fga: 20 })), 60, 0.01, 'eFG%');
near(tovPct(box({ tov: 5, fga: 20, fta: 10 })), 17.007, 0.01, 'TOV%');
assert.equal(tsPct(box({})), 0, 'no attempts must not divide by zero');
near(gameScore(box({ pts: 30, fgm: 11, fga: 20, ftm: 6, fta: 8, oreb: 2, dreb: 6, stl: 2, ast: 5, blk: 1, pf: 3, tov: 3 })), 24.8, 0.001, 'Game Score');

// --- Rate stats -----------------------------------------------------------
// A player who takes every team shot while playing every team minute uses 100%.
const team: TeamTotals = box({
  min: 240, pts: 110, reb: 45, oreb: 10, dreb: 35, ast: 25, tov: 14, pf: 20,
  fgm: 40, fga: 88, fg3m: 12, fg3a: 34, ftm: 18, fta: 22,
}) as TeamTotals;
team.gp = 1;
team.oppPts = 104;

const hog = box({ min: 48, fga: 88, fta: 22, tov: 14 });
near(usgPct(hog, team), 100, 0.01, 'USG% ceiling');

const starter = box({
  min: 36, pts: 28, reb: 7, oreb: 1, dreb: 6, ast: 6, stl: 1, blk: 1, tov: 3,
  pf: 2, fgm: 10, fga: 20, fg3m: 3, fg3a: 8, ftm: 5, fta: 6,
});
assert.ok(usgPct(starter, team) > 25 && usgPct(starter, team) < 40, 'USG% plausible');
assert.ok(astPct(starter, team) > 15 && astPct(starter, team) < 45, 'AST% plausible');

// --- Team -----------------------------------------------------------------
near(possessions(team), 88 + 0.44 * 22 - 10 + 14, 0.01, 'possessions');
near(offRtg(team), (110 / possessions(team)) * 100, 0.01, 'ORtg');
assert.ok(pace(team) > 90 && pace(team) < 110, `pace plausible, got ${pace(team)}`);

// --- PER ------------------------------------------------------------------
const u = uPer(starter, team, LEAGUE_2024_25);
assert.ok(u > 0, 'a good game produces positive uPER');
assert.equal(uPer(box({}), team, LEAGUE_2024_25), 0, 'zero minutes -> zero uPER');

// Normalization must put the minutes-weighted league average at exactly 15.
const league = [
  { uPer: 0.5, min: 2000 },
  { uPer: 0.3, min: 1500 },
  { uPer: 0.1, min: 500 },
];
const pers = normalizePer(league);
const wAvg =
  pers.reduce((s, p, i) => s + p * league[i].min, 0) /
  league.reduce((s, r) => s + r.min, 0);
near(wAvg, 15, 0.001, 'normalized PER league average');
assert.ok(pers[0] > pers[1] && pers[1] > pers[2], 'normalization preserves order');

// --- Approximations (sanity bands only) -----------------------------------
const ortg = playerOrtg(starter, team, LEAGUE_2024_25);
assert.ok(ortg > 80 && ortg < 160, `player ORtg plausible, got ${ortg}`);

// Full-season scale check: a 36 mpg starter on an 82-game team must land in the
// real WS range (elite ~15), not 5x it — the minutes denominator is easy to get
// wrong and nothing else in the app would catch it.
const seasonTeam: TeamTotals = box({
  min: 240 * 82, pts: 110 * 82, reb: 45 * 82, oreb: 10 * 82, dreb: 35 * 82,
  ast: 25 * 82, tov: 14 * 82, pf: 20 * 82, fgm: 40 * 82, fga: 88 * 82,
  fg3m: 12 * 82, fg3a: 34 * 82, ftm: 18 * 82, fta: 22 * 82,
}) as TeamTotals;
seasonTeam.gp = 82;
seasonTeam.oppPts = 104 * 82;
const seasonStar = box({
  min: 36 * 82, pts: 28 * 82, reb: 7 * 82, oreb: 82, dreb: 6 * 82, ast: 6 * 82,
  stl: 82, blk: 82, tov: 3 * 82, pf: 2 * 82, fgm: 10 * 82, fga: 20 * 82,
  fg3m: 3 * 82, fg3a: 8 * 82, ftm: 5 * 82, fta: 6 * 82,
});
const seasonWs = winShares(seasonStar, seasonTeam, LEAGUE_2024_25);
assert.ok(
  seasonWs.ws > 3 && seasonWs.ws < 20,
  `season WS must be on the real scale, got ${seasonWs.ws.toFixed(1)}`,
);
assert.ok(seasonWs.ws48 < 0.45, `WS/48 must be on the real scale, got ${seasonWs.ws48}`);
assert.ok(
  playerDrtg(seasonStar, seasonTeam) > 90 && playerDrtg(seasonStar, seasonTeam) < 125,
  `player DRtg must be on the real scale, got ${playerDrtg(seasonStar, seasonTeam)}`,
);

const ws = winShares(starter, team, LEAGUE_2024_25);
assert.ok(ws.ws > 0, 'productive starter has positive WS');
near(ws.ws, ws.ows + ws.dws, 1e-9, 'WS = OWS + DWS');

const bpm = boxPlusMinus(starter, team, LEAGUE_2024_25);
near(bpm.bpm, bpm.obpm + bpm.dbpm, 1e-9, 'BPM = OBPM + DBPM');
assert.ok(bpm.bpm > -15 && bpm.bpm < 20, `BPM in range, got ${bpm.bpm}`);
near(vorp(-2, 2000, 240 * 82, 82), 0, 1e-9, 'replacement level BPM -> 0 VORP');

// BPM is defined with a league average of exactly 0.
const centered = centerBpm([
  { obpm: 4, dbpm: 2, min: 2000 },
  { obpm: 1, dbpm: 0, min: 1000 },
  { obpm: -2, dbpm: -1, min: 500 },
]);
const bpmMin = [2000, 1000, 500];
near(
  centered.reduce((s, c, i) => s + c.bpm * bpmMin[i], 0) / 3500,
  0, 1e-9, 'centered BPM league average',
);

// --- Shot geometry --------------------------------------------------------
assert.equal(shotDistanceFt(0, 250), 25, 'distance in feet');
assert.equal(shotZone(230, 50).zone, 'Right Corner 3', 'right corner');
assert.equal(shotZone(-230, 50).zone, 'Left Corner 3', 'left corner');
assert.equal(shotZone(0, 260).zone, 'Above the Break 3', 'top of key three');
assert.equal(shotZone(0, 20).zone, 'Restricted Area', 'at the rim');
assert.equal(shotZone(0, 150).zone, 'Mid-Range', 'mid-range');
assert.equal(shotZone(230, 200).value, 3, 'deep wing is a three');
// A shot 22ft out but above the break is still a two.
assert.equal(shotZone(0, 220).value, 2, 'inside the arc above the break');

// --- Awards ladders ---------------------------------------------------------
// a: 10 and 1, b: 20 and 1, c: 30 and 4. Means 20 and 2, SDs 8.165 and 1.414.
// c: (1.225 + 1.414) / 2 = 1.319; a: (-1.225 - 0.707) / 2 = -0.966.
const ladder = zLadder(
  [{ id: 'a', x: 10, y: 1 }, { id: 'b', x: 20, y: 1 }, { id: 'c', x: 30, y: 4 }, { id: 'd', x: 40, y: null }],
  [(r) => r.x, (r) => r.y],
);
assert.deepEqual(ladder.map((l) => l.row.id), ['c', 'b', 'a'], 'ranked by average z, the row missing a stat left off');
near(ladder[0].score, 1.3195, 0.001, 'top score');
near(ladder[2].score, -0.9659, 0.001, 'bottom score');
assert.equal(zLadder([{ x: 5 }, { x: 5 }], [(r) => r.x])[0].score, 0, 'no spread, no z');

// --- Similar seasons --------------------------------------------------------
// Season 1 scores 0 and 10, season 2 100 and 200: both z to -1 and +1, so the
// low scorer of season 2 is the low scorer of season 1's match, eras apart.
const zs = zBySeason([
  { playerId: 1, seasonId: 1, stats: [0, 5] },
  { playerId: 2, seasonId: 1, stats: [10, 5] },
  { playerId: 3, seasonId: 2, stats: [100, null] },
  { playerId: 4, seasonId: 2, stats: [200, null] },
  { playerId: 1, seasonId: 2, stats: [150, null] },
]);
// Season 2 is 100, 200 and 150: mean 150, SD 40.82.
near(zs.find((r) => r.playerId === 3)!.stats[0]!, -1.2247, 0.001, 'z within its own season');
assert.equal(zs[0].stats[1], null, 'no spread, no z');
const near1 = nearestSeasons(zs, zs[0], 3, 1);
assert.deepEqual(near1.map((m) => m.row.playerId), [3, 2, 4], 'nearest first, his own seasons skipped');
near(near1[0].distance, 0.2247, 0.001, 'distance over the stats both have');
assert.equal(nearestSeasons(zs, zs[0], 3, 2).length, 0, 'too few shared stats, no match');

// --- Pace, milestones and streaks -------------------------------------------
// 300 points through 10 team games is 30 a game, 2,460 over 82.
assert.equal(onPace(300, 10), 2460, 'pace per team game');
assert.equal(onPace(0, 0), null, 'no games, no pace');
assert.deepEqual(nextMilestone(29888, 1000), { at: 30000, left: 112 }, '112 from 30,000');
assert.deepEqual(nextMilestone(30000, 1000), { at: 31000, left: 1000 }, 'reached one, on to the next');
assert.equal(activeStreak([25, 31, 20, 12, 40], (p) => p >= 20), 3, 'newest three at 20+');
assert.equal(activeStreak([12, 30], (p) => p >= 20), 0, 'broken last game');
assert.equal(activeStreak([22, 30], (p) => p >= 20), 2, 'every game so far');

// --- Splits by opponent ------------------------------------------------------
const g = (opp: string, won: boolean, o: Partial<BoxTotals>) => ({ ...box(o), opp, won });
const vs = splitLogs(
  [
    g('NYK', true, { min: 36, pts: 30, fgm: 10, fga: 20, fg3m: 4, fg3a: 8, ftm: 6, fta: 6 }),
    g('MIA', false, { min: 30, pts: 10, fta: 0 }),
    g('NYK', false, { min: 34, pts: 20, fgm: 8, fga: 20, fg3m: 0, fg3a: 4, ftm: 4, fta: 4 }),
  ],
  (l) => l.opp,
);
assert.deepEqual(vs.map((s) => s.key), ['NYK', 'MIA'], 'most games first');
assert.equal(vs[0].record, '1-1');
near(vs[0].pts, 25, 0.001, 'points per game vs NYK');
near(vs[0].fgPct!, 45, 0.001, 'FG% on summed makes, not averaged');
near(vs[0].fg3Pct!, 33.333, 0.001, '3P% on summed makes');
assert.equal(vs[1].fgPct, null, 'no shots: no FG%');
assert.equal(vs[1].tsPct, null, 'no shots: no TS%');

// --- Lineup stints ---------------------------------------------------------
// 12 minutes, 30-24 on 25 and 23 possessions (24 averaged): 125 / 100 per 100.
const sr = stintRatings([
  { seconds: 400, pts: 20, oppPts: 10, poss: 15, oppPoss: 14 },
  { seconds: 320, pts: 10, oppPts: 14, poss: 10, oppPoss: 9 },
]);
assert.deepEqual([sr.min, sr.plusMinus, sr.poss], [12, 6, 24], 'stint minutes, +/-, possessions');
near(sr.ortg!, 125, 1e-9, 'stint ORtg');
near(sr.net!, 25, 1e-9, 'stint net rating');
assert.equal(stintRatings([]).net, null, 'no possessions, no rating');

// --- Expected shooting ----------------------------------------------------
// League: 36 of 60 at the rim (60%), 14 of 40 from 25 feet (35%).
// A takes 10 of each and makes 8 and 5: expected 12 + 10.5 = 22.5 points on
// 20 shots, a 56.25 xeFG%, against 31 points, 77.5 eFG%.
const xs = expectedShooting([
  { playerId: 1, value: 2, distanceFt: 2, made: true, n: 8 },
  { playerId: 1, value: 2, distanceFt: 2, made: false, n: 2 },
  { playerId: 1, value: 3, distanceFt: 25, made: true, n: 5 },
  { playerId: 1, value: 3, distanceFt: 25, made: false, n: 5 },
  { playerId: 2, value: 2, distanceFt: 2, made: true, n: 28 },
  { playerId: 2, value: 2, distanceFt: 2, made: false, n: 22 },
  { playerId: 2, value: 3, distanceFt: 25, made: true, n: 9 },
  { playerId: 2, value: 3, distanceFt: 25, made: false, n: 21 },
]);
near(xs.get(1)!.xEfg, 56.25, 0.001, 'expected eFG% from the league rate at each spot');
near(xs.get(1)!.efg, 77.5, 0.001, 'actual eFG% from the same shots');
near(xs.get(1)!.shotMaking, 21.25, 0.001, 'shot-making is the gap');
// Over the whole league, makes above expectation and below cancel out.
near([...xs.values()].reduce((s, p) => s + p.shotMaking * p.fga, 0), 0, 1e-9, 'league shot-making nets to zero');
// Every shot from 30 feet out is one heave bucket: 1 of 2 there makes each 50%.
const heave = expectedShooting([
  { playerId: 1, value: 3, distanceFt: 31, made: true, n: 1 },
  { playerId: 2, value: 3, distanceFt: 45, made: false, n: 1 },
]);
near(heave.get(2)!.xEfg, 75, 0.001, 'heaves share a bucket');
// Shot type: at 2 feet the league dunks MIN of MIN (100%) and makes MIN/2 of MIN
// jumpers (50%). Player 1 only dunks, player 2 only shoots jumpers. Priced by
// type, 1 is expected to make all of his and 2 half; by spot alone, both 75%.
const atRim = (n: number, typedDunks = true) => expectedShooting([
  { playerId: 1, value: 2, distanceFt: 2, made: true, n, type: typedDunks ? 'DUNK' : undefined },
  { playerId: 2, value: 2, distanceFt: 2, made: true, n: n / 2, type: 'Jump Shot' },
  { playerId: 2, value: 2, distanceFt: 2, made: false, n: n / 2, type: 'Jump Shot' },
]);
const full = atRim(MIN_TYPE_ATTEMPTS);
near(full.get(1)!.xEfg, 100, 0.001, 'dunks priced as dunks once the bucket is full');
near(full.get(2)!.xEfg, 50, 0.001, 'jumpers priced as jumpers');
near(full.get(2)!.shotMaking, 0, 0.001, 'an average jump shooter is average');
const thin = atRim(MIN_TYPE_ATTEMPTS - 2);
near(thin.get(1)!.xEfg, 75, 0.001, 'too few of a type: the spot rate');
near(thin.get(2)!.xEfg, 75, 0.001, 'both types fall back together');
// A full bucket beside a thin one: the thin type takes the rest of the spot, so the league still nets to zero.
const mixed = expectedShooting([
  { playerId: 1, value: 2, distanceFt: 2, made: true, n: MIN_TYPE_ATTEMPTS, type: 'DUNK' },
  { playerId: 2, value: 2, distanceFt: 2, made: true, n: 3, type: 'Hook' },
  { playerId: 3, value: 2, distanceFt: 2, made: false, n: 7, type: 'Layup' },
]);
near(mixed.get(2)!.xEfg, 30, 0.001, 'thin types share what is left of the spot');
near([...mixed.values()].reduce((s, p) => s + p.shotMaking * p.fga, 0), 0, 1e-9, 'still nets to zero');

// --- Standings ------------------------------------------------------------
near(winPct(60, 22), 0.7317, 0.0001, 'winning percentage');
assert.equal(winPct(0, 0), 0, 'an unplayed season is .000, not NaN');
const lead = { wins: 64, losses: 18 };
assert.equal(gamesBehind(lead, lead), 0, 'the leader is never behind itself');
assert.equal(gamesBehind(lead, { wins: 62, losses: 20 }), 2, 'two fewer wins and two more losses is 2 GB');
// One extra loss with the same wins is half a game, which is the whole reason
// the column carries a decimal.
assert.equal(gamesBehind(lead, { wins: 64, losses: 19 }), 0.5, 'half a game back');

// --- Pythagorean record -----------------------------------------------------
// Basketball-reference publishes expected wins from season point totals; these
// are its numbers, copied off the league pages, across three eras.
for (const [team, gp, pf, pa, published] of [
  ['2025-26 OKC', 82, 9760, 8846, 65], ['2025-26 SAS', 82, 9826, 9145, 60],
  ['2025-26 DET', 82, 9657, 8988, 60], ['1959-60 BOS', 75, 9337, 8713, 54],
  ['1959-60 STL', 75, 8506, 8303, 44], ['1959-60 SYR', 75, 8917, 8720, 43],
  ['1946-47 BOS', 60, 3605, 3898, 15], ['1946-47 CHS', 61, 4697, 4473, 41],
  ['1946-47 CLR', 60, 4251, 4308, 27],
] as const) {
  assert.equal(Math.round(pythagWins(pf, pa, gp)), published, `${team} expected wins`);
}
assert.equal(pythagWins(0, 0, 0), 0, 'a team that has not played expects nothing');

// --- Standings from game results -------------------------------------------
// Four teams, five games. Every expectation below is counted by hand.
const ident = new Map([
  [1, { conference: 'East', division: 'Atlantic' }],
  [2, { conference: 'East', division: 'Central' }],
  [3, { conference: 'West', division: 'Pacific' }],
  [4, { conference: 'West', division: 'Pacific' }],
]);
const table = standings(
  [
    { date: '2026-10-20', home: 1, away: 2, homeScore: 100, awayScore: 90 },
    { date: '2026-10-21', home: 3, away: 1, homeScore: 105, awayScore: 110 },
    { date: '2026-10-22', home: 2, away: 3, homeScore: 99, awayScore: 101 },
    { date: '2026-10-23', home: 1, away: 3, homeScore: 95, awayScore: 100 },
    { date: '2026-10-24', home: 4, away: 3, homeScore: 120, awayScore: 80 },
  ],
  ident,
);
const row = (id: number) => table.find((r) => r.teamId === id)!;
assert.equal(table.length, 4, 'every team gets a row, played or not');
assert.deepEqual(
  [row(1).wins, row(1).losses, row(1).home, row(1).away, row(1).conf, row(1).div],
  [2, 1, [1, 1], [1, 0], [1, 0], [0, 0]],
  'team 1 splits',
);
assert.deepEqual([row(1).pf, row(1).pa, row(1).streak], [305, 295, 'L1'], 'team 1 points and streak');
assert.deepEqual(
  [row(3).wins, row(3).losses, row(3).home, row(3).away, row(3).conf, row(3).div, row(3).streak],
  [2, 2, [0, 1], [2, 1], [0, 1], [0, 1], 'L1'],
  'team 3: a division loss counts toward both division and conference',
);
assert.deepEqual([row(2).streak, row(4).streak, row(4).div], ['L2', 'W1', [1, 0]], 'streaks');
assert.deepEqual(
  [row(4).wins, row(4).losses, row(4).l10, row(4).streak],
  [1, 0, [1, 0], 'W1'],
  'team 4',
);
const idle = standings([], new Map([[9, { conference: 'East', division: null }]]))[0];
assert.deepEqual(
  [idle.wins, idle.losses, idle.streak, idle.l10, idle.pf],
  [0, 0, '', [0, 0], 0],
  'a season that has not tipped off is 0-0, not missing',
);
// Two early losses then ten straight wins: L10 only sees the ten.
const run = Array.from({ length: 12 }, (_, i) => ({
  date: `2026-11-${String(i + 1).padStart(2, '0')}`,
  home: 1, away: 2, homeScore: i < 2 ? 90 : 110, awayScore: 100,
}));
const hot = standings(run, ident).find((r) => r.teamId === 1)!;
assert.deepEqual([hot.wins, hot.losses, hot.l10, hot.streak], [10, 2, [10, 0], 'W10'], 'L10 and streak');
// Games arrive in any order; streaks are about dates, not input order.
const shuffled = standings([...run].reverse(), ident).find((r) => r.teamId === 1)!;
assert.equal(shuffled.streak, 'W10', 'streak is computed in date order');

// --- Career rows ------------------------------------------------------------
// A player whose career straddles 1973-74, when steals and blocks were first
// recorded. Turnovers never were in these two seasons; threes didn't exist.
const career = careerTotals([
  {
    gp: 80, gs: null, min: 3000, pts: 2000, reb: 900, oreb: null, dreb: null, ast: 300,
    stl: null, blk: null, tov: null, pf: 250, fgm: 800, fga: 1600, fg3m: null, fg3a: null,
    ftm: 400, fta: 500,
  },
  {
    gp: 82, gs: null, min: 3100, pts: 2100, reb: 950, oreb: 300, dreb: 650, ast: 320,
    stl: 100, blk: 50, tov: null, pf: 240, fgm: 850, fga: 1700, fg3m: null, fg3a: null,
    ftm: 400, fta: 480,
  },
]);
assert.equal(career.gp, 162, 'career games');
assert.equal(career.pts.total, 4100, 'career points');
assert.deepEqual([career.stl.total, career.stl.gp], [100, 82], 'steals only over the games they were kept');
assert.equal(career.stl.partial, true, 'a stat kept for part of a career is flagged');
assert.equal(career.pts.partial, false, 'a stat kept all career is not');
assert.equal(career.tov.total, null, 'never recorded stays null, not 0');
near(career.fgPct!, 50, 0.001, 'career FG% from summed makes');
near(career.ftPct!, 81.633, 0.001, 'career FT%');
assert.equal(career.fg3Pct, null, 'no threes attempted, no 3P%');
near(career.tsPct!, 54.942, 0.001, 'career TS% from summed totals');

const adv = careerAdvanced([
  { min: 3000, per: 20, ws: 10, ows: 6, dws: 4, bpm: null, vorp: null },
  { min: 3100, per: 22, ws: 12, ows: 7, dws: 5, bpm: 5, vorp: 4 },
]);
near(adv.per!, 21.016, 0.001, 'career PER is minutes-weighted');
assert.deepEqual([adv.ws, adv.vorp, adv.bpm], [22, 4, 5], 'WS and VORP sum; BPM weights only its own seasons');
near(adv.ws48!, 0.1731, 0.0001, 'career WS/48');

// --- Qualifying ---------------------------------------------------------------
// The NBA's rule: appear in 70% of the team's games. Scaled to games played so
// far, so it means something in November too.
assert.equal(minGames(82), 58, '70% of 82 rounds up to 58');
assert.equal(minGames(10), 7, 'ten games in');
assert.equal(minGames(3), 3, 'three games in');
assert.equal(minGames(0), 0, 'before opening night nobody needs games');
assert.equal(scaledFloor(300, 82), 300, 'a full season keeps the whole attempt floor');
assert.equal(scaledFloor(300, 41), 150, 'half a season, half the floor');
assert.equal(scaledFloor(100, 60), 74, 'a 60-game BAA season scales down and rounds up');

// --- Percentiles --------------------------------------------------------------
const pop = [10, 20, 30, 40, 50];
assert.deepEqual(
  [percentileOf(10, pop), percentileOf(30, pop), percentileOf(50, pop)],
  [0, 50, 100],
  'share of the field below, as 0-100',
);
assert.equal(percentileOf(10, pop, true), 100, 'lower-is-better flips the scale');
assert.equal(percentileOf(20, [10, 20, 20, 30]), 33, 'ties share a percentile');
assert.equal(percentileOf(7, [7]), 50, 'a field of one sits in the middle');

// --- Ordinals -------------------------------------------------------------------
assert.deepEqual(
  [0, 1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 50, 100, 101, 111].map(ordinal),
  ['0th', '1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '50th', '100th', '101st', '111th'],
  'ordinals, including the teens',
);

assert.deepEqual(gameClock(1, '12:00'), { elapsed: 0, left: 2880 }, 'tip-off');
assert.deepEqual(gameClock(3, '5:30'), { elapsed: 1440 + 390, left: 720 + 330 }, 'mid third quarter');
assert.deepEqual(gameClock(5, '1:00'), { elapsed: 2880 + 240, left: 60 }, 'overtime counts its own five minutes');

// Win probability: even at tip-off bar the home edge, certain at the horn, and a
// lead is worth more the less time is left.
assert.ok(Math.abs(winProbability(0, 2880) - 0.574) < 0.01, 'home edge alone at tip-off');
assert.equal(winProbability(3, 0), 1, 'home lead at the horn');
assert.equal(winProbability(-1, 0), 0, 'home deficit at the horn');
assert.equal(winProbability(0, 0), 0.5, 'tie at the horn: overtime');
assert.ok(winProbability(-9, 2280) < 0.35 && winProbability(-9, 2280) > 0.2, 'down 9 late in the first');
assert.ok(winProbability(5, 60) > winProbability(5, 1440), 'a lead late beats the same lead at half');
assert.ok(Math.abs(winProbability(4, 600) + winProbability(-4, 600, -2.5) - 1) < 1e-6, 'symmetric');

// --- Short names -------------------------------------------------------------
{
  const names = shortNames([
    { id: 1, firstName: 'Jalen', lastName: 'Williams' },
    { id: 2, firstName: 'Jaylin', lastName: 'Williams' },
    { id: 3, firstName: 'Kenrich', lastName: 'Williams' },
    { id: 4, firstName: 'Alex', lastName: 'Caruso' },
  ]);
  assert.deepEqual([...names.values()], ['Jal. Williams', 'Jay. Williams', 'K. Williams', 'Caruso'], 'namesakes told apart, shortest prefix');
}

// Defense keys every shot to five defenders; `league` keeps it priced at the shooters' rates.
{
  const shooters = [
    { playerId: 1, value: 2, distanceFt: 1, made: true, n: 60 },
    { playerId: 1, value: 2, distanceFt: 1, made: false, n: 40 },
  ];
  const defenders = [10, 11, 12, 13, 14].flatMap((d) => shooters.map((g) => ({ ...g, playerId: d, made: g.made, n: g.n })));
  // Defender 10 only saw the misses: 0% against a 60% look.
  const d = expectedShooting([...defenders.filter((g) => g.playerId !== 10), { ...shooters[1], playerId: 10 }], shooters);
  near(d.get(10)!.xEfg, 60, 0.01, 'priced at the league rate, not his own sample');
  near(d.get(10)!.efg, 0, 0.01, 'what opponents shot with him on');
  near(d.get(11)!.shotMaking, 0, 0.01, 'an average night is zero');
}

console.log('stats.ts: all checks passed');
