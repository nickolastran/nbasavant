/** Self-check for the bracket: `npm test`. */
import assert from 'node:assert/strict';
import { bracket, type BracketGame, type BracketTeam } from './bracket';

const teams = new Map<number, BracketTeam>();
const team = (id: number, abbr: string, conference: string | null, pct: number) =>
  teams.set(id, { id, abbr, name: abbr, color: '#000', conference, pct, divisionWinner: false });

let gid = 0;
/** A series from `day` on: home court to `home`, the wins in the order given. */
const series = (home: number, away: number, winners: number[], day: number): BracketGame[] =>
  winners.map((w, i) => ({
    id: ++gid, date: new Date(2006, 3, day + i), home, away, status: 'Final',
    homeScore: w === home ? 100 : 90, awayScore: w === home ? 90 : 100,
  }));
const sweep = (home: number, away: number, day: number) => series(home, away, [home, home, home, home], day);

// 2005-06 West: the Mavericks (60-22) were the 4 seed behind division winners Phoenix and Denver.
team(1, 'SAS', 'West', 0.768); team(2, 'DAL', 'West', 0.732); team(3, 'PHX', 'West', 0.659); team(4, 'DEN', 'West', 0.537);
team(5, 'SAC', 'West', 0.537); team(6, 'MEM', 'West', 0.598); team(7, 'LAC', 'West', 0.573); team(8, 'LAL', 'West', 0.549);
for (let i = 11; i <= 18; i++) team(i, `E${i - 10}`, 'East', 1 - (i - 10) / 10);

const firstRound = [
  ...sweep(1, 5, 20), ...sweep(2, 6, 20), ...sweep(3, 8, 20), ...series(4, 7, [7, 7, 7, 7], 20),
  ...sweep(11, 18, 20), ...sweep(14, 15, 20), ...sweep(13, 16, 20), ...sweep(12, 17, 20),
];

// Before the second round, seeds go by record.
let b = bracket(firstRound, teams, { live: true });
const west = () => b.halves!.find((h) => h.conference === 'West')!;
assert.deepEqual(west().rounds[0].map((s) => s!.top.team.abbr), ['SAS', 'DEN', 'PHX', 'DAL'], 'by record before round 2: slots 1, 4, 3, 2');
assert.equal(west().rounds[1][0], null, 'an unset series is a null slot');

// Once San Antonio draws Dallas, Dallas is the 4 seed and Phoenix/Denver the 2 and 3.
b = bracket([...firstRound, ...series(1, 2, [1, 2], 40)], teams, { live: true });
assert.deepEqual(west().rounds[0].map((s) => `${s!.top.seed}${s!.top.team.abbr}-${s!.bottom.seed}${s!.bottom.team.abbr}`),
  ['1SAS-8SAC', '4DAL-5MEM', '3DEN-6LAC', '2PHX-7LAL'], 'second round fixes the 4/5 slot');
const semi = west().rounds[1][0]!;
assert.deepEqual([semi.top.seed, semi.bottom.seed, semi.top.wins, semi.bottom.wins, semi.winner], [1, 4, 1, 1, null], 'tied series, live');
assert.equal(west().rounds[0][2]!.winner, 7, 'the 6 seed upset');
assert.deepEqual(west().rounds[1][1], null);

// A finished season's short series still has a winner.
const old = bracket(series(1, 2, [1, 2, 1], 1), teams, { live: false });
assert.equal(old.rounds[0][0].winner, 1, 'best-of-3 decided at 2 wins');
assert.equal(old.halves, null, 'not the 16-team format');
assert.equal(bracket(series(1, 2, [1, 2, 1], 1), teams, { live: true }).rounds[0][0].winner, null, 'live needs 4 wins');

// A bye: a team's first series is round 2 when its opponent already played one.
team(21, 'A', null, 0.6); team(22, 'B', null, 0.5); team(23, 'C', null, 0.7);
const bye = bracket([...series(21, 22, [21, 21], 1), ...series(23, 21, [23, 23], 10)], teams, { live: false });
assert.deepEqual(bye.rounds.map((r) => r.length), [1, 1], 'bye team joins in round 2');

console.log('bracket: all checks passed');

// A bye team's second series is round 3, not 2: rounds follow rounds, not series counts.
team(24, 'D', null, 0.4);
const byes = bracket([
  ...series(22, 24, [22, 22], 1), // round 1
  ...series(21, 22, [21, 21], 5), // round 2: A had a bye
  ...series(23, 21, [23, 23], 9), // round 3: C had two
], teams, { live: false });
assert.deepEqual(byes.rounds.map((r) => r.map((s) => s.top.team.abbr)), [['B'], ['A'], ['C']], 'byes skip rounds');
assert.equal(byes.finals?.winner, 23, 'a short format ends on its single last series');
console.log('bracket: bye checks passed');

// 2005-06: Denver (44-38) won its division and was the 3 seed; the Clippers (47-35) had home court.
teams.get(4)!.divisionWinner = true;
const div = bracket([...firstRound, ...series(1, 2, [1, 2], 40)], teams, { live: false, divisionSeeds: true });
const r1 = div.halves!.find((h) => h.conference === 'West')!.rounds[0];
assert.deepEqual([r1[2]!.top.seed, r1[2]!.top.team.abbr, r1[2]!.bottom.seed, r1[2]!.bottom.team.abbr], [3, 'DEN', 6, 'LAC'], 'division winner seeded above home court');
console.log('bracket: division seeding passed');
