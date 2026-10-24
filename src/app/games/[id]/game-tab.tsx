import Link from 'next/link';
import type { ReactNode } from 'react';
import { Headshot } from '@/components/Headshot';
import { TeamMark } from '@/components/TeamMark';
import { Tip } from '@/components/Tip';
import { WinProbability, type WinPoint } from '@/components/WinProbability';
import { prisma, type Standing } from '@/lib/db';
import { normName } from '@/lib/identity';
import { gameInjuries } from '@/lib/injuries';
import { fmt, perGame } from '@/lib/format';
import type { liveGame } from '@/lib/live';
import type { Broadcast } from '@/lib/nba';
import { gameClock, gamesBehind, minGames, winProbability } from '@/lib/stats';

export type Live = NonNullable<Awaited<ReturnType<typeof liveGame>>>;
type Team = { id: number; abbreviation: string; city: string; name: string; primaryColor: string };
export type GameInfo = {
  id: number;
  seasonId: number;
  seasonKey: string;
  day: string;
  status: string;
  longDate: string;
  broadcast: Broadcast | null;
  away: Team;
  home: Team;
};

/** PG/SG -> G, SF/PF -> F; C, G and F stay. */
const broad = (pos: string | null | undefined) =>
  !pos ? null : pos.endsWith('G') ? 'G' : pos.endsWith('F') ? 'F' : pos.startsWith('C') ? 'C' : null;

const periodName = (p: number) => (p <= 4 ? `Q${p}` : p === 5 ? 'OT' : `${p - 4}OT`);
const pct = (m: number | null, a: number | null) => (m !== null && a ? (m / a) * 100 : null);

export function Card({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="panel p-3">
      <h2 className="mb-2 flex items-baseline justify-between border-b pb-2 text-[0.6875rem] font-bold uppercase tracking-[0.12em]" style={{ borderColor: 'var(--line)' }}>
        {title}
        {action}
      </h2>
      {children}
    </section>
  );
}

export const muted = { color: 'var(--ink-3)' };

/**
 * The Game tab: who's on the floor, win probability, the season's team stats
 * and the game's details on the left; the game as it stands, its leaders, each
 * team's season leaders and who's out in the middle; the season series, this
 * game's team box and the standings on the right. Before the NBA opens the box
 * score (around tip-off) `data` is null and only the season pieces show.
 */
export async function GameTab({ game, data, standings }: { game: GameInfo; data: Live | null; standings: Standing[] }) {
  const ids = [game.away.id, game.home.id];
  const [season, players, series, roster] = await Promise.all([
    prisma.teamStats.findMany({ where: { seasonId: game.seasonId, teamId: { in: ids } } }),
    prisma.playerStats.findMany({
      where: { seasonId: game.seasonId, teamId: { in: ids } },
      include: { player: { select: { fullName: true } } },
    }),
    prisma.game.findMany({
      where: {
        seasonId: game.seasonId,
        kind: { in: ['regular', 'playoffs', 'play-in'] },
        status: { startsWith: 'Final' },
        OR: [
          { homeTeamId: game.home.id, awayTeamId: game.away.id },
          { homeTeamId: game.away.id, awayTeamId: game.home.id },
        ],
      },
      include: { homeTeam: true, awayTeam: true },
      orderBy: { date: 'asc' },
    }),
    // Roster positions: the box score only gives starters their lineup slot.
    data
      ? prisma.player.findMany({ where: { id: { in: data.logs.map((l) => l.playerId) } }, select: { id: true, position: true } })
      : [],
  ]);
  const position = new Map(roster.map((p) => [p.id, broad(p.position)]));

  return (
    <div className="grid gap-4 lg:grid-cols-[19rem_minmax(0,1fr)_19rem]">
      <div className="space-y-4">
        {data && data.state !== 'pre' && <OnCourt game={game} data={data} position={position} />}
        {data && data.state !== 'pre' && <WinChance game={game} data={data} />}
        <SeasonStats game={game} season={season} />
        <Info game={game} data={data} />
      </div>
      <div className="space-y-4">
        <Now game={game} data={data} />
        {data && data.state !== 'pre' && <GameLeaders game={game} data={data} />}
        <TeamLeaders game={game} season={season} players={players} />
        <Injuries game={game} />
      </div>
      <div className="space-y-4">
        <Records game={game} standings={standings} series={series} />
        {data && data.state !== 'pre' && <MatchupBox game={game} data={data} />}
        <MiniStandings game={game} standings={standings} />
      </div>
    </div>
  );
}

