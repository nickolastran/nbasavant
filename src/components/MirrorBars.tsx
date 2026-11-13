import { ordinal } from '@/lib/format';
import type { MirrorRow } from '@/lib/compare';

const show = (r: MirrorRow, v: number | null) => (v === null ? '—' : `${r.signed && v > 0 ? '+' : ''}${v.toFixed(r.dp ?? 1)}`);

/**
 * Two teams, one stat per row, bars growing out from the middle. A bar's
 * length is the team's standing in the league for that stat (first is full
 * width), so rows with different units compare; the value and the rank are
 * printed beside it, and the better side is bold.
 */
export function MirrorBars({
  title, rows, a, b,
}: {
  title: string;
  rows: MirrorRow[];
  a: { name: string; color: string };
  b: { name: string; color: string };
}) {
  return (
    <section className="panel p-3">
      <h3 className="eyebrow mb-2">{title}</h3>
      <ul className="space-y-2">
        {rows.map((r) => {
          const better = r.neutral || r.a === null || r.b === null || r.a === r.b ? null : (r.a > r.b) !== !!r.lowerIsBetter ? 'a' : 'b';
          const width = (rank: number | null) => (rank === null ? 0 : r.of > 1 ? (1 - (rank - 1) / (r.of - 1)) * 100 : 100);
          const side = (which: 'a' | 'b') => {
            const [v, rank, team] = which === 'a' ? [r.a, r.rankA, a] : [r.b, r.rankB, b];
            return (
              <div className={`flex items-center gap-2 ${which === 'a' ? 'flex-row-reverse' : ''}`}>
                <span className="relative h-3 flex-1 rounded-sm" style={{ background: 'var(--line)' }}>
                  <span
                    className="absolute inset-y-0 rounded-sm transition-[width] duration-slow ease-out"
                    style={{ width: `${Math.max(rank === null ? 0 : 3, width(rank))}%`, background: team.color, [which === 'a' ? 'right' : 'left']: 0 }}
                  />
                </span>
                <span className={`tnum w-24 text-xs ${which === 'a' ? 'text-right' : ''}`} style={{ fontWeight: better === which ? 700 : 400 }}>
                  {show(r, v)}
                  {rank !== null && (
                    <span className="ml-1 font-normal" style={{ color: 'var(--ink-3)' }}>
                      {ordinal(rank)}
                    </span>
                  )}
                </span>
              </div>
            );
          };
          return (
            <li
              key={r.label}
              className="grid grid-cols-[minmax(0,1fr)_7.5rem_minmax(0,1fr)] items-center gap-2 max-sm:grid-cols-2"
              aria-label={`${r.label}: ${a.name} ${show(r, r.a)}${r.rankA ? `, ${ordinal(r.rankA)} of ${r.of}` : ''}; ${b.name} ${show(r, r.b)}${r.rankB ? `, ${ordinal(r.rankB)} of ${r.of}` : ''}`}
            >
              {side('a')}
              <span className="text-center text-xs font-semibold max-sm:order-first max-sm:col-span-2">
                {r.label}
                {r.lowerIsBetter && <span className="block text-[0.5625rem] font-normal" style={{ color: 'var(--ink-3)' }}>lower is better</span>}
              </span>
              {side('b')}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
