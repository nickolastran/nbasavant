'use client';

import { useEffect, useRef } from 'react';

/**
 * Fades its children up a few pixels when they first scroll into view. It only
 * hides what starts below the fold, after mount, so content is never invisible
 * without JavaScript, and the CSS does nothing under reduced motion.
 */
export function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || el.getBoundingClientRect().top < window.innerHeight) return;
    el.classList.add('reveal');
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        el.classList.add('reveal-in');
        io.disconnect();
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
