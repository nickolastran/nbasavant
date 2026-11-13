/**
 * Derived leaderboard metrics that aren't in stats.ts: rate conversions, shot
 * rates, SRS and the five-zone shot profile. Pure functions, no database.
 * A stat the league didn't record is null in and null out. See docs/METRICS.md.
 */

type N = number | null | undefined;
const ratio = (a: N, b: N) => (a == null || !b ? null : a / b);

/** A season total as a per-36-minute rate. */
export const per36 = (total: N, min: N) => {
  const r = ratio(total, min);
  return r === null ? null : r * 36;
};

/**
 * A season total per 100 team possessions with him on the floor. His
 * possessions are estimated from his minutes at his team's pace (possessions
 * per 48), since box scores don't count possessions by player.
 */
export const per100 = (total: N, min: N, teamPace: N) => {
  const poss = teamPace == null || !min ? null : (teamPace * min) / 48;
  const r = ratio(total, poss);
  return r === null ? null : r * 100;
};

/** Three-point attempt rate: share of field goal attempts that are threes, 0 to 1. */
export const threePAr = (fg3a: N, fga: N) => ratio(fg3a, fga);

/** Free throw rate: free throw attempts per field goal attempt. */
export const ftRate = (fta: N, fga: N) => ratio(fta, fga);

/** Assists per turnover. */
export const astTo = (ast: N, tov: N) => ratio(ast, tov);

/** Simple Rating System: average point margin plus strength of schedule. */
export const srs = (pts: N, oppPts: N, gp: N, sos: N) => {
  const margin = pts == null || oppPts == null ? null : ratio(pts - oppPts, gp);
  return margin === null || sos == null ? null : margin + sos;
};

export const ZONE_GROUPS = ['rim', 'shortMid', 'longMid', 'corner3', 'atb3'] as const;
export type ZoneGroup = (typeof ZONE_GROUPS)[number];
export const ZONE_LABELS: Record<ZoneGroup, string> = {
  rim: 'Rim', shortMid: 'Short mid', longMid: 'Long mid', corner3: 'Corner 3', atb3: 'Above-break 3',
};

/**
 * The chart's zones folded into five: rim is the restricted area (4 ft),
 * short mid is the rest of the paint and mid-range out to 16 ft, long mid is
 * the rest inside the arc. Anything else (backcourt heaves) is in no group.
 */
export function zoneGroup(zone: string): ZoneGroup | null {
  if (zone === 'Restricted Area') return 'rim';
  if (zone === 'In The Paint (Non-RA)' || zone === 'Mid-Range') return 'shortMid';
  if (zone === 'Long Mid-Range') return 'longMid';
  if (zone.endsWith('Corner 3')) return 'corner3';
  if (zone === 'Above the Break 3') return 'atb3';
  return null;
}

/** Each zone's share of a shooter's attempts (percent of his grouped shots) and his FG% there. */
export function zoneProfile(counts: { zone: string; made: boolean; n: number }[]) {
  const tally = Object.fromEntries(ZONE_GROUPS.map((g) => [g, { fga: 0, fgm: 0 }])) as Record<ZoneGroup, { fga: number; fgm: number }>;
  let total = 0;
  for (const c of counts) {
    const g = zoneGroup(c.zone);
    if (!g) continue;
    tally[g].fga += c.n;
    if (c.made) tally[g].fgm += c.n;
    total += c.n;
  }
  return Object.fromEntries(
    ZONE_GROUPS.map((g) => [g, {
      fga: tally[g].fga,
      freq: total ? (tally[g].fga / total) * 100 : null,
      fgPct: tally[g].fga ? (tally[g].fgm / tally[g].fga) * 100 : null,
    }]),
  ) as Record<ZoneGroup, { fga: number; freq: number | null; fgPct: number | null }>;
}
