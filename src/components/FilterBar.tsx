'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { TeamMark } from '@/components/TeamMark';

export type Field =
  | {
      kind: 'select';
      name: string;
      label: string;
      options: { value: string; label: string }[];
      /**
       * What the page renders when the URL says nothing. Without it a select
       * whose options have no '' entry shows its first option, which is a
       * different season from the one on screen.
       */
      defaultValue?: string;
      /** Option values are team abbreviations: show each team's logo beside it. */
      logos?: boolean;
    }
  | { kind: 'number'; name: string; label: string; min?: number; max?: number; step?: number; defaultValue?: string }
  | { kind: 'text'; name: string; label: string; placeholder?: string; defaultValue?: string };

/**
 * Filters live in the URL, so every view is linkable and the back button works.
 * One row above the content, per the site's filter convention. `bare` drops the
 * box, the visible labels and the clear button, for a few inline dropdowns.
 */
export function FilterBar({ fields, bare }: { fields: Field[]; bare?: boolean }) {
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
      className={bare ? 'flex flex-wrap items-center gap-2' : 'mb-4 flex flex-wrap items-end gap-x-4 gap-y-2 rounded border px-3 py-2.5'}
      style={bare ? undefined : { borderColor: 'var(--line)', background: 'var(--panel-2)' }}
    >
      {fields.map((f) =>
        f.kind === 'select' && f.logos ? (
          // A div, not a label: a label hands clicks on its text to the first
          // button inside, which would pick "All teams".
          <div key={f.name} className="flex flex-col gap-1">
            <span className={bare ? 'sr-only' : 'eyebrow'}>{f.label}</span>
            <LogoSelect
              label={f.label}
              value={sp.get(f.name) ?? f.defaultValue ?? ''}
              options={f.options}
              onChange={(v) => set(f.name, v)}
            />
          </div>
        ) : (
          <label key={f.name} className="flex flex-col gap-1">
            <span className={bare ? 'sr-only' : 'eyebrow'}>{f.label}</span>
            {f.kind === 'select' ? (
              <select value={sp.get(f.name) ?? f.defaultValue ?? ''} onChange={(e) => set(f.name, e.target.value)}>
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={f.kind === 'number' ? 'number' : 'search'}
                defaultValue={sp.get(f.name) ?? f.defaultValue ?? ''}
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
        ),
      )}
      {!bare && [...sp.keys()].length > 0 && (
        <button className="btn-ghost" onClick={() => router.replace(pathname, { scroll: false })}>
          Clear filters
        </button>
      )}
    </div>
  );
}

/**
 * A select whose options carry a team logo, which a native <select> can't
 * show. <details> does the opening and closing; this adds closing on an
 * outside click or Escape.
 */
function LogoSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !ref.current?.open) return;
      ref.current.open = false;
      ref.current.querySelector('summary')?.focus();
    };
    document.addEventListener('click', click);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('click', click);
      document.removeEventListener('keydown', key);
    };
  }, []);

  const current = options.find((o) => o.value === value) ?? options[0];
  const face = (o: { value: string; label: string }) => (
    <>
      {o.value && <TeamMark abbr={o.value} size={18} />}
      <span className="truncate">{o.label}</span>
    </>
  );

  return (
    <details ref={ref} className="relative">
      <summary
        aria-label={`${label}: ${current.label}`}
        className="flex min-w-56 cursor-pointer list-none items-center gap-2 rounded border px-2 py-[0.3125rem] text-[0.8125rem] [&::-webkit-details-marker]:hidden"
        style={{ background: 'var(--panel)', borderColor: 'var(--line)', color: 'var(--ink)' }}
      >
        {face(current)}
        <span aria-hidden className="ml-auto pl-2 text-[0.625rem]" style={{ color: 'var(--ink-3)' }}>
          ▾
        </span>
      </summary>
      <ul
        className="absolute z-30 mt-1 max-h-80 w-full min-w-64 overflow-auto rounded border py-1 shadow-lg"
        style={{ background: 'var(--panel)', borderColor: 'var(--line-2)' }}
      >
        {options.map((o) => (
          <li key={o.value}>
            <button
              type="button"
              aria-current={o.value === value || undefined}
              onClick={() => {
                onChange(o.value);
                ref.current!.open = false;
              }}
              className="flex w-full items-center gap-2 px-2 py-1 text-left text-[0.8125rem] hover:bg-[var(--panel-2)]"
              style={o.value === value ? { fontWeight: 600, background: 'var(--panel-2)' } : undefined}
            >
              {face(o)}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
