import { Suspense } from 'react';
import Link from 'next/link';
import { prisma, getSeason } from '@/lib/db';
import { ComparePicker } from '@/components/ComparePicker';
import { ShotChart, type Shot } from '@/components/ShotChart';
import { TrendChart } from '@/components/TrendChart';
import { FilterBar } from '@/components/FilterBar';
import { seasonOptions } from '@/lib/options';

export const metadata = { title: 'Compare Players' };
export const revalidate = 60;

const SERIES_COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];

const ROWS = [
  { key: 'gp', label: 'Games', dp: 0 },
  { key: 'mpg', label: 'Minutes per game', dp: 1 },
  { key: 'ppg', label: 'Points per game', dp: 1 },
  { key: 'rpg', label: 'Rebounds per game', dp: 1 },
  { key: 'apg', label: 'Assists per game', dp: 1 },
  { key: 'fgPct', label: 'Field goal %', dp: 1 },
  { key: 'fg3Pct', label: 'Three point %', dp: 1 },
  { key: 'ftPct', label: 'Free throw %', dp: 1 },
  { key: 'tsPct', label: 'True shooting %', dp: 1 },
  { key: 'usgPct', label: 'Usage %', dp: 1 },
  { key: 'per', label: 'PER', dp: 1 },
  { key: 'ortg', label: 'Offensive rating', dp: 1 },
  { key: 'drtg', label: 'Defensive rating', dp: 1, lowerIsBetter: true },
  { key: 'ws', label: 'Win shares', dp: 2 },
  { key: 'bpm', label: 'Box plus/minus', dp: 2 },
  { key: 'vorp', label: 'VORP', dp: 2 },
] as const;

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const ids = (sp.ids ?? '')
    .split(',')
    .map(Number)
    .filter(Number.isFinite)
    .slice(0, 4);

  const active = await getSeason();
  const seasonKey = sp.season || active?.key;
  const seasons = await prisma.season.findMany({ orderBy: { startYear: 'desc' } });
  const season = seasons.find((s) => s.key === seasonKey);

  const players = ids.length
    ? await prisma.player.findMany({
        where: { id: { in: ids } },
        include: {
          team: true,
          stats: { include: { season: true }, orderBy: { season: { startYear: 'asc' } } },
          advancedStats: true,
        },
      })
    : [];

  // Keep the order the user picked, not the database's.
  players.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));

  const shotsByPlayer =
    season && players.length
      ? await Promise.all(
          players.map((p) =>
            prisma.shotData.findMany({
              where: { playerId: p.id, seasonId: season.id },
              select: {
                x: true, y: true, made: true, value: true, distanceFt: true, zone: true,
                actionType: true,
              },
            }),
          ),
        )
      : [];

  const cards = players.map((p, i) => {
    const s = p.stats.find((x) => x.season.key === seasonKey);
    const a = p.advancedStats.find((x) => x.seasonId === s?.seasonId);
    return {
      id: p.id,
      name: p.fullName,
      team: p.team?.abbreviation ?? '',
      color: SERIES_COLORS[i],
      teamColor: p.team?.primaryColor ?? 'var(--chrome)',
      pos: p.position ?? '',
      values: {
        gp: s?.gp ?? 0, mpg: s && s.gp ? s.min / s.gp : 0,
        ppg: s?.ppg ?? 0, rpg: s?.rpg ?? 0, apg: s?.apg ?? 0,
        fgPct: s?.fgPct ?? 0, fg3Pct: s?.fg3Pct ?? 0, ftPct: s?.ftPct ?? 0,
        tsPct: s?.tsPct ?? 0, usgPct: s?.usgPct ?? 0,
        per: a?.per ?? 0, ortg: a?.ortg ?? 0, drtg: a?.drtg ?? 0,
        ws: a?.ws ?? 0, bpm: a?.bpm ?? 0, vorp: a?.vorp ?? 0,
      } as Record<string, number>,
      seasons: p.stats.map((x) => ({ key: x.season.key, ppg: x.ppg, tsPct: x.tsPct })),
    };
  });

  const trendSeasons = [...new Set(cards.flatMap((c) => c.seasons.map((s) => s.key)))].sort();
  const trendData = trendSeasons.map((key) => {
    const row: Record<string, string | number> = { label: key };
    for (const c of cards) row[`p${c.id}`] = c.seasons.find((s) => s.key === key)?.ppg ?? 0;
    return row;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-xl font-bold tracking-tight">Compare players</h1>
        <p className="mb-4 text-sm" style={{ color: 'var(--ink-2)' }}>
          Up to four players, {seasonKey} season. The better value in each row is bold.
        </p>
        <Suspense>
          <ComparePicker selected={cards.map((c) => ({ id: c.id, name: c.name, color: c.color }))} />
          <FilterBar fields={[{ kind: 'select', name: 'season', label: 'Season', options: seasonOptions(seasons) }]} />
        </Suspense>
      </div>

      {!cards.length ? (
        <div className="panel p-8 text-center">
          <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
            Add a player above to start, or{' '}
            <Link href="/players" className="link">
              pick one from the player list
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <div className="panel overflow-x-auto">
            <table className="stat-table">
              <thead>
                <tr>
                  <th scope="col" style={{ textAlign: 'left' }}>
                    Stat
                  </th>
                  {cards.map((c) => (
                    <th key={c.id} scope="col">
                      <span className="flex items-center justify-end gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                        {c.name} · {c.team}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => {
                  const vals = cards.map((c) => c.values[r.key]);
                  const best =
                    'lowerIsBetter' in r && r.lowerIsBetter
                      ? Math.min(...vals.filter((v) => v > 0))
                      : Math.max(...vals);
                  return (
                    <tr key={r.key}>
                      <td style={{ textAlign: 'left' }}>{r.label}</td>
                      {cards.map((c, i) => (
                        <td
                          key={c.id}
                          style={{
                            fontWeight: vals[i] === best && cards.length > 1 ? 700 : 400,
                            color: vals[i] === best && cards.length > 1 ? 'var(--hot)' : undefined,
                          }}
                        >
                          {c.values[r.key].toFixed(r.dp)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {cards.length > 1 && (
            <TrendChart
              title="Points per game by season"
              data={trendData}
              series={cards.map((c) => ({ key: `p${c.id}`, label: c.name }))}
              height={280}
            />
          )}

          <div className="grid gap-5 md:grid-cols-2">
            {cards.map((c, i) => (
              <ShotChart
                key={c.id}
                shots={(shotsByPlayer[i] ?? []).map(
                  (s): Shot => ({
                    x: s.x, y: s.y, made: s.made, value: s.value,
                    distanceFt: s.distanceFt, zone: s.zone, action: s.actionType,
                    player: c.name,
                  }),
                )}
                title={c.name}
                subtitle={`${c.team} · ${seasonKey} · ${(shotsByPlayer[i] ?? []).length} attempts`}
                height={420}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
