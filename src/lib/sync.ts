/**
 * Every write the site makes after the one-time history ingest, as idempotent
 * steps: run any of them twice and the database ends up the same. Called by
 * the daily cron (/api/cron/sync), by `npm run sync`, and by the live
 * scoreboard the moment it sees a game go final.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { TEAMS } from '../../prisma/teams';
import { fetchPlayoffs, fetchSeason, nn, type PlayerSeason, type TeamSeason } from './bref';
import { shiftDay, todayEt } from './dates';
import { matcher, resolvePlayer } from './identity';
import { FEEDS, broadcastOf, gameKind, inches, lineOf, logsFromBox, nbaJson, rowsOf, shotsFromPbp, stintsFromPbp, topOf, type GameLeaders } from './nba';
import {
  LEAGUE_2024_25, boxPlusMinus, centerBpm, efgPct, playerDrtg, playerOrtg, tsPct, vorp,
  type BoxTotals, type SeasonLine, type TeamTotals,
} from './stats';

const KNOWN_TEAMS = new Set(TEAMS.map((t) => t.id));
const r1 = (x: number) => Math.round(x * 10) / 10;

export const chunked = async <T>(rows: T[], size: number, fn: (c: T[]) => Promise<unknown>) => {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
};

// --- Season totals (basketball-reference) -------------------------------------

/**
 * Our ORtg/DRtg and BPM estimates need turnovers and offensive rebounds on both
 * the player and team side; before 1973-74 those weren't kept, so they stay null.
 */
function boxInputs(p: PlayerSeason['line'], t: TeamSeason | undefined) {
  const b = t?.box;
  const inputs = [p.min, p.tov, p.oreb, p.dreb, p.ast, p.stl, p.blk, b?.min, b?.tov, b?.oreb, t?.oppPts];
  if (inputs.some((v) => v === null || v === undefined)) return null;
  return { player: p as BoxTotals, team: { ...(b as BoxTotals), gp: t!.gp, oppPts: t!.oppPts! } as TeamTotals };
}

function ratings(p: PlayerSeason['line'], t: TeamSeason | undefined) {
  const x = boxInputs(p, t);
  if (!x) return { ortg: null, drtg: null };
  return { ortg: r1(playerOrtg(x.player, x.team, LEAGUE_2024_25)), drtg: r1(playerDrtg(x.player, x.team)) };
}

/**
 * Our BPM and VORP for every player with the inputs, by player id. BR leaves
 * its own blank for the first weeks of a season; these stand in until it
 * fills them (see stats.ts for how far off they can be).
 */
function estimates(rows: { id: number; teamId: number; line: PlayerSeason['line'] }[], byTeam: Map<number, TeamSeason>) {
  const fits = rows.flatMap(({ id, teamId, line }) => {
    const x = boxInputs(line, byTeam.get(teamId));
    return x ? [{ id, ...x, ...boxPlusMinus(x.player, x.team, LEAGUE_2024_25), min: x.player.min }] : [];
  });
  return new Map(
    centerBpm(fits).map((b, i) => {
      const { id, player, team } = fits[i];
      return [id, { obpm: r1(b.obpm), dbpm: r1(b.dbpm), bpm: r1(b.bpm), vorp: r1(vorp(b.bpm, player.min, team.min, team.gp)) }];
    }),
  );
}

/** The per-game and shooting rates stored beside a line, so tables can sort on them. */
function rates(l: SeasonLine) {
  const perGame = (v: number | null) => (v === null || !l.gp ? null : r1(v / l.gp));
  const pct = (made: number | null, att: number | null) => (made !== null && att ? r1((made / att) * 100) : null);
  return {
    ppg: l.gp ? r1(l.pts / l.gp) : 0,
    rpg: perGame(l.reb),
    apg: perGame(l.ast),
    fgPct: pct(l.fgm, l.fga),
    fg3Pct: pct(l.fg3m, l.fg3a),
    ftPct: pct(l.ftm, l.fta),
    tsPct: l.fga + l.fta ? r1(tsPct(l)) : null,
    // No three-point line before 1979-80: a missing 3PM is zero threes.
    efgPct: l.fga ? r1(efgPct({ fgm: l.fgm, fg3m: l.fg3m ?? 0, fga: l.fga })) : null,
  };
}

