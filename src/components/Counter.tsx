'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A number that counts up the first time it scrolls into view. The server
 * renders the final value, so it is right without JavaScript, for crawlers and
 * under reduced motion (where it never moves).
 */
export function Counter({ value, dp = 0, suffix = '', className }: { value: number; dp?: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const el = ref.current;
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t: number) => {
        const k = Math.min(1, (t - t0) / 700);
        setShown(value * (1 - (1 - k) ** 3)); // ease-out cubic
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);

  const text = (v: number) => `${v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}${suffix}`;
  return (
    <span ref={ref} className={className}>
      {/* Screen readers get the real value once; the ticking copy is for the eye. */}
      <span className="sr-only">{text(value)}</span>
      <span aria-hidden>{text(shown)}</span>
    </span>
  );
}
