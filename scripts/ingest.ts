/**
 * Pulls real NBA data from basketball-reference.com into the schema.
 *
 *   npm run ingest                                   # 2000-01 .. 2025-26, ~25 min
 *   npm run ingest -- --from 2020 --to 2026          # seasons by end year
 *   npm run ingest -- --shots 40 --pbp 30            # more derived detail
 *   npm run ingest -- --keep                         # add to the DB instead of wiping it
 *   npm run ingest -- --from 2027 --to 2027 --keep   # next season's schedule, once BR posts it
 *
 * Real, straight off the source: players, per-season totals, the published
 * advanced metrics (PER, TS%, USG%, WS, BPM, VORP, AST%/TRB%/STL%/BLK%/TOV%),
 * team ratings, and every regular-season game with its final score.
 *
 * Derived, because basketball-reference publishes no such data: individual
 * ORtg/DRtg (stats.ts approximations), shot coordinates, and play-by-play.
 * Shots are sampled to match each player's *published* FGA share and FG% by
 * distance band, so the chart totals tie out to the real numbers even though
 * no individual dot is a real shot.
 *
 * basketball-reference throttles above ~20 requests/minute and will ban a
 * client that keeps going, so every fetch runs through `page()`, which paces
 * itself, backs off on 429, and retries.
 */
import { PrismaClient } from '@prisma/client';
import { TEAMS } from '../prisma/teams';
import { BoxTotals, TeamTotals, playerDrtg, playerOrtg, LEAGUE_2024_25, shotZone } from '../src/lib/stats';

const prisma = new PrismaClient();

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

const FROM = Number(arg('from', '2001'));           // season end year: 2001 = 2000-01
const TO = Number(arg('to', '2026'));
const SHOT_PLAYERS = Number(arg('shots', '20'));    // per season, by attempts
const PBP_GAMES = Number(arg('pbp', '20'));         // most recent games overall
const DELAY = Number(process.env.BREF_DELAY_MS ?? 3500);
const UA =
  process.env.BREF_USER_AGENT ??
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- deterministic RNG, so a re-run produces the same derived shots ---------
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

// --- fetching --------------------------------------------------------------

/** One basketball-reference page, comment markers stripped. Empty string on 404. */
async function page(path: string, tries = 3): Promise<string> {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(`https://www.basketball-reference.com${path}`, {
        headers: { 'User-Agent': UA, Accept: 'text/html,*/*', 'Accept-Language': 'en-US,en;q=0.9' },
        signal: AbortSignal.timeout(45_000),
      });
      if (res.status === 404) return '';
      if (res.status === 429) {
        console.warn('  rate limited; sleeping 90s');
        await sleep(90_000);
        throw new Error('429');
      }
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const html = await res.text();
      await sleep(DELAY);
      // Half of BR's tables ship inside HTML comments; unwrap them all.
      return html.replaceAll('<!--', '').replaceAll('-->', '');
    } catch (err) {
      if (attempt === tries) throw new Error(`${path} failed after ${tries} tries: ${err}`);
      console.warn(`  ${path} attempt ${attempt} failed (${err}); backing off`);
      await sleep(DELAY * attempt * 3);
    }
  }
  throw new Error('unreachable');
}

type Row = Record<string, string>;

const strip = (s: string) =>
  s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();

/**
 * Every data row of one BR table, keyed by its `data-stat` names.
 * `_id` is the player slug; `_team` / `<stat>_abbr` are team abbreviations
 * lifted out of the cell links, which is the only place BR puts them.
 */
function table(html: string, id: string): Row[] {
  const start = html.indexOf(`id="${id}"`);
  if (start < 0) return [];
  const stop = html.indexOf('</table>', start);
  const body = html.slice(start, stop < 0 ? undefined : stop);
  return body
    .split('<tr')
    .slice(1)
    .map((tr) => {
      const row: Row = {};
      for (const m of tr.matchAll(/data-stat="([a-z0-9_]+)"([^>]*)>([\s\S]*?)<\/(?:td|th)>/g)) {
        row[m[1]] = strip(m[3]);
        const csk = /csk="([^"]+)"/.exec(m[2]);
        if (csk) row[`${m[1]}_csk`] = csk[1];
        const team = /\/teams\/([A-Z]{3})\//.exec(m[3]);
        if (team) row[`${m[1]}_abbr`] = team[1];
      }
      const slug = /data-append-csv="([^"]+)"/.exec(tr);
      if (slug) row._id = slug[1];
      const team = /\/teams\/([A-Z]{3})\//.exec(tr);
      if (team) row._team = team[1];
      return row;
    })
    .filter((r) => Object.keys(r).length > 3);
}

