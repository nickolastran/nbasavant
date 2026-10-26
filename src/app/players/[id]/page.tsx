import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { prisma } from '@/lib/db';
import { FilterBar } from '@/components/FilterBar';
import { FavoriteStar } from '@/components/Favorites';
import { Headshot } from '@/components/Headshot';
import { PercentileBars, type Percentile } from '@/components/PercentileBars';
import { ShotChart, type Shot } from '@/components/ShotChart';
import { StatTable, type Col } from '@/components/StatTable';
import { TrendChart } from '@/components/TrendChart';
import { ViewTabs } from '@/components/ViewTabs';
import { feetInches, fmt, ordinal, perGame } from '@/lib/format';
import { seasonDefense, seasonShooting, type Defense } from '@/lib/leaders';
import { FEATURES, MIN_MINUTES, similarSeasons } from '@/lib/similar';
import {
  activeStreak, careerAdvanced, careerTotals, expectedShooting, minGames, nextMilestone, onPace, percentileOf, scaledFloor, splitLogs, stintRatings,
  type SeasonLine,
} from '@/lib/stats';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const player = await prisma.player.findUnique({ where: { id: Number((await params).id) || 0 } });
  return { title: player?.fullName ?? 'Player' };
}

const STAT_VIEWS = [
  { value: 'averages', label: 'Averages' },
  { value: 'totals', label: 'Totals' },
  { value: 'advanced', label: 'Advanced' },
];

type Cell = number | null;
type TableCol = { key: string; label: string; dp?: number; title?: string };

/** The columns each view prints, ESPN-style. */
const TABLE: Record<string, TableCol[]> = {
  averages: [
    { key: 'gp', label: 'GP' }, { key: 'gs', label: 'GS' }, { key: 'mpg', label: 'MIN', dp: 1 },
    { key: 'ppg', label: 'PTS', dp: 1 }, { key: 'rpg', label: 'REB', dp: 1 }, { key: 'apg', label: 'AST', dp: 1 },
    { key: 'spg', label: 'STL', dp: 1 }, { key: 'bpg', label: 'BLK', dp: 1 }, { key: 'topg', label: 'TOV', dp: 1 },
    { key: 'fgPct', label: 'FG%', dp: 1 }, { key: 'fg3Pct', label: '3P%', dp: 1 }, { key: 'ftPct', label: 'FT%', dp: 1 },
    { key: 'tsPct', label: 'TS%', dp: 1, title: 'True shooting percentage' },
  ],
  totals: [
    { key: 'gp', label: 'GP' }, { key: 'gs', label: 'GS' }, { key: 'min', label: 'MIN', dp: 0 },
    { key: 'pts', label: 'PTS' }, { key: 'reb', label: 'REB' }, { key: 'ast', label: 'AST' },
    { key: 'stl', label: 'STL' }, { key: 'blk', label: 'BLK' }, { key: 'tov', label: 'TOV' }, { key: 'pf', label: 'PF' },
    { key: 'fgm', label: 'FGM' }, { key: 'fga', label: 'FGA' }, { key: 'fg3m', label: '3PM' }, { key: 'fg3a', label: '3PA' },
    { key: 'ftm', label: 'FTM' }, { key: 'fta', label: 'FTA' },
  ],
  advanced: [
    { key: 'per', label: 'PER', dp: 1, title: 'Player efficiency rating; league average is 15' },
    { key: 'tsPct', label: 'TS%', dp: 1 }, { key: 'efgPct', label: 'eFG%', dp: 1 },
    { key: 'usgPct', label: 'USG%', dp: 1 }, { key: 'astPct', label: 'AST%', dp: 1 }, { key: 'rebPct', label: 'REB%', dp: 1 },
    { key: 'ows', label: 'OWS', dp: 1 }, { key: 'dws', label: 'DWS', dp: 1 }, { key: 'ws', label: 'WS', dp: 1 },
    { key: 'ws48', label: 'WS/48', dp: 3 }, { key: 'obpm', label: 'OBPM', dp: 1 }, { key: 'dbpm', label: 'DBPM', dp: 1 },
    { key: 'bpm', label: 'BPM', dp: 1 }, { key: 'vorp', label: 'VORP', dp: 1 },
    { key: 'ortg', label: 'ORtg', dp: 1, title: 'Our estimate; nobody publishes an individual ORtg' },
    { key: 'drtg', label: 'DRtg', dp: 1, title: 'Our estimate; nobody publishes an individual DRtg' },
  ],
};

/** Labels for the note under a career row that only covers part of a career. */
const TALLY_LABELS: Record<string, string> = {
  gs: 'games started', min: 'minutes', reb: 'rebounds', oreb: 'offensive rebounds', dreb: 'defensive rebounds',
  ast: 'assists', stl: 'steals', blk: 'blocks', tov: 'turnovers', pf: 'fouls', fg3m: 'threes',
};

