/**
 * Color math for places CSS variables can't reach (canvas export, SVG fills
 * computed in JS) and for choosing readable text on team colors.
 */

const INK = '#16181c';

const rgb = (hex: string) => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};

const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG 2 contrast ratio, 1 to 21. */
export function contrastRatio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Text color for this background, always at least 4.5:1: white where it clears,
 * then ink, then pure black for the few mid-tone reds where neither does.
 */
export const onColor = (bg: string) =>
  ['#ffffff', INK].find((c) => contrastRatio(bg, c) >= 4.5) ?? '#000000';

/** Savant's percentile scale: poor (deep blue), below, average (gray), above, elite (deep red). */
export const DIVERGING = ['#2f6fb2', '#86a5c4', '#b9c0c8', '#d98491', '#c8102e'] as const;

/** Low to high for counts and frequencies, light to dark so it reads without hue. */
export const SEQUENTIAL = ['#e8eef6', '#b7cbe4', '#7fa3cf', '#4a7ab5', '#1f4f8f'] as const;

/** Which of the five steps a percentile lands on; the same cut points as the percentile bars. */
export const percentileStep = (p: number) => (p >= 80 ? 4 : p >= 60 ? 3 : p > 40 ? 2 : p > 20 ? 1 : 0);

const mix = (a: string, b: string, t: number) => {
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};

/** A smooth color for a 0-100 percentile: blue, through gray at 50, to red. */
export function percentileColor(p: number) {
  const t = Math.min(100, Math.max(0, p)) / 100;
  return t < 0.5 ? mix(DIVERGING[0], DIVERGING[2], t * 2) : mix(DIVERGING[2], DIVERGING[4], (t - 0.5) * 2);
}
