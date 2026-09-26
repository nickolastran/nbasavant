import { ordinal } from '@/lib/format';

/**
 * Savant's percentile rankings: one track per metric, 0-100, the dot at the
 * player's (or team's) percentile against the qualified field. Red is better
 * than the field, blue is worse, gray is the middle.
 *
 * The scale is five steps rather than a smooth ramp on purpose: the number
 * sits inside the dot, and a smooth ramp passes through a band (roughly 70-85%
 * of the way to either pole) where neither white nor ink text reaches 4.5:1.
 * These steps all do: white on the poles, ink on everything lighter.
 */
export type Percentile = {
  label: string;
  /** The stat itself, already formatted: "27.4", "61.2%". */
  value: string;
  /** 0-100, already flipped for stats where lower is better. */
  pct: number;
  /** Full sentence for the hover/focus tooltip. */
  title?: string;
};

function step(p: number) {
  if (p >= 80) return { fill: 'var(--hot)', text: '#fff' };
  if (p >= 60) return { fill: 'color-mix(in oklab, var(--hot) 55%, var(--mid))', text: 'var(--ink)' };
  if (p > 40) return { fill: 'var(--mid)', text: 'var(--ink)' };
  if (p > 20) return { fill: 'color-mix(in oklab, var(--cold) 55%, var(--mid))', text: 'var(--ink)' };
  return { fill: 'var(--cold)', text: '#fff' };
}

export function PercentileBars({
  title, subtitle, rows, empty,
}: {
  title: string;
  subtitle?: string;
  rows: Percentile[];
  /** Why there are no rows (didn't qualify, nothing tracked that season). */
  empty?: string;
}) {
  return (
    <section className="panel p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {subtitle && (
        <p className="mt-0.5 text-xs" style={{ color: 'var(--ink-3)' }}>
          {subtitle}
        </p>
      )}
      {rows.length ? (
        <>
          <div
            className="mb-1 mt-3 grid grid-cols-[6.5rem_1fr_3.75rem] gap-3 text-[0.625rem] uppercase tracking-[0.08em]"
            style={{ color: 'var(--ink-3)' }}
            aria-hidden
          >
            <span />
            <span className="flex justify-between">
              <span>Poor</span>
              <span>Average</span>
              <span>Great</span>
            </span>
            <span className="text-right">Value</span>
          </div>
          <ul className="space-y-2.5">
            {rows.map((r) => {
              const s = step(r.pct);
              return (
                <li
                  key={r.label}
                  className="grid grid-cols-[6.5rem_1fr_3.75rem] items-center gap-3"
                  title={r.title}
                  aria-label={`${r.label}: ${r.value}, ${ordinal(r.pct)} percentile`}
                >
                  <span className="truncate text-xs font-semibold">{r.label}</span>
                  <span className="relative h-1.5 rounded-full" style={{ background: 'var(--line)' }}>
                    <span
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{ width: `${r.pct}%`, background: s.fill }}
                    />
                    <span
                      className="tnum absolute top-1/2 grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[0.625rem] font-bold"
                      // The 2px ring in the surface color keeps the dot legible over the track.
                      style={{ left: `${r.pct}%`, background: s.fill, color: s.text, boxShadow: '0 0 0 2px var(--panel)' }}
                    >
                      {r.pct}
                    </span>
                  </span>
                  <span className="tnum text-right text-xs" style={{ color: 'var(--ink-2)' }}>
                    {r.value}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="mt-3 text-sm" style={{ color: 'var(--ink-3)' }}>
          {empty ?? 'Nothing to rank.'}
        </p>
      )}
    </section>
  );
}

