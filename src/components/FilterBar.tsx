'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';

export type Field =
  | { kind: 'select'; name: string; label: string; options: { value: string; label: string }[] }
  | { kind: 'number'; name: string; label: string; min?: number; max?: number; step?: number }
  | { kind: 'text'; name: string; label: string; placeholder?: string };

/**
 * Filters live in the URL, so every view is linkable and the back button works.
 * One row above the content, per the site's filter convention.
 */
export function FilterBar({ fields }: { fields: Field[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const set = (name: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <div
      className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-2 rounded border px-3 py-2.5"
      style={{ borderColor: 'var(--line)', background: 'var(--panel-2)' }}
    >
      {fields.map((f) => (
        <label key={f.name} className="flex flex-col gap-1">
          <span className="eyebrow">{f.label}</span>
          {f.kind === 'select' ? (
            <select value={sp.get(f.name) ?? ''} onChange={(e) => set(f.name, e.target.value)}>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={f.kind === 'number' ? 'number' : 'search'}
              defaultValue={sp.get(f.name) ?? ''}
              placeholder={f.kind === 'text' ? f.placeholder : undefined}
              min={f.kind === 'number' ? f.min : undefined}
              max={f.kind === 'number' ? f.max : undefined}
              step={f.kind === 'number' ? f.step : undefined}
              onChange={(e) => {
                const v = e.target.value;
                clearTimeout((window as any).__filterTimer);
                (window as any).__filterTimer = setTimeout(() => set(f.name, v), 300);
              }}
              className="w-28"
            />
          )}
        </label>
      ))}
      {[...sp.keys()].length > 0 && (
        <button className="btn-ghost" onClick={() => router.replace(pathname, { scroll: false })}>
          Clear filters
        </button>
      )}
    </div>
  );
}
