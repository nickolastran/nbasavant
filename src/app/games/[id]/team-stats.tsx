import { TeamMark } from '@/components/TeamMark';
import { clockParts } from '@/lib/nba';
import type { Live } from './game-tab';

type Team = { abbreviation: string; primaryColor: string };
type Totals = Live['home']['totals'];

const n = (t: Totals, k: string) => Number(t[k] ?? 0);
const pct = (t: Totals, k: string) => Math.round(n(t, k) * 100);
/** "PT18M04.00S" in seconds. */
const secs = (iso: unknown) => {
  const { min, sec } = clockParts(String(iso ?? ''));
  return min * 60 + sec;
};

/**
 * The two teams' box score numbers, one stat a row, details indented under the
 * stat they break down. Rebounds are the players' (offensive plus defensive),
 * matching the box score's team line; flagrant fouls aren't in the box score,
 * so they're counted from the play-by-play.
 */
export function TeamStats({ data, away, home }: { data: Live; away: Team; home: Team }) {
  const flagrants = (abbr: string) =>
    data.plays.filter((p) => p.type === 'foul' && /flagrant/i.test(p.subType) && p.teamAbbr === abbr).length;
  // A team's minutes are its five players' together, so a fifth of them is the game clock so far.
  const ledPct = (t: Totals) => {
    const played = secs(t.minutes) / 5;
    return played ? Math.round((secs(t.timeLeading) / played) * 100) : 0;
  };
  const rows: { label: string; sub?: boolean; get: (us: Totals, them: Totals, abbr: string) => string | number }[] = [
    { label: 'FG', get: (t) => `${n(t, 'fieldGoalsMade')}-${n(t, 'fieldGoalsAttempted')}` },
    { label: 'Field Goal %', get: (t) => pct(t, 'fieldGoalsPercentage') },
    { label: '3PT', get: (t) => `${n(t, 'threePointersMade')}-${n(t, 'threePointersAttempted')}` },
    { label: 'Three Point %', get: (t) => pct(t, 'threePointersPercentage') },
    { label: 'FT', get: (t) => `${n(t, 'freeThrowsMade')}-${n(t, 'freeThrowsAttempted')}` },
    { label: 'Free Throw %', get: (t) => pct(t, 'freeThrowsPercentage') },
    { label: 'Rebounds', get: (t) => n(t, 'reboundsOffensive') + n(t, 'reboundsDefensive') },
    { label: 'Offensive Rebounds', sub: true, get: (t) => n(t, 'reboundsOffensive') },
    { label: 'Defensive Rebounds', sub: true, get: (t) => n(t, 'reboundsDefensive') },
    { label: 'Assists', get: (t) => n(t, 'assists') },
    { label: 'Steals', get: (t) => n(t, 'steals') },
    { label: 'Blocks', get: (t) => n(t, 'blocks') },
    { label: 'Total Turnovers', get: (t) => n(t, 'turnoversTotal') },
    { label: 'Points Conceded Off Turnovers', sub: true, get: (_, them) => n(them, 'pointsFromTurnovers') },
    { label: 'Fast Break Points', get: (t) => n(t, 'pointsFastBreak') },
    { label: 'Points in Paint', get: (t) => n(t, 'pointsInThePaint') },
    { label: 'Second Chance Points', get: (t) => n(t, 'pointsSecondChance') },
    { label: 'Bench Points', get: (t) => n(t, 'benchPoints') },
    { label: 'Fouls', get: (t) => n(t, 'foulsPersonal') },
    { label: 'Technical Fouls', sub: true, get: (t) => n(t, 'foulsTechnical') + n(t, 'foulsTeamTechnical') },
    { label: 'Flagrant Fouls', sub: true, get: (_, __, abbr) => flagrants(abbr) },
    { label: 'Largest Lead', get: (t) => n(t, 'biggestLead') },
    { label: 'Percent Led', get: (t) => ledPct(t) },
  ];
  return (
    <section className="panel mx-auto max-w-4xl p-4">
      <h2 className="mb-1 border-b pb-2 text-[0.6875rem] font-bold uppercase tracking-[0.12em]" style={{ borderColor: 'var(--line)' }}>
        Team stats
      </h2>
      <table className="tnum w-full text-sm">
        <thead>
          <tr className="border-b" style={{ borderColor: 'var(--line-2)' }}>
            <th className="py-2 text-left">
              <span className="sr-only">Stat</span>
            </th>
            {[away, home].map((t) => (
              <th key={t.abbreviation} scope="col" className="w-32 py-2">
                <span className="flex justify-end">
                  <TeamMark abbr={t.abbreviation} color={t.primaryColor} size={30} />
                  <span className="sr-only">{t.abbreviation}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.label}
              className="border-b"
              style={{ borderColor: 'var(--line)', background: i % 2 ? 'var(--panel-2)' : undefined, color: r.sub ? 'var(--ink-2)' : undefined }}
            >
              <th scope="row" className={`py-2 text-left ${r.sub ? 'pl-4 font-normal' : 'font-semibold'}`}>
                {r.label}
              </th>
              <td className="py-2 text-right">{r.get(data.away.totals, data.home.totals, away.abbreviation)}</td>
              <td className="py-2 pr-1 text-right">{r.get(data.home.totals, data.away.totals, home.abbreviation)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
