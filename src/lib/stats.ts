/**
 * Advanced stat formulas.
 *
 * Exact (match Basketball-Reference definitions): TS%, eFG%, USG%, AST%, REB%,
 * STL%, BLK%, TOV%, possessions, pace, ORtg/DRtg (team), PER.
 * Approximated (documented at each function): individual ORtg/DRtg, Win Shares, BPM.
 */

export type BoxTotals = {
  min: number; pts: number; reb: number; oreb: number; dreb: number;
  ast: number; stl: number; blk: number; tov: number; pf: number;
  fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number;
};

export type TeamTotals = BoxTotals & { gp: number; oppPts?: number };

/** League-average totals used to normalize PER/BPM. Refreshed by scripts/ingest.ts. */
export type LeagueContext = {
  pts: number; fgm: number; fga: number; fg3m: number; ftm: number; fta: number;
  oreb: number; dreb: number; reb: number; ast: number; tov: number; pf: number;
  pace: number; ptsPerGame: number;
};

export const LEAGUE_2024_25: LeagueContext = {
  pts: 293_000, fgm: 108_000, fga: 227_000, fg3m: 33_500, ftm: 43_000, fta: 55_500,
  oreb: 25_500, dreb: 78_500, reb: 104_000, ast: 63_500, tov: 32_000, pf: 46_500,
  pace: 99.0, ptsPerGame: 113.4,
};

const div = (a: number, b: number) => (b === 0 ? 0 : a / b);
const pct = (a: number, b: number) => div(a, b) * 100;

// --- Shooting -------------------------------------------------------------

/** True Shooting %: points per scoring attempt, where an attempt = FGA + 0.44*FTA. */
export const tsPct = (b: Pick<BoxTotals, 'pts' | 'fga' | 'fta'>) =>
  div(b.pts, 2 * (b.fga + 0.44 * b.fta)) * 100;

/** Effective FG%: a three counts 1.5x a two. */
export const efgPct = (b: Pick<BoxTotals, 'fgm' | 'fg3m' | 'fga'>) =>
  div(b.fgm + 0.5 * b.fg3m, b.fga) * 100;

/**
 * Hollinger's Game Score: one game's box line as a single number on the points
 * scale (about 10 is an average game, 40 an outstanding one).
 */
export const gameScore = (b: BoxTotals) =>
  b.pts + 0.4 * b.fgm - 0.7 * b.fga - 0.4 * (b.fta - b.ftm) + 0.7 * b.oreb + 0.3 * b.dreb +
  b.stl + 0.7 * b.ast + 0.7 * b.blk - 0.4 * b.pf - b.tov;

// --- Rate stats -----------------------------------------------------------

/** Share of team possessions a player used while on the floor. */
export function usgPct(p: BoxTotals, tm: BoxTotals): number {
  const teamPlays = tm.fga + 0.44 * tm.fta + tm.tov;
  return pct((p.fga + 0.44 * p.fta + p.tov) * (tm.min / 5), p.min * teamPlays);
}

/** Share of teammate field goals a player assisted while on the floor. */
export function astPct(p: BoxTotals, tm: BoxTotals): number {
  const teammateFgm = (p.min / (tm.min / 5)) * tm.fgm - p.fgm;
  return pct(p.ast, teammateFgm);
}

export function rebPct(p: BoxTotals, tm: BoxTotals, oppReb: number): number {
  return pct(p.reb * (tm.min / 5), p.min * (tm.reb + oppReb));
}

export function stlPct(p: BoxTotals, tm: BoxTotals, oppPoss: number): number {
  return pct(p.stl * (tm.min / 5), p.min * oppPoss);
}

export function blkPct(p: BoxTotals, tm: BoxTotals, oppFga2: number): number {
  return pct(p.blk * (tm.min / 5), p.min * oppFga2);
}

/** Turnovers per 100 plays. */
export const tovPct = (b: Pick<BoxTotals, 'tov' | 'fga' | 'fta'>) =>
  pct(b.tov, b.fga + 0.44 * b.fta + b.tov);

// --- Team ----------------------------------------------------------------

/** Possessions (Oliver). Averaging with the opponent's estimate is more stable
 *  but needs opponent totals; callers that have them should do so. */
