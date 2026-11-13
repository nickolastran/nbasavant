import type { Row } from '@/components/AdvancedTable';
import type { Percentile } from '@/components/PercentileBars';
import { fmt, ordinal } from '@/lib/format';
import { percentileOf } from '@/lib/stats';

type Metric = { group: string; key: string; label: string; dp?: number; unit?: string; signed?: boolean; low?: boolean };
const CARD: Metric[] = [
  { group: 'Scoring', key: 'pts', label: 'Points' },
  { group: 'Scoring', key: 'tsPct', label: 'True shooting', unit: '%' },
  { group: 'Scoring', key: 'fg3Pct', label: 'Three-point %', unit: '%' },
  { group: 'Scoring', key: 'usgPct', label: 'Usage', unit: '%' },
  { group: 'Scoring', key: 'shotMaking', label: 'Shot-making', signed: true },
  { group: 'Playmaking', key: 'ast', label: 'Assists' },
  { group: 'Playmaking', key: 'astPct', label: 'Assist %', unit: '%' },
  { group: 'Playmaking', key: 'astTo', label: 'AST/TO', dp: 2 },
  { group: 'Playmaking', key: 'tov', label: 'Turnovers', low: true },
  { group: 'Rebounding', key: 'reb', label: 'Rebounds' },
  { group: 'Rebounding', key: 'drebPct', label: 'Def. rebound %', unit: '%' },
  { group: 'Defense', key: 'stl', label: 'Steals' },
  { group: 'Defense', key: 'blk', label: 'Blocks' },
  { group: 'Defense', key: 'oppDiff', label: 'Opp. shooting', signed: true, low: true },
  { group: 'Defense', key: 'dRimFg', label: 'Rim FG% allowed', unit: '%', low: true },
  { group: 'Impact', key: 'bpm', label: 'Box +/-', signed: true },
  { group: 'Impact', key: 'per', label: 'PER' },
  { group: 'Impact', key: 'ws48', label: 'WS/48', dp: 3 },
  { group: 'Impact', key: 'onOffNet', label: 'On/off net', signed: true },
];

/**
 * One player's percentile card from the leaderboard rows: each stat against
 * every player with at least a quarter of the league's heaviest minutes. The
 * same field for everyone, so two cards side by side compare like with like.
 */
export function percentileCard(rows: Row[], playerId: number): { rows: Percentile[]; field: number } {
  const most = Math.max(0, ...rows.map((r) => (typeof r.min === 'number' ? r.min : 0)));
  const pool = rows.filter((r) => typeof r.min === 'number' && r.min >= most * 0.25);
  const me = rows.find((r) => r.playerId === playerId);
  if (!me) return { rows: [], field: pool.length };
  const out: Percentile[] = [];
  for (const m of CARD) {
    const mine = me[m.key];
    const field = pool.map((r) => r[m.key]).filter((v): v is number => typeof v === 'number');
    if (typeof mine !== 'number' || field.length < 2) continue;
    const pct = percentileOf(mine, field, m.low);
    const value = `${m.signed && mine > 0 ? '+' : ''}${fmt(mine, m.dp ?? 1, m.unit)}`;
    out.push({ group: m.group, label: m.label, value, pct, title: `${m.label}: ${value}, ${ordinal(pct)} percentile of ${field.length} players` });
  }
  return { rows: out, field: pool.length };
}

export type MirrorRow = {
  label: string;
  a: number | null;
  b: number | null;
  /** 1 is best in the league; null where the stat has no better direction or no value. */
  rankA: number | null;
  rankB: number | null;
  of: number;
  dp?: number;
  signed?: boolean;
  lowerIsBetter?: boolean;
  /** No better side (pace): printed, not ranked or bolded. */
  neutral?: boolean;
};

/** A team-season row; only its numeric columns are read. */
type TeamRow = Record<string, unknown>;
const num = (v: unknown) => (typeof v === 'number' ? v : null);
const DEFS: { group: string; key: string; label: string; dp?: number; signed?: boolean; low?: boolean; neutral?: boolean }[] = [
  { group: 'Ratings', key: 'netRtg', label: 'Net rating', signed: true },
  { group: 'Ratings', key: 'ortg', label: 'Offensive rating' },
  { group: 'Ratings', key: 'drtg', label: 'Defensive rating', low: true },
  { group: 'Ratings', key: 'pace', label: 'Pace', neutral: true },
  { group: 'Offense: four factors', key: 'efgPct', label: 'Effective FG%' },
  { group: 'Offense: four factors', key: 'tovPct', label: 'Turnover %', low: true },
  { group: 'Offense: four factors', key: 'orebPct', label: 'Off. rebound %' },
  { group: 'Offense: four factors', key: 'ftRate', label: 'Free throw rate', dp: 3 },
  { group: 'Defense: four factors', key: 'oppEfgPct', label: 'Opp. eFG%', low: true },
  { group: 'Defense: four factors', key: 'oppTovPct', label: 'Forced TOV %' },
  { group: 'Defense: four factors', key: 'drebPct', label: 'Def. rebound %' },
];

/** Two teams' major stats, each with its league rank that season, grouped for the mirrored bars. */
export function teamMirror(a: TeamRow, b: TeamRow, league: TeamRow[]) {
  const groups = new Map<string, MirrorRow[]>();
  for (const d of DEFS) {
    const field = league.map((t) => num(t[d.key])).filter((v): v is number => v !== null);
    const rank = (v: number | null) => (v === null || d.neutral ? null : 1 + field.filter((x) => (d.low ? x < v : x > v)).length);
    const [va, vb] = [num(a[d.key]), num(b[d.key])];
    const row: MirrorRow = {
      label: d.label, a: va, b: vb, rankA: rank(va), rankB: rank(vb), of: field.length,
      dp: d.dp, signed: d.signed, lowerIsBetter: d.low, neutral: d.neutral,
    };
    groups.set(d.group, [...(groups.get(d.group) ?? []), row]);
  }
  return [...groups].map(([title, rows]) => ({ title, rows }));
}

/**
 * The four factors as a matchup: one team's offense against the other's
 * defense in the same factor. (Free throw rate is left out: the opponent's
 * isn't on record.)
 */
export function faceoff(off: TeamRow, def: TeamRow) {
  const n = num;
  return [
    { label: 'Shooting (eFG%)', off: n(off.efgPct), def: n(def.oppEfgPct), offBetterHigh: true },
    { label: 'Turnovers (TOV%)', off: n(off.tovPct), def: n(def.oppTovPct), offBetterHigh: false },
    { label: 'Offensive boards (OREB%)', off: n(off.orebPct), def: n(def.drebPct) === null ? null : 100 - n(def.drebPct)!, offBetterHigh: true },
  ];
}
