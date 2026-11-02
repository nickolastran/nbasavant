import Link from 'next/link';

export const metadata = { title: 'Not found' };

/** Every notFound() and unmatched URL lands here, inside the site's own chrome. */
export default function NotFound() {
  return (
    <div className="panel mx-auto mt-10 max-w-xl px-6 py-12 text-center">
      <p className="eyebrow">404</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Air ball.</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm" style={{ color: 'var(--ink-2)' }}>
        There&apos;s no page here. The player, team or game may not exist, or the link is off. Try the search
        above, or start from one of these.
      </p>
      <nav className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/" className="tab">Home</Link>
        <Link href="/scores" className="tab">Scores</Link>
        <Link href="/players" className="tab">Players</Link>
        <Link href="/teams" className="tab">Teams</Link>
      </nav>
    </div>
  );
}