export const possessions = (b: BoxTotals) =>
  b.fga + 0.44 * b.fta - b.oreb + b.tov;

/**
 * Minutes, +/- and ratings over some lineup stints. Possessions are the two
 * sides' estimates averaged, as team ratings are, so ORtg - DRtg is the net.
 */
export function stintRatings(stints: { seconds: number; pts: number; oppPts: number; poss: number; oppPoss: number }[]) {
  let seconds = 0, pts = 0, oppPts = 0, poss = 0;
  for (const s of stints) {
    seconds += s.seconds;
    pts += s.pts;
    oppPts += s.oppPts;
    poss += (s.poss + s.oppPoss) / 2;
  }
  const ortg = poss ? (pts / poss) * 100 : null;
  const drtg = poss ? (oppPts / poss) * 100 : null;
  return { min: seconds / 60, pts, oppPts, plusMinus: pts - oppPts, poss, ortg, drtg, net: ortg === null ? null : ortg - drtg! };
}

/** Possessions per 48 minutes. `min` is total team minutes (5 * game minutes). */
export const pace = (b: TeamTotals) => div(possessions(b) * 48 * 5, b.min);

/** Points scored per 100 possessions. */
export const offRtg = (b: TeamTotals) => div(b.pts, possessions(b)) * 100;

/** Points allowed per 100 possessions. */
export const defRtg = (b: TeamTotals) => div(b.oppPts ?? 0, possessions(b)) * 100;

// --- PER ------------------------------------------------------------------

/**
 * Hollinger's unadjusted PER. Returns uPER; run `normalizePer` over a whole
 * league-season to get the familiar 15.0-average scale.
 */
export function uPer(p: BoxTotals, tm: BoxTotals, lg: LeagueContext): number {
  if (p.min <= 0) return 0;
  const lgDrbPct = div(lg.reb - lg.oreb, lg.reb);
  const vop = div(lg.pts, lg.fga - lg.oreb + lg.tov + 0.44 * lg.fta);
  const factor = 2 / 3 - (0.5 * div(lg.ast, lg.fgm)) / (2 * div(lg.fgm, lg.ftm));
  const tmAstRatio = div(tm.ast, tm.fgm);

  const raw =
    p.fg3m +
    (2 / 3) * p.ast +
    (2 - factor * tmAstRatio) * p.fgm +
    p.ftm * 0.5 * (1 + (1 - tmAstRatio) + (2 / 3) * tmAstRatio) -
    vop * p.tov -
    vop * lgDrbPct * (p.fga - p.fgm) -
    vop * 0.44 * (0.44 + 0.56 * lgDrbPct) * (p.fta - p.ftm) +
    vop * (1 - lgDrbPct) * p.dreb +
    vop * lgDrbPct * p.oreb +
    vop * p.stl +
    vop * lgDrbPct * p.blk -
    p.pf * (div(lg.ftm, lg.pf) - 0.44 * div(lg.fta, lg.pf) * vop);

  return raw / p.min;
}

/** Scale a league's uPER values so the minutes-weighted average is 15.0. */
export function normalizePer(
  rows: { uPer: number; min: number; tmPace?: number }[],
  lgPace = LEAGUE_2024_25.pace,
): number[] {
  const totalMin = rows.reduce((s, r) => s + r.min, 0);
  const weighted = rows.reduce((s, r) => s + r.uPer * r.min, 0);
  const lgAvg = div(weighted, totalMin);
  return rows.map((r) => {
    const paceAdj = r.tmPace ? div(lgPace, r.tmPace) : 1;
    return div(r.uPer * paceAdj * 15, lgAvg);
  });
}

// --- Approximations -------------------------------------------------------

/**
 * Individual offensive rating.
 * ponytail: Oliver's full points-produced chain (~40 terms, needs teammate
 * assist splits) is approximated here with scoring-possession efficiency plus
 * an assist credit. Within ~2-3 pts/100 of Basketball-Reference for most
 * rotation players; swap in the full model if you need exact parity.
 */
