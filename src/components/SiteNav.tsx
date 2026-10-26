'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/** The always-visible section row. Order matches the printed box score's. */
const TABS = [
  { href: '/scores', label: 'Scores' },
  { href: '/game-feed', label: 'Game Feed' },
  { href: '/schedule', label: 'Schedule' },
  { href: '/standings', label: 'Standings' },
  { href: '/leaders', label: 'Stat Leaders' },
  { href: '/players', label: 'Player Stats' },
  { href: '/team-stats', label: 'Team Stats' },
  { href: '/teams', label: 'Teams' },
  { href: '/transactions', label: 'Transactions' },
];

/** The cube: everything that doesn't earn a permanent tab. */
const CUBE = [
  { href: '/draft', label: 'Draft', hint: 'Classes and career output' },
  { href: '/injuries', label: 'Injuries', hint: 'Report and status' },
  { href: '/depth-charts', label: 'Depth Charts', hint: 'Rotations by position' },
  { href: '/playoffs', label: 'Playoffs', hint: 'Bracket for every season' },
  { href: '/awards', label: 'Awards', hint: 'MVP, DPOY, ROY race' },
  { href: '/salaries', label: 'Salaries', hint: 'Cap sheets and deals' },
  { href: '/compare', label: 'Compare', hint: 'Players side by side' },
  { href: '/defense', label: 'Defense', hint: 'Opponent shooting, rim protection' },
  { href: '/lineups', label: 'Lineups', hint: 'Best and worst units, league-wide' },
  { href: '/shots', label: 'Shot Charts', hint: 'Every attempt, mapped' },
  { href: '/explorer', label: 'Stat Explorer', hint: 'Filter and sort anything' },
  { href: '/api-docs', label: 'API', hint: 'The data, as JSON' },
];

export function SiteNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const cube = useRef<HTMLDivElement>(null);

  // A menu that outlives a click elsewhere on the page is a bug, not a feature.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!cube.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  // Route changes close it too — Next keeps this component mounted across them.
  useEffect(() => setOpen(false), [path]);

  const current = (href: string) =>
    path === href || path.startsWith(`${href}/`) ? 'page' : undefined;

  return (
    <div className="border-b" style={{ background: 'var(--chrome-2)', borderColor: 'var(--line)' }}>
      <div className="flex items-center gap-3 px-4 py-2">
        <nav
          aria-label="Sections"
          className="no-scrollbar flex flex-1 gap-1.5 overflow-x-auto"
        >
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className="tab" aria-current={current(t.href)}>
              {t.label}
            </Link>
          ))}
        </nav>

        <div ref={cube} className="relative shrink-0">
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label="More sections"
            className="grid grid-cols-3 gap-[3px] rounded p-1.5 hover:bg-black/5"
          >
            {Array.from({ length: 9 }, (_, i) => (
              <span
                key={i}
                className="block h-[4px] w-[4px] rounded-[1px]"
                style={{ background: open ? 'var(--accent)' : 'var(--ink-2)' }}
              />
            ))}
          </button>

          {open && (
            <div
              role="menu"
              className="panel absolute right-0 top-full z-50 mt-2 grid w-[min(92vw,30rem)] grid-cols-3"
              style={{ boxShadow: 'var(--shadow)' }}
            >
              {CUBE.map((c, i) => (
                <Link
                  key={c.href}
                  role="menuitem"
                  href={c.href}
                  className="border-b border-r p-3 no-underline transition-colors hover:bg-[var(--panel-2)]"
                  style={{
                    borderColor: 'var(--line)',
                    color: 'var(--ink)',
                    // Trim the grid's outer edges so the panel border is the only one.
                    borderRightWidth: i % 3 === 2 ? 0 : 1,
                    borderBottomWidth: i > 5 ? 0 : 1,
                  }}
                >
                  <div className="text-[0.75rem] font-bold uppercase tracking-[0.06em]">
                    {c.label}
                  </div>
                  <div className="mt-0.5 text-[0.6875rem]" style={{ color: 'var(--ink-3)' }}>
                    {c.hint}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