/**
 * Replace one season's player, advanced and team rows with what BR has now.
 * `idFor` turns each BR slug into the player's id (see identity.ts).
 */
export async function writeSeason(
  db: PrismaClient,
  seasonId: number,
  { teams, players }: { teams: TeamSeason[]; players: PlayerSeason[] },
  idFor: (p: PlayerSeason) => number,
) {
  const rows = players.map((p) => ({ ...p, id: idFor(p) }));

  // Players first; stats rows point at them. A player the roster sync created
  // first learns his slug here, and BR's name (it keeps the accents: Jokić).
  await chunked(rows, 1000, (c) =>
    db.player.createMany({
      data: c.map((p) => {
        const sp = p.name.indexOf(' ');
        return {
          id: p.id,
          brSlug: p.slug,
          firstName: sp < 0 ? p.name : p.name.slice(0, sp),
          lastName: sp < 0 ? '' : p.name.slice(sp + 1),
          fullName: p.name,
          position: p.position,
          teamId: p.teamId,
        };
      }),
      skipDuplicates: true,
    }),
  );
  await db.$executeRaw`
    UPDATE players p SET
      "brSlug" = COALESCE(p."brSlug", v.slug),
      "fullName" = v.name, "firstName" = split_part(v.name, ' ', 1),
      "lastName" = substr(v.name, length(split_part(v.name, ' ', 1)) + 2),
      position = CASE WHEN p.position IN ('PG', 'SG', 'SF', 'PF', 'C') THEN p.position ELSE COALESCE(v.pos, p.position) END
    FROM (
      SELECT unnest(${rows.map((r) => r.id)}::int[]) AS id,
             unnest(${rows.map((r) => r.slug)}::text[]) AS slug,
             unnest(${rows.map((r) => r.name)}::text[]) AS name,
             unnest(${rows.map((r) => r.position)}::text[]) AS pos
    ) v
    WHERE p.id = v.id AND v.name <> ''`;

  const byTeam = new Map(teams.map((t) => [t.teamId, t]));
  const stats = rows.map(({ id, teamId, line: l, adv }) => ({
    playerId: id, seasonId, teamId, ...l, ...rates(l), usgPct: nn(adv?.usg_pct),
  }));
  const est = estimates(rows, byTeam);
  const advanced = rows
    .filter((p) => p.adv)
    .map(({ id, teamId, line, adv: a }) => {
      const { ortg, drtg } = ratings(line, byTeam.get(teamId));
      const e = est.get(id);
      return {
        playerId: id, seasonId,
        per: nn(a!.per), ows: nn(a!.ows), dws: nn(a!.dws), ws: nn(a!.ws), ws48: nn(a!.ws_per_48),
        obpm: nn(a!.obpm) ?? e?.obpm ?? null, dbpm: nn(a!.dbpm) ?? e?.dbpm ?? null,
        bpm: nn(a!.bpm) ?? e?.bpm ?? null, vorp: nn(a!.vorp) ?? e?.vorp ?? null,
        astPct: nn(a!.ast_pct), rebPct: nn(a!.trb_pct), stlPct: nn(a!.stl_pct),
        blkPct: nn(a!.blk_pct), tovPct: nn(a!.tov_pct),
        ortg, drtg, netRtg: ortg !== null && drtg !== null ? r1(ortg - drtg) : null,
      };
    });
  const teamRows = teams.map((t) => ({
    ...teamLine(t), seasonId, conference: t.conference, division: t.division,
  }));

  await db.$transaction([
    db.advancedStats.deleteMany({ where: { seasonId } }),
    db.playerStats.deleteMany({ where: { seasonId } }),
    db.teamStats.deleteMany({ where: { seasonId } }),
    db.teamStats.createMany({ data: teamRows }),
    db.playerStats.createMany({ data: stats }),
    db.advancedStats.createMany({ data: advanced }),
  ]);
  return { players: stats.length, advanced: advanced.length, teams: teamRows.length };
}