export function playerOrtg(p: BoxTotals, tm: BoxTotals, _lg: LeagueContext): number {
  const scPoss = p.fga + 0.44 * p.fta + p.tov;
  if (scPoss <= 0) return 0;
  const ptsProduced = p.pts + p.ast + 0.5 * p.oreb;
  const base = div(ptsProduced, scPoss + 0.5 * p.ast) * 100;
  // Shrink toward team efficiency for low-volume samples.
  const w = Math.min(1, scPoss / 200);
  return base * w + div(tm.pts, possessions(tm)) * 100 * (1 - w);
}

/**
 * Individual defensive rating.
 * ponytail: a minutes-weighted blend of team DRtg and the player's stop rate
 * (steals/blocks/DREB per 100). Directionally right, not Oliver-exact.
 */
export function playerDrtg(p: BoxTotals, tm: TeamTotals): number {
  const teamDrtg = defRtg(tm);
  if (p.min <= 0) return teamDrtg;
  // Team possessions the player was on the floor for.
  const onCourtPoss = div(p.min, tm.min / 5) * possessions(tm);
  const per100 = div(p.stl + p.blk + 0.3 * p.dreb, onCourtPoss) * 100;
  const stopValue = (per100 - 4.0) * 1.4; // 4.0/100 ≈ league-average stop rate
  return teamDrtg - stopValue;
}

/**
 * Win Shares via marginal offense/defense.
 * ponytail: uses playerOrtg/playerDrtg above, so it inherits their error bars.
 */
export function winShares(
  p: BoxTotals, tm: TeamTotals, lg: LeagueContext,
): { ows: number; dws: number; ws: number; ws48: number } {
  const tmPace = pace(tm);
  // A player's *share* of team possessions: tm.min is all five slots, so this
  // is already his fifth of the floor. (Using tm.min/5 here inflates WS 5x.)
  const playerPoss = div(p.min, tm.min) * possessions(tm);
  const lgPtsPerPoss = div(lg.ptsPerGame, lg.pace);
  const ptsPerWin = 0.32 * lg.ptsPerGame * div(tmPace, lg.pace);

  const marginalOff =
    (playerOrtg(p, tm, lg) / 100 - 0.92 * lgPtsPerPoss) * playerPoss;
  const marginalDef =
    (1.08 * lgPtsPerPoss - playerDrtg(p, tm) / 100) * playerPoss;

  const ows = div(marginalOff, ptsPerWin);
  const dws = div(marginalDef, ptsPerWin);
  const ws = ows + dws;
  return { ows, dws, ws, ws48: div(ws, p.min) * 48 };
}

/**
 * Box Plus/Minus.
 * ponytail: BPM 2.0's published regression uses 14 coefficients plus a team
 * adjustment that redistributes team NetRtg across the roster. This is the
 * per-100 linear core without the team adjustment step — good for ranking,
 * off by up to ~1.5 from Basketball-Reference on extreme teams.
 */
export function boxPlusMinus(p: BoxTotals, tm: TeamTotals, lg: LeagueContext) {
  if (p.min <= 0) return { obpm: 0, dbpm: 0, bpm: 0 };
  // Player possessions = share of team minutes * team possessions.
  const playerPoss = div(p.min, tm.min / 5) * possessions(tm);
  const per100 = (v: number) => div(v, playerPoss) * 100;
  const s = {
    pts: per100(p.pts), reb: per100(p.reb), oreb: per100(p.oreb),
    ast: per100(p.ast), stl: per100(p.stl), blk: per100(p.blk),
    tov: per100(p.tov), fga: per100(p.fga), fg3m: per100(p.fg3m),
  };
  const ts = tsPct(p) / 100;
  const lgTs = div(lg.pts, 2 * (lg.fga + 0.44 * lg.fta));
  const scoringEff = (ts - lgTs) * s.fga * 2;

  const obpm =
    0.6 * scoringEff + 0.16 * s.ast + 0.12 * s.oreb + 0.09 * s.fg3m - 0.29 * s.tov - 4.1;
  const dbpm =
    0.21 * (s.reb - s.oreb) + 0.62 * s.stl + 0.42 * s.blk - 0.02 * s.pts - 1.9;
  return { obpm, dbpm, bpm: obpm + dbpm };
}

