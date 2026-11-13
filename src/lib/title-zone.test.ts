/** Self-check for the Title Zone math: `npm test`. */
import assert from 'node:assert/strict';
import { TITLE_ZONE as cfg } from './title-zone.config';
import { type TeamGame, inZone, landscape, quadrant, rotate, schedule, titleMarks, zonePolygon } from './title-zone';

const near = (a: number, b: number, eps = 0.01, msg = '') => assert.ok(Math.abs(a - b) < eps, `${msg} expected ~${b}, got ${a}`);

// --- Zone membership: net >= +3.3, offense >= -1.0, defense >= -2.5 ----------------
assert.equal(inZone({ relOff: 2, relDef: 2 }, cfg), true, 'balanced and good');
assert.equal(inZone({ relOff: 6, relDef: -2.5 }, cfg), true, 'offense-led, defense right on the floor');
assert.equal(inZone({ relOff: 7, relDef: -2.6 }, cfg), false, 'defense too weak however good the offense');
assert.equal(inZone({ relOff: -1.1, relDef: 8 }, cfg), false, 'offense too weak');
assert.equal(inZone({ relOff: -1, relDef: 4.3 }, cfg), true, 'offense right on the floor');
assert.equal(inZone({ relOff: 1.6, relDef: 1.6 }, cfg), false, 'net +3.2 is just short');
assert.equal(inZone({ relOff: 1.65, relDef: 1.65 }, cfg), true, 'net +3.3 is in');

// The drawn region's corners are the three constraints' intersections, clipped to the chart.
const poly = zonePolygon(cfg, 10);
assert.deepEqual(poly, [[-1, 4.3], [5.8, -2.5], [10, -2.5], [10, 10], [-1, 10]]);
for (const [o, d] of poly) assert.equal(inZone({ relOff: o, relDef: d }, cfg), true, `vertex ${o},${d} is on the zone's edge`);

// --- Quadrants and the 45 degree turn --------------------------------------------
assert.equal(quadrant({ relOff: 1, relDef: 1 }), 'both');
assert.equal(quadrant({ relOff: 1, relDef: -1 }), 'offense');
assert.equal(quadrant({ relOff: -1, relDef: 1 }), 'defense');
assert.equal(quadrant({ relOff: -1, relDef: -1 }), 'neither');
// Good at both is straight up, offense-led is to the right, defense-led to the left.
near(rotate(1, 1).x, 0);
assert.ok(rotate(1, 1).y > 0);
assert.ok(rotate(3, 0).x > 0 && rotate(0, 3).x < 0);
near(rotate(3, 0).y, rotate(0, 3).y);

// --- Ratings by date ---------------------------------------------------------------
// Two games of 100 possessions. A beats B 110-100, then B beats C 105-95.
const g = (teamId: number, oppId: number, date: string, pts: number, oppPts: number, home: boolean, gameId: number): TeamGame =>
  ({ teamId, oppId, date, pts, oppPts, poss: 100, home, gameId });
const games = [
  g(1, 2, '2026-10-20', 110, 100, true, 1), g(2, 1, '2026-10-20', 100, 110, false, 1),
  g(2, 3, '2026-10-22', 105, 95, true, 2), g(3, 2, '2026-10-22', 95, 105, false, 2),
];
const day1 = landscape(games, '2026-10-20');
assert.equal(day1.length, 2, 'a team that has not played is not on the chart yet');
const a1 = day1.find((p) => p.teamId === 1)!;
near(a1.ortg, 110); near(a1.drtg, 100);
// League average after day one is 105; A is +5 on offense and +5 on defense.
near(a1.relOff, 5); near(a1.relDef, 5); near(a1.net, 10);
assert.deepEqual([a1.wins, a1.losses], [1, 0]);

const day2 = landscape(games, '2026-10-22');
const b2 = day2.find((p) => p.teamId === 2)!;
assert.deepEqual([b2.gp, b2.wins, b2.losses], [2, 1, 1]);
near(b2.ortg, 102.5); near(b2.drtg, 102.5); near(b2.net, 0);
// League average is now (110+100+105+95)/4 = 102.5.
near(b2.relOff, 0); near(b2.relDef, 0);
// Relative offense and defense net to zero across the league, weighted by possessions.
near(day2.reduce((s, p) => s + p.relOff * p.gp, 0), 0);
near(day2.reduce((s, p) => s + p.relDef * p.gp, 0), 0);
// The last-N view keeps only each team's latest N games.
const recent = landscape(games, '2026-10-22', 1);
near(recent.find((p) => p.teamId === 2)!.ortg, 105);
assert.equal(recent.find((p) => p.teamId === 2)!.gp, 1);
// A date before anyone played is an empty chart, not a crash.
assert.deepEqual(landscape(games, '2026-10-01'), []);

// --- Title marks ---------------------------------------------------------------------
const marks = (w: number, l: number, srs: number | null, seed: number | null) => titleMarks({ wins: w, losses: l }, srs, seed, cfg);
assert.deepEqual(marks(8, 3, 5.2, 2), { pace: true, srs: true, seed: true, count: 3 });
assert.equal(marks(6, 3, 5, 1).pace, false, 'under ten games: too early to call a pace');
assert.equal(marks(7, 4, 0, 9).pace, false, '7-4 is under two wins in three');
assert.equal(marks(40, 19, 0, 9).pace, true, '40 wins before 20 losses, settled');
assert.equal(marks(45, 20, 0, 9).pace, false, 'the 20th loss came first: 39-20 at best, settled');
assert.equal(marks(41, 30, 0, 9).pace, false, 'a 40-win team that lost 20 first');
assert.equal(marks(10, 2, 3.99, 4).count, 1);
assert.equal(marks(10, 2, null, null).count, 1, 'no SRS or seed on record counts as not met');

// --- Next five ---------------------------------------------------------------------
const net = new Map([[1, 6], [2, 0], [3, -6]]);
// Team 2 hosts the weak team twice and visits it once: an easy stretch.
const easy = schedule(2, [{ homeId: 2, awayId: 3 }, { homeId: 2, awayId: 3 }, { homeId: 3, awayId: 2 }], net, 2, cfg)!;
assert.deepEqual([easy.games, easy.home, easy.away], [3, 2, 1]);
// Opponent net, venue-adjusted: (-6 - 2.5) twice at home, (-6 + 2.5) once away.
near(easy.oppNet, (-8.5 - 8.5 - 3.5) / 3);
assert.equal(easy.level, 'easy');
const hard = schedule(2, [{ homeId: 1, awayId: 2 }], net, 2, cfg)!;
near(hard.oppNet, 8.5);
assert.equal(hard.level, 'hard');
// Playing an easy stretch at its own level pushes a team's raw rating up; a hard one pulls it down.
assert.ok(easy.push > 0 && hard.push < 0);
// After 2 games, 3 more at +6.83 against expectation move the average by 6.83 * 3 / 5.
near(easy.push, (20.5 / 3) * 3 / 5);
assert.equal(schedule(2, [], net, 2, cfg), null, 'nothing scheduled');
// Only the first five count.
assert.equal(schedule(2, Array(8).fill({ homeId: 2, awayId: 3 }), net, 2, cfg)!.games, 5);

console.log('title-zone: all checks passed');
