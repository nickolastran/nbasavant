import Link from 'next/link';
import { prisma } from '@/lib/db';
import { GameCard, type Game } from '@/components/ScoreboardBar';

export const metadata = { title: 'Scores' };
export const revalidate = 60;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const shift = (day: string, n: number) => iso(new Date(Date.parse(day) + n * 864e5));

const longDate = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

/**
 * A full day's slate. Defaults to the most recent day that has games rather
 * than to today, so the page is never blank in the off-season.
 */
export default async function ScoresPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const asked = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? '') ? sp.date : null;

  const fallback = await prisma.game.findFirst({
    where: { date: { lte: new Date(`${iso(new Date())}T23:59:59Z`) } },
    orderBy: { date: 'desc' },
    select: { date: true },
  });
  const day = asked ?? (fallback ? iso(fallback.date) : iso(new Date()));

  const games = await prisma.game.findMany({
    where: { date: { gte: new Date(day), lt: new Date(Date.parse(day) + 864e5) } },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { id: 'asc' },
  });

  const records = new Map<number, string>(
    games.length
      ? (
          await prisma.teamStats.findMany({
            where: { seasonId: games[0].seasonId },
            select: { teamId: true, wins: true, losses: true },
          })
        ).map((r) => [r.teamId, `${r.wins}-${r.losses}`])
      : [],
  );

  const cards: Game[] = games.map((g) => ({
    id: g.id,
    date: day,
    status: g.status,
    home: g.homeTeam.abbreviation,
    away: g.awayTeam.abbreviation,
    homeName: `${g.homeTeam.city} ${g.homeTeam.name}`,
    awayName: `${g.awayTeam.city} ${g.awayTeam.name}`,
    homeColor: g.homeTeam.primaryColor,
    awayColor: g.awayTeam.primaryColor,
    homeScore: g.homeScore,
    awayScore: g.awayScore,
    homeRecord: records.get(g.homeTeamId) ?? '',
    awayRecord: records.get(g.awayTeamId) ?? '',
  }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold tracking-tight">{longDate(day)}</h1>
        <div className="flex gap-2">
          <Link href={`/scores?date=${shift(day, -1)}`} className="btn-ghost no-underline">
            ‹ Prev day
          </Link>
          <Link href={`/scores?date=${shift(day, 1)}`} className="btn-ghost no-underline">
            Next day ›
          </Link>
        </div>
        <Link href="/schedule" className="link ml-auto text-sm">
          Full schedule
        </Link>
      </div>

      {cards.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cards.map((g) => (
            <GameCard key={g.id} g={g} />
          ))}
        </div>
      ) : (
        <p className="panel p-6 text-sm" style={{ color: 'var(--ink-2)' }}>
          No games on {longDate(day)}.
        </p>
      )}
    </div>
  );
}
