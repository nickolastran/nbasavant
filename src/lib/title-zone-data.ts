import { unstable_cache } from 'next/cache';
import { byRecord, prisma, seasonStandings } from '@/lib/db';
import { todayEt } from '@/lib/dates';
import { srs } from '@/lib/metrics';
import { type Level, type Point, type TeamGame, inZone, landscape, schedule, titleMarks } from '@/lib/title-zone';
import { TITLE_ZONE as cfg } from '@/lib/title-zone.config';

export type ZoneTeam = {
  id: number;
  abbr: string;
  name: string;
  color: string;
  conference: string | null;
  seed: number | null;
  srs: number | null;
  /** Title marks met, and whether the star shows (in the zone with enough marks). */
  marks: { pace: boolean; srs: boolean; seed: boolean; count: number };
  star: boolean;
  next: { games: number; home: number; away: number; oppNet: number; level: Level; push: number } | null;
};
/** [teamId, relOff, relDef, gp, wins, losses], rounded: one team on one day. */
export type Dot = [number, number, number, number, number, number];
export type Frame = { date: string; season: Dot[]; recent: Dot[] };
export type Mover = { teamId: number; delta: number; net: number; result: string };
export type ZoneData = Awaited<ReturnType<typeof buildTitleZone>>;

const r2 = (v: number) => Math.round(v * 100) / 100;
const dot = (p: Point): Dot => [p.teamId, r2(p.relOff), r2(p.relDef), p.gp, p.wins, p.losses];

export async function buildTitleZone(seasonId: number) {
  const today = todayEt();
  const [rows, standings, stats, upcoming, champions] = await Promise.all([
    // Every finished regular-season game, with each side's box totals where a box score is on file.
    prisma.$queryRaw<{ gameId: number; date: Date; home: number; away: number; homeScore: number; awayScore: number; period: number; teamId: number | null; fga: number | null; fta: number | null; oreb: number | null; tov: number | null }[]>`
      SELECT g.id AS "gameId", g.date, g."homeTeamId" AS home, g."awayTeamId" AS away, g."homeScore", g."awayScore", g.period,
             l."teamId", sum(l.fga)::int AS fga, sum(l.fta)::int AS fta, sum(l.oreb)::int AS oreb, sum(l.tov)::int AS tov
      FROM games g LEFT JOIN player_game_logs l ON l."gameId" = g.id
      WHERE g."seasonId" = ${seasonId} AND g.kind = 'regular' AND g.status LIKE 'Final%'
      GROUP BY g.id, l."teamId"`,
    seasonStandings(seasonId),
    prisma.teamStats.findMany({ where: { seasonId }, select: { teamId: true, gp: true, pts: true, oppPts: true, sos: true, pace: true } }),
    prisma.game.findMany({
      where: { seasonId, kind: 'regular', NOT: { status: { startsWith: 'Final' } }, date: { gte: new Date(today) } },
      orderBy: { date: 'asc' },
      select: { homeTeamId: true, awayTeamId: true },
    }),
    championCheck(),
  ]);

  // A game's possessions are its two box scores' estimates averaged. A final with no box score on file
  // (a sync that missed it) falls back to the two teams' season pace over the minutes played, so no result is left out.
  const paceOf = new Map(stats.map((t) => [t.teamId, t.pace]));
  const sides = new Map<number, typeof rows>();
  for (const r of rows) sides.set(r.gameId, [...(sides.get(r.gameId) ?? []), r]);
  const games: TeamGame[] = [];
  let estimated = 0;
  for (const [gameId, pair] of sides) {
    const g = pair[0];
    let poss: number;
    if (pair.length === 2 && pair.every((t) => t.fga !== null)) {
      poss = pair.reduce((s, t) => s + t.fga! + 0.44 * t.fta! - t.oreb! + t.tov!, 0) / 2;
    } else {
      const [ph, pa] = [paceOf.get(g.home), paceOf.get(g.away)];
      if (!ph || !pa) continue;
      poss = ((ph + pa) / 2) * (48 + 5 * Math.max(0, g.period - 4)) / 48;
      estimated++;
    }
    const date = g.date.toISOString().slice(0, 10);
    games.push({ gameId, teamId: g.home, oppId: g.away, date, home: true, poss, pts: g.homeScore, oppPts: g.awayScore });
    games.push({ gameId, teamId: g.away, oppId: g.home, date, home: false, poss, pts: g.awayScore, oppPts: g.homeScore });
  }

  const dates = [...new Set(games.map((g) => g.date))].sort();
  const frames: Frame[] = dates.map((date) => ({
    date,
    season: landscape(games, date).map(dot),
    recent: landscape(games, date, cfg.recentGames).map(dot),
  }));
  const now = dates.length ? landscape(games, dates[dates.length - 1]) : [];
  const before = dates.length > 1 ? landscape(games, dates[dates.length - 2]) : [];
  const nowOf = new Map(now.map((p) => [p.teamId, p]));
  const netOf = new Map(now.map((p) => [p.teamId, p.net]));

  // Seeds: place within the conference by record.
  const seedOf = new Map<number, number>();
  for (const conf of new Set(standings.map((s) => s.conference))) {
    standings.filter((s) => s.conference === conf).sort(byRecord).forEach((s, i) => seedOf.set(s.teamId, i + 1));
  }
  const statOf = new Map(stats.map((s) => [s.teamId, s]));

  const teams: ZoneTeam[] = standings
    .filter((s) => nowOf.has(s.teamId))
    .map((s) => {
      const p = nowOf.get(s.teamId)!;
      const st = statOf.get(s.teamId);
      const teamSrs = st ? srs(st.pts, st.oppPts, st.gp, st.sos) : null;
      const seed = seedOf.get(s.teamId) ?? null;
      const marks = titleMarks(p, teamSrs, seed, cfg);
      return {
        id: s.teamId, abbr: s.abbr, name: s.name, color: s.color, conference: s.conference, seed,
        srs: teamSrs === null ? null : r2(teamSrs), marks, star: inZone(p, cfg) && marks.count >= cfg.starAt,
        next: schedule(s.teamId, upcoming.map((g) => ({ homeId: g.homeTeamId, awayId: g.awayTeamId })), netOf, p.gp, cfg),
      };
    });

  // Movers: the change in season net rating over the latest game day, for teams that played on it.
  const last = dates[dates.length - 1];
  const beforeOf = new Map(before.map((p) => [p.teamId, p.net]));
  const abbrOf = new Map(teams.map((t) => [t.id, t.abbr]));
  const lastGames = games.filter((g) => g.date === last);
  const movers: Mover[] = lastGames
    .filter((g) => beforeOf.has(g.teamId) && nowOf.has(g.teamId))
    .map((g) => ({
      teamId: g.teamId,
      net: r2(nowOf.get(g.teamId)!.net),
      delta: r2(nowOf.get(g.teamId)!.net - beforeOf.get(g.teamId)!),
      result: `${g.pts > g.oppPts ? 'W' : 'L'} ${g.pts}-${g.oppPts} ${g.home ? 'vs' : '@'} ${abbrOf.get(g.oppId) ?? ''}`,
    }))
    .sort((a, b) => b.delta - a.delta);
  const results = lastGames
    .filter((g) => g.home)
    .map((g) => ({ gameId: g.gameId, home: abbrOf.get(g.teamId) ?? '', away: abbrOf.get(g.oppId) ?? '', homePts: g.pts, awayPts: g.oppPts }));

  // Net rating a day earlier, for the up/down/flat icon beside each zone team.
  const prevNet = Object.fromEntries(before.map((p) => [p.teamId, r2(p.net)]));
  return { teams, frames, movers, results, last: last ?? null, prevNet, champions, games: games.length / 2, estimated };
}

