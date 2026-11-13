'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useId } from 'react';

type Item = { value: string; label: string };

/**
 * The segmented control: a row of pills with one filled indicator that slides
 * to the current choice. Give it `href` and each pill is a link (state lives in
 * the URL); give it `onChange` and each is a button.
 */
export function Segmented({
  items, current, href, onChange, label = 'Views', className = '',
}: {
  items: Item[];
  current: string;
  href?: (value: string) => string;
  onChange?: (value: string) => void;
  label?: string;
  className?: string;
}) {
  const id = useId();
  const pill = 'relative rounded-full px-3 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] no-underline whitespace-nowrap transition-colors';
  return (
    <div
      role={href ? 'navigation' : 'group'}
      aria-label={label}
      className={`inline-flex max-w-full flex-wrap gap-0.5 rounded-[1.1rem] border p-0.5 ${className}`}
      style={{ borderColor: 'var(--line)', background: 'var(--panel-2)' }}
    >
      {items.map((v) => {
        const on = v.value === current;
        const inner = (
          <>
            {on && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-full"
                style={{ background: 'var(--ink)' }}
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative">{v.label}</span>
          </>
        );
        const style = { color: on ? 'var(--on-ink)' : 'var(--ink-2)' };
        return href ? (
          <Link key={v.value} href={href(v.value)} scroll={false} aria-current={on ? 'page' : undefined} className={pill} style={style}>
            {inner}
          </Link>
        ) : (
          <button key={v.value} type="button" aria-pressed={on} onClick={() => onChange?.(v.value)} className={pill} style={style}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Tabs that live in the URL (`?view=`), keeping every other filter, so each
 * view is linkable and the back button works.
 */
export function ViewTabs({
  views, current, params, name = 'view',
}: {
  views: Item[];
  current: string;
  params: Record<string, string>;
  name?: string;
}) {
  return (
    <Segmented
      className="mb-4"
      items={views}
      current={current}
      href={(v) => `?${new URLSearchParams({ ...params, [name]: v })}`}
    />
  );
}
