'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Holds its children back until they are about to scroll into view, showing a
 * shimmer of the same size meanwhile. For heavy client charts and tables below
 * the fold: the page becomes interactive without paying for them up front.
 * `className` sizes the placeholder (an aspect ratio or a min-height), so
 * nothing shifts when the real thing arrives.
 */
export function LazyMount({ children, className = 'min-h-64' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setShow(true), { rootMargin: '400px 0px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return show ? <>{children}</> : <span ref={ref} aria-hidden className={`skeleton block w-full rounded-md ${className}`} />;
}
