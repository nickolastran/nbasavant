'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TEAM_OPTIONS } from '@/lib/options';

type Hit = { key: string; name: string; sub: string | null };

const TEAMS: Hit[] = TEAM_OPTIONS.filter((t) => t.value).map((t) => ({
  key: t.value,
  name: t.label.split(' — ')[1] ?? t.label,
  sub: t.value,
}));

/**
 * Adds and removes picks from the URL list that drives the comparison:
 * players (`?ids=`, searched on the server) or teams (`?teams=`, the 30 franchises).
 */
export function ComparePicker({
  selected, kind = 'players',
}: {
  selected: { key: string; name: string; color: string }[];
  kind?: 'players' | 'teams';
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const router = useRouter();
  const sp = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const param = kind === 'teams' ? 'teams' : 'ids';
  const noun = kind === 'teams' ? 'team' : 'player';

  useEffect(() => {
    const term = q.trim().toLowerCase();
    if (kind === 'teams') {
      return setHits(term ? TEAMS.filter((t) => `${t.key} ${t.name}`.toLowerCase().includes(term)).slice(0, 6) : []);
    }
    if (term.length < 2) return setHits([]);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const res = await fetch(`/api/players?q=${encodeURIComponent(q)}&limit=6`, {
        signal: ctrl.signal,
      }).catch(() => null);
      if (res?.ok) {
        const rows: { id: number; name: string; team: string | null }[] = await res.json();
        setHits(rows.map((r) => ({ key: String(r.id), name: r.name, sub: r.team })));
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, kind]);

  const setKeys = (keys: string[]) => {
    const next = new URLSearchParams(sp.toString());
    if (keys.length) next.set(param, keys.join(','));
    else next.delete(param);
    router.replace(`/compare?${next.toString()}`, { scroll: false });
  };

  const keys = selected.map((s) => s.key);
  const full = keys.length >= 4;

  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-2 rounded border px-3 py-2.5"
      style={{ borderColor: 'var(--line)', background: 'var(--panel-2)' }}
    >
      {selected.map((s) => (
        <span
          key={s.key}
          className="flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium"
          style={{ background: 'var(--panel)', border: `1px solid ${s.color}` }}
        >
          <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
          {s.name}
          <button
            onClick={() => setKeys(keys.filter((k) => k !== s.key))}
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
          placeholder={full ? 'Four is the maximum' : `Add a ${noun}`}
          aria-label={`Add a ${noun} to the comparison`}
          disabled={full}
          className="w-44"
        />
        {hits.length > 0 && !full && (
          <ul className="panel absolute left-0 top-full z-40 mt-1 w-60 py-1" style={{ boxShadow: 'var(--shadow)' }}>
            {hits
              .filter((h) => !keys.includes(h.key))
              .map((h) => (
                <li key={h.key}>
                  <button
                    className="flex w-full items-baseline justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-black/5"
                    onClick={() => {
                      setKeys([...keys, h.key]);
                      setQ('');
                      setHits([]);
                      inputRef.current?.focus();
                    }}
                  >
                    <span>{h.name}</span>
                    <span className="eyebrow">{h.sub}</span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}
