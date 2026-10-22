import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { AutoRefresh } from '@/components/AutoRefresh';
import { PlayByPlay } from '@/components/PlayByPlay';
import { ShotChart, type Shot } from '@/components/ShotChart';
import { StatTable, type Col } from '@/components/StatTable';
import { TeamMark } from '@/components/TeamMark';
import { Tip } from '@/components/Tip';
import { seasonStandings, type Standing } from '@/lib/db';
import { liveGame } from '@/lib/live';
import type { Broadcast } from '@/lib/nba';
import { GameTab, type GameInfo } from './game-tab';

export const revalidate = 10;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const game = await prisma.game.findUnique({
    where: { id: Number((await params).id) || 0 },
    include: { homeTeam: true, awayTeam: true },
  });
  return { title: game ? `${game.awayTeam.abbreviation} at ${game.homeTeam.abbreviation}` : 'Game' };
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

function Tabs({ current }: { current: string }) {
  return (
    <nav className="flex overflow-x-auto border-b" style={{ borderColor: 'var(--line)' }} aria-label="Game">
      {TABS.map((t) => {
        const active = t.value === current;
        return (
          <Link
            key={t.value}
            href={t.value ? `?tab=${t.value}` : '?'}
            aria-current={active ? 'page' : undefined}
            scroll={false}
            className="-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] no-underline"
            style={{ borderColor: active ? 'var(--ink)' : 'transparent', color: active ? 'var(--ink)' : 'var(--ink-2)' }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

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

const BOX_COLS = [
  { key: 'name', label: 'Player' },
  { key: 'role', label: '' },
  { key: 'min', label: 'MIN', dp: 1 },
  { key: 'pts', label: 'PTS', shade: true },
  { key: 'reb', label: 'REB', shade: true },
  { key: 'ast', label: 'AST', shade: true },
  { key: 'stl', label: 'STL' },
  { key: 'blk', label: 'BLK' },
  { key: 'tov', label: 'TOV', lowerIsBetter: true },
  { key: 'pf', label: 'PF', lowerIsBetter: true },
  { key: 'fg', label: 'FG' },
  { key: 'fg3', label: '3P' },
  { key: 'ft', label: 'FT' },
  { key: 'plusMinus', label: '+/-', shade: true },
];

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

  const box = (teamId: number) =>
    (data?.logs ?? [])
      .filter((l) => l.teamId === teamId)
      .sort((a, b) => Number(b.started) - Number(a.started) || b.min - a.min)
      .map((l) => ({
        playerId: l.playerId, name: l.name, role: l.started ? 'Starter' : '',
        min: l.min, pts: l.pts, reb: l.reb, ast: l.ast, stl: l.stl, blk: l.blk, tov: l.tov, pf: l.pf,
        fg: `${l.fgm}-${l.fga}`, fg3: `${l.fg3m}-${l.fg3a}`, ft: `${l.ftm}-${l.fta}`, plusMinus: l.plusMinus,
      }));
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
      <Tabs current={tab} />

      {tab === '' && <GameTab game={info} data={data} standings={standings} />}

      {tab === 'box' &&
        (!data
          ? waiting
          : [
              { t: data.away, team: game.awayTeam },
              { t: data.home, team: game.homeTeam },
            ].map(({ t, team }) => (
              <section key={t.teamId}>
                <h2 className="mb-2 flex items-center gap-2 text-lg font-bold tracking-tight">
                  <TeamMark abbr={team.abbreviation} color={team.primaryColor} size={26} />
                  {team.city} {team.name} <span className="tnum font-normal">{scored ? t.score : ''}</span>
                </h2>
                <StatTable
                  empty="Nobody has checked in yet."
                  rows={box(t.teamId)}
                  cols={BOX_COLS as Col<ReturnType<typeof box>[number]>[]}
                  initialSort="min"
                  href={{ base: '/players', key: 'playerId' }}
                  photo="playerId"
                  tall
                  filename={`box-${t.abbr}-${game.gameCode}`}
                  pageSize={20}
                />
                {t.inactive.length > 0 && (
                  <p className="mt-1 text-xs" style={{ color: 'var(--ink-3)' }}>
                    Did not play: {t.inactive.map((p) => (p.reason ? `${p.name} (${p.reason})` : p.name)).join(', ')}
                  </p>
                )}
              </section>
            )))}

      {tab === 'pbp' &&
        (!data
          ? waiting
          : (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <ShotChart
                  shots={data.shots.map(
                    (s): Shot => ({
                      x: s.x, y: s.y, made: s.made, value: s.value, distanceFt: s.distanceFt,
                      zone: s.zone, action: s.actionType, player: s.player, period: s.period,
                      clock: `${s.minsLeft}:${String(s.secsLeft).padStart(2, '0')}`,
                    }),
                  )}
                  title="Every shot in this game"
                  subtitle={`${data.shots.length} attempts, from the NBA's play-by-play`}
                />
                {/* Newest first while it's live; in order once it's over. */}
                <PlayByPlay plays={live ? [...data.plays].reverse() : data.plays} />
              </div>
            ))}

      {tab === 'team' &&
        (!scored
          ? waiting
          : (
              <div className="panel overflow-x-auto">
                <table className="stat-table">
                  <thead>
                    <tr>
                      <th style={{ cursor: 'default' }}>Stat</th>
                      <th style={{ cursor: 'default' }}>{data.away.abbr}</th>
                      <th style={{ cursor: 'default' }}>{data.home.abbr}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.away.stats.map((s, i) => {
                      const h = data.home.stats[i];
                      const show = (x: typeof s) => (x.pct === null ? x.text : `${x.text} (${x.pct.toFixed(1)}%)`);
                      return (
                        <tr key={s.label}>
                          <td>{s.label}</td>
                          <td>{show(s)}</td>
                          <td>{show(h)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
    </div>
  );
}

async function PastGame({ game, standings }: { game: GameRow; standings: Standing[] }) {
  const logs = await prisma.playerGameLog.findMany({
    where: { gameId: game.id },
    include: { player: { select: { id: true, fullName: true } } },
    orderBy: { min: 'desc' },
  });
  return (
    <div className="space-y-6">
      <Header game={game} standings={standings} away={{ score: game.awayScore }} home={{ score: game.homeScore }} status={game.status} />
      {logs.length === 0 && (
        <p className="panel p-6 text-sm" style={{ color: 'var(--ink-2)' }}>
          Final score from basketball-reference. Box scores, play-by-play and real shot charts start with
          2026-27, from the NBA&apos;s feed. See the{' '}
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
      {[game.awayTeam, game.homeTeam].map((t) => {
        const rows = logs
          .filter((l) => l.teamId === t.id)
          .map((l) => ({
            playerId: l.player.id, name: l.player.fullName, role: l.started ? 'Starter' : '',
            min: l.min, pts: l.pts, reb: l.reb, ast: l.ast, stl: l.stl, blk: l.blk, tov: l.tov, pf: l.pf,
            fg: `${l.fgm}-${l.fga}`, fg3: `${l.fg3m}-${l.fg3a}`, ft: `${l.ftm}-${l.fta}`, plusMinus: l.plusMinus,
          }));
        return rows.length ? (
          <section key={t.id}>
            <h2 className="mb-2 text-lg font-bold tracking-tight">
              {t.city} {t.name}
            </h2>
            <StatTable
              rows={rows}
              cols={BOX_COLS as Col<(typeof rows)[number]>[]}
              initialSort="min"
              href={{ base: '/players', key: 'playerId' }}
              filename={`box-${t.abbreviation}-${game.gameCode}`}
              pageSize={20}
            />
          </section>
        ) : null;
      })}
    </div>
  );
}
