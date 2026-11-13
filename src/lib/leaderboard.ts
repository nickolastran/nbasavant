import { unstable_cache } from 'next/cache';
import type { ACol, Preset, Row } from '@/components/AdvancedTable';
import { prisma } from '@/lib/db';
import { onOffOf, seasonDefense, seasonShooting, seasonStints } from '@/lib/leaders';
import { ZONE_GROUPS, ZONE_LABELS, astTo, ftRate, per100, per36, srs, threePAr, zoneProfile } from '@/lib/metrics';
import { stintRatings } from '@/lib/stats';

/** How counting stats are shown: per game, per 36 minutes, or per 100 team possessions. */
export type RateMode = 'game' | '36' | '100';
export const RATE_MODES: { value: RateMode; label: string }[] = [
  { value: 'game', label: 'Per game' },
  { value: '36', label: 'Per 36' },
  { value: '100', label: 'Per 100 poss' },
];

const diff = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);

/** Four decimals is past anything the table prints; full doubles would double the page's payload. */
const trim = (row: Row): Row =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1e4) / 1e4 : v]));

/**
 * Every player-season in a season as one wide row: box score at the chosen
 * rate, efficiency, shot profile, playmaking, defense and impact. Shot,
 * defense and on/off columns come from play-by-play and are empty before 2026-27.
 */
