'use client';

import { GameCard, useLive, type Game } from '@/components/ScoreboardBar';

/** A day's cards on /scores, following the live feed when the day is today. */
export function LiveCards({ games, date }: { games: Game[]; date: string }) {
  const shown = useLive(games, date);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {shown.map((g) => (
        <GameCard key={g.id} g={g} leaders />
      ))}
    </div>
  );
}
