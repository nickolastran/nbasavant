'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';

/** Light or dark. The choice is remembered; until one is made the system setting decides (see layout.tsx). */
export function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);
  useEffect(() => setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'), []);

  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {
      // Private mode: the choice lasts for this page only.
    }
    setTheme(next);
  };

  return (
    <button
      type="button"
      onClick={flip}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
      className="grid h-8 w-8 place-items-center rounded-md transition-colors hover:bg-[var(--panel-2)]"
      style={{ color: 'var(--ink-2)' }}
    >
      {/* Empty until mounted, so the server and the first client render agree. */}
      {theme && <Icon name={theme === 'dark' ? 'sun' : 'moon'} />}
    </button>
  );
}
