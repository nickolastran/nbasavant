import type { Standing } from '@/lib/db';
import { fmt, pct3 } from '@/lib/format';
import { gamesBehind } from '@/lib/stats';

/**
 * The standings columns, shared by the page (its glossary) and the sortable
 * tables in the browser, which is why they live outside both.
 */
export type Col = {
  h: string;
  tip: string;
  cell: (r: Standing, lead: Standing) => React.ReactNode;
  /** Higher is better; sorting by the column puts the best first, a second click the worst. */
  rank: (r: Standing) => number | null;
  /** Starts a new group of columns: a rule down its left edge. */
  sep?: boolean;
};

const wl = ([w, l]: [number, number]) => `${w}-${l}`;
const split = ([w, l]: [number, number]) => (w + l ? w / (w + l) : null);
const signed = (v: number, digits = 1) => `${v > 0 ? '+' : ''}${v.toFixed(digits)}`;
const tone = (v: number, text: string) => (
  <span style={{ color: v > 0 ? 'var(--pos)' : v < 0 ? 'var(--neg)' : undefined }}>{text}</span>
);
const gp = (r: Standing) => r.wins + r.losses;
const perGame = (r: Standing, v: number) => (gp(r) ? v / gp(r) : null);

const RECORD: Col[] = [
  { h: 'W', tip: 'Wins', cell: (r) => r.wins, rank: (r) => r.wins },
  { h: 'L', tip: 'Losses', cell: (r) => r.losses, rank: (r) => -r.losses },
  { h: 'PCT', tip: 'Winning percentage', cell: (r) => pct3(r.pct), rank: (r) => r.pct },
  {
    h: 'GB', tip: 'Games behind the leader',
    cell: (r, lead) => (r === lead ? '—' : gamesBehind(lead, r).toFixed(1)),
    // Games behind orders exactly as wins minus losses.
    rank: (r) => r.wins - r.losses,
  },
  { h: 'HOME', tip: 'Home record', cell: (r) => wl(r.home), rank: (r) => split(r.home), sep: true },
  { h: 'AWAY', tip: 'Road record', cell: (r) => wl(r.away), rank: (r) => split(r.away) },
];
const STREAK: Col = {
  h: 'STRK', tip: 'Current streak', cell: (r) => r.streak || '—',
  rank: (r) => (r.streak ? (r.streak[0] === 'W' ? 1 : -1) * Number(r.streak.slice(1)) : null),
};

export const STANDINGS_COLS: Col[] = [
  ...RECORD,
  { h: 'DIV', tip: 'Record against the division', cell: (r) => (r.division ? wl(r.div) : '—'), rank: (r) => split(r.div) },
  {
    h: 'CONF', tip: 'Record against the conference',
    cell: (r) => (r.conference ? wl(r.conf) : '—'), rank: (r) => split(r.conf),
  },
  {
    h: 'PPG', tip: 'Points per game', sep: true,
    cell: (r) => (gp(r) ? fmt(r.pf / gp(r)) : '—'), rank: (r) => perGame(r, r.pf),
  },
  {
    h: 'OPP PPG', tip: 'Points allowed per game',
    cell: (r) => (gp(r) ? fmt(r.pa / gp(r)) : '—'), rank: (r) => perGame(r, -r.pa),
  },
  {
    h: 'DIFF', tip: 'Point differential per game',
    cell: (r) => (gp(r) ? tone((r.pf - r.pa) / gp(r), signed((r.pf - r.pa) / gp(r))) : '—'),
    rank: (r) => perGame(r, r.pf - r.pa),
  },
  STREAK,
  { h: 'L10', tip: 'Last ten games', cell: (r) => (gp(r) ? wl(r.l10) : '—'), rank: (r) => split(r.l10) },
];
// Both come from the regular season, so preseason tables leave them off.
export const RATING_COLS: Col[] = [
  {
    h: 'xW-L', tip: 'Expected record from points scored and allowed (Pythagorean, exponent 14)', sep: true,
    cell: (r) => (gp(r) ? `${Math.round(r.xWins)}-${gp(r) - Math.round(r.xWins)}` : '—'),
    rank: (r) => perGame(r, r.xWins),
  },
  {
    h: 'NET', tip: 'Net rating: points per 100 possessions, scored minus allowed',
    cell: (r) => (r.netRtg === null ? '—' : tone(r.netRtg, signed(r.netRtg))), rank: (r) => r.netRtg,
  },
];
export const CUP_COLS: Col[] = [
  ...RECORD,
  { h: 'PF', tip: 'Points scored', sep: true, cell: (r) => (gp(r) ? r.pf : '—'), rank: (r) => (gp(r) ? r.pf : null) },
  { h: 'PA', tip: 'Points allowed', cell: (r) => (gp(r) ? r.pa : '—'), rank: (r) => (gp(r) ? -r.pa : null) },
  {
    h: 'DIFF', tip: 'Point differential, the first group-stage tiebreaker after head-to-head',
    cell: (r) => (gp(r) ? tone(r.pf - r.pa, signed(r.pf - r.pa, 0)) : '—'), rank: (r) => (gp(r) ? r.pf - r.pa : null),
  },
  STREAK,
];

export type ColSet = 'standings' | 'preseason' | 'cup';
export const colsFor = (set: ColSet) =>
  set === 'cup' ? CUP_COLS : set === 'preseason' ? STANDINGS_COLS : [...STANDINGS_COLS, ...RATING_COLS];
