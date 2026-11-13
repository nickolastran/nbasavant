/** Self-check for the AdvancedTable's URL state: `npm test`. */
import assert from 'node:assert/strict';
import { type TableState, applyFilters, decodeState, encodeState } from './table-state';

const defaults: TableState = { sort: [{ id: 'ppg', desc: true }], preset: null, cols: null, filters: [], q: '', shade: true };

// Defaults leave the URL alone, and other params (the page's own filters) survive.
assert.equal(encodeState(defaults, new URLSearchParams('season=2026-27'), defaults).toString(), 'season=2026-27');

// A full state round-trips through the URL.
const state: TableState = {
  sort: [{ id: 'tsPct', desc: true }, { id: 'tov', desc: false }],
  preset: 'shooting',
  cols: null,
  filters: [{ key: 'min', op: 'gte', value: '200' }, { key: 'team', op: 'eq', value: 'BOS' }, { key: 'bpm', op: 'lte', value: '-1.5' }],
  q: 'jay son',
  shade: false,
};
const url = encodeState(state, new URLSearchParams('season=2026-27'), defaults);
assert.equal(url.get('season'), '2026-27');
assert.deepEqual(decodeState(new URLSearchParams(url.toString()), defaults), state);

// A custom column set round-trips, and wins over a preset.
const custom = { ...defaults, cols: ['ppg', 'rpg'] };
assert.deepEqual(decodeState(encodeState(custom, new URLSearchParams(), defaults), defaults), custom);

// Going back to the defaults clears what an earlier state wrote.
assert.equal(encodeState(defaults, url, defaults).toString(), 'season=2026-27');

// Junk in the URL is dropped, not thrown on: unknown op, missing value, empty sort id.
const junk = decodeState(new URLSearchParams('sort=,ppg.sideways&f=ppg.between.3,rpg.gte,apg.gte.x,team.eq.LAL&shade=maybe'), defaults);
assert.deepEqual(junk.sort, [{ id: 'ppg', desc: true }]);
assert.deepEqual(junk.filters, [{ key: 'team', op: 'eq', value: 'LAL' }]);
assert.equal(junk.shade, true);

// Filtering rows.
const rows = [
  { player: 'Jayson Tatum', team: 'BOS', ppg: 26.5, bpm: 5.8 },
  { player: 'Jaylen Brown', team: 'BOS', ppg: 22.1, bpm: null },
  { player: 'Luka Dončić', team: 'LAL', ppg: 39.3, bpm: 12.3 },
];
const names = (r: typeof rows) => r.map((x) => x.player);
assert.deepEqual(names(applyFilters(rows, [{ key: 'ppg', op: 'gte', value: '25' }], '', 'player')), ['Jayson Tatum', 'Luka Dončić']);
assert.deepEqual(names(applyFilters(rows, [{ key: 'team', op: 'eq', value: 'bos' }], '', 'player')), ['Jayson Tatum', 'Jaylen Brown']);
// A blank stat never passes a numeric filter: "BPM at most 6" must not list a player with no BPM.
assert.deepEqual(names(applyFilters(rows, [{ key: 'bpm', op: 'lte', value: '6' }], '', 'player')), ['Jayson Tatum']);
// Search ignores case and accents.
assert.deepEqual(names(applyFilters(rows, [], 'doncic', 'player')), ['Luka Dončić']);
assert.deepEqual(names(applyFilters(rows, [{ key: 'ppg', op: 'gte', value: '20' }], 'jay', 'player')), ['Jayson Tatum', 'Jaylen Brown']);
assert.equal(applyFilters(rows, [], '', 'player').length, 3);

// A table whose default is a preset: choosing "all columns" (no preset) must survive the URL too.
const withPreset: TableState = { ...defaults, preset: 'overview' };
const all = { ...withPreset, preset: null };
assert.equal(encodeState(all, new URLSearchParams(), withPreset).get('preset'), 'all');
assert.deepEqual(decodeState(encodeState(all, new URLSearchParams(), withPreset), withPreset), all);
assert.equal(encodeState(withPreset, new URLSearchParams(), withPreset).toString(), '');
assert.equal(decodeState(new URLSearchParams(), withPreset).preset, 'overview');

console.log('table-state: all checks passed');