/**
 * BPM is defined so the league average is 0.0. The linear core above has no
 * such guarantee, so shift a whole league-season's values onto that scale.
 */
export function centerBpm(
  rows: { obpm: number; dbpm: number; min: number }[],
): { obpm: number; dbpm: number; bpm: number }[] {
  const totalMin = rows.reduce((s, r) => s + r.min, 0) || 1;
  const meanO = rows.reduce((s, r) => s + r.obpm * r.min, 0) / totalMin;
  const meanD = rows.reduce((s, r) => s + r.dbpm * r.min, 0) / totalMin;
  return rows.map((r) => {
    const obpm = r.obpm - meanO;
    const dbpm = r.dbpm - meanD;
    return { obpm, dbpm, bpm: obpm + dbpm };
  });
}

/** Value Over Replacement Player; replacement level is -2.0 BPM. */
export const vorp = (bpm: number, playerMin: number, tmMin: number, gp: number) =>
  ((bpm + 2.0) * div(playerMin, tmMin / 5) * gp) / 82;

// --- Shot chart zones -----------------------------------------------------

/** NBA tracking coords are tenths of a foot from the basket. */
export const shotDistanceFt = (x: number, y: number) =>
  Math.round(Math.hypot(x, y) / 10);

/** Classify a shot into the Savant-style zones used by the heat map. */
export function shotZone(x: number, y: number): { zone: string; area: string; value: number } {
  const dist = Math.hypot(x, y) / 10;
  const corner = Math.abs(x) >= 220 && y <= 92.5;
  const isThree = corner || dist >= 23.75;
  const area =
    x < -80 ? 'Left Side(L)' : x > 80 ? 'Right Side(R)' : 'Center(C)';

  if (isThree) {
    if (corner) return { zone: x < 0 ? 'Left Corner 3' : 'Right Corner 3', area, value: 3 };
    return { zone: 'Above the Break 3', area, value: 3 };
  }
  if (dist <= 4) return { zone: 'Restricted Area', area, value: 2 };
  if (dist <= 8) return { zone: 'In The Paint (Non-RA)', area, value: 2 };
  if (dist <= 16) return { zone: 'Mid-Range', area, value: 2 };
  return { zone: 'Long Mid-Range', area, value: 2 };
}

/** Points per shot, the number the heat map is actually colored by. */
export const pointsPerShot = (made: number, attempts: number, value: number) =>
  div(made * value, attempts);

/** A count of one player's real shots from one spot, made or missed. */
export type ShotGroup = { playerId: number; value: number; distanceFt: number; made: boolean; n: number };

/**
 * Expected eFG% (Savant's xwOBA idea, for shots): what the league makes from
 * the spots a player shoots from, against what he makes. A spot is the shot's
 * value and its distance to the foot, so a corner three and a 22-foot two are
 * priced apart; 30 feet and out is one heave bucket. Shot-making is eFG% minus
 * expected eFG%, in points: zero is an average shooter on his diet.
 * ponytail: location only, no shot type, defender or clock. Add actionType to
 * the spot once a season has enough shots to fill the buckets.
 */
export function expectedShooting(groups: ShotGroup[]) {
  const spot = (g: ShotGroup) => `${g.value}:${Math.min(g.distanceFt, 30)}`;
  const league = new Map<string, { made: number; att: number }>();
  for (const g of groups) {
    const b = league.get(spot(g)) ?? { made: 0, att: 0 };
    b.att += g.n;
    if (g.made) b.made += g.n;
    league.set(spot(g), b);
  }
  const players = new Map<number, { fga: number; pts: number; xPts: number }>();
  for (const g of groups) {
    const b = league.get(spot(g))!;
    const p = players.get(g.playerId) ?? { fga: 0, pts: 0, xPts: 0 };
    p.fga += g.n;
    if (g.made) p.pts += g.n * g.value;
    p.xPts += (g.n * g.value * b.made) / b.att;
    players.set(g.playerId, p);
  }
  return new Map(
    [...players].map(([id, p]) => {
      const efg = div(p.pts, 2 * p.fga) * 100;
      const xEfg = div(p.xPts, 2 * p.fga) * 100;
      return [id, { fga: p.fga, efg, xEfg, shotMaking: efg - xEfg }];
    }),
  );
}

