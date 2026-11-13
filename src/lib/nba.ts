/**
 * The NBA's public data feeds: live scoreboard, box scores, play-by-play, the
 * season schedule, rosters and transactions. Everything here is fetching plus
 * pure mapping into the shapes the database and pages use.
 *
 * The CDN answers only requests that come from nba.com, so every call carries
 * that Referer. Browsers can't send it for us (CORS allows nba.com alone),
 * which is why live data always goes through our own routes.
 */
import { shotZone } from './stats';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const CDN_HEADERS = { 'User-Agent': UA, Referer: 'https://www.nba.com/', Accept: 'application/json' };
const STATS_HEADERS = {
  ...CDN_HEADERS,
  Origin: 'https://www.nba.com',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
};

const CDN = 'https://cdn.nba.com/static/json';
export const FEEDS = {
  scoreboard: `${CDN}/liveData/scoreboard/todaysScoreboard_00.json`,
  box: (gameId: string) => `${CDN}/liveData/boxscore/boxscore_${gameId}.json`,
  pbp: (gameId: string) => `${CDN}/liveData/playbyplay/playbyplay_${gameId}.json`,
  schedule: `${CDN}/staticData/scheduleLeagueV2.json`,
  /** This season's rosters and bios. */
  roster: `${CDN}/staticData/playerIndex.json`,
  /** Every signing, waiver and trade since July 2015. */
  movement: 'https://stats.nba.com/js/data/playermovement/NBA_Player_Movement.json',
  /**
   * Every player since 1946, with bio and draft. stats.nba.com proper turns
   * away most cloud IPs, so only the local ingest calls this one.
   */
  allPlayers: (season: string) =>
    `https://stats.nba.com/stats/playerindex?Historical=1&LeagueID=00&Season=${season}`,
};

/**
 * One feed as JSON. `revalidate` is Next's data cache in seconds; outside Next
 * (the ingest and sync scripts) it's ignored and every call goes to the source.
 */
export async function nbaJson<T = any>(url: string, revalidate?: number): Promise<T> {
  const res = await fetch(url, {
    headers: url.includes('stats.nba.com') ? STATS_HEADERS : CDN_HEADERS,
    signal: AbortSignal.timeout(20_000),
    ...(revalidate !== undefined ? { next: { revalidate } } : {}),
  } as RequestInit);
  if (!res.ok) throw new Error(`NBA feed ${url} answered ${res.status}`);
  return res.json();
}

/** stats.nba.com tables come as headers + row arrays; turn each row into an object. */
export const rowsOf = (rs: { headers: string[]; rowSet: unknown[][] }) =>
  rs.rowSet.map((r) => Object.fromEntries(rs.headers.map((h, i) => [h, r[i]])) as Record<string, any>);

// --- Small parsers ---------------------------------------------------------------

export type GameKind = 'preseason' | 'regular' | 'all-star' | 'playoffs' | 'play-in' | 'cup-final';
const KINDS: Record<string, GameKind> = {
  '1': 'preseason', '2': 'regular', '3': 'all-star', '4': 'playoffs', '5': 'play-in', '6': 'cup-final',
};
/** The third digit of an NBA game id says what kind of game it is. */
export const gameKind = (gameId: string): GameKind | undefined => KINDS[gameId.charAt(2)];

/** "PT11M45.00S" -> 11:45. Tenths are dropped, as a scoreboard does. */
export function clockParts(iso: string) {
  const m = /PT(\d+)M(\d+)/.exec(iso ?? '');
  return { min: m ? Number(m[1]) : 0, sec: m ? Number(m[2]) : 0 };
}

/** "PT36M01.00S" -> 36.0167 minutes. */
export function minutesPlayed(iso: string) {
  const m = /PT(\d+)M([\d.]+)S/.exec(iso ?? '');
  return m ? Number(m[1]) + Number(m[2]) / 60 : 0;
}

/** "6-8" -> 80. */
export function inches(height: string) {
  const m = /^(\d+)-(\d+)$/.exec(height ?? '');
  return m ? Number(m[1]) * 12 + Number(m[2]) : null;
}