const n = (v: string | undefined) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const pctOf = (v: string | undefined) => n(v) * 100; // BR writes ".402"
const r1 = (x: number) => Math.round((Number.isFinite(x) ? x : 0) * 10) / 10;
const r2 = (x: number) => Math.round((Number.isFinite(x) ? x : 0) * 100) / 100;

const chunked = async <T>(rows: T[], size: number, fn: (c: T[]) => Promise<unknown>) => {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
};

// --- teams -----------------------------------------------------------------

/**
 * BR abbreviation -> Team.id. Charlotte and New Orleans map onto the franchises
 * that own that history today (CHH/CHA/CHO are all one franchise; NOH/NOK are
 * the Pelicans). Relocations that changed city get their own row.
 */
const BREF_TEAM: Record<string, number> = {
  ATL: 1610612737, BOS: 1610612738, BRK: 1610612751, CHA: 1610612766, CHH: 1610612766,
  CHI: 1610612741, CHO: 1610612766, CLE: 1610612739, DAL: 1610612742, DEN: 1610612743,
  DET: 1610612765, GSW: 1610612744, HOU: 1610612745, IND: 1610612754, LAC: 1610612746,
  LAL: 1610612747, MEM: 1610612763, MIA: 1610612748, MIL: 1610612749, MIN: 1610612750,
  NJN: 1610612769, NOH: 1610612740, NOK: 1610612740, NOP: 1610612740, NYK: 1610612752,
  OKC: 1610612760, ORL: 1610612753, PHI: 1610612755, PHO: 1610612756, POR: 1610612757,
  SAC: 1610612758, SAS: 1610612759, SEA: 1610612767, TOR: 1610612761, UTA: 1610612762,
  VAN: 1610612768, WAS: 1610612764,
};
/** Rows BR uses for a player's combined line when he changed teams mid-season. */
const isCombined = (abbr: string) => abbr === 'TOT' || /^\dTM$/.test(abbr);

// --- players ---------------------------------------------------------------

/**
 * BR identifies players by slug ("jamesle01"); the schema wants an Int id.
 * FNV-1a keeps it stable across runs so a partial re-ingest lands on the same
 * rows; the while-loop settles the rare collision.
 */
const idBySlug = new Map<string, number>();
const slugById = new Map<number, string>();
function playerId(slug: string): number {
  const cached = idBySlug.get(slug);
  if (cached) return cached;
  let h = 0x811c9dc5;
  for (const ch of slug) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  let id = (h >>> 1) || 1;
  while (slugById.has(id) && slugById.get(id) !== slug) id++;
  idBySlug.set(slug, id);
  slugById.set(id, slug);
  return id;
}

const emptyBox = (): BoxTotals => ({
  min: 0, pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
  pf: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
});
const toBox = (r: Row): BoxTotals => ({
  min: n(r.mp), pts: n(r.pts), reb: n(r.trb), oreb: n(r.orb), dreb: n(r.drb),
  ast: n(r.ast), stl: n(r.stl), blk: n(r.blk), tov: n(r.tov), pf: n(r.pf),
  fgm: n(r.fg), fga: n(r.fga), fg3m: n(r.fg3), fg3a: n(r.fg3a),
  ftm: n(r.ft), fta: n(r.fta),
});

// --- derived shots ---------------------------------------------------------

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