export function TeamHead({ team }: { team: Team }) {
  return (
    <div className="flex items-center gap-2 py-1.5 text-sm font-semibold">
      <TeamMark abbr={team.abbreviation} color={team.primaryColor} size={22} />
      {team.name}
    </div>
  );
}

function OnCourt({ game, data, position }: { game: GameInfo; data: Live; position: Map<number, string | null> }) {
  const side = (team: Team, t: Live['home']) => {
    const five = data.logs.filter((l) => t.onCourt.includes(l.playerId));
    return (
      <div key={team.id}>
        <TeamHead team={team} />
        <table className="w-full text-[0.8125rem]">
          <thead>
            <tr className="text-[0.625rem] font-semibold uppercase" style={muted}>
              <th className="text-left font-semibold">Player</th>
              {['PTS', 'FG', 'REB', 'AST', 'PF'].map((h) => (
                <th key={h} className={`${h === 'FG' ? 'w-12' : 'w-8'} text-right font-semibold`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="tnum">
            {five.map((l) => (
              <tr key={l.playerId} className="border-t" style={{ borderColor: 'var(--line)' }}>
                <td className="py-1.5">
                  <span className="flex items-center gap-2">
                    <Headshot id={l.playerId} name="" className="h-8 w-8 shrink-0 rounded-full bg-[var(--panel-2)] object-cover object-top" />
                    <span className="min-w-0">
                      <Link href={`/players/${l.playerId}`} className="link block truncate font-medium">
                        {l.firstName.charAt(0)}. {l.lastName}
                      </Link>
                      <span className="text-[0.6875rem]" style={muted}>
                        {[l.jersey && `#${l.jersey}`, position.get(l.playerId) ?? broad(l.position)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="text-right font-semibold">{l.pts}</td>
                <td className="whitespace-nowrap text-right">{`${l.fgm}-${l.fga}`}</td>
                <td className="text-right">{l.reb}</td>
                <td className="text-right">{l.ast}</td>
                <td className="text-right">{l.pf}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };
  return (
    <Card title={data.state === 'live' ? 'On the court' : 'On the court at the end'}>
      <div className="space-y-2">
        {side(game.away, data.away)}
        {side(game.home, data.home)}
      </div>
    </Card>
  );
}

function WinChance({ game, data }: { game: GameInfo; data: Live }) {
  const points: WinPoint[] = [{ t: 0, p: winProbability(0, 2880), when: 'Tip-off', score: '0-0' }];
  for (const play of data.plays) {
    const { elapsed, left } = gameClock(play.period, play.clock);
    points.push({
      t: elapsed,
      p: winProbability(play.homeScore - play.awayScore, left),
      when: `${periodName(play.period)} ${play.clock}`,
      score: `${play.awayScore}-${play.homeScore}`,
    });
  }
  const last = Math.max(4, ...data.plays.map((p) => p.period));
  return (
    <Card title="Win probability">
      <WinProbability
        points={points}
        length={2880 + (last - 4) * 300}
        home={game.home.abbreviation}
        away={game.away.abbreviation}
      />
    </Card>
  );
}

type SeasonRow = Awaited<ReturnType<typeof prisma.teamStats.findMany>>[number];

function SeasonStats({ game, season }: { game: GameInfo; season: SeasonRow[] }) {
  const of = (team: Team) => season.find((s) => s.teamId === team.id);
  const [a, h] = [of(game.away), of(game.home)];
  if (!a?.gp && !h?.gp) return null;
  const rows: [string, (s: SeasonRow) => number | null, number?][] = [
    ['Points', (s) => perGame(s.pts, s.gp)],
    ['Points allowed', (s) => perGame(s.oppPts, s.gp)],
    ['Field goal %', (s) => pct(s.fgm, s.fga)],
    ['Three-point %', (s) => pct(s.fg3m, s.fg3a)],
    ['Rebounds', (s) => perGame(s.reb, s.gp)],
    ['Assists', (s) => perGame(s.ast, s.gp)],
    ['Turnovers', (s) => perGame(s.tov, s.gp)],
    ['Net rating', (s) => s.netRtg],
  ];
  return (
    <Card title={`${game.seasonKey} team stats`}>
      <table className="tnum w-full text-[0.8125rem]">
        <thead>
          <tr className="text-[0.625rem] font-semibold uppercase" style={muted}>
            <th />
            <th className="w-14 text-right font-semibold">{game.away.abbreviation}</th>
            <th className="w-14 text-right font-semibold">{game.home.abbreviation}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, get]) => (
            <tr key={label} className="border-t" style={{ borderColor: 'var(--line)' }}>
              <td className="py-1" style={{ color: 'var(--ink-2)' }}>
                {label}
              </td>
              <td className="text-right">{fmt(a ? get(a) : null)}</td>
              <td className="text-right">{fmt(h ? get(h) : null)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function Info({ game, data }: { game: GameInfo; data: Live | null }) {
  const rows: [string, ReactNode][] = [
    ['Date', game.longDate],
    ['Tip-off', /^\d/.test(game.status) ? <Tip day={game.day} status={game.status} /> : null],
    ['Arena', data?.arena],
    ['Attendance', data?.attendance?.toLocaleString('en-US')],
    ['TV', game.broadcast?.tv.join(', ')],
    ['Radio', game.broadcast?.radio.join(', ')],
    ['Officials', data?.officials.join(', ')],
  ];
  return (
    <Card title="Game information">
      <dl className="space-y-1.5 text-[0.8125rem]">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="grid grid-cols-[5.5rem_1fr] gap-2">
              <dt style={muted}>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
    </Card>
  );
}

/** The game as it stands: clock, bonus, timeouts, and the last few plays. */
function Now({ game, data }: { game: GameInfo; data: Live | null }) {
  if (!data || data.state === 'pre') {
    return (
      <Card title="Game">
        <p className="py-6 text-center text-sm" style={{ color: 'var(--ink-2)' }}>
          {/^\d/.test(game.status) ? (
            <>
              Tip-off at <Tip day={game.day} status={game.status} />. Live stats start here when the game does.
            </>
          ) : (
            game.status
          )}
        </p>
      </Card>
    );
  }
  const recent = [...data.plays].reverse().slice(0, 8);
  const teamOf = (abbr: string) => [game.away, game.home].find((t) => t.abbreviation === abbr);
  const state = (team: Team, t: Live['home']) => (
    <div className="flex items-center gap-2 text-[0.75rem]">
      <TeamMark abbr={team.abbreviation} color={team.primaryColor} size={18} />
      <span className="font-semibold">{team.abbreviation}</span>
      {t.timeouts !== null && <span style={muted}>{t.timeouts} timeouts left</span>}
      {data.state === 'live' && t.bonus && (
        <span className="rounded px-1 text-[0.625rem] font-bold uppercase" style={{ background: 'var(--panel-2)' }}>
          Bonus
        </span>
      )}
    </div>
  );
  return (
    <Card
      title={data.state === 'live' ? `Live · ${data.status}` : data.status}
      action={
        <Link href="?tab=pbp" className="link text-[0.6875rem] font-semibold normal-case tracking-normal" scroll={false}>
          Full play-by-play
        </Link>
      }
    >
      <div className="mb-2 flex flex-wrap gap-x-6 gap-y-1">
        {state(game.away, data.away)}
        {state(game.home, data.home)}
      </div>
      <ol>
        {recent.map((p, i) => {
          const team = teamOf(p.teamAbbr);
          return (
            <li key={i} className="flex items-start gap-3 border-t py-2 text-[0.8125rem]" style={{ borderColor: 'var(--line)' }}>
              <span className="w-5 shrink-0 pt-0.5">{team && <TeamMark abbr={team.abbreviation} color={team.primaryColor} size={18} />}</span>
              <span className="min-w-0 flex-1">
                <span className="block">{p.description}</span>
                <span className="text-[0.6875rem]" style={muted}>
                  {periodName(p.period)} {p.clock}
                </span>
              </span>
              <span className="tnum shrink-0 font-semibold">
                {p.awayScore}-{p.homeScore}
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/** One row of a leaders card: away player and number on the left, home on the right. */
function Duel({ label, away, home }: {
  label: string;
  away: { playerId: number; name: string; value: number; line: string } | null;
  home: { playerId: number; name: string; value: number; line: string } | null;
}) {
  const side = (p: typeof away, right: boolean) =>
    p ? (
      <div className={`flex min-w-0 items-center gap-2 ${right ? 'flex-row-reverse text-right' : ''}`}>
        <Headshot id={p.playerId} name="" className="h-10 w-10 shrink-0 rounded-full bg-[var(--panel-2)] object-cover object-top" />
        <div className="min-w-0">
          <Link href={`/players/${p.playerId}`} className="link block truncate text-[0.8125rem] font-medium">
            {p.name}
          </Link>
          <span className="text-[0.6875rem]" style={muted}>
            {p.line}
          </span>
        </div>
        <span className="tnum text-xl font-bold">{fmt(p.value, Number.isInteger(p.value) ? 0 : 1)}</span>
      </div>
    ) : (
      <span style={muted}>—</span>
    );
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-t py-2" style={{ borderColor: 'var(--line)' }}>
      {side(away, false)}
      <span className="eyebrow w-16 text-center">{label}</span>
      {side(home, true)}
    </div>
  );
}

function GameLeaders({ game, data }: { game: GameInfo; data: Live }) {
  const best = (team: Team, key: 'pts' | 'reb' | 'ast') => {
    const l = data.logs
      .filter((x) => x.teamId === team.id && x.min > 0)
      .sort((a, b) => b[key] - a[key] || b.pts - a.pts)[0];
    return l
      ? { playerId: l.playerId, name: l.name, value: l[key], line: `${l.fgm}-${l.fga} FG · ${l.pts} PTS ${l.reb} REB ${l.ast} AST` }
      : null;
  };
  return (
    <Card title="Game leaders">
      <div className="mb-1 grid grid-cols-[1fr_auto_1fr] gap-3">
        <TeamHead team={game.away} />
        <span className="w-16" />
        <div className="flex justify-end">
          <TeamHead team={game.home} />
        </div>
      </div>
      {(
        [
          ['Points', 'pts'],
          ['Rebounds', 'reb'],
          ['Assists', 'ast'],
        ] as const
      ).map(([label, key]) => (
        <Duel key={key} label={label} away={best(game.away, key)} home={best(game.home, key)} />
      ))}
    </Card>
  );
}

type PlayerRow = Awaited<ReturnType<typeof prisma.playerStats.findMany<{ include: { player: { select: { fullName: true } } } }>>>[number];

function TeamLeaders({ game, season, players }: { game: GameInfo; season: SeasonRow[]; players: PlayerRow[] }) {
  if (!players.length) return null;
  // Qualified players first (70% of the team's games), anyone if nobody is yet.
  const best = (team: Team, get: (p: PlayerRow) => number | null) => {
    const roster = players.filter((p) => p.teamId === team.id);
    const gp = season.find((s) => s.teamId === team.id)?.gp ?? 0;
    const qualified = roster.filter((p) => p.gp >= minGames(gp));
    const p = (qualified.length ? qualified : roster)
      .filter((x) => get(x) !== null)
      .sort((a, b) => get(b)! - get(a)!)[0];
    return p
      ? {
          playerId: p.playerId, name: p.player.fullName, value: get(p)!,
          line: `${fmt(p.ppg)} PTS · ${fmt(p.rpg)} REB · ${fmt(p.apg)} AST`,
        }
      : null;
  };
  return (
    <Card title={`${game.seasonKey} team leaders`}>
      {(
        [
          ['Points', (p: PlayerRow) => p.ppg],
          ['Rebounds', (p: PlayerRow) => p.rpg],
          ['Assists', (p: PlayerRow) => p.apg],
        ] as const
      ).map(([label, get]) => (
        <Duel key={label} label={`${label} / G`} away={best(game.away, get)} home={best(game.home, get)} />
      ))}
    </Card>
  );
}

const STATUS_COLOR: Record<string, string> = {
  Out: 'var(--neg)', Doubtful: 'var(--s4)', Questionable: 'var(--s4)', Probable: 'var(--pos)', Available: 'var(--pos)',
};

/**
 * The NBA's official injury report for this game: the newest report that
 * lists it, each player's status and why. Names are matched to the two
 * rosters (accents and punctuation aside) so they link.
 */
async function Injuries({ game }: { game: GameInfo }) {
  const report = await gameInjuries(game.seasonKey, game.day, game.away.abbreviation, game.home.abbreviation);
  const roster = report
    ? await prisma.player.findMany({ where: { teamId: { in: [game.away.id, game.home.id] } }, select: { id: true, fullName: true } })
    : [];
  const idOf = new Map(roster.map((p) => [normName(p.fullName), p.id]));
  return (
    <Card
      title="Injury report"
      action={
        report?.asOf && (
          <span className="text-[0.6875rem] font-normal normal-case tracking-normal" style={muted}>
            NBA official, {report.asOf}
          </span>
        )
      }
    >
      {!report ? (
        <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
          The NBA&apos;s official injury report doesn&apos;t list this game.
        </p>
      ) : (
        <div className="space-y-4">
          {[game.away, game.home].map((team) => {
            const list = report.rows.filter((r) => r.team === team.abbreviation);
            return (
              <div key={team.id}>
                <TeamHead team={team} />
                {list.length ? (
                  <ul className="text-[0.8125rem]">
                    {list.map((r) => {
                      const id = idOf.get(normName(r.name));
                      return (
                        <li key={r.name} className="flex items-center gap-3 border-t py-1.5" style={{ borderColor: 'var(--line)' }}>
                          {id ? (
                            <Headshot id={id} name="" className="h-9 w-9 shrink-0 rounded-full bg-[var(--panel-2)] object-cover object-top" />
                          ) : (
                            <span className="h-9 w-9 shrink-0 rounded-full" style={{ background: 'var(--panel-2)' }} />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              {id ? (
                                <Link href={`/players/${id}`} className="link font-medium">
                                  {r.name}
                                </Link>
                              ) : (
                                <span className="font-medium">{r.name}</span>
                              )}
                              <span className="shrink-0 text-[0.6875rem] font-semibold uppercase" style={{ color: STATUS_COLOR[r.status] ?? 'var(--ink-2)' }}>
                                {r.status}
                              </span>
                            </div>
                            <div className="text-[0.75rem]" style={muted}>
                              {r.reason}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-[0.8125rem]" style={muted}>
                    Nobody listed.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

type SeriesGame = Awaited<ReturnType<typeof prisma.game.findMany<{ include: { homeTeam: true; awayTeam: true } }>>>[number];

function Records({ game, standings, series }: { game: GameInfo; standings: Standing[]; series: SeriesGame[] }) {
  const row = (team: Team) => standings.find((s) => s.teamId === team.id);
  const wins = (team: Team) =>
    series.filter((g) => (g.homeTeamId === team.id ? g.homeScore > g.awayScore : g.awayScore > g.homeScore)).length;
  const [aw, hw] = [wins(game.away), wins(game.home)];
  const lead =
    aw === hw ? `Series tied ${aw}-${hw}` : `${aw > hw ? game.away.abbreviation : game.home.abbreviation} leads ${Math.max(aw, hw)}-${Math.min(aw, hw)}`;
  const wl = (x?: [number, number]) => (x ? `${x[0]}-${x[1]}` : '—');
  const lines: [string, (s?: Standing) => string][] = [
    ['Overall', (s) => (s ? `${s.wins}-${s.losses}` : '—')],
    ['Home', (s) => wl(s?.home)],
    ['Away', (s) => wl(s?.away)],
    ['Last 10', (s) => wl(s?.l10)],
    ['Streak', (s) => s?.streak || '—'],
  ];
  return (
    <Card title="Matchup">
      <div className="mb-2 flex items-center justify-between">
        <TeamMark abbr={game.away.abbreviation} color={game.away.primaryColor} size={32} />
        <div className="text-center">
          <div className="eyebrow">{game.seasonKey} season series</div>
          <div className="text-sm font-semibold">{lead}</div>
        </div>
        <TeamMark abbr={game.home.abbreviation} color={game.home.primaryColor} size={32} />
      </div>
      {series.length > 0 && (
        <ul className="mb-2 text-[0.75rem]">
          {series.map((g) => (
            <li key={g.id}>
              <Link href={`/games/${g.id}`} className="link flex justify-between gap-2 py-0.5">
                <span>{g.date.toISOString().slice(5, 10).replace('-', '/')}</span>
                <span className="tnum">
                  {g.awayTeam.abbreviation} {g.awayScore} @ {g.homeTeam.abbreviation} {g.homeScore}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <table className="tnum w-full text-[0.8125rem]">
        <thead>
          <tr className="text-[0.625rem] font-semibold uppercase" style={muted}>
            <th />
            <th className="w-14 text-right font-semibold">{game.away.abbreviation}</th>
            <th className="w-14 text-right font-semibold">{game.home.abbreviation}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map(([label, get]) => (
            <tr key={label} className="border-t" style={{ borderColor: 'var(--line)' }}>
              <td className="py-1" style={{ color: 'var(--ink-2)' }}>
                {label}
              </td>
              <td className="text-right">{get(row(game.away))}</td>
              <td className="text-right">{get(row(game.home))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/** This game's team box side by side, each row a split bar in the two teams' colours. */
function MatchupBox({ game, data }: { game: GameInfo; data: Live }) {
  const value = (s: Live['home']['stats'][number]) => s.pct ?? Number(s.text);
  return (
    <Card
      title="Team box score"
      action={
        <Link href="?tab=team" className="link text-[0.6875rem] font-semibold normal-case tracking-normal" scroll={false}>
          All team stats
        </Link>
      }
    >
      <div className="mb-1 flex justify-between text-[0.6875rem] font-semibold">
        <span>{game.away.abbreviation}</span>
        <span>{game.home.abbreviation}</span>
      </div>
      <div className="space-y-2">
        {data.away.stats.map((a, i) => {
          const h = data.home.stats[i];
          const [x, y] = [value(a), value(h)];
          const share = Number.isFinite(x) && Number.isFinite(y) && x + y > 0 ? x / (x + y) : 0.5;
          const show = (s: typeof a) => (s.pct === null ? s.text : `${s.pct.toFixed(1)}%`);
          return (
            <div key={a.label}>
              <div className="flex justify-between text-[0.75rem]">
                <span className="tnum font-semibold">{show(a)}</span>
                <span style={{ color: 'var(--ink-2)' }}>{a.label}</span>
                <span className="tnum font-semibold">{show(h)}</span>
              </div>
              <div className="mt-0.5 flex h-1.5 gap-0.5" aria-hidden>
                <span className="rounded-l" style={{ width: `${share * 100}%`, background: game.away.primaryColor }} />
                <span className="flex-1 rounded-r" style={{ background: game.home.primaryColor }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** Each team's conference (one table when they share it), the two teams highlighted. */
function MiniStandings({ game, standings }: { game: GameInfo; standings: Standing[] }) {
  const confOf = (team: Team) => standings.find((s) => s.teamId === team.id)?.conference ?? null;
  const confs = [...new Set([confOf(game.away), confOf(game.home)])].filter((c): c is string => !!c);
  if (!confs.length) return null;
  return (
    <>
      {confs.map((c) => {
        const rows = standings
          .filter((s) => s.conference === c)
          .sort((a, b) => b.pct - a.pct || b.wins - a.wins);
        return (
          <Card
            key={c}
            title={`${c}ern Conference`}
            action={
              <Link href="/standings" className="link text-[0.6875rem] font-semibold normal-case tracking-normal">
                Full standings
              </Link>
            }
          >
            <table className="tnum w-full text-[0.8125rem]">
              <thead>
                <tr className="text-[0.625rem] font-semibold uppercase" style={muted}>
                  <th className="text-left font-semibold">Team</th>
                  <th className="w-10 text-right font-semibold">W</th>
                  <th className="w-10 text-right font-semibold">L</th>
                  <th className="w-10 text-right font-semibold">GB</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s, i) => {
                  const ours = s.teamId === game.away.id || s.teamId === game.home.id;
                  const gb = gamesBehind(rows[0], s);
                  return (
                    <tr
                      key={s.teamId}
                      className="border-t"
                      style={{ borderColor: 'var(--line)', background: ours ? 'var(--panel-2)' : undefined, fontWeight: ours ? 600 : undefined }}
                    >
                      <td className="py-1">
                        <span className="flex items-center gap-2">
                          <span className="w-4 text-right text-[0.6875rem]" style={muted}>
                            {i + 1}
                          </span>
                          <TeamMark abbr={s.abbr} color={s.color} size={16} />
                          <Link href={`/teams/${s.abbr}`} className="link">
                            {s.abbr}
                          </Link>
                        </span>
                      </td>
                      <td className="text-right">{s.wins}</td>
                      <td className="text-right">{s.losses}</td>
                      <td className="text-right">{gb ? fmt(gb, 1) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        );
      })}
    </>
  );
}
