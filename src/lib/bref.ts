/**
 * basketball-reference.com: season totals, the published advanced metrics,
 * team ratings, standings and schedules from 1946-47 on. Shared by the one-time
 * history ingest and the daily sync.
 *
 * BR bans clients that go faster than ~20 requests a minute, so every call
 * goes through fetchPage(), which paces itself, backs off on 429 and retries.
 */
import { TEAMS } from '../../prisma/teams';
import type { SeasonLine } from './stats';

const DELAY = Number(process.env.BREF_DELAY_MS ?? 3500);
const UA =
  process.env.BREF_USER_AGENT ??
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * One page with its HTML comments unwrapped (half of BR's tables ship inside
 * them). '' on 404. `tries: 1` never sleeps through a rate limit: a function
 * with a time budget should fail fast and let the next run pick it up.
 */
export async function fetchPage(path: string, { tries = 3 } = {}): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`https://www.basketball-reference.com${path}`, {
        headers: { 'User-Agent': UA, Accept: 'text/html,*/*', 'Accept-Language': 'en-US,en;q=0.9' },
        signal: AbortSignal.timeout(45_000),
      });
    } catch (err) {
      if (attempt >= tries) throw new Error(`${path} failed after ${tries} tries: ${err}`);
      console.warn(`  ${path} attempt ${attempt} failed (${err}); backing off`);
      await sleep(DELAY * attempt * 3);
      continue;
    }
    if (res.status === 404) return '';
    if (res.status === 429) {
      if (attempt >= tries) throw new Error(`${path}: rate limited by basketball-reference`);
      console.warn('  rate limited; sleeping 90s');
      await sleep(90_000);
      continue;
    }
    if (!res.ok) {
      if (attempt >= tries) throw new Error(`${path}: ${res.status} ${res.statusText}`);
      await sleep(DELAY * attempt * 3);
      continue;
    }
    const html = await res.text();
    await sleep(DELAY);
    return html.replaceAll('<!--', '').replaceAll('-->', '');
  }
}

export type Row = Record<string, string>;

const strip = (s: string) =>
  s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();

/**
 * Every data row of one BR table, keyed by its `data-stat` names. `_id` is the
 * player slug; `_team` and `<stat>_abbr` are team abbreviations lifted out of
 * cell links, the only place BR puts them. `<stat>_csk` is a cell's sort key.
 */
