/**
 * Label placement for scatter charts. Every marker keeps its spot; labels are
 * placed around them in priority order and never overlap a marker or each
 * other. A label that cannot fit near its point is left out (the point is
 * still there to hover), so the chart never shows colliding text.
 */

export type LabelIn = {
  id: number | string;
  /** Marker center and radius, in pixels. */
  x: number;
  y: number;
  r: number;
  /** The label's box. */
  w: number;
  h: number;
  /** Higher is placed first. */
  priority: number;
};
export type Placed = { id: number | string; x: number; y: number; w: number; h: number; leader: boolean };

type Box = { x: number; y: number; w: number; h: number };
const hit = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Where a label may sit relative to its marker: beside it first, then a step away with a leader line. */
function candidates(p: LabelIn, gap: number): Box[] {
  const [l, r, t, b] = [p.x - p.r - gap - p.w, p.x + p.r + gap, p.y - p.r - gap - p.h, p.y + p.r + gap];
  const [cx, cy] = [p.x - p.w / 2, p.y - p.h / 2];
  return [
    { x: r, y: cy }, { x: l, y: cy }, { x: cx, y: t }, { x: cx, y: b },
    { x: r, y: t }, { x: r, y: b }, { x: l, y: t }, { x: l, y: b },
  ].map((c) => ({ ...c, w: p.w, h: p.h }));
}

// ponytail: every candidate is tested against every marker and placed label, O(n² · candidates). Fine for a
// few hundred points; switch to a grid index if a chart ever needs thousands.
export function placeLabels(points: LabelIn[], bounds: { width: number; height: number }): Placed[] {
  const markers: (Box & { id: LabelIn['id'] })[] = points.map((p) => ({ id: p.id, x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2 }));
  const placed: Placed[] = [];
  for (const p of [...points].sort((a, b) => b.priority - a.priority)) {
    for (const [gap, leader] of [[2, false], [14, true], [26, true]] as const) {
      const spot = candidates(p, gap).find(
        (c) =>
          c.x >= 0 && c.y >= 0 && c.x + c.w <= bounds.width && c.y + c.h <= bounds.height &&
          !markers.some((m) => hit(c, m)) && !placed.some((o) => hit(c, o)),
      );
      if (spot) {
        placed.push({ id: p.id, ...spot, leader });
        break;
      }
    }
  }
  return placed;
}
