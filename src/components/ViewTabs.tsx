import Link from 'next/link';

/**
 * Tabs that live in the URL (`?view=`), keeping every other filter, so each
 * view is linkable and the back button works. Same look as the section nav.
 */
export function ViewTabs({
  views, current, params, name = 'view',
}: {
  views: { value: string; label: string }[];
  current: string;
  params: Record<string, string>;
  name?: string;
}) {
  return (
    <nav className="mb-4 flex flex-wrap gap-1.5" aria-label="Views">
      {views.map((v) => (
        <Link
          key={v.value}
          href={`?${new URLSearchParams({ ...params, [name]: v.value })}`}
          className="tab"
          aria-current={v.value === current ? 'page' : undefined}
          scroll={false}
        >
          {v.label}
        </Link>
      ))}
    </nav>
  );
}
