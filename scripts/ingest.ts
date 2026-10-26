/**
 * The one-time history load: every season from the BAA's first (1946-47)
 * through the last one played, from basketball-reference.com, with every
 * player matched to his NBA person id. Run it from your own machine: it takes
 * about 90 minutes at BR's pace, and the NBA player index it matches against
 * turns away most cloud IPs.
 *
 *   npm run ingest                            # 1946-47 .. 2025-26, wipes first
 *   npm run ingest -- --from 2020 --to 2026   # seasons by end year
 *   npm run ingest -- --keep                  # add to the DB instead of wiping it
 *   npm run ingest -- --shots 40              # more derived shot charts per season
 *
 * Then `npm run sync` brings in the current season from the NBA's feeds.
 *
 * Real, straight off the source: players and their bios, per-season totals,
 * the published advanced metrics, team ratings, each season's standings
 * alignment, and every regular-season game with its final score. A stat the
 * league didn't keep yet (steals before 1973-74...) is stored as null.
 *
 * Derived: individual ORtg/DRtg (stats.ts approximations), and for 1996-97
 * through 2025-26 shot charts sampled to match each player's *published*
 * shooting splits by distance, so the totals tie out even though no single
 * dot is a real shot. Real shots start with 2026-27, from the NBA's feed.
 */
import { TEAMS } from '../prisma/teams';
import { cupFinal, fetchPage, fetchSeason, gameRow, playerIndex, seasonPath, table, teamIdFor, type Row } from '../src/lib/bref';
import { prisma } from '../src/lib/db';
import { legacyId, matcher, resolvePlayer } from '../src/lib/identity';
import { FEEDS, inches, nbaJson, rowsOf } from '../src/lib/nba';
import { shotZone } from '../src/lib/stats';
import { chunked, writeSeason } from '../src/lib/sync';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const FROM = Number(arg('from', '1947')); // season end year: 1947 = 1946-47
const TO = Number(arg('to', '2026'));
const SHOT_PLAYERS = Number(arg('shots', '20')); // per season, by attempts
const KEEP = process.argv.includes('--keep');
/** From this season on, games and shots come from the NBA's feeds (`npm run sync`). */
const NBA_FEED_FROM = 2027;
/** BR's shooting-by-distance tables, which derived shots are drawn from, start here. */
const SHOOTING_FROM = 1997;

const label = (y: number) => `${y - 1}-${String(y % 100).padStart(2, '0')}`;

