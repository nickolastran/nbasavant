'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Hit = { id: number; name: string; team: string | null; position: string | null };

/** Type-ahead in the header. Debounced so a fast typist makes one query, not ten. */
export function PlayerSearch() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const res = await fetch(`/api/players?q=${encodeURIComponent(q)}&limit=8`, {
        signal: ctrl.signal,
      }).catch(() => null);
      if (res?.ok) {
        setHits(await res.json());
        setActive(0);
        setOpen(true);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  const go = (id: number) => {
    setOpen(false);
    setQ('');
    router.push(`/players/${id}`);
  };

  return (
    <div ref={box} className="relative">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, hits.length - 1));
          if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
          if (e.key === 'Enter' && hits[active]) go(hits[active].id);
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Search players"
        aria-label="Search players"
        role="combobox"
        aria-expanded={open}
        aria-controls="player-search-results"
        className="w-36 sm:w-52"
      />
      {open && hits.length > 0 && (
        <ul
          id="player-search-results"
          role="listbox"
          className="panel absolute right-0 top-full z-50 mt-1 max-h-80 w-72 overflow-auto py-1"
          style={{ boxShadow: 'var(--shadow)' }}
        >
          {hits.map((h, i) => (
            <li key={h.id}>
              <button
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(h.id)}
                className="flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left text-sm"
                style={{ background: i === active ? 'var(--panel-2)' : undefined }}
              >
                <span>{h.name}</span>
                <span className="eyebrow">
                  {h.team} {h.position}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
