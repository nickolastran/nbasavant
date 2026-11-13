/** Self-check for the lab's lineup math: `npm test`. */
import assert from 'node:assert/strict';
import { type Unit, confidence, estimate, fourFactors, splits, together, wowy } from './lineup';

const near = (a: number | null, b: number, eps = 0.01, msg = '') => assert.ok(a !== null && Math.abs(a - b) < eps, `${msg} expected ~${b}, got ${a}`);
// One five-man unit's totals. 100 possessions each side per 48 minutes unless said otherwise.
const u = (players: number[], min: number, pts: number, oppPts: number, poss = (min / 48) * 100): Unit =>
  ({ players, seconds: min * 60, pts, oppPts, poss, oppPoss: poss });

// A team with three units. 1-2-3 always play; 4/5 and 6/7 swap.
const units = [
  u([1, 2, 3, 4, 5], 48, 120, 100),  // +20 per 100
  u([1, 2, 3, 6, 7], 24, 50, 55),    // -10 per 100
  u([1, 2, 6, 7, 8], 24, 45, 55),    // -20 per 100, player 3 off
];

// --- Players together --------------------------------------------------------------
const all5 = together(units, [1, 2, 3, 4, 5]);
near(all5.min, 48); near(all5.ortg, 120); near(all5.drtg, 100); near(all5.net, 20);
near(all5.pace, 100, 0.01, 'possessions per 48');
assert.equal(all5.plusMinus, 20);
// A pair is every unit that contains both.
const pair = together(units, [1, 3]);
near(pair.min, 72); near(pair.ortg, (170 / 150) * 100); near(pair.net, ((170 - 155) / 150) * 100);
// Never shared the floor: no minutes, no ratings (not zero).
const never = together(units, [4, 8]);
assert.equal(never.min, 0);
assert.equal(never.net, null);
assert.equal(never.pace, null);

// --- On/off splits ------------------------------------------------------------------
// One player: on and off.
const s1 = splits(units, [3]);
assert.equal(s1.length, 2);
const on = s1.find((s) => s.on[0])!, off = s1.find((s) => !s.on[0])!;
near(on.min, 72); near(off.min, 24); near(off.net, -20);
// Two players: a 2x2 grid whose minutes add up to the team's.
const s2 = splits(units, [3, 4]);
assert.equal(s2.length, 4);
near(s2.reduce((t, s) => t + s.min, 0), 96);
near(s2.find((s) => s.on[0] && s.on[1])!.min, 48);
near(s2.find((s) => s.on[0] && !s.on[1])!.min, 24);
assert.equal(s2.find((s) => !s.on[0] && s.on[1])!.min, 0, '4 never played without 3');
// Three players: 2x2x2.
assert.equal(splits(units, [1, 3, 4]).length, 8);

// --- WOWY grid ----------------------------------------------------------------------
const grid = wowy(units, [1, 3, 8]);
near(grid.get('1:3')!.net, ((170 - 155) / 150) * 100);
assert.equal(grid.get('3:8')!.min, 0);
assert.equal(grid.get('3:1'), undefined, 'each pair once, lower index first');

// --- Estimating a unit that hasn't played ----------------------------------------------
const team = together(units, []);
near(team.min, 96);
// The real unit: with a heavy sample the estimate sits close to what it actually did.
const real = estimate(units, [1, 2, 3, 4, 5], 100);
assert.equal(real.actual.min, 48);
assert.ok(real.net !== null && real.net > 5 && real.net < 20, `shrunk toward the team, got ${real.net}`);
// A five that never played together, but whose pairs and trios did: it gets an estimate between the extremes.
const fresh = estimate(units, [1, 2, 3, 4, 6], 100);
assert.equal(fresh.actual.min, 0);
assert.ok(fresh.net !== null && fresh.net > -20 && fresh.net < 20);
assert.ok(fresh.sample > 0);
// More prior, more pull toward the team's own rating.
const loose = estimate(units, [1, 2, 3, 4, 5], 10), tight = estimate(units, [1, 2, 3, 4, 5], 5000);
assert.ok(Math.abs(tight.net! - team.net!) < Math.abs(loose.net! - team.net!));
// Players with no minutes at all: nothing to go on, so the estimate is the team's rating and the sample is zero.
const blank = estimate(units, [91, 92, 93, 94, 95], 100);
assert.equal(blank.sample, 0);
near(blank.net, team.net!);
// No data for the team at all.
assert.equal(estimate([], [1, 2, 3, 4, 5], 100).net, null);

// --- Confidence ----------------------------------------------------------------------
assert.equal(confidence(0), 'none');
assert.equal(confidence(150), 'low');
assert.equal(confidence(600), 'medium');
assert.equal(confidence(2500), 'high');

// --- Four factors -----------------------------------------------------------------------
const counts = { fgm: 40, fga: 80, fg3m: 10, ftm: 15, fta: 20, tov: 12, oreb: 10, dreb: 30, oppFgm: 36, oppFga: 90, oppFg3m: 8, oppFtm: 10, oppFta: 14, oppTov: 16, oppOreb: 12, oppDreb: 28 };
const ff = fourFactors([{ ...u([1, 2, 3, 4, 5], 48, 105, 90), ...counts }])!;
near(ff.efg, ((40 + 5) / 80) * 100, 0.001, 'eFG%');
near(ff.tov, (12 / (80 + 0.44 * 20 + 12)) * 100, 0.001, 'TOV%');
near(ff.oreb, (10 / (10 + 28)) * 100, 0.001, 'OREB% is against the opponent\'s defensive boards');
near(ff.ftRate, 15 / 80, 0.0001, 'FT rate is makes per attempt');
near(ff.oppEfg, ((36 + 4) / 90) * 100, 0.001, 'opponent eFG%');
near(ff.oppTov, (16 / (90 + 0.44 * 14 + 16)) * 100, 0.001, 'forced TOV%');
near(ff.dreb, (30 / (30 + 12)) * 100, 0.001, 'DREB%');
near(ff.oppFtRate, 10 / 90, 0.0001);
// Two units sum before the rates are taken.
near(fourFactors([{ ...u([1, 2, 3, 4, 5], 24, 50, 45), ...counts }, { ...u([1, 2, 3, 4, 6], 24, 50, 45), ...counts, fgm: 20 }])!.efg, ((60 + 10) / 160) * 100, 0.001);
// Units saved before the counts existed have none: no factors, not zeros.
assert.equal(fourFactors(units), null);
assert.equal(fourFactors([]), null);

console.log('lineup: all checks passed');
