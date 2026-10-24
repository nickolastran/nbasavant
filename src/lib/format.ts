/** A stat for display: fixed decimals, or an em dash when the league didn't keep it. */
export const fmt = (v: number | null | undefined, dp = 1, suffix = '') =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : `${v.toFixed(dp)}${suffix}`;

/** ".683", the way standings print a winning percentage. */
export const pct3 = (v: number) => v.toFixed(3).replace(/^0/, '');

/** A total spread over games, or null when the total is unknown. */
export const perGame = (total: number | null | undefined, gp: number) =>
  total === null || total === undefined || !gp ? null : total / gp;

/** "6'8\"" from inches. */
export const feetInches = (inches: number | null) =>
  inches ? `${Math.floor(inches / 12)}'${inches % 12}"` : null;

/** 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st. */
export const ordinal = (n: number) => {
  const suffix = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]}`;
};

/**
 * Surnames for a group of players, told apart where they clash: "Williams"
 * alone, "Jal. Williams" / "Jay. Williams" when two share it, full names when
 * even that doesn't separate them.
 */
export function shortNames(players: { id: number; firstName: string; lastName: string }[]) {
  const count = (key: (p: (typeof players)[number]) => string, p: (typeof players)[number]) =>
    players.filter((q) => key(q) === key(p)).length;
  const prefix = (p: (typeof players)[number]) => {
    const others = players.filter((q) => q.id !== p.id && q.lastName === p.lastName);
    // The shortest start of the first name no namesake shares.
    for (let n = 1; n <= p.firstName.length; n++) {
      const start = p.firstName.slice(0, n);
      if (others.every((q) => !q.firstName.startsWith(start))) return `${start}.`;
    }
    return p.firstName;
  };
  return new Map(players.map((p) => [p.id, count((q) => q.lastName, p) === 1 ? p.lastName : `${prefix(p)} ${p.lastName}`]));
}