async function buildPlayerLeaderboard(seasonId: number, mode: RateMode): Promise<Row[]> {
  const [stats, teams, shooting, defense, stints, zones, jumpers, logs] = await Promise.all([
    prisma.playerStats.findMany({
      where: { seasonId },
      include: {
        team: { select: { abbreviation: true } },
        player: { select: { fullName: true, position: true, advancedStats: { where: { seasonId } } } },
      },
    }),
    prisma.teamStats.findMany({ where: { seasonId }, select: { teamId: true, gp: true, pace: true, dreb: true, drebPct: true } }),
    seasonShooting(seasonId),
    seasonDefense(seasonId),
    seasonStints(seasonId),
    prisma.shotData.groupBy({ by: ['playerId', 'zone', 'made'], where: { seasonId, eventNum: { not: null } }, _count: true }),
    // Jump shots, and how many of the made ones were assisted: the closest the play-by-play gets to catch-and-shoot.
    prisma.$queryRaw<{ playerId: number; made: number; assisted: number }[]>`
      SELECT "playerId", count(*) FILTER (WHERE made)::int AS made, count("assistId") FILTER (WHERE made)::int AS assisted
      FROM shot_data WHERE "seasonId" = ${seasonId} AND "eventNum" IS NOT NULL AND "actionType" = 'Jump Shot'
      GROUP BY 1`,
    prisma.playerGameLog.findMany({
      where: { seasonId, game: { kind: { not: 'preseason' } } },
      orderBy: { date: 'asc' },
      select: { playerId: true, pts: true },
    }),
  ]);

  const teamOf = new Map(teams.map((t) => [t.teamId, t]));
  const onOff = onOffOf(stints);
  const zonesOf = new Map<number, { zone: string; made: boolean; n: number }[]>();
  for (const z of zones) zonesOf.set(z.playerId, [...(zonesOf.get(z.playerId) ?? []), { zone: z.zone, made: z.made, n: z._count }]);
  const jumpOf = new Map(jumpers.map((j) => [j.playerId, j]));
  const last10 = new Map<number, number[]>();
  for (const l of logs) last10.set(l.playerId, [...(last10.get(l.playerId) ?? []), l.pts].slice(-10));

  return stats.map((s) => {
    const a = s.player.advancedStats[0];
    const team = teamOf.get(s.teamId ?? -1);
    const rate = (total: number | null) =>
      mode === 'game' ? (total === null ? null : total / s.gp) : mode === '36' ? per36(total, s.min) : per100(total, s.min, team?.pace);
    const profile = zoneProfile(zonesOf.get(s.playerId) ?? []);
    const shot = shooting.get(s.playerId);
    const def = defense.get(s.playerId);
    const oo = onOff.get(s.playerId);
    const jump = jumpOf.get(s.playerId);
    // DREB%: his defensive rebounds against the ones available while he played. Available boards are the team's own
    // plus the opponents' offensive ones, recovered from the team's DREB%. ponytail: team minutes are gp x 240, so overtime is ignored.
    const available = team?.dreb && team.drebPct ? team.dreb / (team.drebPct / 100) : null;
    const drebPct = s.dreb !== null && s.min && available && team ? (100 * s.dreb * team.gp * 48) / (s.min * available) : null;

    const row: Row = {
      player: s.player.fullName, playerId: s.playerId, team: s.team?.abbreviation ?? '', pos: s.player.position ?? '',
      gp: s.gp, min: s.min === null ? null : Math.round(s.min), mpg: s.min === null ? null : s.min / s.gp,
      pts: rate(s.pts), reb: rate(s.reb), ast: rate(s.ast), stl: rate(s.stl), blk: rate(s.blk), tov: rate(s.tov), fg3a: rate(s.fg3a),
      tsPct: s.tsPct, efgPct: s.efgPct, fgPct: s.fgPct, fg3Pct: s.fg3Pct, ftPct: s.ftPct,
      fg3ar: threePAr(s.fg3a, s.fga), ftr: ftRate(s.fta, s.fga),
      xEfg: shot?.xEfg ?? null, shotMaking: shot?.shotMaking ?? null,
      astJump: jump && jump.made >= 5 ? (jump.assisted / jump.made) * 100 : null,
      usgPct: s.usgPct, astPct: a?.astPct ?? null, astTo: astTo(s.ast, s.tov), tovPct: a?.tovPct ?? null,
      drebPct, stlPct: a?.stlPct ?? null, blkPct: a?.blkPct ?? null,
      oppDiff: def?.diff ?? null, dRimFg: def?.rimFg ?? null, dRimDiff: def?.rimDiff ?? null, dbpm: a?.dbpm ?? null,
      onOffNet: diff(oo?.on.net ?? null, oo?.off.net ?? null),
      onOffOrtg: diff(oo?.on.ortg ?? null, oo?.off.ortg ?? null),
      onOffDrtg: diff(oo?.on.drtg ?? null, oo?.off.drtg ?? null),
      onMin: oo ? Math.round(oo.on.min) : null,
      bpm: a?.bpm ?? null, obpm: a?.obpm ?? null, per: a?.per ?? null, ws48: a?.ws48 ?? null, vorp: a?.vorp ?? null,
      last10: last10.get(s.playerId) ?? null,
    };
    for (const g of ZONE_GROUPS) {
      row[`${g}Freq`] = profile[g].freq;
      // A percentage on a handful of attempts is noise; show it from five up.
      row[`${g}Fg`] = profile[g].fga >= 5 ? profile[g].fgPct : null;
    }
    return trim(row);
  });
}