export function table(html: string, id: string): Row[] {
  const start = html.indexOf(`id="${id}"`);
  if (start < 0) return [];
  const stop = html.indexOf('</table>', start);
  return html
    .slice(start, stop < 0 ? undefined : stop)
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

/** A number, or null when BR leaves the cell blank or the column doesn't exist that season. */
export const nn = (v: string | undefined) => {
  if (v === undefined || v.trim() === '') return null;
  const x = Number(v.trim().replace(/^\+/, ''));
  return Number.isFinite(x) ? x : null;
};

/** BR writes rates as ".402"; the site stores 40.2. */
export const pctOf = (v: string | undefined) => {
  const x = nn(v);
  return x === null ? null : Math.round(x * 1000) / 10;
};

/** The league's first three seasons were the BAA's; BR files them under that name. */
export const seasonPath = (endYear: number) => `${endYear <= 1949 ? 'BAA' : 'NBA'}_${endYear}`;

/** BR abbreviations that differ from the team rows' own, including renames that stayed put. */
const ALIAS: Record<string, string> = {
  BRK: 'BKN', CHO: 'CHA', CHH: 'CHA', PHO: 'PHX', NOH: 'NOP', NOK: 'NOP',
  WSB: 'WAS', CAP: 'WAS', CHP: 'CHZ', KCO: 'KCK',
};
const TEAM_ID = new Map(TEAMS.map((t) => [t.abbreviation, t.id]));

/** Throws rather than guess: an unmapped team used to drop its whole roster silently. */
export function teamIdFor(abbr: string) {
  const id = TEAM_ID.get(ALIAS[abbr] ?? abbr);
  if (!id) throw new Error(`Unknown team abbreviation ${abbr}: add it to prisma/teams.ts or ALIAS in src/lib/bref.ts`);
  return id;
}

/** BR's line for a player who changed teams mid-season: TOT, 2TM, 3TM... */
export const isCombined = (abbr: string) => abbr === 'TOT' || /^\dTM$/.test(abbr);

export type Aligned = { name: string; conference: string | null; division: string | null };

/**
 * Each team's name, conference and division that season, read off the
 * division standings. Before 1970-71 there were no conferences, only
 * divisions (Eastern, Western, and in 1949-50 a Central).
 */
export function alignment(html: string) {
  const out = new Map<string, Aligned>();
  for (const [t] of html.matchAll(/<table[^>]*id="divs_standings_[EW]?"[\s\S]*?<\/table>/g)) {
    const head = /<th[^>]*data-stat="team_name"[^>]*>([^<]*)<\/th>/.exec(t)?.[1] ?? '';
    const conference = /Eastern Conference/.test(head) ? 'East' : /Western Conference/.test(head) ? 'West' : null;
    let division: string | null = null;
    for (const tr of t.split('<tr').slice(1)) {
      const d = /<strong>([^<]+?) Division<\/strong>/.exec(tr);
      if (d) {
        division = d[1];
        continue;
      }
      const team = /\/teams\/([A-Z]{3})\/[^"]*">([^<]+)<\/a>/.exec(tr);
      if (team) out.set(team[1], { name: team[2].trim(), conference, division });
    }
  }
  return out;
}

/** A player's (or team's) season totals; untracked stats stay null. */
export function seasonLine(r: Row): SeasonLine {
  return {
    gp: nn(r.games ?? r.g) ?? 0,
    gs: nn(r.games_started ?? r.gs),
    min: nn(r.mp),
    pts: nn(r.pts) ?? 0,
    reb: nn(r.trb),
    oreb: nn(r.orb),
    dreb: nn(r.drb),
    ast: nn(r.ast),
    stl: nn(r.stl),
    blk: nn(r.blk),
    tov: nn(r.tov),
    pf: nn(r.pf),
    fgm: nn(r.fg) ?? 0,
    fga: nn(r.fga) ?? 0,
    fg3m: nn(r.fg3),
    fg3a: nn(r.fg3a),
    ftm: nn(r.ft) ?? 0,
    fta: nn(r.fta) ?? 0,
  };
}

/** A played game from one of BR's schedule tables, as a `games` row. */
export function gameRow(r: Row, seasonId: number, kind: 'regular' | 'playoffs') {
  const code = /^(\d{4})(\d{2})(\d{2})/.exec(r.date_game_csk ?? '');
  const ot = r.overtimes ?? '';
  return {
    gameCode: r.date_game_csk || `${r.date_game}|${r.home_team_name_abbr}`,
    seasonId,
    date: code ? new Date(`${code[1]}-${code[2]}-${code[3]}T12:00:00Z`) : new Date(r.date_game),
    homeTeamId: teamIdFor(r.home_team_name_abbr),
    awayTeamId: teamIdFor(r.visitor_team_name_abbr),
    homeScore: Number(r.home_pts) || 0,
    awayScore: Number(r.visitor_pts) || 0,
    // BR's overtime column is '', 'OT', '2OT', ...
    status: `Final${ot ? `/${ot}` : ''}`,
    period: 4 + (ot ? Number(ot.replace('OT', '')) || 1 : 0),
    kind,
  };
}

/**
 * The NBA Cup final is played in December but doesn't count toward anyone's
 * record. BR marks every Cup game the same way, so the final is simply the
 * last one. Returns its sort key, or null in a season without a Cup.
 */
export function cupFinal(scheduleRows: Row[]) {
  const cup = scheduleRows.filter((r) => /NBA Cup|In-Season Tournament/i.test(r.game_remarks ?? ''));
  return cup.at(-1)?.date_game_csk ?? null;
}

// --- A whole season ----------------------------------------------------------

export type TeamSeason = Aligned & {
  teamId: number;
  abbr: string;
  gp: number;
  wins: number;
  losses: number;
  ratings: Record<
    'pace' | 'ortg' | 'drtg' | 'netRtg' | 'efgPct' | 'tsPct' | 'tovPct' | 'orebPct'
    | 'drebPct' | 'ftRate' | 'oppEfgPct' | 'oppTovPct' | 'sos',
    number | null
  >;
  box: SeasonLine;
  oppPts: number | null;
};

export type PlayerSeason = {
  slug: string;
  name: string;
  position: string | null;
  /** The team he finished the season with; a traded player's line is his combined one. */
  teamId: number;
  line: SeasonLine;
  adv: Row | undefined;
};

export function parseTeams(league: string): TeamSeason[] {
  const aligned = alignment(league);
  const byTeam = (id: string) => new Map(table(league, id).filter((r) => r._team).map((r) => [r._team, r]));
  const [totals, opp] = [byTeam('totals-team'), byTeam('totals-opponent')];
  return table(league, 'advanced-team')
    .filter((r) => r._team)
    .map((r) => {
      const t = totals.get(r._team) ?? {};
      const o = opp.get(r._team) ?? {};
      const wins = nn(r.wins) ?? 0;
      const losses = nn(r.losses) ?? 0;
      return {
        teamId: teamIdFor(r._team),
        abbr: r._team,
        ...(aligned.get(r._team) ?? { name: (r.team ?? '').replace(/\*$/, ''), conference: null, division: null }),
        gp: nn(t.g) ?? wins + losses,
        wins,
        losses,
        ratings: {
          pace: nn(r.pace), ortg: nn(r.off_rtg), drtg: nn(r.def_rtg), netRtg: nn(r.net_rtg),
          efgPct: pctOf(r.efg_pct), tsPct: pctOf(r.ts_pct), tovPct: nn(r.tov_pct),
          orebPct: nn(r.orb_pct), drebPct: nn(r.drb_pct), ftRate: nn(r.ft_rate),
          oppEfgPct: pctOf(r.opp_efg_pct), oppTovPct: nn(r.opp_tov_pct), sos: nn(r.sos),
        },
        box: seasonLine(t),
        // The opponent table prefixes its columns: points allowed are `opp_pts`.
        oppPts: nn(o.opp_pts) ?? nn(o.pts),
      };
    });
}

export function parsePlayers(totals: string, advanced: string): PlayerSeason[] {
  // BR lists a combined row plus one row per stint for traded players.
  // ponytail: the combined line is kept and filed under his last team, the way
  // nba.com shows it. Per-stint splits are dropped; add them back as extra
  // PlayerStats rows if anyone wants the trade-deadline view.
  const byPlayer = new Map<string, PlayerSeason>();
  for (const r of table(totals, 'totals_stats').filter((r) => r._id)) {
    const abbr = r.team_name_abbr || r._team || '';
    const prev = byPlayer.get(r._id);
    const player = (teamId: number): PlayerSeason => ({
      slug: r._id,
      name: r.name_display || r.player || '',
      position: (r.pos || '').split('-')[0] || null,
      teamId,
      line: seasonLine(r),
      adv: undefined,
    });
    if (isCombined(abbr)) byPlayer.set(r._id, player(prev?.teamId ?? 0));
    else if (!prev) byPlayer.set(r._id, player(teamIdFor(abbr)));
    else prev.teamId = teamIdFor(abbr); // stints are listed in order: the last one wins
  }
  // The league pages call it `advanced`, the playoff pages `advanced_stats`.
  for (const r of [...table(advanced, 'advanced'), ...table(advanced, 'advanced_stats')].filter((r) => r._id)) {
    const p = byPlayer.get(r._id);
    const abbr = r.team_name_abbr || r._team || '';
    if (p && (isCombined(abbr) || !p.adv)) p.adv = r;
  }
  return [...byPlayer.values()].filter((p) => p.teamId);
}

/**
 * League page, totals and advanced for one season (3 requests). A season BR
 * has scheduled but not played has every team at 0 games: `scheduleOnly`.
 */
export async function fetchSeason(endYear: number, opts?: { tries?: number }) {
  const path = seasonPath(endYear);
  const league = await fetchPage(`/leagues/${path}.html`, opts);
  const teams = parseTeams(league);
  const scheduleOnly = teams.every((t) => t.gp === 0);
  if (scheduleOnly) return { teams, players: [] as PlayerSeason[], scheduleOnly };
  const totals = await fetchPage(`/leagues/${path}_totals.html`, opts);
  const advanced = await fetchPage(`/leagues/${path}_advanced.html`, opts);
  return { teams, players: parsePlayers(totals, advanced), scheduleOnly };
}

/**
 * One season's playoffs: player totals and advanced, and the teams' totals and
 * ratings (3 requests). Empty before the playoffs start.
 */
export async function fetchPlayoffs(endYear: number, opts?: { tries?: number }) {
  const path = seasonPath(endYear);
  const totals = await fetchPage(`/playoffs/${path}_totals.html`, opts);
  if (!totals) return { players: [] as PlayerSeason[], teams: [] as TeamSeason[] };
  const players = parsePlayers(totals, await fetchPage(`/playoffs/${path}_advanced.html`, opts));
  return { players, teams: parseTeams(await fetchPage(`/playoffs/${path}.html`, opts)) };
}

export type IndexedPlayer = {
  name: string;
  /** Start years of his first and last seasons (BR prints end years). */
  from: number;
  to: number;
  birthDate: Date | null;
  heightIn: number | null;
  weightLb: number | null;
  college: string | null;
};

/**
 * Every player BR has, with his years and bio: the index that lets a slug be
 * matched to an NBA id before any season loads, and the only source of birth
 * dates. 26 requests, one per letter.
 */
export async function playerIndex() {
  const out = new Map<string, IndexedPlayer>();
  for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
    for (const r of table(await fetchPage(`/players/${letter}/`), 'players')) {
      const [from, to] = [nn(r.year_min), nn(r.year_max)];
      if (!r._id || !from || !to) continue;
      const born = /^(\d{4})(\d{2})(\d{2})$/.exec(r.birth_date_csk ?? '');
      out.set(r._id, {
        name: (r.player ?? '').replace(/\*$/, ''), // * marks the Hall of Fame
        from: from - 1,
        to: to - 1,
        birthDate: born ? new Date(`${born[1]}-${born[2]}-${born[3]}T12:00:00Z`) : null,
        heightIn: nn(r.height_csk),
        weightLb: nn(r.weight),
        college: r.colleges || null,
      });
    }
  }
  return out;
}
