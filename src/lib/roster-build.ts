/**
 * Build-a-Roster: what a hand-picked group of players projects to as a team.
 * Pure functions; see docs/METRICS.md for the method and its limits.
 */

export const SKILLS = ['shooting', 'creation', 'rim', 'rebounding', 'perimeter'] as const;
export type Skill = (typeof SKILLS)[number];
export const SKILL_LABELS: Record<Skill, string> = { shooting: 'Shooting', creation: 'Creation', rim: 'Rim protection', rebounding: 'Rebounding', perimeter: 'Perimeter D' };

/** Nobody is projected past this many minutes a game. */
export const MAX_MPG = 38;
const GAME_MINUTES = 240;

export type Pick = {
  id: number;
  /** His real minutes per game this season: his share of the new team's minutes follows it. */
  mpg: number;
  obpm: number;
  dbpm: number;
  /** 0-100 percentile in each skill, or null where he has no number. */
  skills: Record<Skill, number | null>;
};

/**
 * A game's 240 minutes split among the picks in proportion to their real
 * minutes, with nobody over the cap: whoever would pass it is held there and
 * the rest share what is left, again in proportion.
 */
export function allocate(picks: Pick[]) {
  const out = new Map<number, number>();
  let open = picks.filter((p) => p.mpg > 0);
  let left = GAME_MINUTES;
  while (open.length) {
    const total = open.reduce((s, p) => s + p.mpg, 0);
    const over = open.filter((p) => (p.mpg / total) * left > MAX_MPG);
    if (!over.length) {
      for (const p of open) out.set(p.id, (p.mpg / total) * left);
      break;
    }
    for (const p of over) out.set(p.id, MAX_MPG);
    left -= over.length * MAX_MPG;
    open = open.filter((p) => !over.includes(p));
  }
  return out;
}

/**
 * The team these players project to. Offense and defense relative to league
 * average are the minutes-weighted sums of offensive and defensive box
 * plus/minus (five players are always on the floor, so the weights sum to
 * five). Skill coverage is the minutes-weighted average percentile.
 */
export function project(picks: Pick[]) {
  if (!picks.length) return null;
  const minutes = allocate(picks);
  const sum = (f: (p: Pick) => number) => picks.reduce((s, p) => s + (f(p) * (minutes.get(p.id) ?? 0)) / 48, 0);
  const [relOff, relDef] = [sum((p) => p.obpm), sum((p) => p.dbpm)];
  const coverage = Object.fromEntries(
    SKILLS.map((k) => {
      const have = picks.filter((p) => p.skills[k] !== null);
      const w = have.reduce((s, p) => s + (minutes.get(p.id) ?? 0), 0);
      return [k, w ? have.reduce((s, p) => s + p.skills[k]! * (minutes.get(p.id) ?? 0), 0) / w : null];
    }),
  ) as Record<Skill, number | null>;
  return { relOff, relDef, net: relOff + relDef, coverage, minutes, covered: [...minutes.values()].reduce((a, b) => a + b, 0) };
}
