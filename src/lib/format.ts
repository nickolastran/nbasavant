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
