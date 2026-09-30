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
  /** What a scoreboard prints: "Q3 5:21", "Half", "Final/OT", "7:30 pm ET". */
  status: string;
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

/** Today's slate by the NBA's own calendar, or null when the feed can't be reached. */
export async function liveScoreboard(): Promise<{ date: string; games: LiveGame[] } | null> {
  let board: any;
  try {
    board = (await nbaJson(FEEDS.scoreboard, 10)).scoreboard;
  } catch (e) {
    console.error('live scoreboard unavailable:', e instanceof Error ? e.message : e);
    return null;
  }
  const games: LiveGame[] = (board.games as any[]).map((g) => ({
    gameCode: g.gameId,
    state: STATE[g.gameStatus] ?? 'pre',
    status: String(g.gameStatusText).trim(),
    period: g.period ?? 0,
    home: side(g.homeTeam, g.gameLeaders?.homeLeaders),
    away: side(g.awayTeam, g.gameLeaders?.awayLeaders),
  }));

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
        .map((p) => ({ name: `${p.firstName} ${p.familyName}`.trim(), reason: benchReason(p.notPlayingReason) })),
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
    home,
    away,
    logs: logsFromBox(box).map((l) => ({ ...l, name: names.get(l.playerId) ?? '' })),
    plays: pbp ? playsFromPbp(pbp) : [],
    shots: pbp ? shotsFromPbp(pbp).map((s) => ({ ...s, player: names.get(s.playerId) ?? '' })) : [],
  };
}

