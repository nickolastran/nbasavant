/** Self-check for the stat formulas: `npm test`. Fails loudly if math drifts. */
import assert from 'node:assert/strict';
import {
  BoxTotals, LEAGUE_2024_25, TeamTotals, astPct, boxPlusMinus, efgPct,
  centerBpm, normalizePer, offRtg, pace, playerDrtg, playerOrtg, possessions, shotDistanceFt, shotZone,
  gamesBehind, tovPct, tsPct, uPer, usgPct, vorp, winPct, winShares,
} from './stats';

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

// --- Standings ------------------------------------------------------------
near(winPct(60, 22), 0.7317, 0.0001, 'winning percentage');
assert.equal(winPct(0, 0), 0, 'an unplayed season is .000, not NaN');
const lead = { wins: 64, losses: 18 };
assert.equal(gamesBehind(lead, lead), 0, 'the leader is never behind itself');
assert.equal(gamesBehind(lead, { wins: 62, losses: 20 }), 2, 'two fewer wins and two more losses is 2 GB');
// One extra loss with the same wins is half a game, which is the whole reason
// the column carries a decimal.
assert.equal(gamesBehind(lead, { wins: 64, losses: 19 }), 0.5, 'half a game back');

console.log('stats.ts: all checks passed');
