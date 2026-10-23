'use client';

import Link from 'next/link';
import { MotionConfig, motion } from 'framer-motion';
import { useEffect, type ReactNode } from 'react';

/**
 * The game page's tabs. They're links (`?tab=`), so each is shareable and the
 * back button works; the underline slides to the tab picked, and TabPanel
 * fades the new tab's content in. Both sit still for anyone who asks the OS
 * for reduced motion.
 */
export function Tabs({ tabs, current }: { tabs: { value: string; label: string }[]; current: string }) {
  return (
    <MotionConfig reducedMotion="user">
      <nav
        // Scrolls sideways on a phone, without a visible scrollbar (Windows drew one for the underline's 1px).
        className="flex overflow-x-auto border-b [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ borderColor: 'var(--line)' }}
        aria-label="Game"
      >
        {tabs.map((t) => {
          const active = t.value === current;
          return (
            <Link
              key={t.value}
              href={t.value ? `?tab=${t.value}` : '?'}
              aria-current={active ? 'page' : undefined}
              scroll={false}
              className="relative whitespace-nowrap px-4 py-2 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] no-underline transition-colors"
              style={{ color: active ? 'var(--ink)' : 'var(--ink-2)' }}
            >
              {t.label}
              {active && (
                <motion.span
                  layoutId="game-tab-underline"
                  className="absolute inset-x-0 bottom-0 h-0.5"
                  style={{ background: 'var(--ink)' }}
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                />
              )}
            </Link>
          );
        })}
      </nav>
    </MotionConfig>
  );
}

// The page as first loaded shows at once (and in the server HTML, before any
// script runs); only a tab picked after that fades in.
let loaded = false;

/** One tab's content; a newly picked `tab` fades up into place. */
export function TabPanel({ tab, children }: { tab: string; children: ReactNode }) {
  useEffect(() => {
    loaded = true;
  }, []);
  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        key={tab}
        initial={loaded ? { opacity: 0, y: 8 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="space-y-4"
      >
        {children}
      </motion.div>
    </MotionConfig>
  );
}
