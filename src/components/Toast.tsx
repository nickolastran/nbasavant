'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';

type Item = { id: number; text: string };
let next = 0;
const listeners = new Set<(t: Item) => void>();

/** Say something briefly from anywhere on the client: `toast('Link copied')`. */
export const toast = (text: string) => listeners.forEach((l) => l({ id: next++, text }));

/** Where toasts appear. Mounted once in the layout; a polite live region, so screen readers hear them too. */
export function Toaster() {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    const add = (t: Item) => {
      setItems((s) => [...s, t]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== t.id)), 2600);
    };
    listeners.add(add);
    return () => void listeners.delete(add);
  }, []);
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          className="toast flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-3"
          style={{ background: 'var(--ink)', color: 'var(--on-ink)' }}
        >
          <Icon name="check" size={14} />
          {t.text}
        </div>
      ))}
    </div>
  );
}
