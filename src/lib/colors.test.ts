/** Self-check for the color helpers: `npm test`. */
import assert from 'node:assert/strict';
import { TEAMS } from '../../prisma/teams';
import { DIVERGING, contrastRatio, onColor, percentileColor, percentileStep } from './colors';

// WCAG reference pairs.
assert.equal(Math.round(contrastRatio('#000000', '#ffffff')), 21);
assert.equal(contrastRatio('#777777', '#777777'), 1);

// Every team color gets a text color that clears 4.5:1 on it.
for (const t of TEAMS) {
  const c = contrastRatio(t.primaryColor, onColor(t.primaryColor));
  assert.ok(c >= 4.5, `${t.abbreviation} ${t.primaryColor}: text contrast ${c.toFixed(2)}`);
}

// Percentile scale: blue at the bottom, gray in the middle, red at the top, and
// the number printed on each step stays readable.
assert.equal(percentileColor(0), DIVERGING[0]);
assert.equal(percentileColor(50), DIVERGING[2]);
assert.equal(percentileColor(100), DIVERGING[4]);
assert.equal(percentileStep(10), 0);
assert.equal(percentileStep(50), 2);
assert.equal(percentileStep(95), 4);
for (const hex of DIVERGING) assert.ok(contrastRatio(hex, onColor(hex)) >= 4.5, `step ${hex}`);
// Out-of-range input clamps instead of producing a bad color.
assert.equal(percentileColor(-5), DIVERGING[0]);
assert.equal(percentileColor(140), DIVERGING[4]);
assert.match(percentileColor(73), /^#[0-9a-f]{6}$/);

console.log('colors: all checks passed');
