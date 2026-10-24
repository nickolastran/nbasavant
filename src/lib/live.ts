/**
 * Live data for the pages: today's scoreboard, and one game's box score and
 * play-by-play, straight from the NBA's CDN through Next's data cache (so the
 * NBA sees one request per cache window however many people are watching).
 * Nothing in progress is stored. When the scoreboard first sees a game go
 * final, it saves that game after the response has gone out.
 */
import { after } from 'next/server';
import { prisma } from './db';
import { FEEDS, benchReason, clockParts, leaderOf, lineOf, logsFromBox, nbaJson, playsFromPbp, shotsFromPbp, type Leader } from './nba';
import { syncGame } from './sync';

export type LiveState = 'pre' | 'live' | 'final';

export type LiveLeader = Leader;

export type LiveGame = {
  gameCode: string;
  state: LiveState;
  /** What a scoreboard prints: "3rd Qtr 5:21", "Half", "Final/OT", "7:30 pm ET". */
  status: string;
  /** Scheduled tip-off, ISO UTC. */
  start: string;
  period: number;
  home: LiveSide;
  away: LiveSide;
};

/** `periods` is points by period, OT included; the feed zero-fills quarters not yet played. */
type LiveSide = { abbr: string; score: number; record: string; periods: number[]; leader: LiveLeader | null };

const STATE: Record<number, LiveState> = { 1: 'pre', 2: 'live', 3: 'final' };

function side(t: any, leader: any): LiveSide {
  return {
    abbr: t.teamTricode,
    score: t.score ?? 0,
    record: t.wins !== undefined ? `${t.wins}-${t.losses}` : '',
    periods: lineOf(t),
    leader: leaderOf(leader),
  };
}

/** The feed's "1st Qtr" plus the time left in it; a stopped-at-zero clock (end of a quarter, half) adds nothing. */
function withClock(g: any) {
  const status = String(g.gameStatusText).trim();
  const { min, sec } = clockParts(g.gameClock);
  if (g.gameStatus !== 2 || !(min || sec) || /\d:\d\d/.test(status)) return status;
  return `${status} ${min}:${String(sec).padStart(2, '0')}`;
}

/**
 * A game's own box score laid over its scoreboard entry. The scoreboard file
 * sometimes freezes one game (a "Halftime" at 38-39 while the box score is
 * at 6:28 of the second quarter); the box score keeps moving, so it wins.
 */
export function fromBox(g: LiveGame, box: any): LiveGame {
  return {
    ...g,
    state: STATE[box.gameStatus] ?? g.state,
    status: withClock(box),
    period: box.period ?? g.period,
    home: { ...g.home, score: box.homeTeam.score ?? g.home.score, periods: lineOf(box.homeTeam) },
    away: { ...g.away, score: box.awayTeam.score ?? g.away.score, periods: lineOf(box.awayTeam) },
  };
}

/** Today's slate by the NBA's own calendar, or null when the feed can't be reached. */
export async function liveScoreboard(): Promise<{ date: string; games: LiveGame[] } | null> {
  let board: any;
  try {
    board = (await nbaJson(FEEDS.scoreboard, 5)).scoreboard;
  } catch (e) {
    console.error('live scoreboard unavailable:', e instanceof Error ? e.message : e);
    return null;
  }
  const listed: LiveGame[] = (board.games as any[]).map((g) => ({
    gameCode: g.gameId,
    state: STATE[g.gameStatus] ?? 'pre',
    status: withClock(g),
    start: g.gameTimeUTC,
    period: g.period ?? 0,
    home: side(g.homeTeam, g.gameLeaders?.homeLeaders),
    away: side(g.awayTeam, g.gameLeaders?.awayLeaders),
  }));
  // Anything past tip-off and not final checks its box score (cached 10 s, the
  // same entry the game page reads). No box yet means not started: keep the listing.
  const games = await Promise.all(
    listed.map((g) =>
      g.state === 'final' || Date.parse(g.start) > Date.now()
        ? g
        : nbaJson(FEEDS.box(g.gameCode), 10).then((r) => fromBox(g, r.game), () => g),
    ),
  );

  // Write-through: save finals the database hasn't recorded yet. Several
  // visitors can trigger the same one; syncGame is idempotent, so that's fine.
  const finals = games.filter((g) => g.state === 'final').map((g) => g.gameCode);
  if (finals.length) {
    const saved = await prisma.game.findMany({
      where: { gameCode: { in: finals }, status: { startsWith: 'Final' } },
      select: { gameCode: true },
    });
    const pending = finals.filter((code) => !saved.some((s) => s.gameCode === code));
    if (pending.length) {
      after(() =>
        Promise.all(pending.map((code) => syncGame(prisma, code).catch((e) => console.error('write-through', code, e)))),
      );
    }
  }
  return { date: board.gameDate, games };
}