// --- deterministic RNG, so a re-run draws the same derived shots ---------------
let state = 20260101;
const rnd = () => {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const range = (lo: number, hi: number) => lo + rnd() * (hi - lo);
const int = (lo: number, hi: number) => Math.floor(range(lo, hi + 1));
const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
const shuffle = <T>(a: T[]) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const num = (v: string | undefined) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// --- who is who ------------------------------------------------------------------

/**
 * Every BR slug resolved to an NBA person id up front, from both sources'
 * complete player indexes, so each player's whole career is known before any
 * season loads. Two slugs landing on one id means the matcher guessed; both
 * fall back to their legacy ids rather than merge two people.
 */
async function identities() {
  console.log('Matching players: NBA index (stats.nba.com) + BR index (26 pages)…');
  const nba = rowsOf((await nbaJson(FEEDS.allPlayers(label(TO)))).resultSets[0]);
  const br = await playerIndex();
  const match = matcher(
    nba.map((r) => ({
      id: r.PERSON_ID, first: r.PLAYER_FIRST_NAME ?? '', last: r.PLAYER_LAST_NAME ?? '',
      from: Number(r.FROM_YEAR), to: Number(r.TO_YEAR),
    })),
  );

  const found = [...br].map(([slug, p]) => ({ slug, p, ...resolvePlayer(slug, p.name, p.from, p.to, match) }));
  const claims = new Map<number, number>();
  for (const f of found) if (f.matched) claims.set(f.id, (claims.get(f.id) ?? 0) + 1);
  const ids = new Map<string, number>();
  const unmatched: typeof found = [];
  for (const f of found) {
    const clash = f.matched && claims.get(f.id)! > 1;
    ids.set(f.slug, f.matched && !clash ? f.id : legacyId(f.slug));
    if (!f.matched || clash) unmatched.push(f);
  }

  // Only players from the NBA-feed era can end up duplicated, so only they
  // are worth an override in src/lib/identity.ts.
  const recent = unmatched.filter((u) => u.p.to >= 2014);
  console.log(`  ${br.size} BR players, ${br.size - unmatched.length} matched, ${unmatched.length} not`);
  for (const u of recent) console.log(`  unmatched since 2014-15: ${u.slug} ${u.p.name} (${u.p.from}-${u.p.to})`);
  return { ids, match, nba: new Map(nba.map((r) => [r.PERSON_ID as number, r])), br };
}

// --- derived shot charts -----------------------------------------------------------

/** BR's distance buckets, as radii in tenths of a foot. */
const BANDS = [
  { att: 'pct_fga_00_03', fg: 'fg_pct_00_03', lo: 0, hi: 30 },
  { att: 'pct_fga_03_10', fg: 'fg_pct_03_10', lo: 30, hi: 100 },
  { att: 'pct_fga_10_16', fg: 'fg_pct_10_16', lo: 100, hi: 160 },
  { att: 'pct_fga_16_xx', fg: 'fg_pct_16_xx', lo: 160, hi: 235 },
];
const ACTIONS: Record<string, string[]> = {
  'Restricted Area': ['Driving Layup', 'Cutting Dunk', 'Alley Oop Dunk', 'Layup', 'Putback Layup'],
  'In The Paint (Non-RA)': ['Floating Jump Shot', 'Hook Shot', 'Turnaround Fadeaway'],
  'Mid-Range': ['Pullup Jump Shot', 'Jump Shot', 'Step Back Jump Shot'],
  'Long Mid-Range': ['Pullup Jump Shot', 'Jump Shot', 'Fadeaway Jump Shot'],
  'Left Corner 3': ['Jump Shot', 'Catch and Shoot 3PT'],
  'Right Corner 3': ['Jump Shot', 'Catch and Shoot 3PT'],
  'Above the Break 3': ['Pullup Jump Shot', 'Jump Shot', 'Step Back Jump Shot', 'Catch and Shoot 3PT'],
};

/** A point on the floor inside an annulus, in NBA tracking coordinates. */
function spot(lo: number, hi: number) {
  const d = range(lo, hi);
  const t = range(0.12, Math.PI - 0.12);
  const x = Math.round(Math.cos(t) * d);
  let y = Math.round(Math.sin(t) * d);
  // shotZone() calls anything past |x|=220 near the baseline a corner three,
  // so push deep two-pointers off the sideline rather than mislabel them.
  if (hi < 237 && Math.abs(x) >= 219 && y <= 95) y = int(96, 150);
  return { x, y };
}

async function derivedShots(year: number, seasonId: number, players: { slug: string; id: number; teamId: number; row: { fga: number; games: number; fg3Pct: number } }[]) {
  const shooting = new Map<string, Row>();
  for (const r of table(await fetchPage(`/leagues/${seasonPath(year)}_shooting.html`), 'shooting')) {
    const abbr = r.team_name_abbr || r._team || '';
    if (r._id && (abbr === 'TOT' || /^\dTM$/.test(abbr) || !shooting.has(r._id))) shooting.set(r._id, r);
  }
  const games = await prisma.game.findMany({
    where: { seasonId },
    select: { id: true, date: true, homeTeamId: true, awayTeamId: true },
  });
  const gamesByTeam = new Map<number, typeof games>();
  for (const g of games) for (const t of [g.homeTeamId, g.awayTeamId]) gamesByTeam.set(t, [...(gamesByTeam.get(t) ?? []), g]);

  const shots: any[] = [];
  const targets = [...players].sort((a, b) => b.row.fga - a.row.fga).slice(0, SHOT_PLAYERS);
  for (const t of targets) {
    const sh = shooting.get(t.slug);
    const teamGames = gamesByTeam.get(t.teamId);
    if (!sh || !teamGames?.length || t.row.fga < 1) continue;

    const corner = num(sh.pct_fg3a_corner3);
    const bands = [
      ...BANDS.map((b) => ({ ...b, share: num(sh[b.att]), fgPct: num(sh[b.fg]), corner: 0 })),
      { att: '', fg: '', lo: 237, hi: 285, corner, share: num(sh.pct_fga_fg3a), fgPct: t.row.fg3Pct / 100 },
    ];
    const totalShare = bands.reduce((s, b) => s + b.share, 0) || 1;

    const drawn: { x: number; y: number; made: boolean }[] = [];
    for (const b of bands) {
      const att = Math.round(t.row.fga * (b.share / totalShare));
      const made = Math.round(att * b.fgPct);
      for (let i = 0; i < att; i++) {
        const p = b.corner && rnd() < b.corner
          ? { x: (rnd() < 0.5 ? -1 : 1) * int(222, 245), y: int(-8, 88) }
          : spot(b.lo, b.hi);
        drawn.push({ ...p, made: i < made });
      }
    }
    shuffle(drawn);

    // Spread the season's attempts over the games he could have played in.
    const played = shuffle([...teamGames]).slice(0, Math.max(1, t.row.games));
    drawn.forEach((s, i) => {
      const game = played[i % played.length];
      const z = shotZone(s.x, s.y);
      shots.push({
        playerId: t.id, gameId: game.id, seasonId, teamId: t.teamId, x: s.x, y: s.y,
        distanceFt: Math.round(Math.hypot(s.x, s.y) / 10),
        made: s.made, value: z.value, zone: z.zone, zoneArea: z.area,
        actionType: pick(ACTIONS[z.zone]), period: int(1, 4),
        minsLeft: int(0, 11), secsLeft: int(0, 59), date: game.date,
      });
    });
  }
  // Derived shots have no event number; real ones do and are never touched here.
  await prisma.shotData.deleteMany({ where: { seasonId, eventNum: null } });
  await chunked(shots, 5000, (c) => prisma.shotData.createMany({ data: c }));
  return shots.length;
}

// --- games -----------------------------------------------------------------------

async function seasonGames(year: number, seasonId: number, teamGp: Map<number, number>) {
  const path = seasonPath(year);
  const index = await fetchPage(`/leagues/${path}_games.html`);
  // Chronological, as BR lists them. Split seasons name their month pages
  // "october-2019"/"october-2020", so the segment isn't always just letters.
  const months = [...new Set([...index.matchAll(new RegExp(`/leagues/${path}_games-([a-z0-9-]+)\\.html`, 'g'))].map((m) => m[1]))];
  // The NBA Cup final sits in the schedule but isn't a regular-season game.
  // It can only be told apart once the whole schedule is in hand.
  const hasCup = year >= 2024;
  const played = new Map<number, number>();
  const full = () => [...teamGp].every(([id, gp]) => (played.get(id) ?? 0) >= gp);

  const rows: Row[] = [];
  for (const month of months.length ? months : ['']) {
    const html = month ? await fetchPage(`/leagues/${path}_games-${month}.html`) : index;
    for (const r of table(html, 'schedule')) {
      if (num(r.home_pts) <= 0 || !r.home_team_name_abbr || !r.visitor_team_name_abbr) continue;
      rows.push(r);
      for (const abbr of [r.home_team_name_abbr, r.visitor_team_name_abbr]) {
        const id = teamIdFor(abbr);
        played.set(id, (played.get(id) ?? 0) + 1);
      }
    }
    // BR runs the playoffs into the same month pages; once every team has its
    // regular season, stop reading.
    if (!hasCup && full()) break;
  }

  const skip = hasCup ? cupFinal(rows) : null;
  played.clear();
  const games = [];
  for (const r of rows) {
    if (r.date_game_csk === skip) continue;
    const [home, away] = [teamIdFor(r.home_team_name_abbr), teamIdFor(r.visitor_team_name_abbr)];
    // A team's regular season is exactly the game count BR reports for it.
    if ((played.get(home) ?? 0) >= (teamGp.get(home) ?? 82) || (played.get(away) ?? 0) >= (teamGp.get(away) ?? 82)) continue;
    played.set(home, (played.get(home) ?? 0) + 1);
    played.set(away, (played.get(away) ?? 0) + 1);
    games.push(gameRow(r, seasonId, 'regular'));
  }
  await chunked(games, 1000, (c) => prisma.game.createMany({ data: c, skipDuplicates: true }));
  return { games: games.length, cupFinal: skip };
}

// --- bios ------------------------------------------------------------------------

/**
 * Height, weight, college, country and draft from the NBA's index; birth
 * date from BR's (the NBA's doesn't carry it), and BR's measurements for
 * anyone the NBA's index doesn't cover.
 */
async function bios(who: Awaited<ReturnType<typeof identities>>) {
  const players = await prisma.player.findMany({ select: { id: true, brSlug: true } });
  const rows = players.map((p) => {
    const n = who.nba.get(p.id);
    const b = p.brSlug ? who.br.get(p.brSlug) : undefined;
    const int = (v: unknown) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    return {
      id: p.id,
      height: (n && inches(n.HEIGHT)) ?? b?.heightIn ?? null,
      weight: int(n?.WEIGHT) ?? b?.weightLb ?? null,
      college: (n?.COLLEGE as string) || b?.college || null,
      country: (n?.COUNTRY as string) || null,
      born: b?.birthDate ?? null,
      dyear: int(n?.DRAFT_YEAR),
      dround: int(n?.DRAFT_ROUND),
      dpick: int(n?.DRAFT_NUMBER),
    };
  });
  await chunked(rows, 2000, (c) => prisma.$executeRaw`
    UPDATE players p SET
      "heightIn" = v.height, "weightLb" = v.weight, college = v.college, country = v.country,
      "birthDate" = v.born, "draftYear" = v.dyear, "draftRound" = v.dround, "draftPick" = v.dpick
    FROM (
      SELECT unnest(${c.map((r) => r.id)}::int[]) AS id,
             unnest(${c.map((r) => r.height)}::int[]) AS height,
             unnest(${c.map((r) => r.weight)}::int[]) AS weight,
             unnest(${c.map((r) => r.college)}::text[]) AS college,
             unnest(${c.map((r) => r.country)}::text[]) AS country,
             unnest(${c.map((r) => r.born)}::timestamp[]) AS born,
             unnest(${c.map((r) => r.dyear)}::int[]) AS dyear,
             unnest(${c.map((r) => r.dround)}::int[]) AS dround,
             unnest(${c.map((r) => r.dpick)}::int[]) AS dpick
    ) v
    WHERE p.id = v.id`);
  return rows.length;
}

// --- main --------------------------------------------------------------------------

async function main() {
  console.log(`Ingesting ${label(FROM)} .. ${label(TO)} from basketball-reference`);
  if (!KEEP) {
    console.log('Clearing existing data…');
    await prisma.$transaction([
      prisma.shotData.deleteMany(), prisma.playerGameLog.deleteMany(),
      prisma.advancedStats.deleteMany(), prisma.playerStats.deleteMany(),
      prisma.teamStats.deleteMany(), prisma.game.deleteMany(), prisma.transaction.deleteMany(),
      prisma.player.deleteMany(), prisma.team.deleteMany(), prisma.season.deleteMany(),
    ]);
  }
  await prisma.team.createMany({ data: TEAMS, skipDuplicates: true });

  const who = await identities();

  // Newest first, so a player's row is created with the last team he played for.
  for (let year = TO; year >= FROM; year--) {
    const key = label(year);
    console.log(`\n=== ${key} ===`);
    const season = await prisma.season.upsert({
      where: { key },
      create: { key, startYear: year - 1, endYear: year },
      update: {},
    });

    const data = await fetchSeason(year);
    if (data.scheduleOnly) {
      console.log('not played yet; `npm run sync` loads it from the NBA');
      continue;
    }
    const counts = await writeSeason(
      prisma, season.id, data,
      (p) => who.ids.get(p.slug) ?? resolvePlayer(p.slug, p.name, year - 1, year - 1, who.match).id,
    );
    await prisma.season.update({ where: { id: season.id }, data: { active: true } });
    console.log(`teams ${counts.teams} · players ${counts.players} · advanced ${counts.advanced}`);

    if (year >= NBA_FEED_FROM) continue;
    const g = await seasonGames(year, season.id, new Map(data.teams.map((t) => [t.teamId, t.gp])));
    console.log(`games ${g.games}${g.cupFinal ? ` (left out the NBA Cup final, ${g.cupFinal})` : ''}`);

    if (year >= SHOOTING_FROM && SHOT_PLAYERS > 0) {
      const n = await derivedShots(
        year, season.id,
        data.players.map((p) => ({
          slug: p.slug, teamId: p.teamId,
          id: who.ids.get(p.slug) ?? resolvePlayer(p.slug, p.name, year - 1, year - 1, who.match).id,
          row: { fga: p.line.fga, games: p.line.gp, fg3Pct: p.line.fg3a ? (p.line.fg3m! / p.line.fg3a) * 100 : 0 },
        })),
      );
      console.log(`shots (derived) ${n}`);
    }
  }

  console.log(`\nbios: ${await bios(who)} players`);
  console.log('Ingest complete. Now run `npm run sync` for the current season, rosters and transactions.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
