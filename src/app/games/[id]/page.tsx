import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { AutoRefresh } from '@/components/AutoRefresh';
import { GamePlays } from '@/components/GamePlays';
import { TeamMark } from '@/components/TeamMark';
import { Tip } from '@/components/Tip';
import { seasonStandings, type Standing } from '@/lib/db';
import { liveGame } from '@/lib/live';
import type { Broadcast } from '@/lib/nba';
import { TeamBox } from './box-score';
import { GameTab, type GameInfo } from './game-tab';
import { Preview } from './preview';
import { Tabs, TabPanel } from './tabs';
import { TeamStats } from './team-stats';

export const revalidate = 10;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const game = await prisma.game.findUnique({
    where: { id: Number((await params).id) || 0 },
    include: { homeTeam: true, awayTeam: true },
  });
  return { title: game ? `${game.awayTeam.abbreviation} at ${game.homeTeam.abbreviation}` : 'Not found' };
}

type GameRow = NonNullable<Awaited<ReturnType<typeof loadGame>>>;
const loadGame = (id: number) =>
  prisma.game.findUnique({ where: { id }, include: { homeTeam: true, awayTeam: true, season: true } });

const longDate = (d: Date) =>
  d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export default async function GamePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const game = await loadGame(id);
  if (!game) notFound();
  const { tab } = await searchParams;
  const standings = await seasonStandings(game.seasonId);
  // From 2026-27 on a game carries the NBA's id, and its box score comes from the NBA's feed.
  return game.gameCode.startsWith('00') ? (
    <NbaGame game={game} standings={standings} tab={TABS.some((t) => t.value === tab) ? tab : ''} />
  ) : (
    <PastGame game={game} standings={standings} />
  );
}

const TABS = [
  { value: '', label: 'Game' },
  { value: 'box', label: 'Box score' },
  { value: 'pbp', label: 'Play-by-play' },
  { value: 'team', label: 'Team stats' },
];

type Side = { score: number | null; periods?: number[]; bonus?: boolean; timeouts?: number | null };

/**
 * Logos out wide, scores toward the middle, and between them the status, the
 * line score and where it's on. Each side's record sits under its name: the
 * overall one, then the split for where it's playing tonight.
 */
