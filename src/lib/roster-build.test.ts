/** Self-check for Build-a-Roster's projection: `npm test`. */
import assert from 'node:assert/strict';
import { type Pick, MAX_MPG, SKILLS, allocate, project } from './roster-build';

const near = (a: number | null, b: number, eps = 0.01, msg = '') => assert.ok(a !== null && Math.abs(a - b) < eps, `${msg} expected ~${b}, got ${a}`);
const pick = (id: number, mpg: number, obpm = 0, dbpm = 0, skill: number | null = 50): Pick =>
  ({ id, mpg, obpm, dbpm, skills: Object.fromEntries(SKILLS.map((s) => [s, skill])) as Pick['skills'] });

// Eight equal players split a game's 240 minutes evenly.
const even = allocate(Array.from({ length: 8 }, (_, i) => pick(i, 30)));
for (const m of even.values()) near(m, 30);
// Minutes follow real roles, always add up to 240, and nobody passes the cap.
const mixed = allocate([pick(1, 38), pick(2, 36), pick(3, 34), pick(4, 30), pick(5, 28), pick(6, 20), pick(7, 12), pick(8, 8), pick(9, 5)]);
near([...mixed.values()].reduce((a, b) => a + b, 0), 240);
assert.ok([...mixed.values()].every((m) => m <= MAX_MPG + 1e-9));
assert.ok(mixed.get(1)! > mixed.get(6)! && mixed.get(6)! > mixed.get(9)!);
// Eight starters who each play 36 a night can't all keep it: the cap holds and the total is still 240.
const heavy = allocate(Array.from({ length: 8 }, (_, i) => pick(i, 36)));
near([...heavy.values()].reduce((a, b) => a + b, 0), 240);
// Too few players to cover 240 minutes under the cap: everyone is capped and the shortfall is reported, not hidden.
const six = allocate(Array.from({ length: 6 }, (_, i) => pick(i, 30)));
for (const m of six.values()) near(m, MAX_MPG);

// Projection: five +2 offensive players on the floor at all times make a +10 offense.
const p = project(Array.from({ length: 8 }, (_, i) => pick(i, 30, 2, -1, 60)))!;
near(p.relOff, 10); near(p.relDef, -5); near(p.net, 5);
near(p.coverage.shooting, 60);
// A star's rating counts in proportion to his minutes.
const star = project([pick(1, 36, 8, 0), ...Array.from({ length: 7 }, (_, i) => pick(i + 2, 28, 0, 0))])!;
near(star.relOff, (8 * star.minutes.get(1)!) / 48);
// A skill nobody has a number for is empty; one some have is averaged over those who do.
const part = project([pick(1, 30, 0, 0, 80), ...Array.from({ length: 7 }, (_, i) => pick(i + 2, 30, 0, 0, null))])!;
near(part.coverage.creation, 80);
assert.equal(project(Array.from({ length: 8 }, (_, i) => pick(i, 30, 0, 0, null)))!.coverage.creation, null);
// Nothing picked, nothing projected.
assert.equal(project([]), null);

console.log('roster-build: all checks passed');