// --- Standings ------------------------------------------------------------

/** Standard normal CDF (Abramowitz-Stegun 7.1.26, error < 1.5e-7). */
function normalCdf(z: number) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const erf = 1 - t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/**
 * The home team's chance to win, 0-1, from the margin (home minus away) and
 * the seconds left. Stern's model: the rest of a game is a random walk whose
 * spread grows with the time left, about 13.5 points over a full 48 minutes,
 * plus the home edge still to be earned. At the horn it's the scoreboard; a tie
 * at the horn means overtime, a coin flip.
 * ponytail: no team strength, so it's even at tip-off bar the home edge. Feed a
 * pre-game spread into `homeEdge` if it should know who's better.
 */
export function winProbability(margin: number, secondsLeft: number, homeEdge = 2.5) {
  if (secondsLeft <= 0) return margin > 0 ? 1 : margin < 0 ? 0 : 0.5;
  const share = secondsLeft / 2880;
  return normalCdf((margin + homeEdge * share) / (13.5 * Math.sqrt(share)));
}

/**
 * Where a play falls in the game from its period and clock ("5:21"): seconds
 * since tip-off, and seconds left in regulation, or in this overtime.
 */
export function gameClock(period: number, clock: string) {
  const [m, s] = clock.split(':').map(Number);
  const rest = (m || 0) * 60 + (s || 0);
  return period <= 4
    ? { elapsed: (period - 1) * 720 + (720 - rest), left: (4 - period) * 720 + rest }
    : { elapsed: 2880 + (period - 5) * 300 + (300 - rest), left: rest };
}

/** Winning percentage. A team that hasn't played yet sits at .000, not NaN. */
export const winPct = (w: number, l: number) => div(w, w + l);

/**
 * Games behind the conference leader: the average of the win gap and the loss
 * gap, which is the league's own definition and why half-games exist.
 */
export const gamesBehind = (
  lead: { wins: number; losses: number },
  team: { wins: number; losses: number },
) => (lead.wins - team.wins + (team.losses - lead.losses)) / 2;


/**
 * Expected wins from points scored and allowed. Exponent 14 is the one
 * basketball-reference publishes its Pythagorean W-L with.
 */
export const pythagWins = (pf: number, pa: number, gp: number) =>
  pf + pa > 0 ? (gp * pf ** 14) / (pf ** 14 + pa ** 14) : 0;

export type GameResult = {
  /** ISO date; sorts chronologically as a string. */
  date: string;
  home: number;
  away: number;
  homeScore: number;
  awayScore: number;
};
/** Where a team sat that season. Before 1970-71 there were no conferences. */
export type Alignment = { conference: string | null; division: string | null };
type WL = [wins: number, losses: number];

export type StandingRow = {
  teamId: number;
  wins: number; losses: number;
  home: WL; away: WL; conf: WL; div: WL; l10: WL;
  pf: number; pa: number;
  /** "W3", "L1", or '' before a team has played. */
  streak: string;
};

/**
 * Every split a standings page shows, from final scores alone. Takes regular
 * season finals only; teams in `alignment` with no games come back 0-0.
 */
export function standings(games: GameResult[], alignment: Map<number, Alignment>): StandingRow[] {
  const rows = new Map<number, StandingRow & { results: boolean[] }>();
  for (const teamId of alignment.keys()) {
    rows.set(teamId, {
      teamId, wins: 0, losses: 0, home: [0, 0], away: [0, 0], conf: [0, 0], div: [0, 0],
      l10: [0, 0], pf: 0, pa: 0, streak: '', results: [],
    });
  }
  const same = (a: string | null | undefined, b: string | null | undefined) => !!a && a === b;
  const tally = (split: WL, won: boolean) => { split[won ? 0 : 1]++; };

  for (const g of [...games].sort((a, b) => a.date.localeCompare(b.date))) {
    const [h, a] = [alignment.get(g.home), alignment.get(g.away)];
    for (const [id, scored, allowed, where] of [
      [g.home, g.homeScore, g.awayScore, 'home'],
      [g.away, g.awayScore, g.homeScore, 'away'],
    ] as const) {
      const r = rows.get(id);
      if (!r) continue;
      const won = scored > allowed;
      r[won ? 'wins' : 'losses']++;
      r.pf += scored;
      r.pa += allowed;
      tally(r[where], won);
      if (same(h?.conference, a?.conference)) tally(r.conf, won);
      if (same(h?.division, a?.division)) tally(r.div, won);
      r.results.push(won);
    }
  }

  return [...rows.values()].map(({ results, ...r }) => {
    const last = results.at(-1);
    let n = 0;
    while (n < results.length && results[results.length - 1 - n] === last) n++;
    const recent = results.slice(-10);
    return {
      ...r,
      streak: results.length ? `${last ? 'W' : 'L'}${n}` : '',
      l10: [recent.filter(Boolean).length, recent.filter((w) => !w).length],
    };
  });
}

