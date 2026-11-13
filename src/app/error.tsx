'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * A page that threw (the database or an NBA feed down, usually) renders here,
 * keeping the nav and scoreboard so the rest of the site is a click away.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="panel mx-auto mt-10 max-w-xl px-6 py-12 text-center">
      <p className="eyebrow">Something broke</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Turnover.</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm" style={{ color: 'var(--ink-2)' }}>
        This page couldn&apos;t load. A data source may be down for a moment. Try again, or head somewhere else.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="tab"
          style={{ background: 'var(--ink)', borderColor: 'var(--ink)', color: 'var(--on-ink)' }}
        >
          Try again
        </button>
        <Link href="/" className="tab">Home</Link>
        <Link href="/scores" className="tab">Scores</Link>
      </div>
      {error.digest && (
        <p className="tnum mt-6 text-[0.6875rem]" style={{ color: 'var(--ink-3)' }}>
          Error ID {error.digest}
        </p>
      )}
    </div>
  );
}
