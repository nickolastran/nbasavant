/**
 * Seeds a self-consistent SAMPLE league: fictional players, real team metadata.
 * Box scores are derived from the generated shots, and season totals from the
 * game logs, so every number on the site adds up.
 *
 * Replace with real data via `npm run ingest` (scripts/ingest.ts).
 */
import { PrismaClient } from '@prisma/client';
import { TEAMS } from './teams';
import {
  BoxTotals, LEAGUE_2024_25, TeamTotals, astPct, blkPct, boxPlusMinus, centerBpm, efgPct,
  normalizePer, pace, playerDrtg, playerOrtg, possessions, rebPct, shotZone,
  stlPct, tovPct, tsPct, uPer, usgPct, vorp, winShares,
} from '../src/lib/stats';

const prisma = new PrismaClient();

// --- deterministic RNG so reseeding gives the same league ------------------
let state = 20250104;
const rnd = () => {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const range = (lo: number, hi: number) => lo + rnd() * (hi - lo);
const int = (lo: number, hi: number) => Math.floor(range(lo, hi + 1));
const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
/** Roughly normal via central limit; keeps stat lines from looking uniform. */
const norm = (mean: number, sd: number) =>
  mean + ((rnd() + rnd() + rnd() + rnd() + rnd() + rnd() - 3) / 3) * sd * 1.7;

const FIRST = ['Marcus', 'Andre', 'Tyrese', 'Jalen', 'Devin', 'Cade', 'Amari', 'Zion', 'Keegan', 'Bennedict', 'Dominic', 'Isaiah', 'Trey', 'Malik', 'Xavier', 'Julian', 'Deni', 'Ochai', 'Terrance', 'Kobe', 'Nikola', 'Luka', 'Franz', 'Alperen', 'Santi', 'Bogdan', 'Dario', 'Josh', 'Quentin', 'Bilal', 'Moussa', 'Rui', 'Yuta', 'Bruno', 'Gradey', 'Jaime', 'Toumani', 'Ausar', 'Scoot', 'Brandin'];
const LAST = ['Whitmore', 'Sanderson', 'Kalkbrenner', 'Mitchell', 'Okoro', 'Duren', 'Beauchamp', 'Bailey', 'Vukcevic', 'Sensabaugh', 'Podziemski', 'Wallace', 'Hendricks', 'Nowell', 'Farabee', 'Camara', 'Lively', 'Prosper', 'Whitehead', 'Mamukelashvili', 'Kessler', 'Sochan', 'Branham', 'Champagnie', 'Dosunmu', 'Terry', 'Springer', 'Nembhard', 'Walker', 'McCollum', 'Hardaway', 'Robinson', 'Kispert', 'Coulibaly', 'Avdija', 'Giddey', 'Reaves', 'Wagner', 'Barnes', 'Suggs'];

type Archetype = {
  pos: string; usage: number; three: number; rim: number; skill: number;
  ast: number; reb: number; def: number;
};
// usage = share of team shots; three/rim = shot mix; skill = make-rate multiplier
const ARCHETYPES: Record<string, Omit<Archetype, 'pos'>> = {
  PG: { usage: 0.21, three: 0.42, rim: 0.30, skill: 1.00, ast: 1.9, reb: 0.5, def: 0.9 },
  SG: { usage: 0.20, three: 0.48, rim: 0.24, skill: 1.00, ast: 0.9, reb: 0.6, def: 1.0 },
  SF: { usage: 0.19, three: 0.40, rim: 0.32, skill: 1.00, ast: 0.8, reb: 0.9, def: 1.05 },
  PF: { usage: 0.18, three: 0.33, rim: 0.42, skill: 1.01, ast: 0.6, reb: 1.3, def: 1.1 },
  C:  { usage: 0.17, three: 0.16, rim: 0.62, skill: 1.05, ast: 0.5, reb: 1.8, def: 1.25 },
};
const ROSTER_POS = ['PG', 'SG', 'SF', 'PF', 'C', 'PG', 'SG', 'SF', 'PF', 'C', 'SG', 'PF'];

const ACTIONS: Record<string, string[]> = {
  'Restricted Area': ['Driving Layup', 'Cutting Dunk', 'Alley Oop Dunk', 'Layup', 'Putback Layup'],
  'In The Paint (Non-RA)': ['Floating Jump Shot', 'Hook Shot', 'Turnaround Fadeaway', 'Driving Floating Jump Shot'],
  'Mid-Range': ['Pullup Jump Shot', 'Jump Shot', 'Step Back Jump Shot', 'Turnaround Jump Shot'],
  'Long Mid-Range': ['Pullup Jump Shot', 'Jump Shot', 'Fadeaway Jump Shot'],
  'Left Corner 3': ['Jump Shot', 'Catch and Shoot 3PT'],
  'Right Corner 3': ['Jump Shot', 'Catch and Shoot 3PT'],
  'Above the Break 3': ['Pullup Jump Shot', 'Jump Shot', 'Step Back Jump Shot', 'Catch and Shoot 3PT'],
};
// League-average make rates by zone, before player skill is applied.
const ZONE_FG: Record<string, number> = {
  'Restricted Area': 0.645, 'In The Paint (Non-RA)': 0.435, 'Mid-Range': 0.425,
  'Long Mid-Range': 0.405, 'Left Corner 3': 0.385, 'Right Corner 3': 0.385,
  'Above the Break 3': 0.355,
};

/** Sample a shot location, biased by the player's shot mix. */
function sampleShot(a: Omit<Archetype, 'pos'>): { x: number; y: number } {
  const r = rnd();
  const angle = () => range(0.15, Math.PI - 0.15);
  if (r < a.rim) {
    const d = range(0, 45), t = angle();
    return { x: Math.round(Math.cos(t) * d), y: Math.round(Math.sin(t) * d) };
  }
  if (r < a.rim + a.three) {
    if (rnd() < 0.24) {
      // corner three
      const side = rnd() < 0.5 ? -1 : 1;
      return { x: side * int(222, 245), y: int(-10, 88) };
    }
    const d = range(240, 285), t = range(0.42, Math.PI - 0.42);
    return { x: Math.round(Math.cos(t) * d), y: Math.round(Math.sin(t) * d) };
  }
  const d = range(50, 230), t = angle();
  return { x: Math.round(Math.cos(t) * d), y: Math.round(Math.sin(t) * d) };
}

const chunked = async <T>(rows: T[], size: number, fn: (c: T[]) => Promise<unknown>) => {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
};

const emptyBox = (): BoxTotals => ({
  min: 0, pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0,
  pf: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
});
const BOX_KEYS = Object.keys(emptyBox()) as (keyof BoxTotals)[];
/** Accumulate only box-score keys — callers pass aggregates carrying extra fields. */
const addBox = <T extends BoxTotals>(a: T, b: BoxTotals) => {
  for (const k of BOX_KEYS) a[k] += b[k];
  return a;
};

const SEASONS = [
  { key: '2023-24', startYear: 2023, endYear: 2024, active: false },
  { key: '2024-25', startYear: 2024, endYear: 2025, active: true },
];
const GAMES_PER_TEAM = Number(process.env.SEED_GAMES_PER_TEAM ?? 20);
const PBP_GAMES = Number(process.env.SEED_PBP_GAMES ?? 40);

async function main() {
  console.log('Clearing existing data…');
  await prisma.$transaction([
    prisma.playByPlay.deleteMany(), prisma.shotData.deleteMany(),
    prisma.playerGameLog.deleteMany(), prisma.advancedStats.deleteMany(),
    prisma.playerStats.deleteMany(), prisma.teamStats.deleteMany(),
    prisma.game.deleteMany(), prisma.player.deleteMany(),
    prisma.team.deleteMany(), prisma.season.deleteMany(),
  ]);

  await prisma.team.createMany({ data: TEAMS });
  const seasons = await Promise.all(
    SEASONS.map((s) => prisma.season.create({ data: s })),
  );
  console.log(`Seeded ${TEAMS.length} teams, ${seasons.length} seasons`);

  // --- players ------------------------------------------------------------
  type P = { id: number; teamId: number; pos: string; a: Omit<Archetype, 'pos'>; name: string };
  const players: P[] = [];
  let nextId = 1000;
  const used = new Set<string>();

  for (const team of TEAMS) {
    ROSTER_POS.forEach((pos, i) => {
      let name = `${pick(FIRST)} ${pick(LAST)}`;
      while (used.has(name)) name = `${pick(FIRST)} ${pick(LAST)}`;
      used.add(name);
      const base = ARCHETYPES[pos];
      // Starters get more usage and are better; bench tails off.
      const tier = i < 5 ? range(1.05, 1.45) : i < 8 ? range(0.8, 1.05) : range(0.5, 0.8);
      players.push({
        id: nextId++,
        teamId: team.id,
        pos,
        name,
        a: {
          ...base,
          usage: base.usage * tier,
          skill: base.skill * range(0.9, 1.12),
          three: Math.min(0.75, base.three * range(0.75, 1.25)),
          rim: Math.max(0.08, base.rim * range(0.75, 1.25)),
          ast: base.ast * tier * range(0.7, 1.4),
          reb: base.reb * range(0.75, 1.3),
          def: base.def * range(0.85, 1.2),
        },
      });
    });
  }

  await prisma.player.createMany({
    data: players.map((p) => {
      const [first, ...rest] = p.name.split(' ');
      const heightIn = { PG: 74, SG: 77, SF: 79, PF: 81, C: 83 }[p.pos]! + int(-2, 3);
      return {
        id: p.id, firstName: first, lastName: rest.join(' '), fullName: p.name,
        position: p.pos, jersey: String(int(0, 55)), heightIn,
        weightLb: Math.round(heightIn * 2.6 + int(-15, 20)),
        birthDate: new Date(Date.UTC(int(1992, 2004), int(0, 11), int(1, 28))),
        country: rnd() < 0.78 ? 'USA' : pick(['Canada', 'Serbia', 'France', 'Australia', 'Spain', 'Nigeria']),
        draftYear: int(2014, 2024), active: true, teamId: p.teamId,
      };
    }),
  });
  console.log(`Seeded ${players.length} players`);

  const byTeam = new Map<number, P[]>();
  for (const p of players) byTeam.set(p.teamId, [...(byTeam.get(p.teamId) ?? []), p]);

  // --- games --------------------------------------------------------------
  for (const season of seasons) {
    const schedule: { home: number; away: number; date: Date }[] = [];
    const start = Date.UTC(season.startYear, 9, 22);
    for (let round = 0; round < GAMES_PER_TEAM / 2; round++) {
      const ids = TEAMS.map((t) => t.id);
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
      }
      for (let i = 0; i < ids.length; i += 2) {
        const day = round * 6 + Math.floor(i / 6);
        schedule.push({ home: ids[i], away: ids[i + 1], date: new Date(start + day * 864e5) });
        schedule.push({
          home: ids[i + 1], away: ids[i],
          date: new Date(start + (day + 60) * 864e5),
        });
      }
    }
    schedule.sort((a, b) => +a.date - +b.date);

    const games = await prisma.game.createManyAndReturn({
      data: schedule.map((g, i) => ({
        gameCode: `002${season.startYear % 100}${String(i + 1).padStart(5, '0')}`,
        seasonId: season.id, date: g.date,
        homeTeamId: g.home, awayTeamId: g.away, status: 'Final',
      })),
    });

    const shots: any[] = [];
    const logs: any[] = [];
    const plays: any[] = [];
    const seasonBox = new Map<number, BoxTotals & { gp: number; gs: number }>();
    const teamBox = new Map<number, TeamTotals & { oppPts: number }>();
    const scores: { id: number; home: number; away: number }[] = [];

    const recentGameIds = new Set(games.slice(-PBP_GAMES).map((g) => g.id));

    for (const game of games) {
      const gameScore = { home: 0, away: 0 };

      for (const side of ['home', 'away'] as const) {
        const teamId = side === 'home' ? game.homeTeamId : game.awayTeamId;
        const oppId = side === 'home' ? game.awayTeamId : game.homeTeamId;
        const roster = byTeam.get(teamId)!;
        const oppRoster = byTeam.get(oppId)!;
        const homeEdge = side === 'home' ? 1.02 : 0.98;

        // Distribute 240 minutes over 9-10 players.
        const rotation = roster.slice(0, rnd() < 0.5 ? 9 : 10);
        const weights = rotation.map((_, i) => (i < 5 ? range(30, 38) : range(10, 22)));
        const scale = 240 / weights.reduce((s, w) => s + w, 0);
        const mins = weights.map((w) => Math.round(w * scale * 10) / 10);

        // Shot volume is a *share* of the team's attempts, so normalize usage
        // over the rotation — otherwise team FGA (and therefore pace) inflates.
        const teamFga = Math.round(norm(87, 5));
        const shares = rotation.map((p, i) => p.a.usage * (mins[i] / 24) * range(0.85, 1.15));
        const shareSum = shares.reduce((s, w) => s + w, 0);

        rotation.forEach((p, i) => {
          const min = mins[i];
          const box = emptyBox();
          box.min = min;

          const fga = Math.max(0, Math.round((teamFga * shares[i]) / shareSum));
          for (let s = 0; s < fga; s++) {
            const { x, y } = sampleShot(p.a);
            const z = shotZone(x, y);
            const made = rnd() < ZONE_FG[z.zone] * p.a.skill * homeEdge;
            const period = int(1, 4);
            const defender = pick(oppRoster);
            shots.push({
              playerId: p.id, gameId: game.id, seasonId: season.id, teamId,
              defenderId: rnd() < 0.85 ? defender.id : null,
              x, y, distanceFt: Math.round(Math.hypot(x, y) / 10),
              made, value: z.value, zone: z.zone, zoneArea: z.area,
              actionType: pick(ACTIONS[z.zone]), period,
              minsLeft: int(0, 11), secsLeft: int(0, 59),
              shotClock: Math.round(range(1, 24) * 10) / 10,
              defDistFt: Math.round(range(0.5, 12) * 10) / 10,
              date: game.date,
            });
            box.fga++;
            if (z.value === 3) box.fg3a++;
            if (made) {
              box.fgm++;
              if (z.value === 3) box.fg3m++;
            }
          }

          box.fta = Math.max(0, Math.round(norm(fga * 0.26, 2)));
          box.ftm = Math.round(box.fta * range(0.65, 0.92));
          box.pts = 2 * (box.fgm - box.fg3m) + 3 * box.fg3m + box.ftm;
          box.oreb = Math.max(0, Math.round(norm(p.a.reb * 0.9 * (min / 24), 1.2)));
          box.dreb = Math.max(0, Math.round(norm(p.a.reb * 3.1 * (min / 24), 2)));
          box.reb = box.oreb + box.dreb;
          box.ast = Math.max(0, Math.round(norm(p.a.ast * 1.7 * (min / 24), 1.8)));
          box.stl = Math.max(0, Math.round(norm(p.a.def * 0.7 * (min / 24), 0.9)));
          box.blk = Math.max(0, Math.round(norm(p.a.def * 0.55 * (min / 24), 0.8)));
          box.tov = Math.max(0, Math.round(norm(p.a.usage * 8 * (min / 24), 1.2)));
          box.pf = Math.max(0, Math.round(norm(1.9 * (min / 24), 1)));

          gameScore[side] += box.pts;

          logs.push({
            playerId: p.id, gameId: game.id, seasonId: season.id, teamId,
            date: game.date, started: i < 5, ...box,
            plusMinus: 0, // filled in below once both team totals are known
          });

          const agg = seasonBox.get(p.id) ?? { ...emptyBox(), gp: 0, gs: 0 };
          addBox(agg, box);
          agg.gp++;
          if (i < 5) agg.gs++;
          seasonBox.set(p.id, agg);

          const tagg = teamBox.get(teamId) ?? { ...emptyBox(), gp: 0, oppPts: 0 };
          addBox(tagg, box);
          teamBox.set(teamId, tagg);
        });
      }

      // Ties are not a thing; nudge the home team.
      if (gameScore.home === gameScore.away) gameScore.home += 2;
      scores.push({ id: game.id, ...gameScore });

      const margin = gameScore.home - gameScore.away;
      for (const l of logs) {
        if (l.gameId !== game.id) continue;
        const sign = l.teamId === game.homeTeamId ? 1 : -1;
        l.plusMinus = Math.round((margin * sign * l.min) / 48 + norm(0, 4));
      }
      for (const t of [game.homeTeamId, game.awayTeamId]) {
        const tagg = teamBox.get(t)!;
        tagg.gp++;
        tagg.oppPts += t === game.homeTeamId ? gameScore.away : gameScore.home;
      }

      if (recentGameIds.has(game.id)) {
        plays.push(...buildPlayByPlay(game.id, game.homeTeamId, game.awayTeamId, byTeam, gameScore));
      }
    }

    await chunked(scores, 500, (c) =>
      prisma.$transaction(
        c.map((s) =>
          prisma.game.update({
            where: { id: s.id },
            data: { homeScore: s.home, awayScore: s.away },
          }),
        ),
      ),
    );
    await chunked(logs, 5000, (c) => prisma.playerGameLog.createMany({ data: c }));
    await chunked(shots, 5000, (c) => prisma.shotData.createMany({ data: c }));
    await chunked(plays, 5000, (c) => prisma.playByPlay.createMany({ data: c }));
    console.log(
      `${season.key}: ${games.length} games, ${logs.length} game logs, ${shots.length} shots, ${plays.length} plays`,
    );

    // --- season aggregates ------------------------------------------------
    const wins = new Map<number, number>();
    for (const g of games) {
      const s = scores.find((x) => x.id === g.id)!;
      const w = s.home > s.away ? g.homeTeamId : g.awayTeamId;
      wins.set(w, (wins.get(w) ?? 0) + 1);
    }

    await prisma.playerStats.createMany({
      data: [...seasonBox].map(([playerId, b]) => {
        const p = players.find((x) => x.id === playerId)!;
        const tm = teamBox.get(p.teamId)!;
        return {
          playerId, seasonId: season.id, teamId: p.teamId,
          gp: b.gp, gs: b.gs, min: Math.round(b.min * 10) / 10,
          pts: b.pts, reb: b.reb, oreb: b.oreb, dreb: b.dreb, ast: b.ast,
          stl: b.stl, blk: b.blk, tov: b.tov, pf: b.pf,
          fgm: b.fgm, fga: b.fga, fg3m: b.fg3m, fg3a: b.fg3a, ftm: b.ftm, fta: b.fta,
          ppg: r1(b.pts / b.gp), rpg: r1(b.reb / b.gp), apg: r1(b.ast / b.gp),
          fgPct: r1((b.fgm / Math.max(1, b.fga)) * 100),
          fg3Pct: r1((b.fg3m / Math.max(1, b.fg3a)) * 100),
          ftPct: r1((b.ftm / Math.max(1, b.fta)) * 100),
          tsPct: r1(tsPct(b)), efgPct: r1(efgPct(b)), usgPct: r1(usgPct(b, tm)),
        };
      }),
    });

    // Advanced metrics: uPER first, then normalize the whole league to 15.0.
    const rows = [...seasonBox].map(([playerId, b]) => {
      const p = players.find((x) => x.id === playerId)!;
      const tm = teamBox.get(p.teamId)!;
      const opp = leagueMinus(teamBox, p.teamId);
      return { playerId, b, tm, opp, uPer: uPer(b, tm, LEAGUE_2024_25) };
    });
    const pers = normalizePer(rows.map((r) => ({ uPer: r.uPer, min: r.b.min })));
    const bpms = centerBpm(
      rows.map((r) => ({ ...boxPlusMinus(r.b, r.tm, LEAGUE_2024_25), min: r.b.min })),
    );

    await prisma.advancedStats.createMany({
      data: rows.map((r, i) => {
        const ws = winShares(r.b, r.tm, LEAGUE_2024_25);
        const bpm = bpms[i];
        const ortg = playerOrtg(r.b, r.tm, LEAGUE_2024_25);
        const drtg = playerDrtg(r.b, r.tm);
        return {
          playerId: r.playerId, seasonId: season.id,
          per: r2(pers[i]), ortg: r1(ortg), drtg: r1(drtg), netRtg: r1(ortg - drtg),
          ows: r2(ws.ows), dws: r2(ws.dws), ws: r2(ws.ws), ws48: r2(ws.ws48),
          obpm: r2(bpm.obpm), dbpm: r2(bpm.dbpm), bpm: r2(bpm.bpm),
          vorp: r2(vorp(bpm.bpm, r.b.min, r.tm.min, r.tm.gp)),
          astPct: r1(astPct(r.b, r.tm)),
          rebPct: r1(rebPct(r.b, r.tm, r.opp.reb / 29)),
          stlPct: r1(stlPct(r.b, r.tm, possessions(r.opp) / 29)),
          blkPct: r1(blkPct(r.b, r.tm, (r.opp.fga - r.opp.fg3a) / 29)),
          tovPct: r1(tovPct(r.b)),
        };
      }),
    });

    await prisma.teamStats.createMany({
      data: TEAMS.map((t) => {
        const b = teamBox.get(t.id)!;
        const poss = possessions(b);
        const ortg = (b.pts / poss) * 100;
        const drtg = (b.oppPts / poss) * 100;
        const opp = leagueMinus(teamBox, t.id);
        return {
          teamId: t.id, seasonId: season.id, gp: b.gp,
          wins: wins.get(t.id) ?? 0, losses: b.gp - (wins.get(t.id) ?? 0),
          pace: r1(pace(b)), ortg: r1(ortg), drtg: r1(drtg), netRtg: r1(ortg - drtg),
          efgPct: r1(efgPct(b)), tsPct: r1(tsPct(b)), tovPct: r1(tovPct(b)),
          orebPct: r1((b.oreb / (b.oreb + opp.dreb / 29)) * 100),
          drebPct: r1((b.dreb / (b.dreb + opp.oreb / 29)) * 100),
          ftRate: r1((b.fta / b.fga) * 100),
          oppEfgPct: r1(efgPct(opp)), oppTovPct: r1(tovPct(opp)),
          sos: r2(norm(0, 1.2)),
          drtgByPosition: {
            PG: r1(drtg + norm(0, 3)), SG: r1(drtg + norm(0, 3)),
            SF: r1(drtg + norm(0, 3)), PF: r1(drtg + norm(0, 3)),
            C: r1(drtg + norm(0, 3)),
          },
        };
      }),
    });
    console.log(`${season.key}: season + advanced + team stats written`);
  }

  const counts = await Promise.all([
    prisma.player.count(), prisma.game.count(), prisma.shotData.count(),
    prisma.playerGameLog.count(), prisma.playByPlay.count(),
  ]);
  console.log(
    `Done. players=${counts[0]} games=${counts[1]} shots=${counts[2]} logs=${counts[3]} plays=${counts[4]}`,
  );
}

