import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { StatTable } from '@/components/StatTable';
import { ShotChart, type Shot } from '@/components/ShotChart';
import { PlayByPlay } from '@/components/PlayByPlay';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const game = await prisma.game.findUnique({
    where: { id: Number((await params).id) },
    include: { homeTeam: true, awayTeam: true },
  });
  return {
    title: game ? `${game.awayTeam.abbreviation} at ${game.homeTeam.abbreviation}` : 'Game',
  };
}

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isFinite(id)) notFound();

  const game = await prisma.game.findUnique({
    where: { id },
    include: {
      homeTeam: true,
      awayTeam: true,
      season: true,
      gameLogs: {
        include: { player: { select: { id: true, fullName: true, position: true } } },
        orderBy: { min: 'desc' },
      },
      plays: { orderBy: { elapsedSec: 'asc' } },
      shots: {
        select: {
          x: true, y: true, made: true, value: true, distanceFt: true, zone: true,
          actionType: true, period: true, minsLeft: true, secsLeft: true,
          player: { select: { fullName: true } },
          defender: { select: { fullName: true } },
        },
      },
    },
  });
  if (!game) notFound();

  const box = (teamId: number) =>
    game.gameLogs
      .filter((l) => l.teamId === teamId)
      .map((l) => ({
        player: l.player.fullName,
        playerId: l.player.id,
        pos: l.player.position ?? '',
        min: l.min, pts: l.pts, reb: l.reb, oreb: l.oreb, dreb: l.dreb,
        ast: l.ast, stl: l.stl, blk: l.blk, tov: l.tov, pf: l.pf,
        fg: `${l.fgm}-${l.fga}`, fg3: `${l.fg3m}-${l.fg3a}`, ft: `${l.ftm}-${l.fta}`,
        plusMinus: l.plusMinus,
      }));

  const leaders = [...game.gameLogs]
    .sort((a, b) => b.pts + b.reb + b.ast - (a.pts + a.reb + a.ast))
    .slice(0, 3);

  const boxCols = [
    { key: 'player', label: 'Player' },
    { key: 'pos', label: 'Pos' },
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
  ] as const;

  const teams = [
    { team: game.awayTeam, score: game.awayScore, label: 'Away' },
    { team: game.homeTeam, score: game.homeScore, label: 'Home' },
  ];

  return (
    <div className="space-y-6">
      <header className="panel overflow-hidden">
        <div className="flex h-1.5">
          <span className="flex-1" style={{ background: game.awayTeam.primaryColor }} />
          <span className="flex-1" style={{ background: game.homeTeam.primaryColor }} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-6 p-4">
          <div className="flex items-center gap-6">
            {teams.map(({ team, score, label }) => (
              <div key={team.id}>
                <div className="eyebrow">{label}</div>
                <div className="text-lg font-semibold">
                  {team.city} {team.name}
                </div>
                <div className="tnum text-4xl font-bold">{score}</div>
              </div>
            ))}
          </div>
          <div className="text-right">
            <div className="eyebrow">{game.season.key} · {game.status}</div>
            <div className="text-sm" style={{ color: 'var(--ink-2)' }}>
              {game.date.toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
              })}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-6 border-t px-4 py-3" style={{ borderColor: 'var(--line)' }}>
          {leaders.map((l) => (
            <div key={l.id}>
              <div className="eyebrow">
                {l.teamId === game.homeTeamId ? game.homeTeam.abbreviation : game.awayTeam.abbreviation}
              </div>
              <div className="text-sm font-medium">{l.player.fullName}</div>
              <div className="tnum text-sm" style={{ color: 'var(--ink-2)' }}>
                {l.pts} pts · {l.reb} reb · {l.ast} ast
              </div>
            </div>
          ))}
        </div>
      </header>

      {teams.map(({ team, score }) => (
        <section key={team.id}>
          <h2 className="mb-2 text-lg font-bold tracking-tight">
            {team.city} {team.name} <span className="tnum font-normal">— {score}</span>
          </h2>
          <StatTable
            rows={box(team.id)}
            cols={boxCols as any}
            initialSort="min"
            href={{ base: '/players', key: 'playerId' }}
            filename={`box-${team.abbreviation}-${game.gameCode}`}
            pageSize={20}
          />
        </section>
      ))}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <ShotChart
          shots={game.shots.map(
            (s): Shot => ({
              x: s.x, y: s.y, made: s.made, value: s.value, distanceFt: s.distanceFt,
              zone: s.zone, action: s.actionType, player: s.player.fullName,
              defender: s.defender?.fullName ?? null, period: s.period,
              clock: `${s.minsLeft}:${String(s.secsLeft).padStart(2, '0')}`,
            }),
          )}
          title="Every shot in this game"
          subtitle={`${game.awayTeam.abbreviation} at ${game.homeTeam.abbreviation}`}
        />

        <PlayByPlay
          plays={game.plays.map((p) => ({
            period: p.period, clock: p.clock, description: p.description,
            eventType: p.eventType, homeScore: p.homeScore, awayScore: p.awayScore,
            teamAbbr:
              p.teamId === game.homeTeamId
                ? game.homeTeam.abbreviation
                : p.teamId === game.awayTeamId
                  ? game.awayTeam.abbreviation
                  : '',
          }))}
        />
      </div>
    </div>
  );
}