/** Why a player sat, from the feed's code: "DND_INJURY" -> "did not dress, injury". */
export function benchReason(code: string | undefined) {
  if (!code) return null;
  if (code === 'DNP_COACH') return "coach's decision";
  return code
    .replace(/^DND_/, 'did not dress, ')
    .replace(/^INACTIVE_/, 'inactive, ')
    .replace(/^DNP_/, '')
    .replace(/_/g, ' ')
    .toLowerCase();
}

/** What `games.broadcast` holds: each outlet once, national first, the side in brackets for local ones. */
export type Broadcast = { tv: string[]; radio: string[] };

/** A schedule game's `broadcasters` block, cut down to names. */
export function broadcastOf(b: any): Broadcast {
  const names = (list: any[] | undefined, side = '') =>
    (list ?? []).map((x) => `${x.broadcasterDisplay}${side}`).filter((n) => n.trim());
  const uniq = (xs: string[]) => [...new Set(xs)];
  return {
    tv: uniq([
      ...names(b?.nationalBroadcasters), ...names(b?.nationalOttBroadcasters),
      ...names(b?.homeTvBroadcasters, ' (home)'), ...names(b?.awayTvBroadcasters, ' (away)'),
    ]),
    radio: uniq([
      ...names(b?.nationalRadioBroadcasters),
      ...names(b?.homeRadioBroadcasters, ' (home)'), ...names(b?.awayRadioBroadcasters, ' (away)'),
    ]),
  };
}

// --- Box score -> game logs --------------------------------------------------------

export type LogRow = ReturnType<typeof logsFromBox>[number];

/** One line per player who got on the floor, plus what it takes to create him. */
export function logsFromBox(game: any) {
  return (['homeTeam', 'awayTeam'] as const).flatMap((side) =>
    (game[side].players as any[])
      .filter((p) => p.played === '1')
      .map((p) => {
        const s = p.statistics;
        return {
          playerId: p.personId as number,
          teamId: game[side].teamId as number,
          started: p.starter === '1',
          min: minutesPlayed(s.minutes),
          pts: s.points as number,
          reb: s.reboundsTotal as number,
          oreb: s.reboundsOffensive as number,
          dreb: s.reboundsDefensive as number,
          ast: s.assists as number,
          stl: s.steals as number,
          blk: s.blocks as number,
          tov: s.turnovers as number,
          pf: s.foulsPersonal as number,
          fgm: s.fieldGoalsMade as number,
          fga: s.fieldGoalsAttempted as number,
          fg3m: s.threePointersMade as number,
          fg3a: s.threePointersAttempted as number,
          ftm: s.freeThrowsMade as number,
          fta: s.freeThrowsAttempted as number,
          plusMinus: s.plusMinusPoints as number,
          firstName: p.firstName as string,
          lastName: p.familyName as string,
          jersey: (p.jerseyNum as string) || null,
          position: (p.position as string) || null,
        };
      }),
  );
}

// --- Play-by-play -> shots and plays -------------------------------------------------

/**
 * Every field goal attempt with its real location. xLegacy/yLegacy are the
 * same tenths-of-a-foot coordinates the site's shot charts use, with the
 * NBA's left corner on the negative side, as shotZone() expects.
 */
export function shotsFromPbp(game: any) {
  return (game.actions as any[])
    // A few arrive with no location (xLegacy: null); they can't be charted.
    .filter((a) => a.isFieldGoal === 1 && a.xLegacy != null && a.yLegacy != null)
    .map((a) => {
      const { min, sec } = clockParts(a.clock);
      const z = shotZone(a.xLegacy, a.yLegacy);
      return {
        eventNum: a.actionNumber as number,
        playerId: a.personId as number,
        teamId: a.teamId as number,
        x: a.xLegacy as number,
        y: a.yLegacy as number,
        distanceFt: Math.round(Math.hypot(a.xLegacy, a.yLegacy) / 10),
        made: a.shotResult === 'Made',
        assistId: (a.assistPersonId as number) || null,
        // The scorer's call, not the geometry: a toe on the line is a two.
        value: a.actionType === '3pt' ? 3 : 2,
        zone: z.zone,
        zoneArea: z.area,
        actionType: (a.subType as string) || (a.actionType as string),
        period: a.period as number,
        minsLeft: min,
        secsLeft: sec,
      };
    });
}

/**
 * Every action on a game page, in order, with what the play-by-play tab filters
 * and draws on: who did it (and who assisted or blocked it), the raw type and
 * subtype ("2pt" / "DUNK"), and for a field goal where it was taken, in the same
 * basket-origin tenths of a foot as `shotsFromPbp`.
 */