const r1 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 10) / 10;
const r2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

/** Everyone else's totals, used as the opponent baseline for rate stats. */
function leagueMinus(teamBox: Map<number, TeamTotals & { oppPts: number }>, teamId: number) {
  const out = { ...emptyBox(), gp: 0, oppPts: 0 } as TeamTotals & { oppPts: number };
  for (const [id, b] of teamBox) if (id !== teamId) addBox(out, b);
  return out;
}

function buildPlayByPlay(
  gameId: number, homeTeamId: number, awayTeamId: number,
  byTeam: Map<number, { id: number; name: string }[]>,
  score: { home: number; away: number },
) {
  const plays = [];
  let home = 0, away = 0, eventNum = 1;
  const totalEvents = 380;
  for (let e = 0; e < totalEvents; e++) {
    const elapsedSec = Math.round((e / totalEvents) * 2880);
    const period = Math.min(4, Math.floor(elapsedSec / 720) + 1);
    const left = 720 - (elapsedSec % 720);
    const isHome = rnd() < 0.5;
    const teamId = isHome ? homeTeamId : awayTeamId;
    const player = pick(byTeam.get(teamId)!);
    const progress = (e + 1) / totalEvents;
    const target = isHome ? score.home * progress : score.away * progress;
    const behind = (isHome ? home : away) < target - 2;

    let description: string, eventType: string;
    if (behind) {
      const pts = rnd() < 0.32 ? 3 : 2;
      if (isHome) home += pts; else away += pts;
      eventType = 'SHOT';
      description = `${player.name} ${pts === 3 ? '3PT ' : ''}${pick(['Jump Shot', 'Driving Layup', 'Pullup Jump Shot', 'Dunk'])} (${pts} PTS)`;
    } else {
      eventType = pick(['REBOUND', 'TURNOVER', 'FOUL', 'MISS', 'SUBSTITUTION', 'BLOCK', 'STEAL']);
      description = {
        REBOUND: `${player.name} REBOUND`, TURNOVER: `${player.name} Bad Pass Turnover`,
        FOUL: `${player.name} Personal Foul`, MISS: `MISS ${player.name} Jump Shot`,
        SUBSTITUTION: `SUB: ${player.name} IN`, BLOCK: `${player.name} BLOCK`,
        STEAL: `${player.name} STEAL`,
      }[eventType]!;
    }

    plays.push({
      gameId, eventNum: eventNum++, period,
      clock: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`,
      elapsedSec, teamId, playerId: player.id, description,
      homeScore: home, awayScore: away, eventType,
    });
  }
  return plays;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
