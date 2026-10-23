/**
 * Self-check for the data feeds: `npm test`. Covers the player matcher, the
 * NBA feed mappers (against a real game, 2026 Finals Game 1) and the
 * basketball-reference parsers. Every expected value is a literal read off the
 * source, never recomputed with the code under test.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { legacyId, matcher, normName, resolvePlayer } from './identity';
import { benchReason, clockParts, gameKind, inches, lineOf, logsFromBox, minutesPlayed, playsFromPbp, shotsFromPbp, topOf } from './nba';
import { alignment, cupFinal, nn, pctOf, seasonLine, seasonPath, teamIdFor } from './bref';
import { localTip, shiftDay, tipAt, todayEt } from './dates';
import { displayName, rowsFromWords, type Word } from './injuries';

const near = (a: number, b: number, eps: number, msg: string) =>
  assert.ok(Math.abs(a - b) < eps, `${msg} expected ~${b}, got ${a}`);
const fixture = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));

// --- Names ------------------------------------------------------------------
assert.equal(normName('Nikola Jokić'), 'nikola jokic', 'accents');
assert.equal(normName('Ömer Aşık'), 'omer asik', 'dotless i does not decompose on its own');
assert.equal(normName('Tibor Pleiß'), 'tibor pleiss', 'eszett');
assert.equal(normName('Jaren Jackson Jr.'), 'jaren jackson', 'suffix');
assert.equal(normName('Gary Payton II'), 'gary payton', 'roman suffix');
assert.equal(normName("D'Angelo Russell"), 'dangelo russell', 'apostrophe');
assert.equal(normName('J.R. Smith'), 'jr smith', 'initials that spell a suffix are still a first name');
assert.equal(normName('Kenny Anderson Jr'), 'kenny anderson', 'suffix without a period');

// --- Matching basketball-reference players to NBA person ids -----------------
const match = matcher([
  { id: 203999, first: 'Nikola', last: 'Jokic', from: 2015, to: 2026 },
  { id: 201600, first: 'Omer', last: 'Asik', from: 2010, to: 2017 },
  { id: 201168, first: 'Yue', last: 'Sun', from: 2008, to: 2008 },
  { id: 202419, first: 'Chris', last: 'Johnson', from: 2010, to: 2012 },
  { id: 203187, first: 'Chris', last: 'Johnson', from: 2012, to: 2016 },
  { id: 1641842, first: 'Ronald', last: 'Holland II', from: 2024, to: 2026 },
  { id: 1630200, first: 'Tre', last: 'Jones', from: 2020, to: 2026 },
  { id: 1630999, first: 'Trevon', last: 'Jones', from: 2020, to: 2021 },
  { id: 76900, first: 'George', last: 'Johnson', from: 1970, to: 1985 },
  { id: 2403, first: ' ', last: 'Nene', from: 2002, to: 2018 },
  { id: 2747, first: 'JR', last: 'Smith', from: 2004, to: 2019 },
]);
assert.equal(match('Nikola Jokić', 2015, 2025), 203999, 'plain match');
assert.equal(match('Ömer Aşık', 2010, 2017), 201600, 'match through normalization');
assert.equal(match('Sun Yue', 2008, 2008), 201168, 'family name first');
assert.equal(match('Chris Johnson', 2010, 2012), 202419, 'namesakes: most overlapping seasons wins');
assert.equal(match('Chris Johnson', 2012, 2015), 203187, 'the other namesake');
assert.equal(match('Chris Johnson', 2012, 2012), null, 'a stint in the one shared season is ambiguous');
assert.equal(match('Ron Holland', 2024, 2025), 1641842, 'short first name, same surname and era');
assert.equal(match('Tre Jones', 2020, 2025), 1630200, 'an exact name beats a nickname match');
assert.equal(match('George Johnson', 1950, 1951), null, 'right name, wrong era');
assert.equal(match('Nobody Atall', 2000, 2001), null, 'no candidate');
assert.equal(match('Nenê', 2002, 2018), 2403, 'one name only: the NBA files him with a blank first name');
assert.equal(match('J.R. Smith', 2004, 2019), 2747, 'initials as a first name');

// Unmatched players keep the id the old ingest gave them, so their URLs survive.
assert.equal(legacyId('jamesle01'), 306736137, 'legacy hash is unchanged');
assert.deepEqual(
  resolvePlayer('murrara01', 'Ronald Murray', 2002, 2009, match, { murrara01: 2436 }),
  { id: 2436, matched: true },
  'an override beats the matcher',
);
assert.deepEqual(
  resolvePlayer('jamesle01', 'Nobody Atall', 2003, 2025, match, {}),
  { id: 306736137, matched: false },
  'no match falls back to the legacy id',
);

// --- NBA feed: game kinds, clocks, bios ----------------------------------------
assert.deepEqual(
  ['0012600001', '0022600001', '0032600001', '0042500401', '0052600001', '0062600001'].map(gameKind),
  ['preseason', 'regular', 'all-star', 'playoffs', 'play-in', 'cup-final'],
  'game id prefixes',
);
assert.deepEqual(clockParts('PT11M45.00S'), { min: 11, sec: 45 }, 'game clock');
assert.deepEqual(clockParts('PT00M05.30S'), { min: 0, sec: 5 }, 'tenths are dropped');
near(minutesPlayed('PT36M01.00S'), 36.0167, 0.001, 'minutes played');
assert.equal(minutesPlayed(''), 0, 'no clock, no minutes');
assert.equal(inches('6-8'), 80, 'height');
assert.equal(inches(''), null, 'unknown height');
assert.deepEqual(
  ['DND_INJURY', 'INACTIVE_INJURY', 'DNP_COACH', 'INACTIVE_GLEAGUE_TWOWAY', undefined].map(benchReason),
  ['did not dress, injury', 'inactive, injury', "coach's decision", 'inactive, gleague twoway', null],
  'why a player sat, in words',
);

// --- NBA feed: box score -> game logs --------------------------------------------
const box = fixture('boxscore_0042500401.json').game;
const logs = logsFromBox(box);
assert.equal(logs.length, 20, 'ten who played per side; the rest never checked in');
const scored = (teamId: number) => logs.filter((l) => l.teamId === teamId).reduce((s, l) => s + l.pts, 0);
assert.equal(scored(1610612759), 95, 'Spurs points add up to the Spurs score');
assert.equal(scored(1610612752), 105, 'Knicks points add up to the Knicks score');
assert.equal(logs.filter((l) => l.started).length, 10, 'five starters a side');
assert.deepEqual(lineOf(box.homeTeam), [27, 28, 21, 19], 'Spurs by quarter');
assert.deepEqual(lineOf(box.awayTeam), [19, 29, 28, 29], 'Knicks by quarter');
assert.deepEqual(topOf(box.homeTeam), { playerId: 1641705, name: 'Victor Wembanyama', jersey: '1', pts: 26, reb: 12, ast: 2 }, 'Spurs top performer');
assert.equal(topOf(box.awayTeam)?.name, 'Jalen Brunson', 'Knicks top performer: most points');
const team = (...ls: [string, number, number, number][]) => ({
  players: ls.map(([n, points, reboundsTotal, assists], i) => ({ personId: i, firstName: n, familyName: '', statistics: { points, reboundsTotal, assists } })),
});
assert.equal(topOf(team(['triple', 29, 15, 10], ['scorer', 31, 2, 2]))?.name, 'scorer', '30+ points beats a bigger all-round line');
assert.equal(topOf(team(['thirty', 30, 1, 1], ['forty', 40, 1, 1]))?.name, 'forty', 'two 30-point scorers: the bigger one');
assert.equal(topOf(team(['triple', 29, 15, 10], ['scorer', 28, 2, 2]))?.name, 'triple', 'under 30: points + rebounds + assists');
assert.equal(topOf(team(['a', 20, 5, 5], ['b', 22, 4, 4]))?.name, 'b', 'P+R+A tie goes to the scorer');
assert.equal(topOf({ players: [] }), null, 'nobody played');
const vassell = logs.find((l) => l.playerId === 1630170)!;
assert.deepEqual(
  [vassell.pts, vassell.fgm, vassell.fga, vassell.ast, vassell.plusMinus, vassell.teamId],
  [9, 4, 11, 3, -13, 1610612759],
  'one real line, field by field',
);
near(vassell.min, 36.0167, 0.001, 'his minutes');
assert.deepEqual(
  [vassell.firstName, vassell.lastName, vassell.jersey, vassell.position],
  ['Devin', 'Vassell', '24', 'SF'],
  'enough to create a player the DB has never seen',
);

// --- NBA feed: play-by-play -> shots ----------------------------------------------
const pbp = fixture('playbyplay_0042500401.json').game;
const shots = shotsFromPbp(pbp);
assert.equal(shots.length, 94 + 89, 'every field goal attempt in the box score, and nothing else');
assert.equal(shots.filter((s) => s.made).length, 39 + 32, 'makes match the box score');
assert.equal(shots.filter((s) => s.value === 3).length, 36 + 43, 'threes attempted');
assert.equal(shots.filter((s) => s.value === 3 && s.made).length, 11 + 11, 'threes made');
assert.deepEqual(
  shots[0],
  {
    eventNum: 7, playerId: 1628973, teamId: 1610612752, x: 5, y: 260, distanceFt: 26,
    made: true, value: 3, zone: 'Above the Break 3', zoneArea: 'Center(C)',
    actionType: 'Jump Shot', period: 1, minsLeft: 11, secsLeft: 45,
  },
  "Brunson's opening three",
);
// Left and right must agree with the NBA's own labels, or every corner three
// on the site lands in the wrong corner.
for (const label of ['Left Corner 3', 'Right Corner 3', 'Above the Break 3']) {
  const theirs = pbp.actions.filter((a: any) => a.isFieldGoal === 1 && a.area === label);
  const ours = theirs.map((a: any) => shots.find((s) => s.eventNum === a.actionNumber)!.zone);
  assert.ok(theirs.length > 0, `fixture has ${label} attempts`);
  assert.deepEqual([...new Set(ours)], [label], `${label} lands in the same zone`);
}

// --- NBA feed: play-by-play -> plays ------------------------------------------------
const plays = playsFromPbp(pbp);
assert.equal(plays.length, pbp.actions.length, 'one play per action');
assert.deepEqual(
  (({ period, clock, description, eventType, teamAbbr, homeScore, awayScore, shot }) =>
    ({ period, clock, description, eventType, teamAbbr, homeScore, awayScore, shot }))(plays[0]),
  { period: 1, clock: '12:00', description: 'Period Start', eventType: 'PERIOD', teamAbbr: '', homeScore: 0, awayScore: 0, shot: null },
  'period start',
);
assert.ok(
  plays.filter((p) => p.shot).every((p) => p.type === '2pt' || p.type === '3pt'),
  'only field goals carry a shot spot',
);
assert.deepEqual(
  [plays[2].eventType, plays[2].teamAbbr, plays[2].awayScore, plays[2].homeScore],
  ['SHOT', 'NYK', 3, 0],
  'a made three reads as a shot, with the score after it',
);
assert.equal(
  plays.filter((p) => p.eventType === 'SHOT' || p.eventType === 'MISS').length,
  183,
  'made and missed field goals',
);
assert.equal(plays.filter((p) => p.eventType === 'FREE THROW').length, 43, 'free throws have their own type');

// --- basketball-reference -------------------------------------------------------------
assert.equal(nn(''), null, 'blank cell is unknown, not zero');
assert.equal(nn(undefined), null, 'missing column is unknown');
assert.equal(nn('0'), 0, 'a real zero stays zero');
assert.equal(nn('+6.1'), 6.1, 'signed');
near(pctOf('.402')!, 40.2, 1e-9, 'percent');
assert.equal(pctOf(''), null, 'blank percent');

assert.deepEqual([seasonPath(1947), seasonPath(1949), seasonPath(1950)], ['BAA_1947', 'BAA_1949', 'NBA_1950'], 'league prefix');

assert.equal(teamIdFor('BRK'), 1610612751, 'Brooklyn');
assert.equal(teamIdFor('CHH'), 1610612766, 'the 1990s Hornets are the Charlotte franchise');
assert.equal(teamIdFor('WSB'), 1610612764, 'the Bullets are the Wizards, same city');
assert.notEqual(teamIdFor('MNL'), teamIdFor('LAL'), 'Minneapolis keeps its own row');
assert.throws(() => teamIdFor('XYZ'), /XYZ/, 'an unknown team fails loudly instead of dropping players');

// Standings markup, trimmed from the real 1949-50 and 1974-75 league pages.
const aligned = alignment(`
<table id="divs_standings_"><thead><tr><th data-stat="team_name">Team</th></tr></thead><tbody>
<tr class='thead'><th colspan='8'><strong>Central Division</strong></th></tr>
<tr class="full_table"><th data-stat="team_name"><a href="/teams/MNL/1950.html">Minneapolis Lakers</a>*</th><td data-stat="wins">51</td></tr>
<tr class='thead'><th colspan='8'><strong>Eastern Division</strong></th></tr>
<tr class="full_table"><th data-stat="team_name"><a href="/teams/SYR/1950.html">Syracuse Nationals</a>*</th><td data-stat="wins">51</td></tr>
</tbody></table>
<table id="confs_standings_E"><thead><tr><th data-stat="team_name">Eastern Conference</th></tr></thead><tbody>
<tr class="full_table"><th data-stat="team_name"><a href="/teams/BOS/1975.html">Boston Celtics</a>*</th><td data-stat="wins">60</td></tr>
</tbody></table>
<table id="divs_standings_E"><thead><tr><th data-stat="team_name">Eastern Conference</th></tr></thead><tbody>
<tr class='thead'><th colspan='8'><strong>Atlantic Division</strong></th></tr>
<tr class="full_table"><th data-stat="team_name"><a href="/teams/BOS/1975.html">Boston Celtics</a>*</th><td data-stat="wins">60</td></tr>
</tbody></table>`);
assert.deepEqual(aligned.get('MNL'), { name: 'Minneapolis Lakers', conference: null, division: 'Central' }, 'before conferences');
assert.deepEqual(aligned.get('SYR'), { name: 'Syracuse Nationals', conference: null, division: 'Eastern' }, 'second division');
assert.deepEqual(aligned.get('BOS'), { name: 'Boston Celtics', conference: 'East', division: 'Atlantic' }, 'conference and division');

// Joe Fulks, 1946-47: the BAA kept no minutes, rebounds, steals or turnovers.
assert.deepEqual(
  seasonLine({ games: '60', fg: '475', fga: '1557', ft: '439', fta: '601', ast: '25', pf: '199', pts: '1389' }),
  {
    gp: 60, gs: null, min: null, pts: 1389, reb: null, oreb: null, dreb: null, ast: 25,
    stl: null, blk: null, tov: null, pf: 199, fgm: 475, fga: 1557, fg3m: null, fg3a: null,
    ftm: 439, fta: 601,
  },
  'untracked stats are null',
);
assert.deepEqual(
  seasonLine({
    games: '79', games_started: '79', mp: '2927', fg: '738', fga: '1522', fg3: '36', fg3a: '144',
    ft: '430', fta: '554', orb: '236', drb: '402', trb: '638', ast: '453', stl: '131', blk: '33',
    tov: '210', pf: '215', pts: '1942',
  }),
  {
    gp: 79, gs: 79, min: 2927, pts: 1942, reb: 638, oreb: 236, dreb: 402, ast: 453,
    stl: 131, blk: 33, tov: 210, pf: 215, fgm: 738, fga: 1522, fg3m: 36, fg3a: 144,
    ftm: 430, fta: 554,
  },
  'a full modern line',
);

// The NBA Cup final is the season's last Cup game and doesn't count in the standings.
assert.equal(
  cupFinal([
    { date_game_csk: '202412140MIL', game_remarks: 'NBA Cup' },
    { date_game_csk: '202412150IND', game_remarks: '' },
    { date_game_csk: '202412170OKC', game_remarks: 'NBA Cup' },
    { date_game_csk: '202412190DET', game_remarks: '' },
  ]),
  '202412170OKC',
  'last Cup game',
);
assert.equal(cupFinal([{ date_game_csk: '201012150BOS', game_remarks: '' }]), null, 'no Cup before 2023-24');

// --- The NBA's calendar ------------------------------------------------------------
// 9:30 pm in New York is already the next day in UTC; the scoreboard must not
// jump to tomorrow's slate in the middle of tonight's games.
assert.equal(todayEt(new Date('2026-10-21T01:30:00Z')), '2026-10-20', 'evening games stay on their ET date');
assert.equal(todayEt(new Date('2026-10-20T16:00:00Z')), '2026-10-20', 'midday');
assert.equal(todayEt(new Date('2027-01-15T04:59:00Z')), '2027-01-14', 'standard time, just before midnight ET');
assert.equal(localTip('2026-10-21', '7:30 pm ET', 'America/Los_Angeles'), '4:30 pm PDT', 'daylight time');
assert.equal(localTip('2027-01-15', '10:00 pm ET', 'Europe/London'), '3:00 am GMT', 'standard time, crosses midnight');
assert.equal(localTip('2027-01-15', '12:00 pm ET', 'America/New_York'), '12:00 pm EST', 'noon');
assert.equal(localTip('2027-01-15', 'Final/OT'), 'Final/OT', 'non-times pass through');
assert.equal(tipAt('2026-10-23', '10:00 pm ET')?.toISOString(), '2026-10-24T02:00:00.000Z', 'a late tip sorts after an early one');
assert.equal(shiftDay('2026-10-31', 1), '2026-11-01', 'next day across a month');
assert.equal(shiftDay('2026-11-01', -1), '2026-10-31', 'previous day');

// --- NBA injury report (PDF words -> rows) ---------------------------------------------
// The real layout in miniature: header on page 1 only, a two-line reason, a team
// that hasn't filed, and a reason that runs over the page break.
const w = (x: number, y: number, str: string): Word => ({ x, y, str });
const header = ['Game', 'Matchup', 'Team', 'Player', 'Current', 'Reason'].map((s, i) => w([23, 200, 264, 425, 586, 666][i], 480, s));
const injuryRows = rowsFromWords([
  [
    w(289, 533, 'Injury'), ...header,
    w(24, 452, '10/22/2026'), w(201, 452, 'CLE@PHI'), w(265, 452, 'Cleveland'), w(307, 452, 'Cavaliers'),
    w(426, 452, 'Allen,'), w(451, 452, 'Jarrett'), w(587, 452, 'Available'),
    w(667, 459, 'Injury/Illness'), w(722, 459, '-'), w(727, 459, 'Right'), w(667, 445, 'Tendinopathy'),
    w(426, 416, 'Udeh,'), w(453, 416, 'Jr.,'), w(467, 416, 'Ernest'), w(587, 416, 'Out'),
    w(667, 416, 'G'), w(676, 416, 'League'), w(707, 416, '-'), w(712, 416, 'Two-'), w(732, 416, 'Way'),
    w(265, 380, 'Philadelphia'), w(317, 380, '76ers'), w(667, 380, 'NOT'), w(690, 380, 'YET'), w(710, 380, 'SUBMITTED'),
    w(201, 340, 'DEN@OKC'), w(265, 340, 'Denver'), w(307, 340, 'Nuggets'),
    w(426, 340, 'Jones,'), w(455, 340, 'Spencer'), w(587, 340, 'Questionable'), w(667, 347, 'Injury/Illness'), w(722, 347, '-'), w(727, 347, 'Bilateral'),
    w(399, 50, 'Page'),
  ],
  [w(289, 533, 'Injury'), w(667, 506, 'Hamstring'), w(426, 477, 'Topic,'), w(453, 477, 'Nikola'), w(587, 477, 'Out'), w(667, 477, 'Rest')],
]);
assert.deepEqual(
  injuryRows.map((r) => [r.matchup, r.team, r.name, r.status, r.reason]),
  [
    ['CLE@PHI', 'CLE', 'Jarrett Allen', 'Available', 'Injury/Illness - Right Tendinopathy'],
    ['CLE@PHI', 'CLE', 'Ernest Udeh Jr.', 'Out', 'G League - Two-Way'],
    ['DEN@OKC', 'DEN', 'Spencer Jones', 'Questionable', 'Injury/Illness - Bilateral Hamstring'],
    ['DEN@OKC', 'DEN', 'Nikola Topic', 'Out', 'Rest'],
  ],
  'injury report: carry-down, wrapped and spilled reasons, unfiled teams skipped, DEN not the 1949 Nuggets',
);
assert.equal(injuryRows[0].date, '10/22/2026', 'report date carries');
assert.equal(displayName('Butler III, Jimmy'), 'Jimmy Butler III', 'suffix after the surname');

console.log('feeds: all checks passed');
