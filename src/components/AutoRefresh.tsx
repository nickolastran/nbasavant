'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Re-renders the server page every `seconds` while `active` (a game is in
 * progress), and only while the tab is visible: a backgrounded tab shouldn't
 * keep asking for box scores nobody is looking at.
 */
export function AutoRefresh({ active, seconds = 15 }: { active: boolean; seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => document.visibilityState === 'visible' && router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [active, seconds, router]);
  return null;
}
