import Link from 'next/link';
import { PercentileBars } from '@/components/PercentileBars';
import { prisma } from '@/lib/db';
import { fmt } from '@/lib/format';
import { lineups, teamPercentiles } from '@/lib/team';
import { Card, TeamHead, muted, type GameInfo } from './game-tab';

type Team = GameInfo['away'];

/** Lineups need this many minutes together to be called best; under it a hot stint is noise. */
const LINEUP_FLOOR = 20;

const finals = { status: { startsWith: 'Final' }, kind: { in: ['regular', 'playoffs', 'play-in'] } };
const won = (g: { homeTeamId: number; homeScore: number; awayScore: number }, teamId: number) =>
  g.homeTeamId === teamId ? g.homeScore > g.awayScore : g.awayScore > g.homeScore;

/**
 * Before tip-off: both teams' league percentiles side by side, every meeting
 * between these two franchises, each side's last ten games, and its best
 * five-man units this season. Early in a season with no ratings yet, the
 * percentiles are last season's, labeled.
 */
export async function Preview({ game }: { game: GameInfo }) {
  const { away, home } = game;
  const [season, current, meetings, awayForm, homeForm, awayUnits, homeUnits] = await Promise.all([
    prisma.season.findUniqueOrThrow({ where: { id: game.seasonId } }),
    prisma.teamStats.findMany({ where: { seasonId: game.seasonId } }),
    prisma.game.findMany({
      where: {
        ...finals,
        OR: [
          { homeTeamId: home.id, awayTeamId: away.id },
          { homeTeamId: away.id, awayTeamId: home.id },
        ],
      },
      include: { season: { select: { key: true } } },
      orderBy: { date: 'desc' },
    }),
    lastTen(away.id),
    lastTen(home.id),
    lineups(game.seasonId, { teamId: away.id }),
    lineups(game.seasonId, { teamId: home.id }),
  ]);

  const prev = current.length < 2
    ? await prisma.season.findFirst({ where: { startYear: { lt: season.startYear } }, orderBy: { startYear: 'desc' } })
    : null;
  const league = prev ? await prisma.teamStats.findMany({ where: { seasonId: prev.id } }) : current;
  const ratedKey = prev?.key ?? game.seasonKey;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {[away, home].map((t) => (
          <PercentileBars
            key={t.id}
            title={`${t.city} ${t.name}, ${ratedKey}`}
            subtitle={
              league.length
                ? `Against the league's ${league.length} teams, per 100 possessions.${prev ? ` Last season's team; ${game.seasonKey} has no ratings yet.` : ''}`
                : undefined
            }
            rows={teamPercentiles(t.id, league)}
            empty="No ratings yet."
          />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <HeadToHead away={away} home={home} meetings={meetings} />
        <Card title="Recent form">
          <div className="space-y-3">
            <Form team={away} games={awayForm} />
            <Form team={home} games={homeForm} />
          </div>
        </Card>
      </div>
      <Card title={`Best lineups, ${game.seasonKey}`} action={<span className="text-[0.6875rem] font-normal normal-case tracking-normal" style={muted}>By net rating once a unit has {LINEUP_FLOOR}+ minutes</span>}>
        <div className="grid gap-4 md:grid-cols-2">
          <Lineups team={away} units={awayUnits} />
          <Lineups team={home} units={homeUnits} />
        </div>
      </Card>
    </div>
  );
}

type Meeting = Awaited<ReturnType<typeof prisma.game.findMany<{ include: { season: { select: { key: true } } } }>>>[number];

function HeadToHead({ away, home, meetings }: { away: Team; home: Team; meetings: Meeting[] }) {
  const record = (games: Meeting[]) => {
    const w = games.filter((g) => won(g, away.id)).length;
    return `${away.abbreviation} ${w}-${games.length - w}`;
  };
  const regular = meetings.filter((g) => g.kind === 'regular');
  const playoffs = meetings.filter((g) => g.kind !== 'regular');
  return (
    <Card title="Head to head">
      {!meetings.length ? (
        <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
          First meeting.
        </p>
      ) : (
        <>
          <dl className="mb-2 grid grid-cols-2 gap-2 text-[0.8125rem]">
            <div>
              <dt className="eyebrow">Regular season</dt>
              <dd className="tnum font-semibold">{regular.length ? record(regular) : '—'}</dd>
            </div>
            <div>
              <dt className="eyebrow">Playoffs</dt>
              <dd className="tnum font-semibold">{playoffs.length ? record(playoffs) : '—'}</dd>
            </div>
          </dl>
          <ul className="text-[0.75rem]">
            {meetings.slice(0, 10).map((g) => {
              const [w, l] = won(g, away.id) ? [away, home] : [home, away];
              return (
                <li key={g.id} className="border-t" style={{ borderColor: 'var(--line)' }}>
                  <Link href={`/games/${g.id}`} className="link flex justify-between gap-2 py-1">
                    <span className="tnum" style={muted}>
                      {g.date.toISOString().slice(0, 10)}
                      {g.kind !== 'regular' && ' · Playoffs'}
                    </span>
                    <span className="tnum">
                      {w.abbreviation} {Math.max(g.homeScore, g.awayScore)}-{Math.min(g.homeScore, g.awayScore)}
                      {g.homeTeamId === w.id ? ` vs ${l.abbreviation}` : ` @ ${l.abbreviation}`}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-1 text-[0.6875rem]" style={muted}>
            Since {meetings.at(-1)!.season.key}. A franchise that moved counts its old city separately.
          </p>
        </>
      )}
    </Card>
  );
}

const lastTen = (teamId: number) =>
  prisma.game.findMany({
    where: { ...finals, OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { date: 'desc' },
    take: 10,
  });
type FormGame = Awaited<ReturnType<typeof lastTen>>[number];

/** Last ten as W/L tiles, oldest on the left, with the record and average margin. */
function Form({ team, games }: { team: Team; games: FormGame[] }) {
  const margin = (g: FormGame) => (g.homeTeamId === team.id ? g.homeScore - g.awayScore : g.awayScore - g.homeScore);
  const wins = games.filter((g) => won(g, team.id)).length;
  const avg = games.length ? games.reduce((s, g) => s + margin(g), 0) / games.length : null;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <TeamHead team={team} />
        {games.length > 0 && (
          <span className="tnum text-[0.75rem]" style={muted}>
            {wins}-{games.length - wins} · {avg! > 0 ? '+' : ''}{fmt(avg)} per game
          </span>
        )}
      </div>
      {games.length ? (
        <ol className="flex gap-1">
          {[...games].reverse().map((g) => {
            const w = won(g, team.id);
            const opp = g.homeTeamId === team.id ? `vs ${g.awayTeam.abbreviation}` : `@ ${g.homeTeam.abbreviation}`;
            const label = `${g.date.toISOString().slice(0, 10)}: ${w ? 'W' : 'L'} ${Math.max(g.homeScore, g.awayScore)}-${Math.min(g.homeScore, g.awayScore)} ${opp}`;
            return (
              <li key={g.id} className="flex-1">
                <Link
                  href={`/games/${g.id}`}
                  title={label}
                  aria-label={label}
                  className="block rounded py-1 text-center text-[0.6875rem] font-bold text-white"
                  style={{ background: w ? 'var(--pos)' : 'var(--neg)' }}
                >
                  {w ? 'W' : 'L'}
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-[0.8125rem]" style={muted}>
          No games yet.
        </p>
      )}
    </div>
  );
}

function Lineups({ team, units }: { team: Team; units: Awaited<ReturnType<typeof lineups>> }) {
  // Too early for any unit to clear the floor: show the most-used ones instead, unranked by net.
  const ranked = units.filter((u) => u.min >= LINEUP_FLOOR && u.net !== null).sort((a, b) => b.net! - a.net!);
  const best = (ranked.length ? ranked : [...units].sort((a, b) => b.min - a.min)).slice(0, 3);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <TeamHead team={team} />
        {best.length > 0 && !ranked.length && (
          <span className="text-[0.6875rem]" style={muted}>
            Most-used so far
          </span>
        )}
      </div>
      {best.length ? (
        <table className="tnum w-full text-[0.8125rem]">
          <thead>
            <tr className="text-[0.625rem] font-semibold uppercase" style={muted}>
              <th className="text-left font-semibold">Lineup</th>
              <th className="w-12 text-right font-semibold">MIN</th>
              <th className="w-14 text-right font-semibold">Net</th>
            </tr>
          </thead>
          <tbody>
            {best.map((u) => (
              <tr key={u.lineup} className="border-t" style={{ borderColor: 'var(--line)' }}>
                <td className="py-1.5">{u.lineup}</td>
                <td className="text-right">{fmt(u.min, 0)}</td>
                <td className="text-right font-semibold" style={{ color: u.net! >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                  {u.net! > 0 ? '+' : ''}
                  {fmt(u.net)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-[0.8125rem]" style={muted}>
          No lineups yet.
        </p>
      )}
    </div>
  );
}
