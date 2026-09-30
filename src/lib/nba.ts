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
    .filter((a) => a.isFieldGoal === 1)
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

/** The filterable feed on a game page, in the shape PlayByPlay renders. */
export function playsFromPbp(game: any) {
  return (game.actions as any[]).map((a) => {
    const { min, sec } = clockParts(a.clock);
    const fg = a.actionType === '2pt' || a.actionType === '3pt';
    return {
      period: a.period as number,
      clock: `${min}:${String(sec).padStart(2, '0')}`,
      description: a.description as string,
      eventType: fg
        ? a.shotResult === 'Made' ? 'SHOT' : 'MISS'
        : a.actionType === 'freethrow' ? 'FREE THROW' : String(a.actionType).toUpperCase(),
      teamAbbr: (a.teamTricode as string) ?? '',
      homeScore: Number(a.scoreHome),
      awayScore: Number(a.scoreAway),
    };
  });
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
