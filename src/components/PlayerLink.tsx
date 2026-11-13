'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Headshot } from '@/components/Headshot';
import { TeamMark } from '@/components/TeamMark';
import { percentileStep } from '@/lib/colors';
import type { PlayerCard } from '@/app/api/players/[id]/card/route';

const cache = new Map<number, Promise<PlayerCard | null>>();
const load = (id: number) => {
  if (!cache.has(id)) {
    cache.set(
      id,
      fetch(`/api/players/${id}/card`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    );
  }
  return cache.get(id)!;
};

const W = 264;

/**
 * A player's name as a link that, on hover or keyboard focus, shows a mini
 * card: headshot, team, season line and a few percentile bars. The card is
 * extra: everything on it is on the page the link goes to.
 */
export function PlayerLink({
  id, children, className = 'link', style,
}: {
  id: number;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const [card, setCard] = useState<PlayerCard | null | 'loading'>('loading');

  const show = () => {
    clearTimeout(timer.current);
    // A short wait, so sweeping the pointer down a table doesn't fire a card per row.
    timer.current = setTimeout(() => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const above = r.bottom + 230 > window.innerHeight && r.top > 230;
      setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - W - 8)), top: above ? r.top - 6 : r.bottom + 6, above });
      load(id).then(setCard);
    }, 280);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setPos(null);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  // A fixed card would drift from its link on scroll; just close it.
  useEffect(() => {
    if (!pos) return;
    window.addEventListener('scroll', hide, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', hide, { capture: true });
  }, [pos]);

  return (
    <>
      <Link
        ref={ref}
        href={`/players/${id}`}
        className={className}
        style={style}
        onPointerEnter={(e) => e.pointerType === 'mouse' && show()}
        onPointerLeave={hide}
        onFocus={show}
        onBlur={hide}
        onKeyDown={(e) => e.key === 'Escape' && hide()}
      >
        {children}
      </Link>
      {pos &&
        createPortal(
          <div
            role="tooltip"
            className="panel pointer-events-none fixed z-[55] p-3 shadow-3"
            style={{ left: pos.left, top: pos.top, width: W, transform: pos.above ? 'translateY(-100%)' : undefined }}
          >
            {card === 'loading' ? (
              <div className="space-y-2" aria-label="Loading">
                <span className="skeleton h-10 w-10 rounded-full" />
                <span className="skeleton h-3 w-2/3 rounded" />
                <span className="skeleton h-3 w-1/2 rounded" />
              </div>
            ) : card === null ? (
              <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                Couldn&apos;t load this player&apos;s card.
              </p>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full" style={{ background: 'var(--panel-2)' }}>
                    <Headshot id={card.id} name="" className="h-11 w-11 object-cover object-top" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold" style={{ color: 'var(--ink)' }}>
                      {card.name}
                    </div>
                    <div className="flex items-center gap-1.5 text-[0.6875rem]" style={{ color: 'var(--ink-2)' }}>
                      {card.team && <TeamMark abbr={card.team.abbr} color={card.team.color} size={14} />}
                      {[card.team?.abbr, card.position].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </div>
                {card.line && (
                  <p className="tnum mt-2 text-xs" style={{ color: 'var(--ink)' }}>
                    <span className="eyebrow mr-1.5">{card.season}</span>
                    {card.line}
                  </p>
                )}
                {card.percentiles.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {card.percentiles.map((p) => (
                      <li key={p.label} className="grid grid-cols-[5.5rem_minmax(0,1fr)_1.75rem] items-center gap-2 text-[0.6875rem]">
                        <span style={{ color: 'var(--ink-2)' }}>{p.label}</span>
                        <span className="relative h-1.5 rounded-full" style={{ background: 'var(--line)' }}>
                          <span
                            className="absolute inset-y-0 left-0 rounded-full"
                            style={{ width: `${p.pct}%`, background: `var(--div-${percentileStep(p.pct) + 1})` }}
                          />
                        </span>
                        <span className="tnum text-right font-bold" style={{ color: 'var(--ink)' }}>
                          {p.pct}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