function Header({
  game, standings, away, home, status, live,
}: {
  game: GameRow; standings: Standing[]; away: Side; home: Side; status: string; live?: boolean;
}) {
  const kind = game.kind === 'preseason' ? 'Preseason' : game.kind === 'playoffs' ? 'Playoffs' : game.kind === 'play-in' ? 'Play-In' : null;
  const final = status.startsWith('Final');
  const broadcast = game.broadcast as Broadcast | null;
  const record = (teamId: number, where: 'home' | 'away') => {
    const s = standings.find((r) => r.teamId === teamId);
    if (!s) return '';
    const split = s[where];
    return `${s.wins}-${s.losses}, ${split[0]}-${split[1]} ${where === 'home' ? 'Home' : 'Away'}`;
  };
  const won = (us: number | null, them: number | null) => final && (us ?? 0) > (them ?? 0);

  const team = (t: GameRow['homeTeam'], side: Side, other: Side, where: 'home' | 'away') => {
    const right = where === 'home';
    return (
      <div className={`flex items-center gap-2 sm:gap-4 ${right ? 'flex-row-reverse text-right' : ''}`}>
        {/* 40px on a phone, 56px from sm up; TeamMark sizes itself inline, hence the !. */}
        <span className="shrink-0 [&>*]:!h-10 [&>*]:!w-10 sm:[&>*]:!h-14 sm:[&>*]:!w-14">
          <TeamMark abbr={t.abbreviation} color={t.primaryColor} size={56} />
        </span>
        <div className="hidden min-w-0 sm:block">
          <Link href={`/teams/${t.abbreviation}?season=${game.season.key}`} className="link block font-semibold">
            {t.city} {t.name}
          </Link>
          <div className="text-xs" style={{ color: 'var(--ink-3)' }}>
            {record(t.id, where)}
          </div>
        </div>
        <div className={`${right ? 'mr-auto' : 'ml-auto'} text-center`}>
          <div
            className="tnum text-3xl font-bold sm:text-4xl"
            style={{ color: side.score === null || won(side.score, other.score) || !final ? 'var(--ink)' : 'var(--ink-3)' }}
          >
            {side.score ?? '—'}
          </div>
          {live && (
            <div className="text-[0.625rem] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--ink-3)' }}>
              {side.timeouts ?? '—'} TO{side.bonus ? ' · Bonus' : ''}
            </div>
          )}
        </div>
      </div>
    );
  };

  const periods = Math.max(4, away.periods?.length ?? 0, home.periods?.length ?? 0);
  const played = away.score !== null;
  return (
    <header className="panel overflow-hidden">
      <div className="flex h-1.5">
        <span className="flex-1" style={{ background: game.awayTeam.primaryColor }} />
        <span className="flex-1" style={{ background: game.homeTeam.primaryColor }} />
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 p-3 sm:gap-6 sm:p-4">
        {team(game.awayTeam, away, home, 'away')}
        <div className="flex flex-col items-center gap-1.5 text-center">
          <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: live ? 'var(--hot)' : 'var(--ink)' }}>
            {live && <span aria-hidden className="h-2 w-2 animate-pulse rounded-full" style={{ background: 'var(--hot)' }} />}
            {live && <span className="sr-only">Live: </span>}
            <Tip day={game.date.toISOString().slice(0, 10)} status={status} />
          </div>
          {played && away.periods && home.periods && (
            <table className="tnum hidden text-[0.75rem] sm:table">
              <thead>
                <tr style={{ color: 'var(--ink-3)' }}>
                  <th />
                  {Array.from({ length: periods }, (_, i) => (
                    <th key={i} className="w-6 font-normal">
                      {i < 4 ? i + 1 : i === 4 ? 'OT' : `${i - 3}OT`}
                    </th>
                  ))}
                  <th className="w-7 font-semibold">T</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [game.awayTeam.abbreviation, away],
                  [game.homeTeam.abbreviation, home],
                ].map(([abbr, s]) => {
                  const side = s as Side;
                  return (
                    <tr key={abbr as string}>
                      <td className="pr-2 text-left font-semibold">{abbr as string}</td>
                      {Array.from({ length: periods }, (_, i) => (
                        <td key={i}>{side.periods![i] ?? ''}</td>
                      ))}
                      <td className="font-bold">{side.score}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {broadcast?.tv[0] && (
            <span className="hidden rounded border px-1.5 text-[0.6875rem] font-semibold sm:inline" style={{ borderColor: 'var(--line-2)' }}>
              {broadcast.tv[0].replace(/ \((home|away)\)$/, '')}
            </span>
          )}
          <div className="eyebrow">{[game.season.key, kind, game.label].filter(Boolean).join(' · ')}</div>
        </div>
        {team(game.homeTeam, home, away, 'home')}
      </div>
    </header>
  );
}

async function NbaGame({ game, standings, tab }: { game: GameRow; standings: Standing[]; tab: string }) {
  const data = await liveGame(game.gameCode, game.status.startsWith('Final'));
  const live = data?.state === 'live';
  const scored = !!data && data.state !== 'pre';
  const info: GameInfo = {
    id: game.id, seasonId: game.seasonId, seasonKey: game.season.key,
    day: game.date.toISOString().slice(0, 10), status: game.status, longDate: longDate(game.date),
    broadcast: game.broadcast as Broadcast | null, away: game.awayTeam, home: game.homeTeam,
  };
  const side = (t: NonNullable<typeof data>['home'] | undefined): Side =>
    scored && t
      ? {
          score: t.score,
          // The feed zero-fills quarters not played yet; while it's live only `period` of them have happened.
          periods: live ? t.periods.slice(0, data!.period) : t.periods,
          bonus: t.bonus,
          timeouts: t.timeouts,
        }
      : { score: null };

  const waiting = (
    <p className="panel p-6 text-sm" style={{ color: 'var(--ink-2)' }}>
      The box score opens around tip-off.
    </p>
  );

  return (
    <div className="space-y-4">
      <AutoRefresh active={data?.state !== 'final'} seconds={live ? 15 : 60} />
      <Header
        game={game}
        standings={standings}
        away={side(data?.away)}
        home={side(data?.home)}
        status={data?.status ?? game.status}
        live={live}
      />
      <Tabs tabs={TABS} current={tab} />
      <TabPanel tab={tab}>

        {tab === '' && (
          <div className="space-y-4">
            {!scored && <Preview game={info} />}
            <GameTab game={info} data={data} standings={standings} />
          </div>
        )}

        {tab === 'box' &&
          (!data ? (
            waiting
          ) : (
            <div className="panel space-y-5 p-4">
              {[
                { t: data.away, team: game.awayTeam },
                { t: data.home, team: game.homeTeam },
              ].map(({ t, team }) => (
                <TeamBox
                  key={t.teamId}
                  team={team}
                  lines={data.logs.filter((l) => l.teamId === t.teamId)}
                  benched={t.inactive}
                  final={data.state === 'final'}
                  onCourt={live ? t.onCourt : []}
                />
              ))}
              <p className="text-[0.6875rem]" style={{ color: 'var(--ink-3)' }}>
                +/- is the team&apos;s net points while the player is on the court.
              </p>
            </div>
          ))}

        {tab === 'pbp' &&
          (!data ? (
            waiting
          ) : (
            <GamePlays
              plays={data.plays}
              live={live}
              away={{ abbr: game.awayTeam.abbreviation, name: game.awayTeam.name, color: game.awayTeam.primaryColor }}
              home={{ abbr: game.homeTeam.abbreviation, name: game.homeTeam.name, color: game.homeTeam.primaryColor }}
              players={data.logs.map((l) => ({
                id: l.playerId,
                name: l.name,
                team: l.teamId === data.home.teamId ? game.homeTeam.abbreviation : game.awayTeam.abbreviation,
              }))}
            />
          ))}

        {tab === 'team' &&
          (!scored || !data ? waiting : <TeamStats data={data} away={game.awayTeam} home={game.homeTeam} />)}
      </TabPanel>
    </div>
  );
}

async function PastGame({ game, standings }: { game: GameRow; standings: Standing[] }) {
  const logs = await prisma.playerGameLog.findMany({
    where: { gameId: game.id },
    include: { player: { select: { fullName: true, jersey: true } } },
    orderBy: [{ started: 'desc' }, { min: 'desc' }],
  });
  return (
    <div className="space-y-6">
      <Header game={game} standings={standings} away={{ score: game.awayScore }} home={{ score: game.homeScore }} status={game.status} />
      {logs.length === 0 && (
        <p className="panel p-6 text-sm" style={{ color: 'var(--ink-2)' }}>
          Final score from basketball-reference. Box scores go back to 1996-97; play-by-play and real shot
          charts start with 2026-27, from the NBA&apos;s feed. See the{' '}
          <Link href={`/teams/${game.awayTeam.abbreviation}?season=${game.season.key}`} className="link">
            {game.awayTeam.name}
          </Link>{' '}
          and{' '}
          <Link href={`/teams/${game.homeTeam.abbreviation}?season=${game.season.key}`} className="link">
            {game.homeTeam.name}
          </Link>{' '}
          {game.season.key} seasons for their stats.
        </p>
      )}
      {logs.length > 0 && (
        <div className="panel space-y-5 p-4">
          {[game.awayTeam, game.homeTeam].map((t) => (
            <TeamBox
              key={t.id}
              team={t}
              lines={logs
                .filter((l) => l.teamId === t.id)
                .map((l) => ({ ...l, name: l.player.fullName, jersey: l.player.jersey }))}
              benched={[]}
              final
            />
          ))}
        </div>
      )}
    </div>
  );
}