const STAT_ROWS = [
  ['Field goals', 'fieldGoalsMade', 'fieldGoalsAttempted'],
  ['Three pointers', 'threePointersMade', 'threePointersAttempted'],
  ['Free throws', 'freeThrowsMade', 'freeThrowsAttempted'],
  ['Rebounds', 'reboundsTotal'],
  ['Offensive rebounds', 'reboundsOffensive'],
  ['Assists', 'assists'],
  ['Steals', 'steals'],
  ['Blocks', 'blocks'],
  ['Turnovers', 'turnoversTotal'],
  ['Points in the paint', 'pointsInThePaint'],
  ['Fast break points', 'pointsFastBreak'],
  ['Second chance points', 'pointsSecondChance'],
  ['Bench points', 'benchPoints'],
  ['Biggest lead', 'biggestLead'],
] as const;

/**
 * One game's box score, team comparison, play-by-play and real shots.
 * Cached 10 s while it can still change, a day once it's final. null before
 * the NBA publishes a box score (it appears around tip-off).
 */
export async function liveGame(gameCode: string, final: boolean) {
  const revalidate = final ? 86_400 : 10;
  let box: any;
  try {
    box = (await nbaJson(FEEDS.box(gameCode), revalidate)).game;
  } catch {
    return null;
  }
  const pbp = await nbaJson(FEEDS.pbp(gameCode), revalidate).then((r) => r.game).catch(() => null);

  const names = new Map<number, string>();
  const team = (t: any) => {
    for (const p of t.players) names.set(p.personId, `${p.firstName} ${p.familyName}`.trim());
    return {
      teamId: t.teamId as number,
      abbr: t.teamTricode as string,
      score: t.score as number,
      periods: (t.periods as any[]).map((p) => p.score as number),
      stats: STAT_ROWS.map(([label, made, att]) => ({
        label,
        text: att ? `${t.statistics[made]}-${t.statistics[att]}` : String(t.statistics[made] ?? '—'),
        pct: att && t.statistics[att] ? (t.statistics[made] / t.statistics[att]) * 100 : null,
      })),
      /** Who didn't get in, and why, when the feed says. */
      inactive: (t.players as any[])
        .filter((p) => p.played !== '1')
        .map((p) => ({
          playerId: p.personId as number,
          name: `${p.firstName} ${p.familyName}`.trim(),
          jersey: (p.jerseyNum as string) || null,
          reason: benchReason(p.notPlayingReason),
        })),
      /** The five on the floor right now (all five at the last whistle once it's final). */
      onCourt: (t.players as any[]).filter((p) => p.oncourt === '1').map((p) => p.personId as number),
      /** The box score's team numbers as the NBA sends them, for the Team stats tab. */
      totals: t.statistics as Record<string, number | string>,
      bonus: t.inBonus === '1',
      timeouts: (t.timeoutsRemaining as number | undefined) ?? null,
    };
  };
  const home = team(box.homeTeam);
  const away = team(box.awayTeam);
  const { min, sec } = clockParts(box.gameClock);
  return {
    state: STATE[box.gameStatus] ?? 'pre',
    status: String(box.gameStatusText).trim(),
    clock: box.gameStatus === 2 ? `${min}:${String(sec).padStart(2, '0')}` : '',
    period: box.period as number,
    arena: box.arena ? `${box.arena.arenaName}, ${box.arena.arenaCity}` : null,
    officials: ((box.officials as any[]) ?? []).map((o) => o.name as string),
    attendance: (box.attendance as number) || null,
    home,
    away,
    logs: logsFromBox(box).map((l) => ({ ...l, name: names.get(l.playerId) ?? '' })),
    plays: pbp ? playsFromPbp(pbp) : [],
    shots: pbp ? shotsFromPbp(pbp).map((s) => ({ ...s, player: names.get(s.playerId) ?? '' })) : [],
  };
}

