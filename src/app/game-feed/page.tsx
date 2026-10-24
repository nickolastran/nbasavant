import { prisma } from '@/lib/db';
import { LeaderBoard, type Board } from '@/components/LeaderBoard';
import { todayEt } from '@/lib/dates';
import { gameScore, tsPct } from '@/lib/stats';
import { FeedDate } from './date';

export const metadata = { title: 'Game Feed' };
export const revalidate = 60;

type Log = Awaited<ReturnType<typeof logsOn>>[number];

const logsOn = (gameIds: number[]) =>
  prisma.playerGameLog.findMany({
    where: { gameId: { in: gameIds } },
    include: {
      player: { select: { fullName: true } },
      team: { select: { abbreviation: true, primaryColor: true } },
    },
  });

const signed = (v: number) => (v > 0 ? `+${v}` : String(v));

/**
 * Each board: what it ranks, how it prints, and who's eligible. Counting
 * stats need at least one; true shooting needs 10 shots so a 2-for-2 cameo
 * can't top it.
 */
const BOARDS: { key: string; label: string; note?: string; of: (l: Log) => number; fmt?: (v: number) => string; min?: (l: Log) => boolean }[] = [
  { key: 'pts', label: 'Points', of: (l) => l.pts },
  { key: 'reb', label: 'Rebounds', of: (l) => l.reb },
  { key: 'ast', label: 'Assists', of: (l) => l.ast },
  { key: 'gmsc', label: 'Game Score', of: (l) => gameScore(l), fmt: (v) => v.toFixed(1) },
  { key: 'fg3m', label: 'Threes made', of: (l) => l.fg3m },
  { key: 'stl', label: 'Steals', of: (l) => l.stl },
  { key: 'blk', label: 'Blocks', of: (l) => l.blk },
  { key: 'pm', label: 'Plus/minus', of: (l) => l.plusMinus, fmt: signed, min: () => true },
  { key: 'ts', label: 'True shooting %', note: '10+ shots', of: (l) => tsPct(l), fmt: (v) => `${v.toFixed(1)}%`, min: (l) => l.fga >= 10 },
  { key: 'ftm', label: 'Free throws made', of: (l) => l.ftm },
  { key: 'oreb', label: 'Offensive rebounds', of: (l) => l.oreb },
];

/**
 * The best single-game lines of one day, from every game that's gone final:
 * a dozen boards of the day's top five. Opens on the latest day with a final.
 */
export default async function GameFeedPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const latest = await prisma.playerGameLog.findFirst({
    where: { date: { lte: new Date(`${todayEt()}T23:59:59Z`) } },
    orderBy: { date: 'desc' },
    select: { date: true },
  });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? sp.date : (latest?.date.toISOString().slice(0, 10) ?? todayEt());

  const games = await prisma.game.findMany({
    where: { date: { gte: new Date(`${date}T00:00:00Z`), lt: new Date(Date.parse(`${date}T00:00:00Z`) + 864e5) } },
    select: { id: true },
  });
  const ids = games.map((g) => g.id);
  const [logs, shots] = await Promise.all([
    logsOn(ids),
    // Longest makes first; a player keeps only his longest below.
    prisma.shotData.findMany({
      where: { gameId: { in: ids }, made: true },
      orderBy: { distanceFt: 'desc' },
      take: 30,
      include: {
        player: { select: { fullName: true } },
        team: { select: { abbreviation: true, primaryColor: true } },
      },
    }),
  ]);

  const row = (l: { playerId: number; player: { fullName: string }; team: { abbreviation: string; primaryColor: string } }, value: string) => ({
    playerId: l.playerId,
    name: l.player.fullName,
    abbr: l.team.abbreviation,
    color: l.team.primaryColor,
    value,
  });

  const empty = 'No finals on this day.';
  const boards: Board[] = BOARDS.map((b) => ({
    key: b.key,
    label: b.label,
    note: b.note ?? '',
    empty,
    rows: logs
      .filter((l) => (b.min ? b.min(l) : b.of(l) > 0))
      .sort((x, y) => b.of(y) - b.of(x) || y.pts - x.pts)
      .slice(0, 5)
      .map((l) => row(l, (b.fmt ?? String)(b.of(l)))),
  }));
  const seen = new Set<number>();
  boards.push({
    key: 'long',
    label: 'Longest made shot',
    note: '',
    empty,
    rows: shots
      .filter((s) => !seen.has(s.playerId) && seen.add(s.playerId))
      .slice(0, 5)
      .map((s) => row(s, `${s.distanceFt} ft`)),
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight">Game Feed</h1>
        <FeedDate date={date} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {boards.map((b) => (
          <LeaderBoard key={b.key} board={b} />
        ))}
      </div>
    </div>
  );
}
