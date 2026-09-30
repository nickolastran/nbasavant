'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Headshot } from '@/components/Headshot';
import { TeamMark } from '@/components/TeamMark';
import { FORMER_NAMES, SUCCESSOR, TEAMS } from '../../prisma/teams';

type Player = { id: number; name: string; team: string | null; position: string | null };
type Hit =
  | { kind: 'team'; href: string; abbr: string; color: string; name: string; sub: string }
  | { kind: 'player'; href: string; id: number; name: string; sub: string };

const teamName = (abbr: string | null) => {
  const t = TEAMS.find((t) => t.abbreviation === abbr);
  return t ? `${t.city} ${t.name}` : abbr;
};

/**
 * Each franchise that still plays or folded, with every name it went by: relocated
 * rows (Seattle SuperSonics) fold into the team they became (Oklahoma City Thunder).
 */
const FRANCHISES = TEAMS.filter((t) => !SUCCESSOR[t.abbreviation]).map((t) => ({
  ...t,
  names: [
    `${t.city} ${t.name}`,
    t.abbreviation,
    ...(FORMER_NAMES[t.abbreviation] ?? []),
    ...TEAMS.filter((o) => SUCCESSOR[o.abbreviation] === t.abbreviation).flatMap((o) => [`${o.city} ${o.name}`, o.abbreviation]),
  ].map((n) => n.toLowerCase()),
}));

/** Franchises matching any of their names; current ones come first in TEAMS. */
const teamHits = (q: string): Hit[] => {
  const s = q.trim().toLowerCase();
  return FRANCHISES.filter((t) => t.names.some((n) => n.includes(s)))
    .slice(0, 3)
    .map((t) => ({
      kind: 'team',
      href: `/teams/${t.abbreviation}`,
      abbr: t.abbreviation,
      color: t.primaryColor,
      name: `${t.city} ${t.name}`,
      // Early franchises played in divisions literally called Eastern and Western.
      sub: /^(Eastern|Western)$/.test(t.division)
        ? `${t.division} Division`
        : `${t.conference === 'East' ? 'Eastern' : 'Western'} Conference · ${t.division}`,
    }));
};

/**
 * Type-ahead in the header for teams and players. Teams match locally; players
 * come from /api/players, debounced so a fast typist makes one query, not ten.
 */
export function SiteSearch() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
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
      const players: Player[] = res?.ok ? await res.json() : [];
      if (ctrl.signal.aborted) return;
      setHits([
        ...teamHits(q),
        ...players.map((p): Hit => ({
          kind: 'player',
          href: `/players/${p.id}`,
          id: p.id,
          name: p.name,
          sub: [p.position, teamName(p.team)].filter(Boolean).join(' · '),
        })),
      ]);
      setActive(0);
      setOpen(true);
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

  const go = (href: string) => {
    setOpen(false);
    setQ('');
    router.push(href);
  };

  return (
    <div ref={box} className="relative">
      <input
        ref={input}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, hits.length - 1));
          if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
          if (e.key === 'Enter' && hits[active]) go(hits[active].href);
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder="Search Players / Teams"
        aria-label="Search players and teams"
        role="combobox"
        aria-expanded={open}
        aria-controls="site-search-results"
        className="w-44 pr-7 sm:w-60"
      />
      {q && (
        <button
          type="button"
          onClick={() => {
            setQ('');
            setOpen(false);
            input.current?.focus();
          }}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-sm leading-none transition-colors hover:bg-[var(--panel-2)]"
          style={{ color: 'var(--ink-3)' }}
        >
          ×
        </button>
      )}
      {open && hits.length > 0 && (
        <ul
          id="site-search-results"
          role="listbox"
          className="panel absolute right-0 top-full z-50 mt-1 max-h-96 w-[min(24rem,calc(100vw-2rem))] overflow-auto py-1"
          style={{ boxShadow: 'var(--shadow)' }}
        >
          {hits.map((h, i) => (
            <li key={h.href}>
              <button
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(h.href)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left"
                style={{ background: i === active ? 'var(--panel-2)' : undefined }}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center">
                  {h.kind === 'team' ? (
                    <TeamMark abbr={h.abbr} color={h.color} size={26} />
                  ) : (
                    <Headshot
                      id={h.id}
                      name={h.name}
                      className="h-8 w-8 rounded-full bg-[var(--panel-2)] object-cover object-top"
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                    {h.name}
                  </span>
                  <span
                    className="block truncate text-[0.6875rem]"
                    style={{
                      color: 'var(--ink-3)',
                      ...(h.kind === 'team' ? { textTransform: 'uppercase', letterSpacing: '0.06em' } : {}),
                    }}
                  >
                    {h.sub}
                  </span>
                </span>
                <span className="eyebrow shrink-0">{h.kind === 'team' ? 'Team' : 'Player'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
