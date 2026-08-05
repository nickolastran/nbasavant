import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { prisma, getSeason } from '@/lib/db';
import { ShotChart, type Shot } from '@/components/ShotChart';
import { StatTable, type Col } from '@/components/StatTable';
import { TrendChart } from '@/components/TrendChart';
import { FilterBar } from '@/components/FilterBar';
import { seasonOptions } from '@/lib/options';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const player = await prisma.player.findUnique({ where: { id: Number((await params).id) } });
  return { title: player?.fullName ?? 'Player' };
}

const one = (v: number) => v.toFixed(1);
const two = (v: number) => v.toFixed(2);

export default async function PlayerPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const id = Number((await params).id);
  const sp = await searchParams;
  if (!Number.isFinite(id)) notFound();

  const player = await prisma.player.findUnique({
    where: { id },
    include: {
      team: true,
      stats: { include: { season: true }, orderBy: { season: { startYear: 'asc' } } },
      advancedStats: { include: { season: true } },
    },
  });
  if (!player) notFound();

  const active = await getSeason();
  const seasonKey = sp.season || active?.key || player.stats.at(-1)?.season.key;
  const season = player.stats.find((s) => s.season.key === seasonKey)?.season ?? active;
  const seasons = player.stats.map((s) => s.season);

  const [shots, logs] = await Promise.all([
    season
      ? prisma.shotData.findMany({
          where: { playerId: id, seasonId: season.id },
          select: {
            x: true, y: true, made: true, value: true, distanceFt: true, zone: true,
            actionType: true, period: true, minsLeft: true, secsLeft: true,
            defender: { select: { fullName: true } },
          },
        })
      : [],
    season
      ? prisma.playerGameLog.findMany({
          where: { playerId: id, seasonId: season.id },
          include: {
            game: {
              include: {
                homeTeam: { select: { abbreviation: true } },
                awayTeam: { select: { abbreviation: true } },
              },
            },
          },
          orderBy: { date: 'desc' },
        })
      : [],
  ]);

  const adv = new Map(player.advancedStats.map((a) => [a.seasonId, a]));
  const current = player.stats.find((s) => s.seasonId === season?.id);
  const currentAdv = season ? adv.get(season.id) : undefined;

  const seasonRows = player.stats.map((s) => {
    const a = adv.get(s.seasonId);
    return {
      season: s.season.key, gp: s.gp, mpg: s.gp ? s.min / s.gp : 0,
      ppg: s.ppg, rpg: s.rpg, apg: s.apg,
      fgPct: s.fgPct, fg3Pct: s.fg3Pct, ftPct: s.ftPct,
      tsPct: s.tsPct, efgPct: s.efgPct, usgPct: s.usgPct,
      per: a?.per ?? 0, ws: a?.ws ?? 0, bpm: a?.bpm ?? 0, vorp: a?.vorp ?? 0,
      ortg: a?.ortg ?? 0, drtg: a?.drtg ?? 0,
    };
  });

  const logRows = logs.map((l) => {
    const home = l.teamId === l.game.homeTeamId;
    const opp = home ? l.game.awayTeam.abbreviation : l.game.homeTeam.abbreviation;
    const won = home ? l.game.homeScore > l.game.awayScore : l.game.awayScore > l.game.homeScore;
    return {
      gameId: l.gameId,
      date: l.date.toISOString().slice(0, 10),
      matchup: `${home ? 'vs' : '@'} ${opp}`,
      result: `${won ? 'W' : 'L'} ${Math.max(l.game.homeScore, l.game.awayScore)}-${Math.min(l.game.homeScore, l.game.awayScore)}`,
      min: l.min, pts: l.pts, reb: l.reb, ast: l.ast, stl: l.stl, blk: l.blk, tov: l.tov,
      fg: `${l.fgm}-${l.fga}`, fg3: `${l.fg3m}-${l.fg3a}`, ft: `${l.ftm}-${l.fta}`,
      plusMinus: l.plusMinus,
    };
  });

  return (
    <div className="space-y-6">
      <header className="panel overflow-hidden">
        <div className="h-1.5" style={{ background: player.team?.primaryColor ?? 'var(--chrome)' }} />
        <div className="flex flex-wrap items-end justify-between gap-4 p-4">
          <div>
            <div className="eyebrow">
              {player.team ? `${player.team.city} ${player.team.name}` : 'Free agent'} · #{player.jersey} ·{' '}
              {player.position}
            </div>
            <h1 className="text-2xl font-bold tracking-tight">{player.fullName}</h1>
            <div className="mt-1 text-xs" style={{ color: 'var(--ink-2)' }}>
              {player.heightIn && `${Math.floor(player.heightIn / 12)}'${player.heightIn % 12}"`}
              {player.weightLb && ` · ${player.weightLb} lb`}
              {player.country && ` · ${player.country}`}
              {player.draftYear && ` · drafted ${player.draftYear}`}
            </div>
          </div>

          {current && (
            <dl className="flex flex-wrap gap-x-6 gap-y-2">
              {[
                ['PPG', one(current.ppg)], ['RPG', one(current.rpg)], ['APG', one(current.apg)],
                ['TS%', one(current.tsPct)], ['USG%', one(current.usgPct)],
                ['PER', currentAdv ? one(currentAdv.per) : '—'],
                ['BPM', currentAdv ? two(currentAdv.bpm) : '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="eyebrow">{label}</dt>
                  <dd className="tnum text-xl font-bold">{value}</dd>
                </div>
              ))}
            </dl>
          )}

          <Link href={`/compare?ids=${player.id}`} className="btn-ghost no-underline">
            Compare this player
          </Link>
        </div>
      </header>

      <Suspense>
        <FilterBar fields={[{ kind: 'select', name: 'season', label: 'Season', options: seasonOptions(seasons) }]} />
      </Suspense>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ShotChart
          shots={shots.map(
            (s): Shot => ({
              x: s.x, y: s.y, made: s.made, value: s.value, distanceFt: s.distanceFt,
              zone: s.zone, action: s.actionType, defender: s.defender?.fullName ?? null,
              period: s.period, clock: `${s.minsLeft}:${String(s.secsLeft).padStart(2, '0')}`,
            }),
          )}
          title={`${player.fullName} — ${seasonKey}`}
          subtitle={`${shots.length} attempts`}
        />

        <div className="space-y-5">
          <TrendChart
            title="Scoring and efficiency by season"
            data={seasonRows.map((r) => ({ label: r.season, ppg: r.ppg, tsPct: r.tsPct }))}
            series={[
              { key: 'ppg', label: 'Points per game' },
              { key: 'tsPct', label: 'True shooting %' },
            ]}
          />
          <TrendChart
            title="Value by season"
            data={seasonRows.map((r) => ({ label: r.season, per: r.per, bpm: r.bpm, ws: r.ws }))}
            series={[
              { key: 'per', label: 'PER' },
              { key: 'bpm', label: 'BPM' },
              { key: 'ws', label: 'Win shares' },
            ]}
            height={224}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold tracking-tight">Career</h2>
        <StatTable
          rows={seasonRows}
          cols={
            [
              { key: 'season', label: 'Season' },
              { key: 'gp', label: 'GP' },
              { key: 'mpg', label: 'MPG', dp: 1 },
              { key: 'ppg', label: 'PPG', dp: 1, shade: true },
              { key: 'rpg', label: 'RPG', dp: 1, shade: true },
              { key: 'apg', label: 'APG', dp: 1, shade: true },
              { key: 'fgPct', label: 'FG%', dp: 1 },
              { key: 'fg3Pct', label: '3P%', dp: 1 },
              { key: 'ftPct', label: 'FT%', dp: 1 },
              { key: 'tsPct', label: 'TS%', dp: 1, shade: true },
              { key: 'efgPct', label: 'eFG%', dp: 1 },
              { key: 'usgPct', label: 'USG%', dp: 1 },
              { key: 'per', label: 'PER', dp: 1, shade: true },
              { key: 'ortg', label: 'ORtg', dp: 1, shade: true },
              { key: 'drtg', label: 'DRtg', dp: 1, shade: true, lowerIsBetter: true },
              { key: 'ws', label: 'WS', dp: 2, shade: true },
              { key: 'bpm', label: 'BPM', dp: 2, shade: true },
              { key: 'vorp', label: 'VORP', dp: 2, shade: true },
            ] as Col<(typeof seasonRows)[number]>[]
          }
          initialSort="season"
          filename={`${player.fullName}-career`}
        />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold tracking-tight">Game log — {seasonKey}</h2>
        <StatTable
          rows={logRows}
          cols={
            [
              { key: 'date', label: 'Date' },
              { key: 'matchup', label: 'Matchup' },
              { key: 'result', label: 'Result' },
              { key: 'min', label: 'MIN', dp: 1 },
              { key: 'pts', label: 'PTS', shade: true },
              { key: 'reb', label: 'REB', shade: true },
              { key: 'ast', label: 'AST', shade: true },
              { key: 'stl', label: 'STL' },
              { key: 'blk', label: 'BLK' },
              { key: 'tov', label: 'TOV', lowerIsBetter: true, shade: true },
              { key: 'fg', label: 'FG' },
              { key: 'fg3', label: '3P' },
              { key: 'ft', label: 'FT' },
              { key: 'plusMinus', label: '+/-', shade: true },
            ] as Col<(typeof logRows)[number]>[]
          }
          initialSort="date"
          href={{ base: '/games', key: 'gameId' }}
          filename={`${player.fullName}-gamelog-${seasonKey}`}
          pageSize={25}
        />
      </section>
    </div>
  );
}