export function playsFromPbp(game: any) {
  return (game.actions as any[]).map((a) => {
    const { min, sec } = clockParts(a.clock);
    const fg = a.actionType === '2pt' || a.actionType === '3pt';
    return {
      id: a.actionNumber as number,
      period: a.period as number,
      clock: `${min}:${String(sec).padStart(2, '0')}`,
      description: a.description as string,
      eventType: fg
        ? a.shotResult === 'Made' ? 'SHOT' : 'MISS'
        : a.actionType === 'freethrow' ? 'FREE THROW' : String(a.actionType).toUpperCase(),
      type: a.actionType as string,
      subType: (a.subType as string) || '',
      teamAbbr: (a.teamTricode as string) ?? '',
      homeScore: Number(a.scoreHome),
      awayScore: Number(a.scoreAway),
      playerId: (a.personId as number) || null,
      player: (a.playerNameI as string) || null,
      assistId: (a.assistPersonId as number) || null,
      assist: (a.assistPlayerNameInitial as string) || null,
      blockId: (a.blockPersonId as number) || null,
      made: a.shotResult === 'Made',
      shot: fg ? { x: a.xLegacy as number, y: a.yLegacy as number, value: a.actionType === '3pt' ? 3 : 2 } : null,
    };
  });
}

// --- Play-by-play -> lineups and the clutch -------------------------------------------

