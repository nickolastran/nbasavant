/**
 * The Title Zone chart's math: team ratings by date, relative to league
 * average, the zone itself, title marks and the next-five schedule. Pure
 * functions; the database side is in title-zone-data.ts. See docs/METRICS.md.
 */
import type { TitleZoneConfig } from './title-zone.config';

/** One team's side of one finished game. `poss` is the game's possessions (both teams' estimates averaged). */
export type TeamGame = { teamId: number; oppId: number; gameId: number; date: string; pts: number; oppPts: number; poss: number; home: boolean };

export type Point = {
  teamId: number;
  gp: number;
  wins: number;
  losses: number;
  ortg: number;
  drtg: number;
  /** Offense above league average, points per 100 possessions. */
  relOff: number;
  /** Defense better than league average: positive is good. */
  relDef: number;
  net: number;
};

const EPS = 1e-9;

/**
 * Every team's ratings through `date` (inclusive), against the league average
 * over the same games. With `lastN`, each team's latest N games only.
 */
export function landscape(games: TeamGame[], date: string, lastN?: number): Point[] {
  const byTeam = new Map<number, TeamGame[]>();
  for (const g of games) {
    if (g.date > date) continue;
    byTeam.set(g.teamId, [...(byTeam.get(g.teamId) ?? []), g]);
  }
  const rows = [...byTeam].map(([teamId, all]) => {
    const mine = lastN ? [...all].sort((a, b) => a.date.localeCompare(b.date)).slice(-lastN) : all;
    const sum = (f: (g: TeamGame) => number) => mine.reduce((s, g) => s + f(g), 0);
    return { teamId, gp: mine.length, wins: mine.filter((g) => g.pts > g.oppPts).length, pts: sum((g) => g.pts), oppPts: sum((g) => g.oppPts), poss: sum((g) => g.poss) };
  });
  const [pts, poss] = [rows.reduce((s, r) => s + r.pts, 0), rows.reduce((s, r) => s + r.poss, 0)];
  if (!poss) return [];
  const league = (pts / poss) * 100;
  return rows
    .filter((r) => r.poss > 0)
    .map((r) => {
      const [ortg, drtg] = [(r.pts / r.poss) * 100, (r.oppPts / r.poss) * 100];
      return { teamId: r.teamId, gp: r.gp, wins: r.wins, losses: r.gp - r.wins, ortg, drtg, relOff: ortg - league, relDef: league - drtg, net: ortg - drtg };
    });
}

/** Inside the Title Zone: good enough overall, with neither end too weak. */
export const inZone = (p: { relOff: number; relDef: number }, cfg: TitleZoneConfig) =>
  p.relOff + p.relDef >= cfg.minNet - EPS && p.relOff >= cfg.minRelOff - EPS && p.relDef >= cfg.minRelDef - EPS;

/** The zone's outline as [relOff, relDef] corners, clipped at `extent` on both axes. */
export function zonePolygon(cfg: TitleZoneConfig, extent: number): [number, number][] {
  const r = (v: number) => Math.round(v * 1e6) / 1e6;
  return [
    [cfg.minRelOff, r(cfg.minNet - cfg.minRelOff)],
    [r(cfg.minNet - cfg.minRelDef), cfg.minRelDef],
    [extent, cfg.minRelDef],
    [extent, extent],
    [cfg.minRelOff, extent],
  ];
}

export type Quadrant = 'both' | 'offense' | 'defense' | 'neither';
export const quadrant = (p: { relOff: number; relDef: number }): Quadrant =>
  p.relOff >= 0 ? (p.relDef >= 0 ? 'both' : 'offense') : p.relDef >= 0 ? 'defense' : 'neither';

/** The chart's 45 degree turn: good at both ends is up, offense-led right, defense-led left. */
export const rotate = (relOff: number, relDef: number) => ({ x: (relOff - relDef) / Math.SQRT2, y: (relOff + relDef) / Math.SQRT2 });

/** The three title marks: 40-20 pace, SRS and a top seed. */
export function titleMarks(rec: { wins: number; losses: number }, srs: number | null, seed: number | null, cfg: TitleZoneConfig) {
  const gp = rec.wins + rec.losses;
  // Settled once the 40th win or the 20th loss is on the books, whichever came first;
  // 40 wins with fewer than 20 losses can only mean the wins came first.
  const pace =
    rec.wins >= cfg.paceWins && rec.losses < cfg.paceLosses
      ? true
      : rec.losses >= cfg.paceLosses
        ? false
        : gp >= cfg.paceMinGames && rec.wins / gp >= cfg.paceWins / (cfg.paceWins + cfg.paceLosses) - EPS;
  const marks = { pace, srs: srs !== null && srs >= cfg.minSrs, seed: seed !== null && seed <= cfg.maxSeed };
  return { ...marks, count: Number(marks.pace) + Number(marks.srs) + Number(marks.seed) };
}

export type Level = 'easy' | 'medium' | 'hard';

/**
 * A team's next few games: how good the opponents are (their net rating, plus
 * the home edge when they host and minus it when they visit), and the push
 * that implies. If the team plays at its own level, its raw rating moves
 * against the opposition's strength, diluted by the games already played.
 */
export function schedule(teamId: number, upcoming: { homeId: number; awayId: number }[], netOf: Map<number, number>, gp: number, cfg: TitleZoneConfig) {
  const next = upcoming.filter((g) => g.homeId === teamId || g.awayId === teamId).slice(0, cfg.lookahead);
  if (!next.length) return null;
  const home = next.filter((g) => g.homeId === teamId).length;
  const oppNet = next.reduce((s, g) => {
    const atHome = g.homeId === teamId;
    return s + (netOf.get(atHome ? g.awayId : g.homeId) ?? 0) + (atHome ? -cfg.homeEdge : cfg.homeEdge);
  }, 0) / next.length;
  const level: Level = oppNet <= cfg.easy ? 'easy' : oppNet >= cfg.hard ? 'hard' : 'medium';
  return { games: next.length, home, away: next.length - home, oppNet, level, push: (-oppNet * next.length) / (gp + next.length) };
}