export function playerCols(mode: RateMode): ACol[] {
  const unit = mode === 'game' ? 'per game' : mode === '36' ? 'per 36 minutes' : 'per 100 team possessions';
  const box = (key: string, label: string, name: string, extra: Partial<ACol> = {}): ACol => ({ key, label, group: 'Box score', dp: 1, title: `${name} ${unit}`, ...extra });
  return [
    { key: 'team', label: 'Team', kind: 'team' },
    { key: 'pos', label: 'Pos', kind: 'text' },
    { key: 'gp', label: 'GP', title: 'Games played' },
    { key: 'min', label: 'MIN', title: 'Total minutes' },
    { key: 'mpg', label: 'MPG', dp: 1, title: 'Minutes per game' },
    box('pts', 'PTS', 'Points', { shade: true }),
    box('reb', 'REB', 'Rebounds', { shade: true }),
    box('ast', 'AST', 'Assists', { shade: true }),
    box('stl', 'STL', 'Steals', { shade: true }),
    box('blk', 'BLK', 'Blocks', { shade: true }),
    box('tov', 'TOV', 'Turnovers', { shade: true, lowerIsBetter: true }),
    { key: 'last10', label: 'Last 10', group: 'Box score', kind: 'spark', title: 'Points in each of his last ten games' },
    { key: 'tsPct', label: 'TS%', group: 'Efficiency', dp: 1, shade: true, title: 'True shooting %' },
    { key: 'efgPct', label: 'eFG%', group: 'Efficiency', dp: 1, shade: true, title: 'Effective field goal %' },
    { key: 'fg3ar', label: '3PAr', group: 'Efficiency', dp: 3, title: 'Share of field goal attempts that are threes' },
    { key: 'ftr', label: 'FTr', group: 'Efficiency', dp: 3, shade: true, title: 'Free throw attempts per field goal attempt' },
    { key: 'fgPct', label: 'FG%', group: 'Efficiency', dp: 1 },
    { key: 'fg3Pct', label: '3P%', group: 'Efficiency', dp: 1, shade: true },
    { key: 'fg3a', label: '3PA', group: 'Efficiency', dp: 1, title: `Three-point attempts ${unit}` },
    { key: 'ftPct', label: 'FT%', group: 'Efficiency', dp: 1 },
    ...ZONE_GROUPS.flatMap((g): ACol[] => [
      { key: `${g}Freq`, label: `${ZONE_LABELS[g]} freq`, group: 'Shot profile', dp: 1, suffix: '%', title: `Share of his shots from: ${ZONE_LABELS[g].toLowerCase()}` },
      { key: `${g}Fg`, label: `${ZONE_LABELS[g]} FG%`, group: 'Shot profile', dp: 1, shade: true, title: `FG% from: ${ZONE_LABELS[g].toLowerCase()} (5+ attempts)` },
    ]),
    { key: 'xEfg', label: 'xeFG%', group: 'Shot quality', dp: 1, shade: true, title: 'Expected eFG%: what the league makes on his shots, by spot and shot type' },
    { key: 'shotMaking', label: 'Shot-making', group: 'Shot quality', dp: 1, signed: true, shade: true, title: 'eFG% minus expected eFG%, in points' },
    { key: 'astJump', label: "Ast'd jumpers", group: 'Shot quality', dp: 0, suffix: '%', title: 'Share of his made jump shots that were assisted: high is catch-and-shoot, low is self-created' },
    { key: 'usgPct', label: 'USG%', group: 'Creation', dp: 1, shade: true, title: 'Usage %' },
    { key: 'astPct', label: 'AST%', group: 'Creation', dp: 1, shade: true, title: 'Assist %' },
    { key: 'astTo', label: 'AST/TO', group: 'Creation', dp: 2, shade: true, title: 'Assists per turnover' },
    { key: 'tovPct', label: 'TOV%', group: 'Creation', dp: 1, shade: true, lowerIsBetter: true, title: 'Turnovers per 100 plays' },
    { key: 'drebPct', label: 'DREB%', group: 'Defense', dp: 1, shade: true, title: 'Share of available defensive rebounds he took (our estimate)' },
    { key: 'stlPct', label: 'STL%', group: 'Defense', dp: 1, shade: true, title: 'Steal %' },
    { key: 'blkPct', label: 'BLK%', group: 'Defense', dp: 1, shade: true, title: 'Block %' },
    { key: 'oppDiff', label: 'Opp eFG±', group: 'Defense', dp: 1, signed: true, shade: true, lowerIsBetter: true, title: "Opponents' eFG% minus expected with him on the floor (on-court, not matchup)" },
    { key: 'dRimFg', label: 'Rim DFG%', group: 'Defense', dp: 1, shade: true, lowerIsBetter: true, title: 'Opponent FG% in the restricted area with him on the floor' },
    { key: 'dRimDiff', label: 'Rim ±', group: 'Defense', dp: 1, signed: true, shade: true, lowerIsBetter: true, title: 'Rim DFG% minus expected' },
    { key: 'dbpm', label: 'DBPM', group: 'Defense', dp: 1, signed: true, shade: true, title: 'Defensive box plus/minus (Basketball-Reference)' },
    { key: 'onOffNet', label: 'On/Off Net', group: 'Impact', dp: 1, signed: true, shade: true, title: 'Team net rating with him on the floor minus off it' },
    { key: 'onOffOrtg', label: 'On/Off ORtg', group: 'Impact', dp: 1, signed: true, shade: true, title: 'Team offensive rating on minus off' },
    { key: 'onOffDrtg', label: 'On/Off DRtg', group: 'Impact', dp: 1, signed: true, shade: true, lowerIsBetter: true, title: 'Team defensive rating on minus off (negative is good)' },
    { key: 'onMin', label: 'On MIN', group: 'Impact', title: 'Minutes on the floor in tracked games: the sample behind on/off' },
    { key: 'bpm', label: 'BPM', group: 'Impact', dp: 1, signed: true, shade: true, title: 'Box plus/minus (Basketball-Reference)' },
    { key: 'obpm', label: 'OBPM', group: 'Impact', dp: 1, signed: true, shade: true, title: 'Offensive box plus/minus (Basketball-Reference)' },
    { key: 'per', label: 'PER', group: 'Impact', dp: 1, shade: true, title: 'Player efficiency rating (league average 15)' },
    { key: 'ws48', label: 'WS/48', group: 'Impact', dp: 3, shade: true, title: 'Win shares per 48 minutes' },
    { key: 'vorp', label: 'VORP', group: 'Impact', dp: 1, shade: true, title: 'Value over replacement player' },
  ];
}