async function main() {
  const years: number[] = [];
  for (let y = TO; y >= FROM; y--) years.push(y); // newest first: Player.teamId ends up current
  const label = (y: number) => `${y - 1}-${String(y % 100).padStart(2, '0')}`;
  console.log(`Ingesting ${years.length} season(s), ${label(FROM)} .. ${label(TO)}, from basketball-reference`);

  if (!flag('keep')) {
    console.log('Clearing existing data…');
    await prisma.$transaction([
      prisma.playByPlay.deleteMany(), prisma.shotData.deleteMany(),
      prisma.playerGameLog.deleteMany(), prisma.advancedStats.deleteMany(),
      prisma.playerStats.deleteMany(), prisma.teamStats.deleteMany(),
      prisma.game.deleteMany(), prisma.player.deleteMany(),
      prisma.team.deleteMany(), prisma.season.deleteMany(),
    ]);
  }
  await prisma.team.createMany({ data: TEAMS, skipDuplicates: true });

  for (const year of years) {
    const key = label(year);
    console.log(`\n=== ${key} ===`);
    const season = await prisma.season.upsert({
      where: { key },
      create: { key, startYear: year - 1, endYear: year, active: year === TO },
      update: { active: year === TO },
    });

    // --- teams ------------------------------------------------------------
    const leaguePage = await page(`/leagues/NBA_${year}.html`);
    const teamBox = new Map<number, TeamTotals>();
    for (const r of table(leaguePage, 'totals-team')) {
      if (!r._team) continue;
      const box = toBox(r) as TeamTotals;
      box.gp = n(r.g);
      box.min = n(r.mp) || box.gp * 240;
      box.oppPts = 0;
      teamBox.set(BREF_TEAM[r._team], box);
    }
    for (const r of table(leaguePage, 'totals-opponent')) {
      // This table prefixes its columns, so points allowed are `opp_pts`.
      const box = r._team && teamBox.get(BREF_TEAM[r._team]);
      if (box) box.oppPts = n(r.opp_pts) || n(r.pts);
    }

    // BR posts a season's schedule months before it is played, with the stat
    // tables present but empty (every team at g=0). Take the schedule and
    // nothing else, and leave the season out of `active` so the stat pages keep
    // defaulting to one that has numbers in it.
    const scheduleOnly = [...teamBox.values()].every((b) => b.gp === 0);
    if (scheduleOnly) {
      await prisma.season.update({ where: { id: season.id }, data: { active: false } });
    }

    const teamRows = scheduleOnly
      ? []
      : table(leaguePage, 'advanced-team').filter((r) => r._team && BREF_TEAM[r._team]);
    for (const r of teamRows) {
      const teamId = BREF_TEAM[r._team];
      const stats = {
        gp: n(r.wins) + n(r.losses), wins: n(r.wins), losses: n(r.losses),
        pace: r1(n(r.pace)), ortg: r1(n(r.off_rtg)), drtg: r1(n(r.def_rtg)),
        netRtg: r1(n(r.net_rtg)), efgPct: r1(pctOf(r.efg_pct)), tsPct: r1(pctOf(r.ts_pct)),
        tovPct: r1(n(r.tov_pct)), orebPct: r1(n(r.orb_pct)), drebPct: r1(n(r.drb_pct)),
        ftRate: r2(n(r.ft_rate)), oppEfgPct: r1(pctOf(r.opp_efg_pct)),
        oppTovPct: r1(n(r.opp_tov_pct)), sos: r2(n(r.sos)),
      };
      await prisma.teamStats.upsert({
        where: { teamId_seasonId: { teamId, seasonId: season.id } },
        create: { teamId, seasonId: season.id, ...stats },
        update: stats,
      });
    }
    console.log(scheduleOnly ? 'schedule only — no results published yet' : `teams: ${teamRows.length}`);

    // --- players and season totals ----------------------------------------
    const totals = scheduleOnly
      ? []
      : table(await page(`/leagues/NBA_${year}_totals.html`), 'totals_stats').filter((r) => r._id);

    // BR lists a combined row plus one row per stint for traded players.
    // ponytail: we keep the combined line and file it under the last team they
    // played for, the way nba.com does. Per-stint splits are dropped; add them
    // back as extra PlayerStats rows if anyone wants the trade-deadline view.
    type Stint = { slug: string; row: Row; teamId: number };
    const byPlayer = new Map<string, Stint>();
    for (const r of totals) {
      const abbr = r.team_name_abbr || r._team || '';
      const prev = byPlayer.get(r._id);
      if (isCombined(abbr)) {
        byPlayer.set(r._id, { slug: r._id, row: r, teamId: prev?.teamId ?? 0 });
      } else if (!prev) {
        byPlayer.set(r._id, { slug: r._id, row: r, teamId: BREF_TEAM[abbr] ?? 0 });
      } else {
        prev.teamId = BREF_TEAM[abbr] ?? prev.teamId; // last stint wins
      }
    }
    const players = [...byPlayer.values()].filter((p) => p.teamId);

    await chunked(players, 500, (c) =>
      prisma.player.createMany({
        data: c.map(({ slug, row, teamId }) => {
          const full = row.name_display || row.player || '';
          const sp = full.indexOf(' ');
          return {
            id: playerId(slug),
            firstName: sp < 0 ? full : full.slice(0, sp),
            lastName: sp < 0 ? '' : full.slice(sp + 1),
            fullName: full,
            position: (row.pos || '').split('-')[0] || null,
            active: year === TO,
            teamId,
          };
        }),
        skipDuplicates: true, // newest season is ingested first, so it wins
      }),
    );

    const statRows = players.map((p) => {
      const box = toBox(p.row);
      const gp = Math.max(1, n(p.row.games));
      return {
        ...p,
        box,
        data: {
          playerId: playerId(p.slug), seasonId: season.id, teamId: p.teamId,
          gp: n(p.row.games), gs: n(p.row.games_started), min: box.min,
          pts: box.pts, reb: box.reb, oreb: box.oreb, dreb: box.dreb, ast: box.ast,
          stl: box.stl, blk: box.blk, tov: box.tov, pf: box.pf, fgm: box.fgm,
          fga: box.fga, fg3m: box.fg3m, fg3a: box.fg3a, ftm: box.ftm, fta: box.fta,
          ppg: r1(box.pts / gp), rpg: r1(box.reb / gp), apg: r1(box.ast / gp),
          fgPct: r1(pctOf(p.row.fg_pct)), fg3Pct: r1(pctOf(p.row.fg3_pct)),
          ftPct: r1(pctOf(p.row.ft_pct)), efgPct: r1(pctOf(p.row.efg_pct)),
          tsPct: 0, usgPct: 0, // filled from the advanced page below
        },
      };
    });

    // --- published advanced metrics ---------------------------------------
    const advanced = new Map<string, Row>();
    for (const r of scheduleOnly ? [] : table(await page(`/leagues/NBA_${year}_advanced.html`), 'advanced')) {
      if (!r._id) continue;
      const abbr = r.team_name_abbr || r._team || '';
      if (isCombined(abbr) || !advanced.has(r._id)) advanced.set(r._id, r);
    }
    for (const s of statRows) {
      const a = advanced.get(s.slug);
      if (a) {
        s.data.tsPct = r1(pctOf(a.ts_pct));
        s.data.usgPct = r1(n(a.usg_pct));
      }
    }

    await chunked(statRows, 500, (c) =>
      prisma.playerStats.createMany({ data: c.map((s) => s.data), skipDuplicates: true }),
    );

    const advData = statRows.flatMap((s) => {
      const a = advanced.get(s.slug);
      if (!a) return [];
      const tm = teamBox.get(s.teamId) ?? ({ ...emptyBox(), gp: 82 } as TeamTotals);
      // The only two numbers BR doesn't publish per player.
      const ortg = playerOrtg(s.box, tm, LEAGUE_2024_25);
      const drtg = playerDrtg(s.box, tm);
      return [{
        playerId: playerId(s.slug), seasonId: season.id,
        per: r2(n(a.per)), ortg: r1(ortg), drtg: r1(drtg), netRtg: r1(ortg - drtg),
        ows: r2(n(a.ows)), dws: r2(n(a.dws)), ws: r2(n(a.ws)), ws48: r2(n(a.ws_per_48)),
        obpm: r2(n(a.obpm)), dbpm: r2(n(a.dbpm)), bpm: r2(n(a.bpm)), vorp: r2(n(a.vorp)),
        astPct: r1(n(a.ast_pct)), rebPct: r1(n(a.trb_pct)), stlPct: r1(n(a.stl_pct)),
        blkPct: r1(n(a.blk_pct)), tovPct: r1(n(a.tov_pct)),
      }];
    });
    await chunked(advData, 500, (c) =>
      prisma.advancedStats.createMany({ data: c, skipDuplicates: true }),
    );
    console.log(`players: ${players.length}, advanced: ${advData.length}`);

    // --- games ------------------------------------------------------------
    const index = await page(`/leagues/NBA_${year}_games.html`);
    // Chronological, as BR lists them. Split seasons name the month pages
    // "october-2019"/"october-2020", so the segment isn't always just letters.
    const months = [
      ...new Set(
        [...index.matchAll(new RegExp(`/leagues/NBA_${year}_games-([a-z0-9-]+)\\.html`, 'g'))]
          .map((m) => m[1]),
      ),
    ];
    const games: {
      gameCode: string; seasonId: number; date: Date; homeTeamId: number; awayTeamId: number;
      homeScore: number; awayScore: number; status: string; period: number;
    }[] = [];

    // BR runs the postseason into the same month pages as the regular season.
    // A team's regular season is exactly the game count BR reports for it, so
    // take games in date order until every team is full, then stop reading.
    // ponytail: the NBA Cup final doesn't count toward the 82 but sits in the
    // schedule, so the two finalists lose their last regular-season game to it
    // (1 game per season since 2023-24). Filter on game_remarks if that matters.
    const played = new Map<number, number>();
    const cap = (id: number) => teamBox.get(id)?.gp ?? 82;
    const seasonOver = () => [...teamBox].every(([id, b]) => (played.get(id) ?? 0) >= b.gp);

    for (const month of months.length ? months : ['']) {
      const html = month ? await page(`/leagues/NBA_${year}_games-${month}.html`) : index;
      for (const r of table(html, 'schedule')) {
        const code = /^(\d{8})\d?([A-Z]{3})/.exec(r.date_game_csk ?? '');
        const home = BREF_TEAM[r.home_team_name_abbr];
        const away = BREF_TEAM[r.visitor_team_name_abbr];
        if (!home || !away) continue;
        const ot = r.overtimes ?? '';
        if (!scheduleOnly) {
          if (n(r.home_pts) <= 0) continue;
          if ((played.get(home) ?? 0) >= cap(home) || (played.get(away) ?? 0) >= cap(away)) continue;
          played.set(home, (played.get(home) ?? 0) + 1);
          played.set(away, (played.get(away) ?? 0) + 1);
        }
        games.push({
          gameCode: code ? r.date_game_csk : `${r.date_game}|${r.home_team_name_abbr}`,
          seasonId: season.id,
          date: code
            ? new Date(`${code[1].slice(0, 4)}-${code[1].slice(4, 6)}-${code[1].slice(6, 8)}T12:00:00Z`)
            : new Date(r.date_game),
          homeTeamId: home, awayTeamId: away,
          homeScore: n(r.home_pts), awayScore: n(r.visitor_pts),
          // BR's overtime column is '', 'OT', '2OT', ...; a played game reads
          // "Final" or "Final/2OT", an unplayed one carries its tip-off time.
          status: n(r.home_pts) > 0 ? `Final${ot ? `/${ot}` : ''}` : r.game_start_time || 'Scheduled',
          period: 4 + (ot ? Number(ot.replace('OT', '')) || 1 : 0),
        });
      }
      if (!scheduleOnly && seasonOver()) break;
    }
    await chunked(games, 1000, (c) => prisma.game.createMany({ data: c, skipDuplicates: true }));
    console.log(`games: ${games.length}`);

    // --- derived shot charts ----------------------------------------------
    if (SHOT_PLAYERS > 0 && games.length) {
      const shooting = new Map<string, Row>();
      for (const r of table(await page(`/leagues/NBA_${year}_shooting.html`), 'shooting')) {
        const abbr = r.team_name_abbr || r._team || '';
        if (r._id && (isCombined(abbr) || !shooting.has(r._id))) shooting.set(r._id, r);
      }

      const dbGames = await prisma.game.findMany({
        where: { seasonId: season.id },
        select: { id: true, date: true, homeTeamId: true, awayTeamId: true },
      });
      const gamesByTeam = new Map<number, typeof dbGames>();
      for (const g of dbGames) {
        for (const t of [g.homeTeamId, g.awayTeamId]) {
          gamesByTeam.set(t, [...(gamesByTeam.get(t) ?? []), g]);
        }
      }

      const targets = [...statRows].sort((a, b) => b.box.fga - a.box.fga).slice(0, SHOT_PLAYERS);
      const shots: any[] = [];
      for (const t of targets) {
        const sh = shooting.get(t.slug);
        const teamGames = gamesByTeam.get(t.teamId);
        if (!sh || !teamGames?.length || t.box.fga < 1) continue;

        const corner = n(sh.pct_fg3a_corner3);
        const bands = [
          ...BANDS.map((b) => ({ ...b, share: n(sh[b.att]), fgPct: n(sh[b.fg]), corner: 0 })),
          {
            att: '', fg: '', lo: 237, hi: 285, corner,
            share: n(sh.pct_fga_fg3a), fgPct: n(t.row.fg3_pct),
          },
        ];
        const totalShare = bands.reduce((s, b) => s + b.share, 0) || 1;

        const drawn: { x: number; y: number; made: boolean }[] = [];
        for (const b of bands) {
          const att = Math.round(t.box.fga * (b.share / totalShare));
          const made = Math.round(att * b.fgPct);
          for (let i = 0; i < att; i++) {
            const p =
              b.corner && rnd() < b.corner
                ? { x: (rnd() < 0.5 ? -1 : 1) * int(222, 245), y: int(-8, 88) }
                : spot(b.lo, b.hi);
            drawn.push({ ...p, made: i < made });
          }
        }
        shuffle(drawn);

        // Spread the season's attempts over the games he could have played in.
        const played = shuffle([...teamGames]).slice(0, Math.max(1, n(t.row.games)));
        drawn.forEach((s, i) => {
          const game = played[i % played.length];
          const z = shotZone(s.x, s.y);
          shots.push({
            playerId: playerId(t.slug), gameId: game.id, seasonId: season.id,
            teamId: t.teamId, x: s.x, y: s.y,
            distanceFt: Math.round(Math.hypot(s.x, s.y) / 10),
            made: s.made, value: z.value, zone: z.zone, zoneArea: z.area,
            actionType: pick(ACTIONS[z.zone]), period: int(1, 4),
            minsLeft: int(0, 11), secsLeft: int(0, 59), date: game.date,
          });
        });
      }
      await chunked(shots, 5000, (c) => prisma.shotData.createMany({ data: c }));
      console.log(`shots (derived): ${shots.length} for ${targets.length} players`);
    }
  }

  if (PBP_GAMES > 0) await playByPlay();
  console.log('\nIngest complete.');
}

