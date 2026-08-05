'use client';

import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => setDark(document.documentElement.classList.contains('dark')), []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  return (
    <button
      onClick={toggle}
      aria-pressed={dark}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="rounded border border-white/20 px-2 py-1.5 text-xs font-medium transition-colors hover:bg-white/10"
      style={{ color: 'var(--on-chrome)' }}
    >
      {dark ? '☀ Light' : '☾ Dark'}
    </button>
  );
}