const BASE = ['team', 'pos', 'gp', 'mpg'];
export const PLAYER_PRESETS: Preset[] = [
  { key: 'overview', label: 'Overview', cols: [...BASE, 'pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'last10', 'tsPct', 'fg3Pct', 'usgPct', 'shotMaking', 'onOffNet', 'bpm', 'per'] },
  { key: 'shooting', label: 'Shooting', cols: [...BASE, 'pts', 'tsPct', 'efgPct', 'fg3ar', 'ftr', 'fg3Pct', 'fg3a', ...ZONE_GROUPS.flatMap((g) => [`${g}Freq`, `${g}Fg`]), 'xEfg', 'shotMaking', 'astJump'] },
  { key: 'playmaking', label: 'Playmaking', cols: [...BASE, 'ast', 'tov', 'usgPct', 'astPct', 'astTo', 'tovPct', 'obpm'] },
  { key: 'defense', label: 'Defense', cols: [...BASE, 'stl', 'blk', 'drebPct', 'stlPct', 'blkPct', 'oppDiff', 'dRimFg', 'dRimDiff', 'dbpm'] },
  { key: 'onoff', label: 'On/Off', cols: [...BASE, 'onMin', 'onOffNet', 'onOffOrtg', 'onOffDrtg', 'bpm', 'per', 'ws48', 'vorp'] },
];

/** Every team in a season: ratings, the four factors on both ends, schedule-adjusted margin and clutch net rating. */
async function buildTeamLeaderboard(seasonId: number): Promise<Row[]> {
  const [teams, clutch] = await Promise.all([
    prisma.teamStats.findMany({ where: { seasonId }, include: { team: true } }),
    prisma.stint.findMany({ where: { seasonId, clutch: true }, select: { teamId: true, seconds: true, pts: true, oppPts: true, poss: true, oppPoss: true } }),
  ]);
  const clutchOf = new Map<number, typeof clutch>();
  for (const s of clutch) clutchOf.set(s.teamId, [...(clutchOf.get(s.teamId) ?? []), s]);
  return teams.map((t) => {
    const c = stintRatings(clutchOf.get(t.teamId) ?? []);
    return trim({
      team: t.name ?? `${t.team.city} ${t.team.name}`, abbr: t.team.abbreviation, conf: t.conference ?? t.division ?? '',
      gp: t.gp, wins: t.wins, losses: t.losses,
      ortg: t.ortg, drtg: t.drtg, netRtg: t.netRtg, pace: t.pace,
      srs: srs(t.pts, t.oppPts, t.gp, t.sos), sos: t.sos,
      efgPct: t.efgPct, tovPct: t.tovPct, orebPct: t.orebPct, ftRate: t.ftRate,
      oppEfgPct: t.oppEfgPct, oppTovPct: t.oppTovPct, drebPct: t.drebPct,
      clutchNet: c.net, clutchMin: c.min ? Math.round(c.min) : null,
      fg3ar: threePAr(t.fg3a, t.fga), tsPct: t.tsPct,
    });
  });
}

export const TEAM_COLS: ACol[] = [
  { key: 'conf', label: 'Conf', kind: 'text' },
  { key: 'wins', label: 'W' },
  { key: 'losses', label: 'L' },
  { key: 'ortg', label: 'ORtg', group: 'Ratings', dp: 1, shade: true, title: 'Points scored per 100 possessions' },
  { key: 'drtg', label: 'DRtg', group: 'Ratings', dp: 1, shade: true, lowerIsBetter: true, title: 'Points allowed per 100 possessions' },
  { key: 'netRtg', label: 'Net', group: 'Ratings', dp: 1, signed: true, shade: true, title: 'ORtg minus DRtg' },
  { key: 'pace', label: 'Pace', group: 'Ratings', dp: 1, title: 'Possessions per 48 minutes' },
  { key: 'srs', label: 'SRS', group: 'Schedule', dp: 2, signed: true, shade: true, title: 'Simple Rating System: average margin plus strength of schedule' },
  { key: 'sos', label: 'SOS', group: 'Schedule', dp: 2, signed: true, title: 'Strength of schedule (Basketball-Reference)' },
  { key: 'efgPct', label: 'eFG%', group: 'Four factors: offense', dp: 1, shade: true },
  { key: 'tovPct', label: 'TOV%', group: 'Four factors: offense', dp: 1, shade: true, lowerIsBetter: true },
  { key: 'orebPct', label: 'OREB%', group: 'Four factors: offense', dp: 1, shade: true },
  { key: 'ftRate', label: 'FT rate', group: 'Four factors: offense', dp: 3, shade: true, title: 'Free throws made per field goal attempt' },
  { key: 'oppEfgPct', label: 'Opp eFG%', group: 'Four factors: defense', dp: 1, shade: true, lowerIsBetter: true },
  { key: 'oppTovPct', label: 'Opp TOV%', group: 'Four factors: defense', dp: 1, shade: true },
  { key: 'drebPct', label: 'DREB%', group: 'Four factors: defense', dp: 1, shade: true },
  { key: 'clutchNet', label: 'Clutch Net', group: 'Clutch', dp: 1, signed: true, shade: true, title: 'Net rating in the last five minutes of the fourth or overtime, within five' },
  { key: 'clutchMin', label: 'Clutch MIN', group: 'Clutch', title: 'Clutch minutes: the sample behind clutch net' },
  { key: 'fg3ar', label: '3PAr', group: 'Style', dp: 3, title: 'Share of field goal attempts that are threes' },
  { key: 'tsPct', label: 'TS%', group: 'Style', dp: 1, shade: true },
];

// Both boards join a season of shots to its lineup stints, about half a second of queries, so the result is
// kept for a minute, the same freshness as the pages around them.
export const playerLeaderboard = unstable_cache(buildPlayerLeaderboard, ['player-leaderboard'], { revalidate: 60 });
export const teamLeaderboard = unstable_cache(buildTeamLeaderboard, ['team-leaderboard'], { revalidate: 60 });
