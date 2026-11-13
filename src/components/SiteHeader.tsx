'use client';

import { MotionConfig, motion } from 'framer-motion';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CommandPalette } from '@/components/CommandPalette';
import { LogoMark, Wordmark } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { CUBE, HOME, type Mode, TABS, modeOf } from '@/lib/nav';

const MODES: { mode: Mode; label: string }[] = [
  { mode: 'general', label: 'General' },
  { mode: 'savant', label: 'Savant' },
];

/**
 * The sticky header: wordmark, the General/Savant switch, search and theme on
 * top; the current mode's section tabs below. Past the first screenful it
 * condenses to give the page its height back.
 */
export function SiteHeader() {
  const path = usePathname();
  const mode = modeOf(path);
  const [condensed, setCondensed] = useState(false);
  const [open, setOpen] = useState(false);
  const cube = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLElement>(null);

  // The page shell reads the mode from <html>; keep it in step with client navigation.
  useEffect(() => {
    document.documentElement.dataset.mode = mode;
  }, [mode]);

  useEffect(() => {
    // Two thresholds, so a page resting near one doesn't flicker between states.
    const onScroll = () => setCondensed((c) => (c ? window.scrollY > 24 : window.scrollY > 72));
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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

  // Route changes close it too, and on a phone bring the current tab into the scrolled row.
  useEffect(() => {
    setOpen(false);
    row.current?.querySelector('[aria-current=page]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [path]);

  const current = (href: string) => (path === href || path.startsWith(`${href}/`) ? 'page' : undefined);

  return (
    <MotionConfig reducedMotion="user">
      <header
        className="sticky top-0 z-40 border-b transition-shadow duration-base"
        style={{ background: 'var(--chrome)', borderColor: 'var(--line)', boxShadow: condensed ? 'var(--elev-1)' : 'none' }}
      >
        <div className={`flex items-center gap-3 px-4 transition-[padding] duration-base ease-out ${condensed ? 'py-1.5' : 'py-3'}`}>
          <Link href="/" className="flex items-center gap-2 no-underline" aria-label="NBA Savant home">
            <LogoMark size={condensed ? 20 : 24} />
            <Wordmark className={`transition-[font-size] duration-base max-[420px]:hidden ${condensed ? 'text-base' : 'text-lg'}`} />
          </Link>

          <nav aria-label="Site mode" className="flex rounded-full border p-0.5" style={{ borderColor: 'var(--line)', background: 'var(--panel-2)' }}>
            {MODES.map((m) => (
              <Link
                key={m.mode}
                href={HOME[m.mode]}
                aria-current={mode === m.mode ? 'true' : undefined}
                className="relative rounded-full px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] no-underline"
                style={{ color: mode === m.mode ? 'var(--on-ink)' : 'var(--ink-2)' }}
              >
                {mode === m.mode && (
                  <motion.span
                    layoutId="mode-pill"
                    className="absolute inset-0 rounded-full"
                    style={{ background: 'var(--ink)' }}
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
                <span className="relative">{m.label}</span>
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <CommandPalette />
            <ThemeToggle />
          </div>
        </div>

        <div className="flex items-center gap-3 border-t px-4" style={{ borderColor: 'var(--line)' }}>
          <nav
            ref={row}
            aria-label="Sections"
            // The fade says "more this way" where the row is cut off on a phone.
            className="no-scrollbar -ml-3 flex flex-1 overflow-x-auto pr-8 [mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)]"
          >
            {TABS[mode].map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={`nav-tab relative ${condensed ? '!py-2' : ''}`}
                aria-current={current(t.href)}
              >
                {t.label}
                {current(t.href) && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute inset-x-3 bottom-0 h-0.5"
                    style={{ background: 'var(--ink)' }}
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
              </Link>
            ))}
          </nav>

          <div ref={cube} className="relative shrink-0">
            <button
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-haspopup="menu"
              aria-label="More sections"
              className="grid grid-cols-3 gap-[3px] rounded p-1.5 hover:bg-[var(--panel-2)]"
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
                // A 1px gap over the rule color draws the inner grid lines; the panel border is the only outer one.
                className="panel absolute right-0 top-full z-50 mt-2 grid w-[min(92vw,30rem)] grid-cols-2 gap-px overflow-hidden sm:grid-cols-3"
                style={{ boxShadow: 'var(--shadow)', background: 'var(--line)' }}
              >
                {CUBE.map((c) => (
                  <Link
                    key={c.href}
                    role="menuitem"
                    href={c.href}
                    className="bg-[var(--panel)] p-3 no-underline transition-colors hover:bg-[var(--panel-2)]"
                    style={{ color: 'var(--ink)' }}
                  >
                    <div className="text-[0.75rem] font-bold uppercase tracking-[0.06em]">{c.label}</div>
                    <div className="mt-0.5 text-[0.6875rem]" style={{ color: 'var(--ink-3)' }}>
                      {c.hint}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>
    </MotionConfig>
  );
}