/** A team's record, ratings and totals, the columns TeamStats and TeamSplitStats share. */
function teamLine(t: TeamSeason) {
  const b = t.box;
  return {
    teamId: t.teamId, name: t.name, gp: t.gp, wins: t.wins, losses: t.losses, ...t.ratings,
    pts: b.pts, oppPts: t.oppPts, reb: b.reb, oreb: b.oreb, dreb: b.dreb, ast: b.ast, stl: b.stl,
    blk: b.blk, tov: b.tov, pf: b.pf, fgm: b.fgm, fga: b.fga, fg3m: b.fg3m, fg3a: b.fg3a, ftm: b.ftm, fta: b.fta,
  };
}

/**
 * One season's playoff lines from BR, players and teams, replacing what's
 * stored. Every playoff player played that regular season, so his slug is
 * already on file; one that somehow isn't is skipped rather than guessed.
 */
export async function writePlayoffs(
  db: PrismaClient,
  seasonId: number,
  { players, teams }: { players: PlayerSeason[]; teams: TeamSeason[] },
) {
  const ids = new Map(
    (await db.player.findMany({ where: { brSlug: { in: players.map((p) => p.slug) } }, select: { id: true, brSlug: true } }))
      .map((p) => [p.brSlug!, p.id]),
  );
  const data = players
    .filter((p) => ids.has(p.slug))
    .map(({ slug, teamId, line: l, adv: a }) => ({
      playerId: ids.get(slug)!, seasonId, kind: 'playoffs', teamId, ...l, ...rates(l),
      usgPct: nn(a?.usg_pct), per: nn(a?.per), ows: nn(a?.ows), dws: nn(a?.dws), ws: nn(a?.ws),
      ws48: nn(a?.ws_per_48), obpm: nn(a?.obpm), dbpm: nn(a?.dbpm), bpm: nn(a?.bpm), vorp: nn(a?.vorp),
      astPct: nn(a?.ast_pct), rebPct: nn(a?.trb_pct),
    }));
  await db.$transaction([
    db.splitStats.deleteMany({ where: { seasonId, kind: 'playoffs' } }),
    db.splitStats.createMany({ data }),
    db.teamSplitStats.deleteMany({ where: { seasonId, kind: 'playoffs' } }),
    db.teamSplitStats.createMany({ data: teams.map((t) => ({ ...teamLine(t), seasonId, kind: 'playoffs' })) }),
  ]);
  return data.length;
}

/** The newest season's playoff lines, once a playoff game is final. Two requests. */
export async function syncPlayoffs(db: PrismaClient) {
  const season = await db.season.findFirst({ orderBy: { startYear: 'desc' } });
  if (!season) return 'no seasons';
  const started = await db.game.count({ where: { seasonId: season.id, kind: 'playoffs', status: { startsWith: 'Final' } } });
  if (!started) return `${season.key} playoffs not started`;
  return `${season.key}: ${await writePlayoffs(db, season.id, await fetchPlayoffs(season.endYear, { tries: 1 }))} players`;
}

/**
 * One season's preseason lines, players and teams, summed from its box scores
 * (BR keeps no preseason). Rebuilt whole each time: a preseason is a few
 * hundred rows. A team's line is its players' lines added up, so team
 * rebounds (credited to no player) are left out, as box score totals do.
 * Finals are saved several at once, so the rebuild holds a lock: each one
 * reads the logs only after the last has written.
 */
