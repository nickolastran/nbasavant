/** Self-check for chart label placement: `npm test`. */
import assert from 'node:assert/strict';
import { type LabelIn, placeLabels } from './labels';

const hit = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// A lone point gets its label right beside it, no leader line.
const lone = placeLabels([{ id: 1, x: 100, y: 100, r: 10, w: 60, h: 12, priority: 1 }], { width: 400, height: 300 });
assert.equal(lone.length, 1);
assert.equal(lone[0].leader, false);
assert.ok(Math.abs(lone[0].x - 100) < 80 && Math.abs(lone[0].y - 100) < 30);

// 150 points on a deterministic scatter, crowded in the middle like real percentile data.
let seed = 42;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pts: LabelIn[] = Array.from({ length: 150 }, (_, i) => ({
  id: i, x: 400 + (rnd() + rnd() - 1) * 380, y: 300 + (rnd() + rnd() - 1) * 280, r: 9, w: 40 + Math.floor(rnd() * 50), h: 12, priority: rnd(),
}));
const top = pts.reduce((a, b) => (b.priority > a.priority ? b : a));
const bounds = { width: 800, height: 600 };
const placed = placeLabels(pts, bounds);
const byId = new Map(pts.map((p) => [p.id, p]));

assert.ok(placed.length >= 40, `expected a useful number of labels, got ${placed.length}`);
assert.ok(placed.some((l) => l.id === top.id), 'the highest-priority point is labelled');
for (const l of placed) {
  assert.ok(l.x >= 0 && l.y >= 0 && l.x + l.w <= bounds.width && l.y + l.h <= bounds.height, 'a label stays inside the chart');
}
// No label overlaps another label.
for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) assert.ok(!hit(placed[i], placed[j]), `labels ${placed[i].id} and ${placed[j].id} overlap`);
// No label covers a marker, its own included.
for (const l of placed) for (const p of pts) {
  assert.ok(!hit(l, { x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2 }), `label ${l.id} covers marker ${p.id}`);
}
// A label that had to move away from its point says so, so the chart can draw a leader line.
for (const l of placed) {
  const p = byId.get(l.id)!;
  const gap = Math.max(l.x - (p.x + p.r), p.x - p.r - (l.x + l.w), l.y - (p.y + p.r), p.y - p.r - (l.y + l.h));
  assert.equal(l.leader, gap > 6, `leader flag for ${l.id} (gap ${gap.toFixed(1)})`);
}
// Nothing to place, nothing returned.
assert.deepEqual(placeLabels([], bounds), []);

console.log('labels: all checks passed');
