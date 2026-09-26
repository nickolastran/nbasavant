import Link from 'next/link';
import { prisma } from '@/lib/db';
import { LiveCards } from '@/components/LiveCards';
import type { Game } from '@/components/ScoreboardBar';
import { shiftDay, todayEt } from '@/lib/dates';

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

  // Season-to-date records; the live feed replaces them with today's for today's games.
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
    homeRecord: records.get(g.homeTeamId) ?? '',
    awayRecord: records.get(g.awayTeamId) ?? '',
  }));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold tracking-tight">{longDate(day)}</h1>
        {day === today && <span className="eyebrow" style={{ color: 'var(--accent)' }}>Today</span>}
        <div className="flex gap-2">
          <Link href={`/scores?date=${shiftDay(day, -1)}`} className="btn-ghost no-underline">
            ‹ Prev day
          </Link>
          <Link href={`/scores?date=${shiftDay(day, 1)}`} className="btn-ghost no-underline">
            Next day ›
          </Link>
          {day !== today && (
            <Link href={`/scores?date=${today}`} className="btn-ghost no-underline">
              Today
            </Link>
          )}
        </div>
        <Link href="/schedule" className="link ml-auto text-sm">
          Full schedule
        </Link>
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
