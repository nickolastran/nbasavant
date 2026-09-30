/**
 * Loading placeholders shaped like the real thing, for each route's loading.tsx.
 * Widths come from a fixed list rather than Math.random so server and client agree.
 */
const WIDTHS = ['72%', '58%', '84%', '64%', '48%', '78%', '54%', '68%'];

export function Bone({ className = '', width }: { className?: string; width?: string }) {
  // Radius as a utility (not in .skeleton) so a caller's rounded-full wins.
  return <span aria-hidden className={`skeleton h-3 rounded-[3px] ${className}`} style={width ? { width } : undefined} />;
}

/** A stat table: optional title bar, optional CSV/JSON toolbar, a header row and `rows` of cells. */
export function TableSkeleton({
  rows = 10,
  cols = 7,
  title = false,
  toolbar = false,
}: {
  rows?: number;
  cols?: number;
  title?: boolean;
  toolbar?: boolean;
}) {
  return (
    <div>
      {toolbar && (
        <div className="flex justify-end gap-1 pb-2">
          <Bone className="h-6 w-12" />
          <Bone className="h-6 w-12" />
        </div>
      )}
      <div className="panel overflow-hidden">
        {title && (
          <div className="border-b px-3 py-2.5" style={{ borderColor: 'var(--line)' }}>
            <Bone width="9rem" />
          </div>
        )}
        <div className="divide-y" style={{ borderColor: 'var(--line)' }}>
          {Array.from({ length: rows + 1 }, (_, r) => (
            <div
              key={r}
              className="flex items-center gap-4 px-3 py-2.5"
              style={{ background: r === 0 ? 'var(--panel-2)' : undefined, borderColor: 'var(--line)' }}
            >
              <span className="w-40 shrink-0">
                <Bone width={r === 0 ? '40%' : WIDTHS[r % WIDTHS.length]} className={r === 0 ? 'h-2' : ''} />
              </span>
              {Array.from({ length: cols - 1 }, (_, c) => (
                <span key={c} className="flex flex-1 justify-end">
                  <Bone width="2rem" className={r === 0 ? 'h-2' : ''} />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A game or schedule card: status line, two team rows, and (with `footer`) the button row. */
export function CardSkeleton({ footer = false }: { footer?: boolean }) {
  return (
    <div className="panel space-y-3 p-3">
      <Bone width="4rem" className="h-2.5" />
      {[0, 1].map((i) => (
        <div key={i} className="flex items-center gap-2">
          <Bone className="h-5 w-5 rounded-full" />
          <Bone width="2.5rem" />
          <Bone width="2rem" className="h-2.5" />
          <Bone width="2rem" className="ml-auto h-4" />
        </div>
      ))}
      {footer && (
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Bone className="h-7 w-full" />
          <Bone className="h-7 w-full" />
        </div>
      )}
    </div>
  );
}

/** Page chrome while it loads: the real title (or a bar), a subtitle line, the filter bar, then `children`. */
export function PageSkeleton({
  title,
  subtitle = true,
  filters = true,
  children,
}: {
  title?: string;
  subtitle?: boolean;
  filters?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {title ? (
        <h1 className="mb-1 text-xl font-bold tracking-tight">{title}</h1>
      ) : (
        <Bone width="14rem" className="mb-2 h-6" />
      )}
      {subtitle ? <Bone width="min(28rem, 80%)" className="mb-4 mt-2" /> : <div className="mb-4" />}
      {filters && (
        <div className="mb-4 flex flex-wrap gap-4 rounded border px-3 py-2.5" style={{ borderColor: 'var(--line)' }}>
          {['7rem', '5rem', '6rem', '4rem'].map((w) => (
            <span key={w} className="flex flex-col gap-1.5">
              <Bone width="3rem" className="h-2" />
              <Bone width={w} className="h-7" />
            </span>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