// --- Careers --------------------------------------------------------------

/** One season's counting line. `null` means the league didn't record it yet. */
export type SeasonLine = {
  gp: number; gs: number | null; min: number | null;
  pts: number; reb: number | null; oreb: number | null; dreb: number | null;
  ast: number | null; stl: number | null; blk: number | null; tov: number | null;
  pf: number | null; fgm: number; fga: number; fg3m: number | null; fg3a: number | null;
  ftm: number; fta: number;
};
/** A career total plus the games it covers, so per-game rates divide honestly. */
export type Tally = { total: number | null; gp: number; partial: boolean };
type Counting = Exclude<keyof SeasonLine, 'gp'>;

export function careerTotals(lines: SeasonLine[]) {
  const gp = lines.reduce((s, l) => s + l.gp, 0);
  const tally = (k: Counting): Tally => {
    const kept = lines.filter((l) => l[k] !== null);
    return {
      total: kept.length ? kept.reduce((s, l) => s + (l[k] as number), 0) : null,
      gp: kept.reduce((s, l) => s + l.gp, 0),
      partial: kept.length > 0 && kept.length < lines.length,
    };
  };
  const keys: Counting[] = [
    'gs', 'min', 'pts', 'reb', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf',
    'fgm', 'fga', 'fg3m', 'fg3a', 'ftm', 'fta',
  ];
  const t = Object.fromEntries(keys.map((k) => [k, tally(k)])) as Record<Counting, Tally>;
  const ratio = (a: number | null, b: number | null) => (a !== null && b ? (a / b) * 100 : null);
  const [pts, fga, fta, fgm] = [t.pts.total!, t.fga.total!, t.fta.total!, t.fgm.total!];
  return {
    gp,
    ...t,
    fgPct: ratio(fgm, fga),
    fg3Pct: ratio(t.fg3m.total, t.fg3a.total),
    ftPct: ratio(t.ftm.total, fta),
    tsPct: fga + fta ? tsPct({ pts, fga, fta }) : null,
    // No three-point line before 1979-80, so a missing 3PM is zero threes.
    efgPct: fga ? efgPct({ fgm, fg3m: t.fg3m.total ?? 0, fga }) : null,
  };
}

type AdvancedLine = {
  min: number | null; per: number | null; ws: number | null; ows: number | null;
  dws: number | null; bpm: number | null; vorp: number | null;
};

/** Sums what accumulates (WS, VORP); weights rates (PER, BPM) by minutes. */
export function careerAdvanced(lines: AdvancedLine[]) {
  const sum = (k: keyof AdvancedLine) => {
    const kept = lines.filter((l) => l[k] !== null);
    return kept.length ? kept.reduce((s, l) => s + (l[k] as number), 0) : null;
  };
  const weighted = (k: 'per' | 'bpm') => {
    const kept = lines.filter((l) => l[k] !== null && l.min);
    const mins = kept.reduce((s, l) => s + l.min!, 0);
    return mins ? kept.reduce((s, l) => s + l[k]! * l.min!, 0) / mins : null;
  };
  const withWs = lines.filter((l) => l.ws !== null && l.min);
  const wsMin = withWs.reduce((s, l) => s + l.min!, 0);
  return {
    per: weighted('per'),
    bpm: weighted('bpm'),
    ws: sum('ws'), ows: sum('ows'), dws: sum('dws'), vorp: sum('vorp'),
    ws48: wsMin ? (withWs.reduce((s, l) => s + l.ws!, 0) * 48) / wsMin : null,
  };
}