/** "PT07M11.50S" -> 431.5 seconds left in the period. */
export function clockSeconds(iso: string) {
  const m = /PT(\d+)M([\d.]+)S/.exec(iso ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const periodLength = (p: number) => (p <= 4 ? 720 : 300);
/** Seconds into the game at a period's clock reading. */
const gameSeconds = (p: number, left: number) =>
  Math.min(p - 1, 4) * 720 + Math.max(0, p - 5) * 300 + periodLength(p) - left;

/** The NBA's clutch: the last five minutes of the fourth or overtime, the score within five. */
export const isClutch = (period: number, left: number, margin: number) =>
  period >= 4 && left <= 300 && Math.abs(margin) <= 5;

/** One team's five on the floor, from one change to the next. */
export type Stint = {
  teamId: number; players: number[]; period: number; start: number; seconds: number;
  pts: number; oppPts: number; poss: number; oppPoss: number; clutch: boolean;
} & Factors & { [K in keyof Factors as `opp${Capitalize<K>}`]: number };
/** The counts the four factors are built from, for one side over one stint. */
export type Factors = { fgm: number; fga: number; fg3m: number; ftm: number; fta: number; tov: number; oreb: number; dreb: number };
const FACTORS = ['fgm', 'fga', 'fg3m', 'ftm', 'fta', 'tov', 'oreb', 'dreb'] as const;
/** One player's box line in a game's clutch minutes. */
export type ClutchLine = {
  playerId: number; teamId: number; pts: number; fgm: number; fga: number; fg3m: number; fg3a: number;
  ftm: number; fta: number; reb: number; ast: number; stl: number; blk: number; tov: number;
};

type Tally = { pts: number } & Factors;
const zero = (): Tally => ({ pts: 0, fgm: 0, fga: 0, fg3m: 0, ftm: 0, fta: 0, tov: 0, oreb: 0, dreb: 0 });

/**
 * Every lineup stint and clutch line in a game. A stint ends at a substitution,
 * a period's end, or the game going into or out of the clutch, so each one is
 * wholly clutch or not. Possessions are Oliver's estimate over the stint.
 *
 * The feed names the first period's starters but not who starts the others:
 * that's whoever does something in the period before being subbed in (or is
 * subbed out first), topped up from the five who ended the last period.
 * ponytail: a sixth "starter" (a technical on the bench) is dropped, first five win.
 */
export function stintsFromPbp(pbp: any, box: any) {
  const home: number = box.homeTeam.teamId;
  const away: number = box.awayTeam.teamId;
  const teamOf = new Map<number, number>();
  const ended = new Map<number, number[]>([[home, []], [away, []]]);
  for (const t of [box.homeTeam, box.awayTeam])
    for (const p of t.players) {
      teamOf.set(p.personId, t.teamId);
      if (p.starter === '1') ended.get(t.teamId)!.push(p.personId);
    }
  const opp = (team: number) => (team === home ? away : home);

  const stints: Stint[] = [];
  const clutch = new Map<number, ClutchLine>();
  const cum: Record<number, Tally> = { [home]: zero(), [away]: zero() };
  const actions = pbp.actions as any[];

  for (const p of [...new Set(actions.map((a) => a.period as number))].sort((a, b) => a - b)) {
    // At one clock reading every substitution goes last, so free throws after a
    // mid-trip sub count for the five who were on for the foul. That matches the
    // NBA's box-score +/- on 97% of player-games; the rest are a point or two off,
    // because the NBA itself isn't consistent about it.
    const acts = actions
      .filter((a) => a.period === p)
      .map((a, i) => ({ a, i, sub: a.actionType === 'substitution' ? 1 : 0 }))
      .sort((x, y) => clockSeconds(y.a.clock) - clockSeconds(x.a.clock) || x.sub - y.sub || x.i - y.i)
      .map((x) => x.a);
    const lineup = new Map<number, Set<number>>();
    for (const team of [home, away]) {
      const seen = new Set<number>();
      const on: number[] = [];
      for (const a of acts) {
        const sub = a.actionType === 'substitution';
        for (const id of (sub ? [a.personId] : a.personIdsFilter ?? []) as number[]) {
          if (teamOf.get(id) !== team || seen.has(id)) continue;
          seen.add(id);
          if (!(sub && a.subType === 'in')) on.push(id);
        }
      }
      // Someone can play a whole period without touching the ball: keep last period's five.
      for (const id of ended.get(team)!) if (on.length < 5 && !seen.has(id)) on.push(id);
      lineup.set(team, new Set(p === 1 ? ended.get(team) : on.slice(0, 5)));
    }

    const margin = () => cum[home].pts - cum[away].pts;
    let inClutch = isClutch(p, periodLength(p), margin());
    const snap = () => ({ [home]: { ...cum[home] }, [away]: { ...cum[away] } });
    const open = new Map<number, { start: number; snap: Record<number, Tally>; clutch: boolean }>();
    const begin = (team: number, at: number) => open.set(team, { start: at, snap: snap(), clutch: inClutch });
    const close = (team: number, at: number) => {
      const o = open.get(team)!;
      const d = (t: number, k: keyof Tally) => cum[t][k] - o.snap[t][k];
      const poss = (t: number) => d(t, 'fga') + 0.44 * d(t, 'fta') - d(t, 'oreb') + d(t, 'tov');
      const players = [...lineup.get(team)!].sort((a, b) => a - b);
      // Mid-way through a batch of subs a lineup can be four or six for no time at all.
      // Free throws shot after a sub at the same clock reading can land in a stint of no length; keep it if anything was counted.
      const counted = FACTORS.some((k) => d(team, k) || d(opp(team), k));
      if (players.length === 5 && (at > o.start || d(team, 'pts') || d(opp(team), 'pts') || counted)) {
        const mine = Object.fromEntries(FACTORS.map((k) => [k, d(team, k)])) as Factors;
        const theirs = Object.fromEntries(FACTORS.map((k) => [`opp${k[0].toUpperCase()}${k.slice(1)}`, d(opp(team), k)]));
        stints.push({
          teamId: team, players, period: p, start: r1(o.start), seconds: r1(at - o.start),
          pts: d(team, 'pts'), oppPts: d(opp(team), 'pts'), poss: poss(team), oppPoss: poss(opp(team)), clutch: o.clutch,
          ...mine, ...theirs,
        } as Stint);
      }
      begin(team, at);
    };
    begin(home, gameSeconds(p, periodLength(p)));
    begin(away, gameSeconds(p, periodLength(p)));

    let lastLeft = periodLength(p);
    for (const a of acts) {
      const left = clockSeconds(a.clock);
      const now = gameSeconds(p, left);
      if (isClutch(p, left, margin()) !== inClutch) {
        // Into the clutch on the clock: the line is 5:00, not the next play.
        const at = lastLeft > 300 && left <= 300 && !inClutch ? gameSeconds(p, 300) : now;
        inClutch = !inClutch;
        close(home, at);
        close(away, at);
      }
      lastLeft = left;

      const team = a.teamId as number;
      if (a.actionType === 'substitution') {
        if (!lineup.has(team)) continue;
        close(team, now);
        if (a.subType === 'in') lineup.get(team)!.add(a.personId);
        else lineup.get(team)!.delete(a.personId);
        continue;
      }
      const made = a.shotResult === 'Made';
      if (cum[team]) {
        if (a.isFieldGoal === 1) {
          cum[team].fga++;
          if (made) {
            cum[team].fgm++;
            if (a.actionType === '3pt') cum[team].fg3m++;
          }
        }
        if (a.actionType === 'freethrow') {
          cum[team].fta++;
          if (made) cum[team].ftm++;
        }
        if (a.actionType === 'rebound' && a.subType === 'offensive') cum[team].oreb++;
        if (a.actionType === 'rebound' && a.subType === 'defensive') cum[team].dreb++;
        if (a.actionType === 'turnover') cum[team].tov++;
      }
      if (inClutch && teamOf.has(a.personId)) {
        const line = (id: number) => {
          if (!clutch.has(id))
            clutch.set(id, {
              playerId: id, teamId: teamOf.get(id)!, pts: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0,
              ftm: 0, fta: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
            });
          return clutch.get(id)!;
        };
        const l = line(a.personId);
        if (a.isFieldGoal === 1) {
          const three = a.actionType === '3pt';
          l.fga++;
          if (three) l.fg3a++;
          if (made) {
            l.fgm++;
            l.pts += three ? 3 : 2;
            if (three) l.fg3m++;
            if (teamOf.has(a.assistPersonId)) line(a.assistPersonId).ast++;
          }
        }
        if (a.actionType === 'freethrow') {
          l.fta++;
          if (made) { l.ftm++; l.pts++; }
        }
        if (a.actionType === 'rebound') l.reb++;
        if (a.actionType === 'turnover') l.tov++;
        if (a.actionType === 'steal') l.stl++;
        if (a.actionType === 'block') l.blk++;
      }
      cum[home].pts = Number(a.scoreHome) || cum[home].pts;
      cum[away].pts = Number(a.scoreAway) || cum[away].pts;
      // A basket that brings it within five (or takes it out) moves the line right here.
      if (isClutch(p, left, margin()) !== inClutch) {
        inClutch = !inClutch;
        close(home, now);
        close(away, now);
      }
    }
    const end = gameSeconds(p, 0);
    close(home, end);
    close(away, end);
    for (const team of [home, away]) ended.set(team, [...lineup.get(team)!]);
  }
  return { stints, clutch: [...clutch.values()] };
}

export type Leader = { playerId: number; name: string; jersey?: string | null; pts: number; reb: number; ast: number };
/** What `games.leaders` holds. */
export type GameLeaders = { home: Leader | null; away: Leader | null };

/** A scoreboard feed's `gameLeaders.homeLeaders` (live CDN board or stats.nba.com scoreboardv3). */
export const leaderOf = (l: any): Leader | null =>
  l?.personId
    ? { playerId: l.personId, name: l.name, jersey: l.jerseyNum || null, pts: l.points, reb: l.rebounds, ast: l.assists }
    : null;

/**
 * A team's top performer in a box score (live CDN or stats.nba.com boxscoretraditionalv3,
 * which share field names): a 30-point scorer if there is one, the biggest; otherwise
 * the most points + rebounds + assists, ties to the scorer. Players who sat score 0 and never win.
 */
export function topOf(team: any): Leader | null {
  const lines = (team.players as any[]).map((p) => ({
    playerId: p.personId as number,
    name: `${p.firstName} ${p.familyName}`.trim(),
    jersey: (p.jerseyNum as string) || null,
    pts: (p.statistics.points ?? 0) as number,
    reb: (p.statistics.reboundsTotal ?? 0) as number,
    ast: (p.statistics.assists ?? 0) as number,
  }));
  const pra = (l: Leader) => l.pts + l.reb + l.ast;
  const [best] = lines.sort((a, b) =>
    Math.max(b.pts, 29) - Math.max(a.pts, 29) || pra(b) - pra(a) || b.pts - a.pts,
  );
  return best ?? null;
}

/** Points by period, OT included, from any NBA feed's team (`periods: [{ score }]`). */
export const lineOf = (team: any): number[] => ((team.periods ?? []) as any[]).map((p) => p.score as number);