/**
 * How the zone's thresholds sit against history: of the champions since
 * `championsSince`, how many finished their regular season inside it. A
 * season's league average is the mean of its teams' offensive ratings.
 */
async function championCheck() {
  const finals = await prisma.$queryRaw<{ seasonId: number; winner: number }[]>`
    SELECT DISTINCT ON (g."seasonId") g."seasonId",
           CASE WHEN g."homeScore" > g."awayScore" THEN g."homeTeamId" ELSE g."awayTeamId" END AS winner
    FROM games g JOIN seasons s ON s.id = g."seasonId"
    WHERE g.kind = 'playoffs' AND g.status LIKE 'Final%' AND s."endYear" >= ${cfg.championsSince}
    ORDER BY g."seasonId", g.date DESC, g.id DESC`;
  if (!finals.length) return null;
  const stats = await prisma.teamStats.findMany({
    where: { seasonId: { in: finals.map((f) => f.seasonId) }, ortg: { not: null }, drtg: { not: null } },
    select: { seasonId: true, teamId: true, ortg: true, drtg: true },
  });
  let total = 0, inside = 0;
  for (const f of finals) {
    const season = stats.filter((s) => s.seasonId === f.seasonId);
    const champ = season.find((s) => s.teamId === f.winner);
    if (!champ || !season.length) continue;
    const league = season.reduce((s, t) => s + t.ortg!, 0) / season.length;
    total++;
    if (inZone({ relOff: champ.ortg! - league, relDef: league - champ.drtg! }, cfg)) inside++;
  }
  return total ? { total, inside, since: cfg.championsSince } : null;
}

/** The whole chart's data for a season, kept for five minutes: it only changes when a game goes final. */
export const titleZoneData = unstable_cache(buildTitleZone, ['title-zone'], { revalidate: 300 });