// --- Similar seasons ----------------------------------------------------------

/** One player-season as a list of stats, null where the league didn't keep one. */
export type SeasonVector = { playerId: number; seasonId: number; stats: (number | null)[] };

/** Each stat as a z-score within its own season, so 1962's rebounding is judged against 1962. */
export function zBySeason(rows: SeasonVector[]): SeasonVector[] {
  const bySeason = new Map<number, SeasonVector[]>();
  for (const r of rows) {
    const list = bySeason.get(r.seasonId);
    if (list) list.push(r);
    else bySeason.set(r.seasonId, [r]);
  }
  return [...bySeason.values()].flatMap((season) => {
    const scale = season[0].stats.map((_, i) => {
      const v = season.map((r) => r.stats[i]).filter((x): x is number => x !== null);
      const mean = v.reduce((a, x) => a + x, 0) / (v.length || 1);
      const sd = Math.sqrt(v.reduce((a, x) => a + (x - mean) ** 2, 0) / (v.length || 1));
      return { mean, sd };
    });
    return season.map((r) => ({
      ...r,
      stats: r.stats.map((x, i) => (x === null || !scale[i].sd ? null : (x - scale[i].mean) / scale[i].sd)),
    }));
  });
}

/**
 * The `n` seasons by other players nearest `target`, by root-mean-square
 * distance over the z-scored stats both have, needing `minShared` of them.
 * ponytail: fewer shared stats means a noisier distance, unpenalized beyond the
 * caller's `minShared`; weight by the count if old seasons crowd the lists.
 */
export function nearestSeasons(rows: SeasonVector[], target: SeasonVector, n: number, minShared: number) {
  const out: { row: SeasonVector; distance: number; shared: number }[] = [];
  for (const r of rows) {
    if (r.playerId === target.playerId) continue;
    let sum = 0, shared = 0;
    for (let i = 0; i < r.stats.length; i++) {
      const a = r.stats[i], b = target.stats[i];
      if (a === null || b === null) continue;
      sum += (a - b) ** 2;
      shared++;
    }
    if (shared >= minShared) out.push({ row: r, distance: Math.sqrt(sum / shared), shared });
  }
  return out.sort((a, b) => a.distance - b.distance).slice(0, n);
}

// --- Qualifying and ranking ---------------------------------------------------

/**
 * Rank rows by their average z-score across some stats, every stat weighted
 * the same, against the rows given: the whole model behind the awards ladders,
 * so a reader can check it. A row missing any of the stats is left off.
 */
export function zLadder<T>(rows: T[], stats: ((r: T) => number | null)[]) {
  const full = rows.filter((r) => stats.every((s) => s(r) !== null));
  const z = stats.map((s) => {
    const v = full.map((r) => s(r)!);
    const mean = v.reduce((a, x) => a + x, 0) / (v.length || 1);
    const sd = Math.sqrt(v.reduce((a, x) => a + (x - mean) ** 2, 0) / (v.length || 1));
    return (r: T) => (sd ? (s(r)! - mean) / sd : 0);
  });
  return full
    .map((row) => ({ row, score: z.reduce((a, f) => a + f(row), 0) / z.length }))
    .sort((a, b) => b.score - a.score);
}

/** The NBA's leaderboard rule: 70% of team games, rounded up. Integer math on purpose. */
export const minGames = (teamGames: number) => Math.ceil((teamGames * 7) / 10);

/** An 82-game attempt floor, prorated to the games played so far. */
export const scaledFloor = (floor: number, teamGames: number) => Math.ceil((floor * teamGames) / 82);

/** Share of the field below `value`, 0-100. Same definition the tables shade by. */
export function percentileOf(value: number, field: number[], lowerIsBetter = false) {
  if (field.length < 2) return 50;
  const p = (field.filter((v) => v < value).length / (field.length - 1)) * 100;
  return Math.round(lowerIsBetter ? 100 - p : p);
}
