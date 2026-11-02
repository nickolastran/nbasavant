import Link from 'next/link';
import { Suspense } from 'react';
import { byRecord, prisma, seasonStandings } from '@/lib/db';
import { bracket, type BracketTeam, type Series } from '@/lib/bracket';
import { FilterBar } from '@/components/FilterBar';
import { TeamMark } from '@/components/TeamMark';
import { seasonOptions } from '@/lib/options';

export const revalidate = 60;

export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { season } = await searchParams;
  return { title: `NBA Playoffs ${season ?? ''}`.trim() };
}

const ROUNDS = ['First Round', 'Conference Semifinals', 'Conference Finals'];
const shortDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export default async function PlayoffsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  // Only seasons with a playoff (or play-in) game to show; this one joins in April.
  const seasons = await prisma.season.findMany({
    where: { games: { some: { kind: { in: ['playoffs', 'play-in'] } } } },
    orderBy: { startYear: 'desc' },
  });
  const season = seasons.find((s) => s.key === sp.season) ?? seasons[0];

  const [games, standings, newest] = season
    ? await Promise.all([
        prisma.game.findMany({ where: { seasonId: season.id, kind: { in: ['playoffs', 'play-in'] } }, orderBy: { date: 'asc' } }),
        seasonStandings(season.id),
        prisma.season.findFirst({ orderBy: { startYear: 'desc' } }),
      ])
    : [[], [], null];
  // ponytail: division winner by record alone, no tiebreakers.
  const leaders = new Set(
    [...new Set(standings.map((r) => r.division))].map((d) => standings.filter((r) => r.division === d).sort(byRecord)[0].teamId),
  );
  const teams = new Map<number, BracketTeam>(
    standings.map((r) => [
      r.teamId,
      { id: r.teamId, abbr: r.abbr, name: r.name, color: r.color, conference: r.conference, pct: r.pct, divisionWinner: leaders.has(r.teamId) },
    ]),
  );
  const asGame = (g: (typeof games)[number]) => ({
    id: g.id, date: g.date, home: g.homeTeamId, away: g.awayTeamId, homeScore: g.homeScore, awayScore: g.awayScore, status: g.status,
  });
  const b = bracket(games.filter((g) => g.kind === 'playoffs').map(asGame), teams, {
    live: season?.id === newest?.id,
    divisionSeeds: !!season && season.startYear >= 2004 && season.startYear <= 2014,
  });
  const playIn = games.filter((g) => g.kind === 'play-in');
  const champ = b.finals?.winner ? teams.get(b.finals.winner) : null;
  const [winner, loser] = b.finals?.top.team.id === b.finals?.winner ? [b.finals?.top, b.finals?.bottom] : [b.finals?.bottom, b.finals?.top];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold tracking-tight">NBA Playoffs {season?.key}</h1>
        <Suspense>
          <FilterBar
            bare
            fields={[{ kind: 'select', name: 'season', label: 'Season', defaultValue: season?.key, options: seasonOptions(seasons) }]}
          />
        </Suspense>
      </div>

      {champ && b.finals && (
        <div className="panel flex items-center gap-3 p-3" style={{ borderLeft: `4px solid ${champ.color}` }}>
          <TeamMark abbr={champ.abbr} color={champ.color} size={36} />
          <div>
            <div className="eyebrow">Champion</div>
            <div className="font-bold">
              {champ.name}{' '}
              <span className="font-normal" style={{ color: 'var(--ink-2)' }}>
                def. {loser!.team.name}, {winner!.wins}-{loser!.wins}
              </span>
            </div>
          </div>
        </div>
      )}

      {!b.rounds.length && !playIn.length && (
        <p className="text-sm" style={{ color: 'var(--ink-2)' }}>
          No playoff games on record yet.
        </p>
      )}

      {b.halves ? (
        // East on the left, West on the right, the Finals between them. Scrolls sideways on a phone.
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[1100px] grid-cols-7 gap-3">
            {[...ROUNDS, 'NBA Finals', ...ROUNDS.slice().reverse()].map((r, i) => (
              <div key={i} className="eyebrow text-center">
                {i === 3 ? r : `${b.halves![i < 3 ? 0 : 1].conference} · ${r.replace('Conference ', '')}`}
              </div>
            ))}
            {[...b.halves[0].rounds, [b.finals], ...b.halves[1].rounds.slice().reverse()].map((col, i) => (
              <div key={i} className="flex flex-col justify-around gap-3">
                {col.map((s, j) => (
                  <SeriesCard key={j} s={s} />
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        b.rounds.length > 0 && (
          <div className="overflow-x-auto pb-2">
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${b.rounds.length}, minmax(13rem, 1fr))` }}>
              {b.rounds.map((r, i) => (
                <div key={i} className="eyebrow text-center">
                  {i === b.rounds.length - 1 ? 'Finals' : i === b.rounds.length - 2 && i > 0 ? 'Semifinals' : `Round ${i + 1}`}
                </div>
              ))}
              {b.rounds.map((r, i) => (
                <div key={i} className="flex flex-col justify-around gap-3">
                  {r.map((s, j) => (
                    <SeriesCard key={j} s={s} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {playIn.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-bold tracking-tight">Play-In Tournament</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {playIn.map((g) => {
              const [away, home] = [teams.get(g.awayTeamId), teams.get(g.homeTeamId)];
              const final = g.status.startsWith('Final');
              return (
                <Link key={g.id} href={`/games/${g.id}`} className="panel p-2.5 text-sm no-underline hover:bg-[var(--panel-2)]" style={{ color: 'var(--ink)' }}>
                  <div className="eyebrow mb-1">
                    {away?.conference} · {shortDay(g.date)}
                  </div>
                  {final ? `${away?.abbr} ${g.awayScore}, ${home?.abbr} ${g.homeScore}` : `${away?.abbr} at ${home?.abbr} · ${g.status}`}
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/** "OKC wins 4-3", "BOS leads 2-1", "Tied 1-1", or when game 1 is. */
function status(s: Series) {
  const [hi, lo] = s.top.wins >= s.bottom.wins ? [s.top, s.bottom] : [s.bottom, s.top];
  if (s.winner) return `${hi.team.abbr} wins ${hi.wins}-${lo.wins}`;
  if (!hi.wins) return `Game 1 · ${shortDay(s.games[0].date)}`;
  return hi.wins === lo.wins ? `Tied ${hi.wins}-${lo.wins}` : `${hi.team.abbr} leads ${hi.wins}-${lo.wins}`;
}

/** One series: seeds, teams, wins, and a link to its latest game (or its next one). */
function SeriesCard({ s }: { s: Series | null }) {
  if (!s) {
    return (
      <div className="flex h-[84px] items-center justify-center rounded border border-dashed text-xs" style={{ borderColor: 'var(--line-2)', color: 'var(--ink-3)' }}>
        TBD
      </div>
    );
  }
  const game = s.games.filter((g) => g.status.startsWith('Final')).at(-1) ?? s.games[0];
  return (
    <Link href={`/games/${game.id}`} className="panel block p-2.5 no-underline transition-colors hover:bg-[var(--panel-2)]" style={{ color: 'var(--ink)' }}>
      {[s.top, s.bottom].map((x) => {
        const out = s.winner !== null && s.winner !== x.team.id;
        return (
          <div key={x.team.id} className="flex items-center gap-2 py-0.5 text-sm" style={{ opacity: out ? 0.55 : 1 }}>
            <span className="tnum w-3 text-right text-[0.6875rem]" style={{ color: 'var(--ink-3)' }}>
              {x.seed ?? ''}
            </span>
            <TeamMark abbr={x.team.abbr} color={x.team.color} size={20} />
            <span title={x.team.name} style={{ fontWeight: s.winner === x.team.id ? 700 : 600 }}>
              {x.team.abbr}
            </span>
            <span className="tnum ml-auto" style={{ fontWeight: s.winner === x.team.id ? 700 : 400 }}>
              {x.wins}
            </span>
          </div>
        );
      })}
      <div className="mt-1 border-t pt-1 text-[0.6875rem]" style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}>
        {status(s)}
      </div>
    </Link>
  );
}
