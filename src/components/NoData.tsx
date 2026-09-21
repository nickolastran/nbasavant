import Link from 'next/link';

/**
 * A section that exists in the navigation but has nothing behind it yet.
 * Says plainly what's missing and where it would come from, rather than
 * inventing numbers — every figure elsewhere on this site is real.
 */
export function NoData({
  title,
  blurb,
  source,
  columns,
}: {
  title: string;
  blurb: string;
  /** The feed that would fill this page once it's ingested. */
  source: string;
  /** The columns this page will show, so the shape is visible in advance. */
  columns: string[];
}) {
  return (
    <div>
      <h1 className="mb-1 text-xl font-bold tracking-tight">{title}</h1>
      <p className="mb-5 max-w-2xl text-sm" style={{ color: 'var(--ink-2)' }}>
        {blurb}
      </p>

      <div className="panel overflow-hidden">
        <table className="stat-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c} style={{ cursor: 'default' }}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
        </table>
        <div className="px-6 py-12 text-center">
          <p className="text-sm font-semibold">No {title.toLowerCase()} ingested yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm" style={{ color: 'var(--ink-3)' }}>
            {source}
          </p>
          <Link href="/api-docs" className="link mt-3 inline-block text-sm">
            What data is available →
          </Link>
        </div>
      </div>
    </div>
  );
}
