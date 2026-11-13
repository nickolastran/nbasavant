/**
 * Lineup math for the lab: what any group of teammates did together, on/off
 * splits for one to three players, the with-or-without-you grid, and an
 * estimate for fives that have barely played. Pure functions over a team's
 * five-man units. See docs/METRICS.md.
 */
import { stintRatings } from './stats';

/** One five-man unit's season totals for a team: its stints summed. */
export type Unit = { players: number[]; seconds: number; pts: number; oppPts: number; poss: number; oppPoss: number } & Partial<Counts>;

/** Shooting, turnover, rebound and free-throw counts for both sides. Absent on stints saved before they were tracked. */
export type Counts = {
  fgm: number; fga: number; fg3m: number; ftm: number; fta: number; tov: number; oreb: number; dreb: number;
  oppFgm: number; oppFga: number; oppFg3m: number; oppFtm: number; oppFta: number; oppTov: number; oppOreb: number; oppDreb: number;
};
export const COUNT_KEYS = ['fgm', 'fga', 'fg3m', 'ftm', 'fta', 'tov', 'oreb', 'dreb', 'oppFgm', 'oppFga', 'oppFg3m', 'oppFtm', 'oppFta', 'oppTov', 'oppOreb', 'oppDreb'] as const;

/**
 * The four factors on both ends over some units: eFG%, TOV% and OREB% as
 * percentages, FT rate as makes per field goal attempt. Null when the units
 * carry no shot counts (saved before they were tracked) rather than zeros.
 */
export function fourFactors(units: Unit[]) {
  const t = Object.fromEntries(COUNT_KEYS.map((k) => [k, units.reduce((s, u) => s + (u[k] ?? 0), 0)])) as Counts;
  if (!t.fga || !t.oppFga) return null;
  const pct = (a: number, b: number) => (b ? (a / b) * 100 : null);
  return {
    efg: pct(t.fgm + 0.5 * t.fg3m, t.fga), tov: pct(t.tov, t.fga + 0.44 * t.fta + t.tov), oreb: pct(t.oreb, t.oreb + t.oppDreb), ftRate: t.ftm / t.fga,
    oppEfg: pct(t.oppFgm + 0.5 * t.oppFg3m, t.oppFga), oppTov: pct(t.oppTov, t.oppFga + 0.44 * t.oppFta + t.oppTov), dreb: pct(t.dreb, t.dreb + t.oppOreb), oppFtRate: t.oppFtm / t.oppFga,
  };
}
export type FourFactors = NonNullable<ReturnType<typeof fourFactors>>;

const rate = (units: Unit[]) => {
  const r = stintRatings(units);
  return { ...r, pace: r.min ? (r.poss / r.min) * 48 : null, factors: fourFactors(units) };
};
export type Rating = ReturnType<typeof rate>;

/** Everything the team did with all of `ids` on the floor. An empty list is the whole team. */
export const together = (units: Unit[], ids: number[]) => rate(units.filter((u) => ids.every((id) => u.players.includes(id))));

/** Every on/off combination of one to three players: 2, 4 or 8 cells, each with its minutes and ratings. */
export function splits(units: Unit[], ids: number[]) {
  return Array.from({ length: 2 ** ids.length }, (_, mask) => {
    // Bit i set means player i is ON; count down so "all on" comes first.
    const on = ids.map((_, i) => !((mask >> (ids.length - 1 - i)) & 1));
    return { on, ...rate(units.filter((u) => ids.every((id, i) => u.players.includes(id) === on[i]))) };
  });
}

/** With-or-without-you: each pair of `ids` together, keyed "a:b" in the order given. */
export function wowy(units: Unit[], ids: number[]) {
  const out = new Map<string, Rating>();
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) out.set(`${ids[i]}:${ids[j]}`, together(units, [ids[i], ids[j]]));
  return out;
}

const combos = <T>(xs: T[], k: number): T[][] => (k === 0 ? [[]] : xs.flatMap((x, i) => combos(xs.slice(i + 1), k - 1).map((c) => [x, ...c])));

/**
 * A rating for five players who may never have shared the floor. It is the
 * possession-weighted average of what every trio, pair and single player
 * among them did (each sample counted once per group), blended with the
 * team's own rating as a prior worth `prior` possessions. The more those
 * groups have played, the less the prior matters. `sample` is the possessions
 * behind it, counting the largest group sizes most: all of the five's trios.
 */
export function estimate(units: Unit[], five: number[], prior: number) {
  const team = together(units, []);
  const actual = together(units, five);
  if (team.ortg === null || team.drtg === null) return { actual, ortg: null, drtg: null, net: null, sample: 0 };
  // Bigger groups say more about the five than singles do, so their possessions count for more.
  const WEIGHT = { 1: 1, 2: 2, 3: 3, 5: 4 } as const;
  let w = prior, off = prior * team.ortg, def = prior * team.drtg, sample = 0;
  for (const k of [1, 2, 3, 5] as const) {
    for (const group of combos(five, k)) {
      const r = together(units, group);
      if (!r.poss || r.ortg === null || r.drtg === null) continue;
      // Averaged over the groups of that size, so ten pairs don't outvote one five.
      const share = (r.poss * WEIGHT[k]) / combos(five, k).length;
      w += share; off += share * r.ortg; def += share * r.drtg;
      if (k === 3) sample += r.poss / 10;
      if (k === 5) sample += r.poss;
    }
  }
  return { actual, ortg: off / w, drtg: def / w, net: (off - def) / w, sample: Math.round(sample) };
}

/** How much to trust a rating, from the possessions behind it. */
export const confidence = (poss: number) => (poss <= 0 ? 'none' : poss < 300 ? 'low' : poss < 1500 ? 'medium' : 'high');
export type Confidence = ReturnType<typeof confidence>;
