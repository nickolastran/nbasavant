/** Self-check for the derived leaderboard metrics: `npm test`. Formulas are documented in docs/METRICS.md. */
import assert from 'node:assert/strict';
import { astTo, ftRate, per100, per36, srs, threePAr, zoneGroup, zoneProfile } from './metrics';

const near = (a: number | null, b: number, eps = 0.01, msg = '') =>
  assert.ok(a !== null && Math.abs(a - b) < eps, `${msg} expected ~${b}, got ${a}`);

// Per 36: 600 points in 900 minutes is 24 per 36.
near(per36(600, 900), 24, 0.001, 'per 36');
assert.equal(per36(10, 0), null, 'no minutes is no rate, not Infinity');
assert.equal(per36(null, 900), null, 'an unrecorded stat stays empty');

// Per 100 possessions: at a pace of 100, 48 minutes is 100 team possessions, so a
// player with 30 points in 48 minutes scores 30 per 100; at pace 96 it is 31.25.
near(per100(30, 48, 100), 30, 0.001, 'per 100 at pace 100');
near(per100(30, 48, 96), 31.25, 0.001, 'per 100 at pace 96');
assert.equal(per100(30, 0, 100), null);
assert.equal(per100(30, 48, null), null, 'no pace on record');

// Rates.
near(threePAr(8, 20), 0.4, 0.001, '3PAr');
near(ftRate(6, 20), 0.3, 0.001, 'FTr');
assert.equal(threePAr(null, 20), null, 'before the three-point line');
assert.equal(ftRate(5, 0), null);
near(astTo(300, 120), 2.5, 0.001, 'AST/TO');
assert.equal(astTo(10, 0), null, 'no turnovers: undefined, not Infinity');

// SRS is average margin plus strength of schedule.
near(srs(820, 656, 82, 0.35), 2.35, 0.001, 'SRS');
assert.equal(srs(100, 90, 0, 0), null, 'no games');
assert.equal(srs(100, 90, 10, null), null, 'no schedule strength on record');

// Zones: seven chart zones fold into the five the leaderboards use.
assert.equal(zoneGroup('Restricted Area'), 'rim');
assert.equal(zoneGroup('In The Paint (Non-RA)'), 'shortMid');
assert.equal(zoneGroup('Mid-Range'), 'shortMid');
assert.equal(zoneGroup('Long Mid-Range'), 'longMid');
assert.equal(zoneGroup('Left Corner 3'), 'corner3');
assert.equal(zoneGroup('Right Corner 3'), 'corner3');
assert.equal(zoneGroup('Above the Break 3'), 'atb3');
assert.equal(zoneGroup('Backcourt'), null, 'heaves count toward no zone');

const profile = zoneProfile([
  { zone: 'Restricted Area', made: true, n: 30 },
  { zone: 'Restricted Area', made: false, n: 10 },
  { zone: 'Left Corner 3', made: true, n: 4 },
  { zone: 'Right Corner 3', made: false, n: 6 },
  { zone: 'Above the Break 3', made: false, n: 50 },
]);
near(profile.rim.freq, 40, 0.001, 'rim frequency');
near(profile.rim.fgPct, 75, 0.001, 'rim FG%');
near(profile.corner3.freq, 10, 0.001, 'corner frequency');
near(profile.corner3.fgPct, 40, 0.001, 'corner FG%');
near(profile.atb3.fgPct, 0, 0.001, 'ATB FG%');
assert.equal(profile.longMid.freq, 0);
assert.equal(profile.longMid.fgPct, null, 'no attempts: no percentage');
assert.equal(zoneProfile([]).rim.freq, null, 'no shots at all: no frequencies');

console.log('metrics: all checks passed');
