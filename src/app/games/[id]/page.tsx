import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { AutoRefresh } from '@/components/AutoRefresh';
import { PlayByPlay } from '@/components/PlayByPlay';
import { ShotChart, type Shot } from '@/components/ShotChart';
import { StatTable, type Col } from '@/components/StatTable';
import { TeamMark } from '@/components/TeamMark';
import { Tip } from '@/components/Tip';
import { liveGame } from '@/lib/live';

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

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const game = await loadGame(id);
  if (!game) notFound();
  // From 2026-27 on a game carries the NBA's id, and its box score comes from the NBA's feed.
  return game.gameCode.startsWith('00') ? <NbaGame game={game} /> : <PastGame game={game} />;
}

function Header({
  game, away, home, status, live, extra,
}: {
  game: GameRow; away: number | null; home: number | null; status: string; live?: boolean; extra?: string | null;
}) {
  const kind = game.kind === 'preseason' ? 'Preseason' : game.kind === 'playoffs' ? 'Playoffs' : game.kind === 'play-in' ? 'Play-In' : null;
  const side = (t: GameRow['homeTeam'], score: number | null, label: string, won: boolean) => (
    <div className="flex items-center gap-3">
      <TeamMark abbr={t.abbreviation} color={t.primaryColor} size={44} />
      <div>
        <div className="eyebrow">{label}</div>
        <Link href={`/teams/${t.abbreviation}?season=${game.season.key}`} className="link text-lg font-semibold">
          {t.city} {t.name}
        </Link>
        <div className="tnum text-4xl font-bold" style={{ color: won || score === null ? 'var(--ink)' : 'var(--ink-2)' }}>
          {score ?? '—'}
        </div>
      </div>
    </div>
  );
  const final = status.startsWith('Final');
  return (
    <header className="panel overflow-hidden">
      <div className="flex h-1.5">
        <span className="flex-1" style={{ background: game.awayTeam.primaryColor }} />
        <span className="flex-1" style={{ background: game.homeTeam.primaryColor }} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-6 p-4">
        <div className="flex flex-wrap items-center gap-8">
          {side(game.awayTeam, away, 'Away', final && (away ?? 0) > (home ?? 0))}
          {side(game.homeTeam, home, 'Home', final && (home ?? 0) > (away ?? 0))}
        </div>
        <div className="text-right">
          <div className="flex items-center justify-end gap-1.5 text-sm font-semibold" style={{ color: live ? 'var(--hot)' : 'var(--ink)' }}>
            {live && <span aria-hidden className="h-2 w-2 animate-pulse rounded-full" style={{ background: 'var(--hot)' }} />}
            {live && <span className="sr-only">Live: </span>}
            <Tip day={game.date.toISOString().slice(0, 10)} status={status} />
          </div>
          <div className="text-sm" style={{ color: 'var(--ink-2)' }}>
            {longDate(game.date)}
          </div>
          <div className="eyebrow mt-1">
            {[game.season.key, kind, game.label, extra].filter(Boolean).join(' · ')}
          </div>
        </div>
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

async function NbaGame({ game }: { game: GameRow }) {
  const data = await liveGame(game.gameCode, game.status.startsWith('Final'));

  if (!data) {
    return (
      <div className="space-y-6">
        <Header game={game} away={null} home={null} status={game.status} />
        <p className="panel p-6 text-sm" style={{ color: 'var(--ink-2)' }}>
          The box score opens around tip-off. Until then:{' '}
          <Link href={`/teams/${game.awayTeam.abbreviation}`} className="link">
            {game.awayTeam.name}
          </Link>{' '}
          and{' '}
          <Link href={`/teams/${game.homeTeam.abbreviation}`} className="link">
            {game.homeTeam.name}
          </Link>{' '}
          rosters, leaders and schedules.
        </p>
        <AutoRefresh active seconds={60} />
      </div>
    );
  }

  const live = data.state === 'live';
  const periods = Math.max(4, data.home.periods.length, data.away.periods.length);
  const box = (teamId: number) =>
    data.logs
      .filter((l) => l.teamId === teamId)
      .sort((a, b) => Number(b.started) - Number(a.started) || b.min - a.min)
      .map((l) => ({
        playerId: l.playerId, name: l.name, role: l.started ? 'Starter' : '',
        min: l.min, pts: l.pts, reb: l.reb, ast: l.ast, stl: l.stl, blk: l.blk, tov: l.tov, pf: l.pf,
        fg: `${l.fgm}-${l.fga}`, fg3: `${l.fg3m}-${l.fg3a}`, ft: `${l.ftm}-${l.fta}`, plusMinus: l.plusMinus,
      }));

  return (
    <div className="space-y-6">
      <AutoRefresh active={data.state !== 'final'} seconds={live ? 15 : 60} />
      <Header
        game={game}
        away={data.state === 'pre' ? null : data.away.score}
        home={data.state === 'pre' ? null : data.home.score}
        status={data.status}
        live={live}
        extra={data.arena}
      />

      {data.state !== 'pre' && (
        <div className="panel overflow-x-auto">
          <table className="stat-table">
            <thead>
              <tr>
                <th style={{ cursor: 'default' }}>Team</th>
                {Array.from({ length: periods }, (_, i) => (
                  <th key={i} style={{ cursor: 'default' }}>
                    {i < 4 ? `Q${i + 1}` : i === 4 ? 'OT' : `${i - 3}OT`}
                  </th>
                ))}
                <th style={{ cursor: 'default' }}>T</th>
              </tr>
            </thead>
            <tbody>
              {[data.away, data.home].map((t) => (
                <tr key={t.teamId}>
                  <td className="font-semibold">{t.abbr}</td>
                  {Array.from({ length: periods }, (_, i) => (
                    <td key={i}>{t.periods[i] ?? '—'}</td>
                  ))}
                  <td className="font-bold">{t.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {[
        { t: data.away, name: `${game.awayTeam.city} ${game.awayTeam.name}` },
        { t: data.home, name: `${game.homeTeam.city} ${game.homeTeam.name}` },
      ].map(({ t, name }, i) => (
        <section key={t.teamId} id={i === 0 ? 'box' : undefined} className="scroll-mt-4">
          <h2 className="mb-2 text-lg font-bold tracking-tight">
            {name} <span className="tnum font-normal">{t.score}</span>
          </h2>
          <StatTable
            empty="Nobody has checked in yet."
            rows={box(t.teamId)}
            cols={BOX_COLS as Col<ReturnType<typeof box>[number]>[]}
            initialSort="min"
            href={{ base: '/players', key: 'playerId' }}
            filename={`box-${t.abbr}-${game.gameCode}`}
            pageSize={20}
          />
          {t.inactive.length > 0 && (
            <p className="mt-1 text-xs" style={{ color: 'var(--ink-3)' }}>
              Did not play: {t.inactive.map((p) => (p.reason ? `${p.name} (${p.reason})` : p.name)).join(', ')}
            </p>
          )}
        </section>
      ))}

      {data.state !== 'pre' && (
        <section>
          <h2 className="mb-2 text-lg font-bold tracking-tight">Team stats</h2>
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
        </section>
      )}

      <div id="gamecast" className="grid scroll-mt-4 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
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
    </div>
  );
}

async function PastGame({ game }: { game: GameRow }) {
  const logs = await prisma.playerGameLog.findMany({
    where: { gameId: game.id },
    include: { player: { select: { id: true, fullName: true } } },
    orderBy: { min: 'desc' },
  });
  return (
    <div className="space-y-6">
      <Header game={game} away={game.awayScore} home={game.homeScore} status={game.status} />
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
