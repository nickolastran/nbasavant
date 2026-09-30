import { prisma } from '@/lib/db';
import { LiveCards, ScoresDate } from '@/components/LiveCards';
import type { Game } from '@/components/ScoreboardBar';
import { shiftDay, todayEt } from '@/lib/dates';
import type { GameLeaders } from '@/lib/nba';

export const metadata = { title: 'Scores' };
export const revalidate = 60;

const longDate = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

/**
 * A full day's slate. Defaults to today (New York's today) when there are
 * games, otherwise the next day that has some, otherwise the last one played.
 * Today's cards follow the live feed; the rest come from the database.
 */
export default async function ScoresPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const today = todayEt();
  const asked = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? sp.date : null;

  const nearest = asked
    ? null
    : (await prisma.game.findFirst({
        where: { date: { gte: new Date(`${today}T00:00:00Z`) } },
        orderBy: { date: 'asc' },
        select: { date: true },
      })) ??
      (await prisma.game.findFirst({ orderBy: { date: 'desc' }, select: { date: true } }));
  const day = asked ?? (nearest ? nearest.date.toISOString().slice(0, 10) : today);

  const games = await prisma.game.findMany({
    where: { date: { gte: new Date(`${day}T00:00:00Z`), lt: new Date(`${shiftDay(day, 1)}T00:00:00Z`) } },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { id: 'asc' },
  });

  // Each team's regular-season record as of this day: after its game once that's
  // final, going in before tip-off. The live feed replaces them for today's games.
  const record = new Map<number, [number, number]>();
  if (games.length) {
    const played = await prisma.game.findMany({
      where: { seasonId: games[0].seasonId, kind: 'regular', status: { startsWith: 'Final' }, date: { lt: new Date(`${shiftDay(day, 1)}T00:00:00Z`) } },
      select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
    });
    for (const g of played) {
      const [winner, loser] = g.homeScore > g.awayScore ? [g.homeTeamId, g.awayTeamId] : [g.awayTeamId, g.homeTeamId];
      const w = record.get(winner) ?? [0, 0];
      const l = record.get(loser) ?? [0, 0];
      record.set(winner, [w[0] + 1, w[1]]);
      record.set(loser, [l[0], l[1] + 1]);
    }
  }
  const recordOf = (teamId: number) => (record.get(teamId) ?? [0, 0]).join('-');

  const cards: Game[] = games.map((g) => ({
    id: g.id,
    gameCode: g.gameCode,
    date: day,
    status: g.status,
    kind: g.kind,
    label: g.label,
    home: g.homeTeam.abbreviation,
    away: g.awayTeam.abbreviation,
    homeName: `${g.homeTeam.city} ${g.homeTeam.name}`,
    awayName: `${g.awayTeam.city} ${g.awayTeam.name}`,
    homeColor: g.homeTeam.primaryColor,
    awayColor: g.awayTeam.primaryColor,
    homeScore: g.homeScore,
    awayScore: g.awayScore,
    homeRecord: recordOf(g.homeTeamId),
    awayRecord: recordOf(g.awayTeamId),
    homeLine: g.homeLine,
    awayLine: g.awayLine,
    homeLeader: (g.leaders as GameLeaders | null)?.home,
    awayLeader: (g.leaders as GameLeaders | null)?.away,
  }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold tracking-tight">Scoreboard</h1>
        <ScoresDate date={day} />
        {day === today && <span className="eyebrow" style={{ color: 'var(--accent)' }}>Today</span>}
      </div>

      {cards.length ? (
        <LiveCards games={cards} date={day} />
      ) : (
        <p className="panel p-6 text-sm" style={{ color: 'var(--ink-2)' }}>
          No games on {longDate(day)}.
        </p>
      )}
    </div>
  );
}