export async function syncPreseason(db: PrismaClient, seasonId: number) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${seasonId})`;
    const logs = await tx.playerGameLog.findMany({
      where: { seasonId, game: { kind: 'preseason' } },
      orderBy: { date: 'asc' },
    });
    const sums = new Map<number, { teamId: number; line: SeasonLine }>();
    for (const g of logs) {
      const s = sums.get(g.playerId) ?? {
        teamId: g.teamId,
        line: { gp: 0, gs: 0, min: 0, pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0 },
      };
      const l = s.line as Record<keyof SeasonLine, number>;
      s.teamId = g.teamId; // in date order, so the last team wins
      l.gp += 1;
      l.gs += g.started ? 1 : 0;
      for (const k of ['min', 'pts', 'reb', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf', 'fgm', 'fga', 'fg3m', 'fg3a', 'ftm', 'fta'] as const) l[k] += g[k];
      sums.set(g.playerId, s);
    }
    const data = [...sums].map(([playerId, { teamId, line: l }]) => ({
      playerId, seasonId, kind: 'preseason', teamId, ...l, ...rates(l),
    }));
    await tx.splitStats.deleteMany({ where: { seasonId, kind: 'preseason' } });
    await tx.splitStats.createMany({ data });

    // Teams: box totals from the logs, games, record and points allowed from the scores.
    const played = new Set(logs.map((g) => g.gameId));
    const games = await tx.game.findMany({ where: { id: { in: [...played] } } });
    const teams = new Map<number, Record<string, number>>();
    const team = (id: number) => {
      if (!teams.has(id)) teams.set(id, { gp: 0, wins: 0, losses: 0, pts: 0, oppPts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0 });
      return teams.get(id)!;
    };
    for (const g of games) {
      for (const [us, own, opp] of [[g.homeTeamId, g.homeScore, g.awayScore], [g.awayTeamId, g.awayScore, g.homeScore]]) {
        const t = team(us);
        t.gp += 1;
        t[own > opp ? 'wins' : 'losses'] += 1;
        t.pts += own;
        t.oppPts += opp;
      }
    }
    for (const g of logs) {
      const t = team(g.teamId);
      for (const k of ['reb', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'tov', 'pf', 'fgm', 'fga', 'fg3m', 'fg3a', 'ftm', 'fta'] as const) t[k] += g[k];
    }
    await tx.teamSplitStats.deleteMany({ where: { seasonId, kind: 'preseason' } });
    await tx.teamSplitStats.createMany({ data: [...teams].map(([teamId, t]) => ({ teamId, seasonId, kind: 'preseason', ...t })) });
    return data.length;
  });
}

/** The newest season's totals, once BR has any. Three requests. */
export async function syncSeasonTotals(db: PrismaClient) {
  const season = await db.season.findFirst({ orderBy: { startYear: 'desc' } });
  if (!season) return 'no seasons';
  // tries: 1 — inside a function with a time budget, a rate limit means "tomorrow".
  const data = await fetchSeason(season.endYear, { tries: 1 });
  if (data.scheduleOnly) return `${season.key} has not started`;

  const slugs = data.players.map((p) => p.slug);
  const known = new Map(
    (await db.player.findMany({ where: { brSlug: { in: slugs } }, select: { id: true, brSlug: true } }))
      .map((p) => [p.brSlug!, p.id]),
  );
  // New to basketball-reference this season: match against the NBA's rosters.
  const roster = rowsOf((await nbaJson(FEEDS.roster)).resultSets[0]);
  const match = matcher(
    roster.map((r) => ({
      id: r.PERSON_ID, first: r.PLAYER_FIRST_NAME, last: r.PLAYER_LAST_NAME,
      from: Number(r.FROM_YEAR), to: Number(r.TO_YEAR),
    })),
  );
  const counts = await writeSeason(
    db, season.id, data,
    (p) => known.get(p.slug) ?? resolvePlayer(p.slug, p.name, season.startYear, season.startYear, match).id,
  );
  await db.season.update({ where: { id: season.id }, data: { active: true } });
  return `${season.key}: ${counts.players} players`;
}

// --- Schedule and games (NBA) ------------------------------------------------------

const otStatus = (period: number) =>
  period > 5 ? `Final/${period - 4}OT` : period === 5 ? 'Final/OT' : 'Final';

/**
 * This season's schedule from the NBA: new games (Cup knockouts and playoffs
 * appear as they're set), moved tip-offs, postponements, final scores. Writes
 * only what changed, so a daily run is a handful of queries.
 */
export async function syncSchedule(db: PrismaClient) {
  const { leagueSchedule: s } = await nbaJson(FEEDS.schedule);
  const start = Number(String(s.seasonYear).slice(0, 4));
  const season = await db.season.upsert({
    where: { key: s.seasonYear },
    create: { key: s.seasonYear, startYear: start, endYear: start + 1, active: false },
    update: {},
  });
  // The schedule basketball-reference published before this feed took over.
  await db.game.deleteMany({ where: { seasonId: season.id, NOT: { gameCode: { startsWith: '00' } } } });

  const existing = new Map(
    (await db.game.findMany({ where: { seasonId: season.id } })).map((g) => [g.gameCode, g]),
  );
  const fresh: Prisma.GameCreateManyInput[] = [];
  const changed: { gameCode: string; data: Record<string, unknown> }[] = [];

  for (const g of (s.gameDates as any[]).flatMap((d) => d.games)) {
    const kind = gameKind(g.gameId);
    // All-Star games, exhibitions against non-NBA clubs, and Cup knockout
    // slots whose teams aren't decided yet all wait or stay out.
    if (!kind || kind === 'all-star' || !KNOWN_TEAMS.has(g.homeTeam.teamId) || !KNOWN_TEAMS.has(g.awayTeam.teamId)) continue;
    const prev = existing.get(g.gameId);
    if (prev && g.gameStatus === 2) {
      // Live: the live routes own it until the final. Only where to watch is filled in.
      if (!prev.broadcast) changed.push({ gameCode: g.gameId, data: { broadcast: broadcastOf(g.broadcasters) } });
      continue;
    }
    const final = g.gameStatus === 3;
    const row = {
      date: new Date(`${String(g.gameDateEst).slice(0, 10)}T12:00:00Z`),
      homeTeamId: g.homeTeam.teamId as number,
      awayTeamId: g.awayTeam.teamId as number,
      kind,
      label: [g.gameLabel, g.gameSubLabel].filter(Boolean).join(' · ') || null,
      // A saved final keeps its own status ("Final/OT"); the schedule may just say "Final".
      status: final
        ? prev?.status.startsWith('Final') ? prev.status : String(g.gameStatusText).trim() || 'Final'
        : g.postponedStatus === 'Y' ? 'Postponed' : String(g.gameStatusText).trim(),
      homeScore: final ? (g.homeTeam.score as number) : 0,
      awayScore: final ? (g.awayTeam.score as number) : 0,
      broadcast: broadcastOf(g.broadcasters),
    };
    if (!prev) fresh.push({ gameCode: g.gameId, seasonId: season.id, ...row });
    else if (
      prev.date.getTime() !== row.date.getTime() || prev.status !== row.status || prev.label !== row.label ||
      prev.homeScore !== row.homeScore || prev.awayScore !== row.awayScore ||
      prev.homeTeamId !== row.homeTeamId || prev.awayTeamId !== row.awayTeamId || prev.kind !== row.kind ||
      JSON.stringify(prev.broadcast) !== JSON.stringify(row.broadcast)
    ) {
      changed.push({ gameCode: g.gameId, data: row });
    }
  }
  await chunked(fresh, 1000, (c) => db.game.createMany({ data: c, skipDuplicates: true }));
  await chunked(changed, 100, (c) =>
    db.$transaction(c.map(({ gameCode, data }) => db.game.update({ where: { gameCode }, data }))),
  );
  return `${s.seasonYear}: ${fresh.length} new, ${changed.length} changed`;
}

/**
 * Save one finished game: final score and player lines, and for regular-season
 * games every real shot (the shot charts are regular season), lineup stint and
 * clutch line. A preseason game
 * also refreshes that preseason's totals.
 */
export async function syncGame(db: PrismaClient, gameCode: string) {
  const game = await db.game.findUnique({ where: { gameCode } });
  if (!game) return 'unknown game';
  const [{ game: box }, { game: pbp }] = await Promise.all([
    nbaJson(FEEDS.box(gameCode)),
    nbaJson(FEEDS.pbp(gameCode)),
  ]);
  if (box.gameStatus !== 3) return 'not final';

  const logs = logsFromBox(box);
  // Two-way call-ups and anyone else the roster sync hasn't met yet.
  await db.player.createMany({
    data: logs.map((l) => ({
      id: l.playerId, firstName: l.firstName, lastName: l.lastName,
      fullName: `${l.firstName} ${l.lastName}`.trim(), jersey: l.jersey, position: l.position,
      teamId: l.teamId, active: true,
    })),
    skipDuplicates: true,
  });

  const where = { gameId: game.id };
  const stamp = { gameId: game.id, seasonId: game.seasonId, date: game.date };
  const lineups = game.kind === 'regular' ? stintsFromPbp(pbp, box) : null;
  const ids = { gameId: game.id, seasonId: game.seasonId };
  await db.$transaction([
    db.game.update({
      where: { id: game.id },
      data: {
        homeScore: box.homeTeam.score, awayScore: box.awayTeam.score, period: box.period, status: otStatus(box.period),
        homeLine: lineOf(box.homeTeam), awayLine: lineOf(box.awayTeam),
        leaders: { home: topOf(box.homeTeam), away: topOf(box.awayTeam) } satisfies GameLeaders,
      },
    }),
    db.playerGameLog.deleteMany({ where }),
    db.playerGameLog.createMany({
      data: logs.map(({ firstName, lastName, jersey, position, ...l }) => ({ ...l, ...stamp })),
      skipDuplicates: true,
    }),
    ...(game.kind === 'regular'
      ? [
          db.shotData.deleteMany({ where }),
          db.shotData.createMany({ data: shotsFromPbp(pbp).map((s) => ({ ...s, ...stamp })), skipDuplicates: true }),
        ]
      : []),
    ...(lineups
      ? [
          db.stint.deleteMany({ where }),
          db.stint.createMany({ data: lineups.stints.map((s) => ({ ...s, ...ids })) }),
          db.clutchLog.deleteMany({ where }),
          db.clutchLog.createMany({ data: lineups.clutch.map((c) => ({ ...c, ...ids })) }),
        ]
      : []),
  ]);
  if (game.kind === 'preseason') await syncPreseason(db, game.seasonId);
  return `${gameCode}: ${logs.length} lines`;
}

/** Finals from the last three days (stat corrections land late), plus any the write-through missed. */
export async function syncFinals(db: PrismaClient) {
  const due = await db.game.findMany({
    where: {
      gameCode: { startsWith: '00' },
      status: { startsWith: 'Final' },
      OR: [
        { date: { gte: new Date(`${shiftDay(todayEt(), -3)}T00:00:00Z`) } },
        { gameLogs: { none: {} } },
        { kind: 'regular', stints: { none: {} } },
        // Saved before shots carried their assister.
        { kind: 'regular', shots: { none: { assistId: { not: null } } } },
      ],
    },
    select: { gameCode: true },
    orderBy: { date: 'asc' },
  });
  let done = 0;
  // Four at a time: quick on the CDN, gentle on the database.
  await chunked(due, 4, async (c) => {
    await Promise.all(c.map((g) => syncGame(db, g.gameCode)));
    done += c.length;
  });
  return `${done} games`;
}

// --- Rosters and transactions (NBA) ----------------------------------------------------

/**
 * Current rosters: who's on which team, number, bio, draft. Also brings in
 * rookies before they've played. Names and positions already on file (from
 * basketball-reference, with accents and PG/SG/SF/PF/C) are kept.
 */
export async function syncRosters(db: PrismaClient) {
  const rows = rowsOf((await nbaJson(FEEDS.roster)).resultSets[0]).filter(
    (r) => r.ROSTER_STATUS && KNOWN_TEAMS.has(r.TEAM_ID),
  );
  const ids = rows.map((r) => r.PERSON_ID as number);
  const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

  await db.player.createMany({
    data: rows.map((r) => ({
      id: r.PERSON_ID, firstName: r.PLAYER_FIRST_NAME, lastName: r.PLAYER_LAST_NAME,
      fullName: `${r.PLAYER_FIRST_NAME} ${r.PLAYER_LAST_NAME}`.trim(), position: r.POSITION || null,
    })),
    skipDuplicates: true,
  });
  await db.$executeRaw`
    UPDATE players p SET
      "teamId" = v.team, jersey = v.jersey, active = true,
      "heightIn" = COALESCE(v.height, p."heightIn"), "weightLb" = COALESCE(v.weight, p."weightLb"),
      college = COALESCE(v.college, p.college), country = COALESCE(v.country, p.country),
      "draftYear" = COALESCE(v.dyear, p."draftYear"), "draftRound" = COALESCE(v.dround, p."draftRound"),
      "draftPick" = COALESCE(v.dpick, p."draftPick")
    FROM (
      SELECT unnest(${ids}::int[]) AS id,
             unnest(${rows.map((r) => r.TEAM_ID)}::int[]) AS team,
             unnest(${rows.map((r) => r.JERSEY_NUMBER || null)}::text[]) AS jersey,
             unnest(${rows.map((r) => inches(r.HEIGHT))}::int[]) AS height,
             unnest(${rows.map((r) => num(r.WEIGHT))}::int[]) AS weight,
             unnest(${rows.map((r) => r.COLLEGE || null)}::text[]) AS college,
             unnest(${rows.map((r) => r.COUNTRY || null)}::text[]) AS country,
             unnest(${rows.map((r) => num(r.DRAFT_YEAR))}::int[]) AS dyear,
             unnest(${rows.map((r) => num(r.DRAFT_ROUND))}::int[]) AS dround,
             unnest(${rows.map((r) => num(r.DRAFT_NUMBER))}::int[]) AS dpick
    ) v
    WHERE p.id = v.id`;
  // Waived, retired, unsigned: off the active list, but they keep their last team.
  await db.player.updateMany({ where: { active: true, id: { notIn: ids } }, data: { active: false } });
  return `${rows.length} rostered`;
}

/** The NBA's whole transaction log since July 2015, replaced wholesale (~10k rows). */
export async function syncTransactions(db: PrismaClient) {
  const rows: any[] = (await nbaJson(FEEDS.movement)).NBA_Player_Movement.rows;
  const data = rows.map((r) => ({
    date: new Date(`${String(r.TRANSACTION_DATE).slice(0, 10)}T12:00:00Z`),
    type: String(r.Transaction_Type),
    description: String(r.TRANSACTION_DESCRIPTION).replace(/\s+/g, ' ').trim(),
    teamId: KNOWN_TEAMS.has(r.TEAM_ID) ? (r.TEAM_ID as number) : null,
    playerId: r.PLAYER_ID ? Number(r.PLAYER_ID) : null,
    groupKey: String(r.GroupSort),
  }));
  await db.$transaction(
    async (tx) => {
      await tx.transaction.deleteMany();
      await chunked(data, 2000, (c) => tx.transaction.createMany({ data: c }));
    },
    { timeout: 60_000 },
  );
  return `${data.length} moves`;
}

// --- All of it -----------------------------------------------------------------

/** Every step, each isolated: one source being down doesn't stop the rest. */
export async function runSync(db: PrismaClient) {
  const report: Record<string, string> = {};
  const step = async (name: string, fn: () => Promise<string>) => {
    const t0 = Date.now();
    try {
      report[name] = `${await fn()} · ${Date.now() - t0}ms`;
    } catch (e) {
      report[name] = `FAILED: ${e instanceof Error ? e.message : String(e)}`;
    }
  };
  await step('schedule', () => syncSchedule(db));
  await step('finals', () => syncFinals(db));
  await step('playoffs', () => syncPlayoffs(db));
  await step('rosters', () => syncRosters(db));
  await step('transactions', () => syncTransactions(db));
  await step('seasonTotals', () => syncSeasonTotals(db));
  // The stamp the site shows as "Updated ...". A failed write mustn't fail the sync.
  await db.syncRun.create({ data: { report } }).catch(() => {});
  return report;
}
