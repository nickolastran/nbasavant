import Link from 'next/link';
import { Headshot } from '@/components/Headshot';
import { TeamMark } from '@/components/TeamMark';

export type Board = {
  key: string;
  label: string;
  /** Printed after the label: "per game", or nothing. */
  note: string;
  empty: string;
  rows: { playerId: number; name: string; abbr: string; color: string; value: string }[];
};

/** One top-N board: ranked rows of team logo, headshot, name and value, and an optional "Complete list" footer. */
export function LeaderBoard({ board: b, more }: { board: Board; more?: string }) {
  return (
    <section className="panel overflow-hidden">
      <h2 className="eyebrow border-b px-3 py-2" style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}>
        {b.label}
        {b.note && (
          <span className="ml-1 font-normal normal-case tracking-normal" style={{ color: 'var(--ink-3)' }}>
            {b.note}
          </span>
        )}
      </h2>
      <ol>
        {b.rows.map((r, i) => (
          <li key={r.playerId} className="flex items-center gap-2 border-b px-3 py-1.5 text-sm last:border-b-0" style={{ borderColor: 'var(--line)' }}>
            <span className="tnum w-3 text-right text-[0.6875rem]" style={{ color: 'var(--ink-3)' }}>
              {i + 1}
            </span>
            <TeamMark abbr={r.abbr} color={r.color} size={18} />
            <Headshot id={r.playerId} name="" className="h-6 w-6 shrink-0 rounded-full bg-[var(--panel-2)] object-cover object-top" />
            <Link href={`/players/${r.playerId}`} className="link flex-1 truncate" style={{ color: 'var(--ink)' }}>
              {r.name}
            </Link>
            <span className="tnum font-semibold">{r.value}</span>
          </li>
        ))}
        {!b.rows.length && (
          <li className="px-3 py-3 text-sm" style={{ color: 'var(--ink-3)' }}>
            {b.empty}
          </li>
        )}
      </ol>
      {more && (
        <Link href={more} className="eyebrow block border-t py-1.5 text-center no-underline hover:underline" style={{ borderColor: 'var(--line)' }}>
          Complete list →
        </Link>
      )}
    </section>
  );
}