export default async function PlayerPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const id = Number((await params).id);
  const sp = await searchParams;
  if (!Number.isInteger(id)) notFound();

  const player = await prisma.player.findUnique({
    where: { id },
    include: {
      team: true,
      stats: {
        include: { season: true, team: { select: { abbreviation: true } } },
        orderBy: { season: { startYear: 'asc' } },
      },
      advancedStats: true,
    },
  });
  if (!player) notFound();

  const seasons = player.stats.map((s) => s.season);
  const season = seasons.find((s) => s.key === sp.season) ?? seasons.at(-1);
  const view = sp.stats in TABLE ? sp.stats : 'averages';
  const adv = new Map(player.advancedStats.map((a) => [a.seasonId, a]));
  const line = player.stats.find((s) => s.seasonId === season?.id);
  const lineAdv = season ? adv.get(season.id) : undefined;

  const [field, teamGp, shots, logs, moves, allLogs] = await Promise.all([
    season
      ? prisma.playerStats.findMany({ where: { seasonId: season.id }, include: { player: { select: { advancedStats: { where: { seasonId: season.id } } } } } })
      : [],
    season
      ? prisma.teamStats.findMany({ where: { seasonId: season.id }, select: { teamId: true, gp: true } })
      : [],
    season
      ? prisma.shotData.findMany({
          where: { playerId: id, seasonId: season.id },
          select: {
            x: true, y: true, made: true, value: true, distanceFt: true, zone: true, eventNum: true,
            actionType: true, period: true, minsLeft: true, secsLeft: true,
          },
        })
      : [],
    season
      ? prisma.playerGameLog.findMany({
          where: { playerId: id, seasonId: season.id, game: { kind: 'regular' } },
          include: {
            game: { include: { homeTeam: { select: { abbreviation: true } }, awayTeam: { select: { abbreviation: true } } } },
          },
          orderBy: { date: 'desc' },
        })
      : [],
    prisma.transaction.findMany({ where: { playerId: id }, include: { team: true }, orderBy: { date: 'desc' }, take: 20 }),
    prisma.playerGameLog.findMany({
      where: { playerId: id, game: { kind: 'regular' } },
      include: { game: { include: { homeTeam: { select: { abbreviation: true } }, awayTeam: { select: { abbreviation: true } } } } },
    }),
  ]);

  // Expected shooting needs the whole league's real shots, so only seasons that have them.
  const realShots = shots.some((s) => s.eventNum !== null);
  const xShot = realShots ? await seasonShooting(season!.id) : expectedShooting([]);

  // --- On/off and the clutch, from his teams' lineup stints (2026-27 on) ------
  const teamIds = [...new Set(logs.map((l) => l.teamId))];
  const [teamStints, clutchSum] = season && teamIds.length
    ? await Promise.all([
        prisma.stint.findMany({
          where: { seasonId: season.id, teamId: { in: teamIds } },
          select: { players: true, gameId: true, seconds: true, pts: true, oppPts: true, poss: true, oppPoss: true, clutch: true },
        }),
        prisma.clutchLog.aggregate({
          where: { seasonId: season.id, playerId: id },
          _sum: { pts: true, fgm: true, fga: true, fg3m: true, fg3a: true, ftm: true, fta: true, reb: true, ast: true, tov: true },
        }),
      ])
    : [[], null];
  const onCourt = teamStints.filter((s) => s.players.includes(id));
  // Opponents' shooting with him on the floor; the whole league's, for his percentiles.
  const defense = realShots && teamStints.length ? await seasonDefense(season!.id) : new Map<number, Defense>();
  const myDef = defense.get(id);
  const onOff = onCourt.length
    ? [
        { label: 'On court', ...stintRatings(onCourt) },
        { label: 'Off court', ...stintRatings(teamStints.filter((s) => !s.players.includes(id))) },
      ]
    : [];
  const clutchOn = onCourt.filter((s) => s.clutch);
  const clutchR = stintRatings(clutchOn);
  const cs = clutchSum?._sum;

  // --- Most similar seasons in history ---------------------------------------
  const matches = season ? await similarSeasons(id, season.id) : null;
  const pairs = (matches ?? []).map((m) => ({ playerId: m.row.playerId, seasonId: m.row.seasonId }));
  const [matchLines, matchAdv] = pairs.length
    ? await Promise.all([
        prisma.playerStats.findMany({
          where: { OR: pairs },
          include: { player: { select: { fullName: true, birthDate: true } }, season: true, team: { select: { abbreviation: true } } },
        }),
        prisma.advancedStats.findMany({ where: { OR: pairs }, select: { playerId: true, seasonId: true, bpm: true, ws48: true } }),
      ])
    : [[], []];
  const ageIn = (birth: Date | null, endYear: number) =>
    birth ? Math.floor((Date.UTC(endYear, 1, 1) - birth.getTime()) / (365.25 * 864e5)) : null;
  const similar = (matches ?? []).flatMap((m) => {
    const l = matchLines.find((x) => x.playerId === m.row.playerId && x.seasonId === m.row.seasonId);
    const x = matchAdv.find((a) => a.playerId === m.row.playerId && a.seasonId === m.row.seasonId);
    return l
      ? [{
          playerId: l.playerId, name: l.player.fullName, season: l.season.key, age: ageIn(l.player.birthDate, l.season.endYear),
          team: l.team?.abbreviation ?? '', gp: l.gp, ppg: l.ppg, rpg: l.rpg, apg: l.apg, tsPct: l.tsPct,
          bpm: x?.bpm ?? null, ws48: x?.ws48 ?? null, shared: m.shared,
        }]
      : [];
  });

  // --- Percentile rankings against the qualified field -----------------------
  // Each player qualifies on his own team's games (as /leaders does): early on,
  // one team a game ahead mustn't shrink the field to its own roster.
  const gpOf = new Map(teamGp.map((t) => [t.teamId, t.gp]));
  const teamGames = Math.max(0, ...teamGp.map((t) => t.gp));
  const gamesOf = (f: { teamId: number | null }) => gpOf.get(f.teamId ?? -1) ?? teamGames;
  const qualified = field.filter((f) => f.gp >= minGames(gamesOf(f)));
  type Metric = { label: string; unit?: string; dp?: number; low?: boolean; signed?: boolean; title?: string; get: (f: (typeof field)[number]) => Cell; floor?: (f: (typeof field)[number]) => boolean };
  const a = (f: (typeof field)[number]) => f.player.advancedStats[0];
  const METRICS: Metric[] = [
    { label: 'Points', get: (f) => f.ppg },
    { label: 'Rebounds', get: (f) => f.rpg },
    { label: 'Assists', get: (f) => f.apg },
    { label: 'Steals', get: (f) => perGame(f.stl, f.gp) },
    { label: 'Blocks', get: (f) => perGame(f.blk, f.gp) },
    { label: 'Turnovers', low: true, get: (f) => perGame(f.tov, f.gp) },
    { label: 'True shooting', unit: '%', get: (f) => f.tsPct, floor: (f) => f.fga >= scaledFloor(300, gamesOf(f)) },
    {
      label: 'Shot quality', unit: '%', get: (f) => xShot.get(f.playerId)?.xEfg ?? null, floor: (f) => f.fga >= scaledFloor(300, gamesOf(f)),
      title: 'Expected eFG%: what the league makes on his shots, by spot and shot type',
    },
    {
      label: 'Shot-making', signed: true, get: (f) => xShot.get(f.playerId)?.shotMaking ?? null, floor: (f) => f.fga >= scaledFloor(300, gamesOf(f)),
      title: 'eFG% minus expected eFG%, in points: zero is an average shooter on his shots',
    },
    {
      label: 'Opp. shooting', signed: true, low: true, get: (f) => defense.get(f.playerId)?.diff ?? null,
      floor: (f) => (defense.get(f.playerId)?.oppFga ?? 0) >= scaledFloor(2000, gamesOf(f)),
      title: "Opponents' eFG% minus what their shots deserved, with him on the floor: below zero is good defense",
    },
    {
      label: 'Rim FG% allowed', unit: '%', low: true, get: (f) => defense.get(f.playerId)?.rimFg ?? null,
      floor: (f) => (defense.get(f.playerId)?.rimFga ?? 0) >= scaledFloor(600, gamesOf(f)),
      title: 'What opponents shot in the restricted area with him on the floor',
    },
    { label: 'Three-point %', unit: '%', get: (f) => f.fg3Pct, floor: (f) => (f.fg3a ?? 0) >= scaledFloor(100, gamesOf(f)) },
    { label: 'Free throw %', unit: '%', get: (f) => f.ftPct, floor: (f) => f.fta >= scaledFloor(100, gamesOf(f)) },
    { label: 'Usage', unit: '%', get: (f) => f.usgPct },
    { label: 'Assist %', unit: '%', get: (f) => a(f)?.astPct ?? null },
    { label: 'Rebound %', unit: '%', get: (f) => a(f)?.rebPct ?? null },
    { label: 'PER', get: (f) => a(f)?.per ?? null },
    { label: 'Box +/-', get: (f) => a(f)?.bpm ?? null },
    { label: 'WS/48', dp: 3, get: (f) => a(f)?.ws48 ?? null },
    { label: 'VORP', get: (f) => a(f)?.vorp ?? null },
  ];
  const me = field.find((f) => f.playerId === id);
  const qualifyAt = me ? minGames(gamesOf(me)) : 0;
  const ranks: Percentile[] = [];
  if (me && me.gp >= qualifyAt) {
    for (const m of METRICS) {
      const mine = m.get(me);
      if (mine === null || (m.floor && !m.floor(me))) continue;
      const pool = qualified.filter((f) => !m.floor || m.floor(f)).map(m.get).filter((v): v is number => v !== null);
      if (pool.length < 2) continue;
      const pct = percentileOf(mine, pool, m.low);
      const value = `${m.signed && mine > 0 ? '+' : ''}${fmt(mine, m.dp ?? 1, m.unit)}`;
      ranks.push({
        label: m.label, value, pct,
        title: `${m.title ?? m.label}: ${value}, ${ordinal(pct)} percentile of ${pool.length} qualified players`,
      });
    }
  }

  // --- Season rows and the career line -----------------------------------------
  const pct = (m: Cell, att: Cell) => (m !== null && att ? (m / att) * 100 : null);
  const rows = player.stats.map((s) => {
    const x = adv.get(s.seasonId);
    return {
      season: s.season.key, team: s.team?.abbreviation ?? '', gp: s.gp, gs: s.gs,
      mpg: perGame(s.min, s.gp), ppg: s.ppg, rpg: s.rpg, apg: s.apg,
      spg: perGame(s.stl, s.gp), bpg: perGame(s.blk, s.gp), topg: perGame(s.tov, s.gp),
      min: s.min, pts: s.pts, reb: s.reb, ast: s.ast, stl: s.stl, blk: s.blk, tov: s.tov, pf: s.pf,
      fgm: s.fgm, fga: s.fga, fg3m: s.fg3m, fg3a: s.fg3a, ftm: s.ftm, fta: s.fta,
      fgPct: s.fgPct, fg3Pct: s.fg3Pct, ftPct: s.ftPct, tsPct: s.tsPct, efgPct: s.efgPct, usgPct: s.usgPct,
      per: x?.per ?? null, astPct: x?.astPct ?? null, rebPct: x?.rebPct ?? null,
      ows: x?.ows ?? null, dws: x?.dws ?? null, ws: x?.ws ?? null, ws48: x?.ws48 ?? null,
      obpm: x?.obpm ?? null, dbpm: x?.dbpm ?? null, bpm: x?.bpm ?? null, vorp: x?.vorp ?? null,
      ortg: x?.ortg ?? null, drtg: x?.drtg ?? null,
    };
  }) as Record<string, string | Cell>[];

  const c = careerTotals(player.stats as SeasonLine[]);
  const ca = careerAdvanced(player.stats.map((s) => ({ min: s.min, ...(adv.get(s.seasonId) ?? { per: null, ws: null, ows: null, dws: null, bpm: null, vorp: null }) })));
  const avg = (t: { total: Cell; gp: number }) => (t.total === null || !t.gp ? null : t.total / t.gp);
  const career: Record<string, Cell> = {
    gp: c.gp, gs: c.gs.total, mpg: avg(c.min), ppg: avg(c.pts), rpg: avg(c.reb), apg: avg(c.ast),
    spg: avg(c.stl), bpg: avg(c.blk), topg: avg(c.tov),
    min: c.min.total, pts: c.pts.total, reb: c.reb.total, ast: c.ast.total, stl: c.stl.total, blk: c.blk.total,
    tov: c.tov.total, pf: c.pf.total, fgm: c.fgm.total, fga: c.fga.total, fg3m: c.fg3m.total, fg3a: c.fg3a.total,
    ftm: c.ftm.total, fta: c.fta.total,
    fgPct: c.fgPct, fg3Pct: c.fg3Pct, ftPct: c.ftPct, tsPct: c.tsPct, efgPct: c.efgPct,
    per: ca.per, ows: ca.ows, dws: ca.dws, ws: ca.ws, ws48: ca.ws48, bpm: ca.bpm, vorp: ca.vorp,
    usgPct: null, astPct: null, rebPct: null, obpm: null, dbpm: null, ortg: null, drtg: null,
  };
  const partial = Object.entries(TALLY_LABELS)
    .filter(([k]) => (c as unknown as Record<string, { partial: boolean }>)[k].partial)
    .map(([k, label]) => {
      const first = player.stats.find((s) => (s as unknown as Record<string, Cell>)[k] !== null);
      return `${label} from ${first?.season.key}`;
    });

  // --- Pace, milestones and active streaks (his season in progress) -----------
  const soFar = line ? Math.max(line.gp, gpOf.get(line.teamId ?? -1) ?? teamGames) : 0;
  const inProgress = player.active && !!line && season === seasons.at(-1) && soFar > 0 && soFar < 82;
  const TRACKED = [
    { key: 'pts', label: 'points', step: 1000 }, { key: 'reb', label: 'rebounds', step: 500 },
    { key: 'ast', label: 'assists', step: 500 }, { key: 'stl', label: 'steals', step: 100 },
    { key: 'blk', label: 'blocks', step: 100 }, { key: 'fg3m', label: 'threes', step: 100 },
  ] as const;
  const tracker = inProgress
    ? TRACKED.flatMap((t) => {
        const now = line![t.key], total = c[t.key].total;
        if (now === null || total === null) return [];
        const m = nextMilestone(total, t.step);
        const rate = now / line!.gp;
        return [{ ...t, now, pace: onPace(now, soFar)!, ...m, games: rate ? Math.ceil(m.left / rate) : null }];
      })
    : [];
  const doubles = (l: (typeof logs)[number]) => [l.pts, l.reb, l.ast, l.stl, l.blk].filter((v) => v >= 10).length;
  const streaks = inProgress
    ? ([
        ['30+ points', (l) => l.pts >= 30], ['20+ points', (l) => l.pts >= 20], ['Double-digit points', (l) => l.pts >= 10],
        ['10+ rebounds', (l) => l.reb >= 10], ['10+ assists', (l) => l.ast >= 10], ['Double-doubles', (l) => doubles(l) >= 2],
        ['3+ threes', (l) => l.fg3m >= 3], ['Made a three', (l) => l.fg3m >= 1],
      ] as [string, (l: (typeof logs)[number]) => boolean][])
        .map(([label, test]) => ({ label, n: activeStreak(logs, test) }))
        .filter((s) => s.n >= 3)
        .sort((a, b) => b.n - a.n)
    : [];
  const num = (v: number) => v.toLocaleString('en-US');

  const logRows = logs.map((l) => {
    const home = l.teamId === l.game.homeTeamId;
    const opp = home ? l.game.awayTeam.abbreviation : l.game.homeTeam.abbreviation;
    const won = home ? l.game.homeScore > l.game.awayScore : l.game.awayScore > l.game.homeScore;
    return {
      gameId: l.gameId,
      date: l.date.toISOString().slice(0, 10),
      matchup: `${home ? 'vs' : '@'} ${opp}`,
      result: `${won ? 'W' : 'L'} ${Math.max(l.game.homeScore, l.game.awayScore)}-${Math.min(l.game.homeScore, l.game.awayScore)}`,
      min: l.min, pts: l.pts, reb: l.reb, ast: l.ast, stl: l.stl, blk: l.blk, tov: l.tov,
      fg: `${l.fgm}-${l.fga}`, fg3: `${l.fg3m}-${l.fg3a}`, ft: `${l.ftm}-${l.fta}`,
      plusMinus: l.plusMinus,
    };
  });

  // Every regular-season game we have, not just this season's, summed by opponent.
  const vsRows = splitLogs(
    allLogs.map((l) => {
      const home = l.teamId === l.game.homeTeamId;
      return {
        ...l,
        opp: home ? l.game.awayTeam.abbreviation : l.game.homeTeam.abbreviation,
        won: home ? l.game.homeScore > l.game.awayScore : l.game.awayScore > l.game.homeScore,
      };
    }),
    (l) => l.opp,
  ).map(({ key, ...s }) => ({ opp: key, ...s }));
  const logsSince = allLogs.length ? seasons.find((s) => allLogs.some((l) => l.seasonId === s.id))?.key : null;

  const myX = xShot.get(id);
  const shotNote = !season
    ? ''
    : realShots
      ? `${shots.length} attempts, each one real, from the NBA's play-by-play${myX ? `. ${fmt(myX.efg)} eFG% on shots the league makes at ${fmt(myX.xEfg)}` : ''}`
      : shots.length
        ? `${shots.length} attempts, derived: drawn to match his published shooting splits by distance`
        : season.endYear < 1997
          ? "Shot locations weren't recorded before 1996-97"
          : 'No shot chart for this season';

  const age = player.active && player.birthDate
    ? Math.floor((Date.now() - player.birthDate.getTime()) / (365.25 * 864e5))
    : null;
  const bio = [
    feetInches(player.heightIn),
    player.weightLb && `${player.weightLb} lb`,
    player.birthDate &&
      `Born ${player.birthDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}${age !== null ? ` (${age})` : ''}`,
    player.college,
    player.country,
    player.draftYear
      ? `${player.draftYear} draft${player.draftRound ? `: round ${player.draftRound}, pick ${player.draftPick}` : ''}`
      : null,
    seasons.length && `${seasons.length} season${seasons.length > 1 ? 's' : ''}, ${seasons[0].key} to ${seasons.at(-1)!.key}`,
  ].filter(Boolean);

  const cols = TABLE[view];
  const cell = (v: string | Cell | undefined, col: TableCol) =>
    typeof v === 'number' ? (col.dp !== undefined ? v.toFixed(col.dp) : String(v)) : v === null || v === undefined ? '—' : v;

  return (
    <div className="space-y-6">
      <header className="panel overflow-hidden">
        <div className="h-1.5" style={{ background: player.team?.primaryColor ?? 'var(--chrome)' }} />
        <div className="flex flex-wrap items-end gap-x-6 gap-y-4 px-4 pt-3">
          {id < 2_000_000 && <Headshot id={id} name={player.fullName} />}
          <div className="min-w-0 flex-1 pb-4">
            <div className="eyebrow">
              {[
                player.team
                  ? `${player.active ? '' : 'Last played for the '}${player.team.city} ${player.team.name}`
                  : 'Free agent',
                player.active && player.jersey && `#${player.jersey}`,
                player.position,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
            <h1 className="flex items-center gap-1 text-2xl font-bold tracking-tight">
              {player.fullName}
              <FavoriteStar player={player.id} team={player.team?.abbreviation ?? null} />
            </h1>
            <div className="mt-1 text-xs" style={{ color: 'var(--ink-2)' }}>
              {bio.join(' · ')}
            </div>
          </div>

          {line && (
            <dl className="flex flex-wrap gap-x-6 gap-y-2 pb-4">
              {[
                ['PTS', fmt(line.ppg)], ['REB', fmt(line.rpg)], ['AST', fmt(line.apg)],
                ['TS%', fmt(line.tsPct)], ['PER', fmt(lineAdv?.per)], ['WS', fmt(lineAdv?.ws)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="eyebrow">
                    {label} <span className="normal-case tracking-normal">{season?.key}</span>
                  </dt>
                  <dd className="tnum text-xl font-bold">{value}</dd>
                </div>
              ))}
            </dl>
          )}

          <Link href={`/compare?ids=${player.id}`} className="btn-ghost mb-4 no-underline">
            Compare
          </Link>
        </div>
      </header>

      {seasons.length > 1 && (
        <Suspense>
          <FilterBar
            fields={[{
              kind: 'select', name: 'season', label: 'Season',
              options: [...seasons].reverse().map((s) => ({ value: s.key, label: s.key })),
              defaultValue: season?.key,
            }]}
          />
        </Suspense>
      )}

      {tracker.length > 0 && (
        <section className="grid gap-5 lg:grid-cols-3">
          <div>
            <h2 className="mb-2 text-sm font-semibold">On pace for, {season!.key}</h2>
            <dl className="panel flex flex-wrap gap-x-6 gap-y-3 p-4">
              {tracker.map((t) => (
                <div key={t.key} title={`${num(t.now)} ${t.label} through ${soFar} team games, carried over 82`}>
                  <dt className="eyebrow">{t.label}</dt>
                  <dd className="tnum text-lg font-bold">{num(t.pace)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs" style={{ color: 'var(--ink-3)' }}>
              His totals per team game so far, over 82 games. Games he misses count against him.
            </p>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold">Next career milestones</h2>
            <ul className="panel divide-y text-sm" style={{ borderColor: 'var(--line)' }}>
              {[...tracker].sort((a, b) => (a.games ?? Infinity) - (b.games ?? Infinity)).map((t) => (
                <li key={t.key} className="flex justify-between gap-3 px-3 py-2" style={{ borderColor: 'var(--line)' }}>
                  <span>
                    <span className="tnum font-bold">{num(t.left)}</span> away from {num(t.at)} {t.label}
                  </span>
                  {t.games !== null && (
                    <span className="tnum text-xs" style={{ color: 'var(--ink-3)' }}>~{t.games} games</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs" style={{ color: 'var(--ink-3)' }}>
              Regular season. Games to go at his {season!.key} rate.
            </p>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold">Active streaks</h2>
            {streaks.length ? (
              <ul className="panel divide-y text-sm" style={{ borderColor: 'var(--line)' }}>
                {streaks.map((s) => (
                  <li key={s.label} className="flex justify-between gap-3 px-3 py-2" style={{ borderColor: 'var(--line)' }}>
                    <span>{s.label}</span>
                    <span className="tnum font-bold">{s.n} straight</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="panel p-4 text-sm" style={{ color: 'var(--ink-3)' }}>No streak of three games or more going.</p>
            )}
            <p className="mt-2 text-xs" style={{ color: 'var(--ink-3)' }}>
              Games he played this season, latest first. A game he sits out doesn&apos;t break one.
            </p>
          </div>
        </section>
      )}

      <section className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <PercentileBars
          title={`Percentile rankings, ${season?.key ?? ''}`}
          subtitle={`Against the ${qualified.length} players with 70% of their team's games. Red beats the field, blue trails it.`}
          rows={ranks}
          empty={
            !line
              ? 'No season on file.'
              : `${line.gp} games played; ranking takes ${qualifyAt}, 70% of his team's games.`
          }
        />
        {shots.length ? (
          <ShotChart
            shots={shots.map(
              (s): Shot => ({
                x: s.x, y: s.y, made: s.made, value: s.value, distanceFt: s.distanceFt,
                zone: s.zone, action: s.actionType,
                period: s.period, clock: `${s.minsLeft}:${String(s.secsLeft).padStart(2, '0')}`,
              }),
            )}
            title={`${player.fullName}, ${season?.key}`}
            subtitle={shotNote}
          />
        ) : (
          <div className="panel grid place-items-center p-8 text-sm" style={{ color: 'var(--ink-3)' }}>
            {shotNote}
          </div>
        )}
      </section>

      {onOff.length > 0 && (
        <section className="grid gap-5 lg:grid-cols-2">
          <div>
            <h2 className="mb-2 text-sm font-semibold">On/off, {season?.key}</h2>
            <div className="panel overflow-x-auto">
              <table className="stat-table">
                <thead>
                  <tr>
                    {['', 'MIN', '+/-', 'ORtg', 'DRtg', 'Net'].map((h) => (
                      <th key={h} style={{ cursor: 'default' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {onOff.map((r) => (
                    <tr key={r.label}>
                      <td>{r.label}</td>
                      <td>{fmt(r.min, 0)}</td>
                      <td>{r.plusMinus > 0 ? `+${r.plusMinus}` : r.plusMinus}</td>
                      <td>{fmt(r.ortg)}</td>
                      <td>{fmt(r.drtg)}</td>
                      <td>{fmt(r.net)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold" style={{ background: 'var(--panel-2)' }}>
                    <td className="px-2 py-2 text-left" colSpan={5}>On − off, net rating</td>
                    <td className="tnum px-2 py-2 text-right">
                      {onOff[0].net !== null && onOff[1].net !== null
                        ? `${onOff[0].net - onOff[1].net > 0 ? '+' : ''}${fmt(onOff[0].net - onOff[1].net)}`
                        : '—'}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-2 text-xs" style={{ color: 'var(--ink-3)' }}>
              His team per 100 possessions with him on the floor and without him.
            </p>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold">Clutch, {season?.key}</h2>
            {clutchOn.length ? (
              <dl className="panel flex flex-wrap gap-x-6 gap-y-3 p-4">
                {[
                  ['Games', String(new Set(clutchOn.map((s) => s.gameId)).size)],
                  ['MIN', fmt(clutchR.min)],
                  ['PTS', String(cs?.pts ?? 0)],
                  ['FG', `${cs?.fgm ?? 0}-${cs?.fga ?? 0}`],
                  ['3P', `${cs?.fg3m ?? 0}-${cs?.fg3a ?? 0}`],
                  ['FT', `${cs?.ftm ?? 0}-${cs?.fta ?? 0}`],
                  ['REB', String(cs?.reb ?? 0)],
                  ['AST', String(cs?.ast ?? 0)],
                  ['TOV', String(cs?.tov ?? 0)],
                  ['+/-', clutchR.plusMinus > 0 ? `+${clutchR.plusMinus}` : String(clutchR.plusMinus)],
                  ['Net', fmt(clutchR.net)],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="eyebrow">{label}</dt>
                    <dd className="tnum text-lg font-bold">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="panel p-4 text-sm" style={{ color: 'var(--ink-3)' }}>No clutch minutes yet this season.</p>
            )}
            <p className="mt-2 text-xs" style={{ color: 'var(--ink-3)' }}>
              The NBA&apos;s clutch: the last five minutes of the fourth or overtime, the score within five.
            </p>
          </div>
          {myDef && (
            <div>
              <h2 className="mb-2 text-sm font-semibold">Defense, {season?.key}</h2>
              <div className="panel overflow-x-auto">
                <table className="stat-table">
                  <thead>
                    <tr>
                      {['Opponents', 'FGA', 'Shot', 'Expected', 'Diff'].map((h) => (
                        <th key={h} style={{ cursor: 'default' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['All shots, eFG%', myDef.oppFga, myDef.oppEfg, myDef.oppXEfg, myDef.diff],
                      ['At the rim, FG%', myDef.rimFga, myDef.rimFg, myDef.rimXFg, myDef.rimDiff],
                    ].map(([label, fga, shot, x, diff]) => (
                      <tr key={label as string}>
                        <td>{label}</td>
                        <td>{fga}</td>
                        <td>{fmt(shot as number | null)}</td>
                        <td>{fmt(x as number | null)}</td>
                        <td style={{ color: diff === null ? undefined : (diff as number) < 0 ? 'var(--pos)' : 'var(--neg)' }}>
                          {diff === null ? '—' : `${(diff as number) > 0 ? '+' : ''}${fmt(diff as number)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs" style={{ color: 'var(--ink-3)' }}>
                What opponents shot with him on the floor, against what the league makes from those same shots. All five
                defenders share every attempt, so it&apos;s noisy early. <Link href="/defense" className="link">League board</Link>
              </p>
            </div>
          )}
        </section>
      )}

      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold tracking-tight">Stats</h2>
          <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
            Regular season. A traded player&apos;s season is his combined line, under his last team.
          </span>
        </div>
        <ViewTabs
          views={STAT_VIEWS}
          current={view}
          name="stats"
          params={Object.fromEntries(Object.entries(sp).filter(([k]) => k !== 'stats'))}
        />
        <div className="panel overflow-x-auto">
          <table className="stat-table">
            <thead>
              <tr>
                <th style={{ cursor: 'default' }}>Season</th>
                <th style={{ cursor: 'default' }}>Team</th>
                {cols.map((col) => (
                  <th key={col.key} title={col.title} style={{ cursor: 'default' }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.season)}>
                  <td>
                    <Link href={`?${new URLSearchParams({ ...sp, season: String(r.season) })}`} className="link" scroll={false}>
                      {r.season}
                    </Link>
                  </td>
                  <td>{r.team}</td>
                  {cols.map((col) => (
                    <td key={col.key} style={r[col.key] === null ? { color: 'var(--ink-3)' } : undefined}>
                      {cell(r[col.key], col)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold" style={{ background: 'var(--panel-2)' }}>
                <td className="px-2 py-2 text-left">Career</td>
                <td />
                {cols.map((col) => (
                  <td key={col.key} className="tnum px-2 py-2 text-right">
                    {cell(career[col.key], col)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
        {partial.length > 0 && (
          <p className="mt-2 text-xs" style={{ color: 'var(--ink-3)' }}>
            The league started keeping some of these during his career. Career {partial.join('; ')}.
          </p>
        )}
      </section>

      {season && (
        <section>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold tracking-tight">Most similar seasons, {season.key}</h2>
            <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
              Other players&apos; seasons nearest this one on {FEATURES.join(', ')}, each measured against its own season&apos;s league.
            </span>
          </div>
          {similar.length ? (
            <div className="panel overflow-x-auto">
              <table className="stat-table">
                <thead>
                  <tr>
                    {['Player', 'Season', 'Age', 'Team', 'GP', 'PTS', 'REB', 'AST', 'TS%', 'BPM', 'WS/48', 'Matched on'].map((h) => (
                      <th key={h} style={{ cursor: 'default' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      playerId: id, name: player.fullName, season: season.key, age: ageIn(player.birthDate, season.endYear),
                      team: line?.team?.abbreviation ?? '', gp: line?.gp ?? null, ppg: line?.ppg ?? null, rpg: line?.rpg ?? null,
                      apg: line?.apg ?? null, tsPct: line?.tsPct ?? null, bpm: lineAdv?.bpm ?? null, ws48: lineAdv?.ws48 ?? null, shared: null,
                    },
                    ...similar,
                  ].map((r, i) => (
                    <tr key={`${r.playerId}-${r.season}`} className={i === 0 ? 'font-bold' : undefined} style={i === 0 ? { background: 'var(--panel-2)' } : undefined}>
                      <td>
                        {i === 0 ? (
                          r.name
                        ) : (
                          <Link href={`/players/${r.playerId}?season=${r.season}`} className="link">
                            {r.name}
                          </Link>
                        )}
                      </td>
                      <td>{r.season}</td>
                      <td>{r.age ?? '—'}</td>
                      <td>{r.team}</td>
                      <td>{r.gp ?? '—'}</td>
                      <td>{fmt(r.ppg)}</td>
                      <td>{fmt(r.rpg)}</td>
                      <td>{fmt(r.apg)}</td>
                      <td>{fmt(r.tsPct)}</td>
                      <td>{fmt(r.bpm)}</td>
                      <td>{fmt(r.ws48, 3)}</td>
                      <td>{r.shared === null ? '' : `${r.shared} of ${FEATURES.length}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="panel p-4 text-sm" style={{ color: 'var(--ink-3)' }}>
              {matches === null
                ? `Not enough of ${season.key} to compare yet: it takes 200 minutes, and ${MIN_MINUTES} over a full season. Pick an earlier season above.`
                : 'No season in history shares enough of these stats to compare.'}
            </p>
          )}
        </section>
      )}

      <section className="grid gap-5 lg:grid-cols-2">
        <TrendChart
          title="Scoring and efficiency by season"
          data={rows.map((r) => ({ label: r.season, ppg: r.ppg, tsPct: r.tsPct }))}
          series={[
            { key: 'ppg', label: 'Points per game' },
            { key: 'tsPct', label: 'True shooting %' },
          ]}
        />
        <TrendChart
          title="Value by season"
          data={rows.map((r) => ({ label: r.season, per: r.per, ws: r.ws }))}
          series={[
            { key: 'per', label: 'PER' },
            { key: 'ws', label: 'Win shares' },
          ]}
        />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold tracking-tight">Game log, {season?.key}</h2>
        <StatTable
          empty="Game logs start with 2026-27, from the NBA's box scores."
          rows={logRows}
          cols={
            [
              { key: 'date', label: 'Date' },
              { key: 'matchup', label: 'Matchup' },
              { key: 'result', label: 'Result' },
              { key: 'min', label: 'MIN', dp: 1 },
              { key: 'pts', label: 'PTS', shade: true },
              { key: 'reb', label: 'REB', shade: true },
              { key: 'ast', label: 'AST', shade: true },
              { key: 'stl', label: 'STL' },
              { key: 'blk', label: 'BLK' },
              { key: 'tov', label: 'TOV', lowerIsBetter: true, shade: true },
              { key: 'fg', label: 'FG' },
              { key: 'fg3', label: '3P' },
              { key: 'ft', label: 'FT' },
              { key: 'plusMinus', label: '+/-', shade: true },
            ] as Col<(typeof logRows)[number]>[]
          }
          initialSort="date"
          href={{ base: '/games', key: 'gameId' }}
          filename={`${player.fullName}-gamelog-${season?.key}`}
          pageSize={25}
        />
      </section>

      {vsRows.length > 0 && (
        <section>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold tracking-tight">Vs. opponents</h2>
            <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
              Regular season, per game, since {logsSince}, when our game logs start.
            </span>
          </div>
          <StatTable
            rows={vsRows}
            cols={
              [
                { key: 'opp', label: 'Opp' },
                { key: 'gp', label: 'GP' },
                { key: 'record', label: 'W-L' },
                { key: 'min', label: 'MIN', dp: 1 },
                { key: 'pts', label: 'PTS', dp: 1, shade: true },
                { key: 'reb', label: 'REB', dp: 1, shade: true },
                { key: 'ast', label: 'AST', dp: 1, shade: true },
                { key: 'stl', label: 'STL', dp: 1 },
                { key: 'blk', label: 'BLK', dp: 1 },
                { key: 'tov', label: 'TOV', dp: 1, lowerIsBetter: true },
                { key: 'fgPct', label: 'FG%', dp: 1 },
                { key: 'fg3Pct', label: '3P%', dp: 1 },
                { key: 'ftPct', label: 'FT%', dp: 1 },
                { key: 'tsPct', label: 'TS%', dp: 1, shade: true },
              ] as Col<(typeof vsRows)[number]>[]
            }
            initialSort="gp"
            href={{ base: '/teams', key: 'opp' }}
            teamLogo="opp"
            filename={`${player.fullName}-vs-opponents`}
            pageSize={30}
          />
        </section>
      )}

      {moves.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-bold tracking-tight">Transactions</h2>
          <ul className="panel divide-y text-sm" style={{ borderColor: 'var(--line)' }}>
            {moves.map((m) => (
              <li key={m.id} className="flex gap-3 px-3 py-2" style={{ borderColor: 'var(--line)' }}>
                <span className="eyebrow w-24 shrink-0 tnum">{m.date.toISOString().slice(0, 10)}</span>
                <span>{m.description}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
