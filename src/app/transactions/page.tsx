import Link from 'next/link';
import { Suspense } from 'react';
import { prisma } from '@/lib/db';
import { FilterBar } from '@/components/FilterBar';
import { NoData } from '@/components/NoData';
import { TeamMark } from '@/components/TeamMark';
import { TEAM_OPTIONS } from '@/lib/options';

export const metadata = { title: 'Transactions' };
export const revalidate = 300;

const TYPES: Record<string, string> = {
  Signing: 'Signed',
  Waive: 'Waived',
  Trade: 'Trade',
  AwardOnWaivers: 'Claimed',
  ContractConverted: 'Converted',
};

/** A transaction year runs July 1 to June 30: the offseason belongs to the season it builds. */
const yearOf = (d: Date) => (d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1);
const seasonKey = (start: number) => `${start}-${String((start + 1) % 100).padStart(2, '0')}`;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const bounds = await prisma.transaction.aggregate({ _min: { date: true }, _max: { date: true } });
  if (!bounds._max.date) {
    return (
      <NoData
        title="Transactions"
        blurb="Signings, trades, waivers and two-way conversions, newest first."
        source="Run `npm run sync` (or wait for the daily cron) to load the NBA's transaction log, July 2015 onward."
        columns={['Date', 'Team', 'Type', 'Details']}
      />
    );
  }

  const first = yearOf(bounds._min.date!);
  const last = yearOf(bounds._max.date);
  const years = Array.from({ length: last - first + 1 }, (_, i) => last - i);
  const year = years.includes(Number(sp.season?.slice(0, 4))) ? Number(sp.season.slice(0, 4)) : last;

  const moves = await prisma.transaction.findMany({
    where: {
      date: { gte: new Date(Date.UTC(year, 6, 1)), lt: new Date(Date.UTC(year + 1, 6, 1)) },
      ...(sp.type && sp.type in TYPES ? { type: sp.type } : {}),
      ...(sp.team ? { team: { abbreviation: sp.team } } : {}),
    },
    include: { team: true },
    orderBy: [{ date: 'desc' }, { id: 'asc' }],
  });

  // Who among them has a page here: not every camp invite ever played.
  const known = new Set(
    (
      await prisma.player.findMany({
        where: { id: { in: moves.flatMap((m) => (m.playerId ? [m.playerId] : [])) } },
        select: { id: true },
      })
    ).map((p) => p.id),
  );

  // One entry per signing or waiver; one per trade, holding all its sides.
  const days = new Map<string, { key: string; type: string; rows: typeof moves }[]>();
  for (const m of moves) {
    const day = m.date.toISOString().slice(0, 10);
    const list = days.get(day) ?? [];
    const key = m.type === 'Trade' ? m.groupKey : `${m.id}`;
    const entry = list.find((e) => e.key === key);
    if (entry) entry.rows.push(m);
    else list.push({ key, type: m.type, rows: [m] });
    days.set(day, list);
  }

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold tracking-tight">Transactions</h1>
      <p className="mb-4 text-sm" style={{ color: 'var(--ink-2)' }}>
        {moves.length} moves in {seasonKey(year)} (July to June), newest first, from the NBA&apos;s transaction log.
        It starts with the 2015-16 offseason.
      </p>

      <Suspense>
        <FilterBar
          fields={[
            {
              kind: 'select', name: 'season', label: 'Season',
              options: years.map((y) => ({ value: seasonKey(y), label: seasonKey(y) })),
              defaultValue: seasonKey(year),
            },
            { kind: 'select', name: 'team', label: 'Team', options: TEAM_OPTIONS },
            {
              kind: 'select', name: 'type', label: 'Type',
              options: [{ value: '', label: 'All moves' }, ...Object.entries(TYPES).map(([value, label]) => ({ value, label }))],
            },
          ]}
        />
      </Suspense>

      {!moves.length && (
        <p className="panel p-6 text-sm" style={{ color: 'var(--ink-2)' }}>
          No moves match these filters.
        </p>
      )}

      <div className="space-y-5">
        {[...days].map(([day, entries]) => (
          <section key={day}>
            <h2 className="eyebrow mb-2">
              {new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
              })}
            </h2>
            <ul className="panel divide-y" style={{ borderColor: 'var(--line)' }}>
              {entries.map((e) => (
                <li key={e.key} className="flex gap-3 px-3 py-2.5 text-sm" style={{ borderColor: 'var(--line)' }}>
                  <span
                    className="h-fit w-20 shrink-0 rounded border px-1.5 py-0.5 text-center text-[0.625rem] font-bold uppercase tracking-[0.08em]"
                    style={{
                      borderColor: 'var(--line-2)',
                      color: e.type === 'Trade' ? 'var(--accent)' : 'var(--ink-2)',
                    }}
                  >
                    {TYPES[e.type] ?? e.type}
                  </span>
                  <ul className="min-w-0 flex-1 space-y-1">
                    {e.rows.map((m) => (
                      <li key={m.id} className="flex items-start gap-2">
                        {m.team && <TeamMark abbr={m.team.abbreviation} color={m.team.primaryColor} size={18} />}
                        <span className="min-w-0">
                          {m.description}
                          {m.playerId && known.has(m.playerId) && (
                            <>
                              {' '}
                              <Link href={`/players/${m.playerId}`} className="link whitespace-nowrap text-xs">
                                Player page →
                              </Link>
                            </>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
