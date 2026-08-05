'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type Hit = { id: number; name: string; team: string | null };

/** Adds and removes players from the ?ids= list that drives the comparison. */
export function ComparePicker({
  selected,
}: {
  selected: { id: number; name: string; color: string }[];
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const router = useRouter();
  const sp = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const res = await fetch(`/api/players?q=${encodeURIComponent(q)}&limit=6`, {
        signal: ctrl.signal,
      }).catch(() => null);
      if (res?.ok) setHits(await res.json());
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const setIds = (ids: number[]) => {
    const next = new URLSearchParams(sp.toString());
    if (ids.length) next.set('ids', ids.join(','));
    else next.delete('ids');
    router.replace(`/compare?${next.toString()}`, { scroll: false });
  };

  const ids = selected.map((s) => s.id);
  const full = ids.length >= 4;

  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-2 rounded border px-3 py-2.5"
      style={{ borderColor: 'var(--line)', background: 'var(--panel-2)' }}
    >
      {selected.map((s) => (
        <span
          key={s.id}
          className="flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium"
          style={{ background: 'var(--panel)', border: `1px solid ${s.color}` }}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
          {s.name}
          <button
            onClick={() => setIds(ids.filter((i) => i !== s.id))}
            aria-label={`Remove ${s.name}`}
            style={{ color: 'var(--ink-3)' }}
          >
            ✕
          </button>
        </span>
      ))}

      <div className="relative">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={full ? 'Four is the maximum' : 'Add a player'}
          aria-label="Add a player to the comparison"
          disabled={full}
          className="w-44"
        />
        {hits.length > 0 && !full && (
          <ul className="panel absolute left-0 top-full z-40 mt-1 w-60 py-1" style={{ boxShadow: 'var(--shadow)' }}>
            {hits
              .filter((h) => !ids.includes(h.id))
              .map((h) => (
                <li key={h.id}>
                  <button
                    className="flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-black/5"
                    onClick={() => {
                      setIds([...ids, h.id]);
                      setQ('');
                      setHits([]);
                      inputRef.current?.focus();
                    }}
                  >
                    <span>{h.name}</span>
                    <span className="eyebrow">{h.team}</span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}