/**
 * Derived play-by-play for the most recent games. The final score, the teams and
 * the rosters are real; who scored when is sampled from each player's real share
 * of his team's points. BR publishes no play-by-play for older seasons.
 */
async function playByPlay() {
  const games = await prisma.game.findMany({
    orderBy: { date: 'desc' },
    take: PBP_GAMES,
  });

  for (const g of games) {
    const rosters = await Promise.all(
      [g.awayTeamId, g.homeTeamId].map((teamId) =>
        prisma.playerStats.findMany({
          where: { seasonId: g.seasonId, teamId, min: { gt: 0 } },
          orderBy: { min: 'desc' },
          take: 10,
          select: { playerId: true, pts: true, gp: true },
        }),
      ),
    );
    if (rosters.some((r) => r.length < 5)) continue;

    const target = [g.awayScore, g.homeScore];
    const score = [0, 0];
    const plays: any[] = [];
    let eventNum = 0;

    while (score[0] < target[0] || score[1] < target[1]) {
      const need = [target[0] - score[0], target[1] - score[1]];
      const side = need[0] === need[1] ? (rnd() < 0.5 ? 0 : 1) : need[0] > need[1] ? 0 : 1;
      const roster = rosters[side];
      const weights = roster.map((p) => p.pts / Math.max(1, p.gp));
      const totalW = weights.reduce((s, w) => s + w, 0) || 1;
      let r = rnd() * totalW;
      const idx = weights.findIndex((w) => (r -= w) <= 0);
      const shooter = roster[Math.max(0, idx)];

      const left = target[side] - score[side];
      const worth = left >= 3 && rnd() < 0.35 ? 3 : left >= 2 ? 2 : 1;
      const made = rnd() < 0.47;
      if (made) score[side] += worth;

      // ~5 minutes of game clock per 8 points scored; good enough to order plays.
      const elapsed = Math.min(2879, Math.round(((score[0] + score[1]) / (target[0] + target[1])) * 2880));
      const period = Math.min(4, Math.floor(elapsed / 720) + 1);
      const inPeriod = 720 - (elapsed % 720);
      plays.push({
        gameId: g.id, eventNum: ++eventNum, period,
        clock: `${Math.floor(inPeriod / 60)}:${String(inPeriod % 60).padStart(2, '0')}`,
        elapsedSec: elapsed,
        teamId: side === 0 ? g.awayTeamId : g.homeTeamId,
        playerId: shooter.playerId,
        description: made
          ? `${worth === 1 ? 'Free Throw' : `${worth}PT ${pick(['Jump Shot', 'Layup', 'Pullup'])}`} made`
          : `${worth === 1 ? 'Free Throw' : `${worth}PT ${pick(['Jump Shot', 'Layup', 'Pullup'])}`} missed`,
        homeScore: score[1], awayScore: score[0],
        eventType: made ? 'SHOT' : pick(['MISS', 'REBOUND', 'BLOCK']),
      });
      if (eventNum > 800) break; // safety net; a real game is ~450 events
    }

    await chunked(plays, 2000, (c) =>
      prisma.playByPlay.createMany({ data: c, skipDuplicates: true }),
    );
    console.log(`play-by-play ${g.gameCode}: ${plays.length} events`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
