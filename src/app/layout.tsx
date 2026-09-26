import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { PlayerSearch } from '@/components/PlayerSearch';
import { ScoreboardBar } from '@/components/ScoreboardBar';
import { SiteNav } from '@/components/SiteNav';

export const metadata: Metadata = {
  title: { default: 'NBA Savant', template: '%s · NBA Savant' },
  description: 'Live scores, standings, stats and Savant-style analytics for every NBA season since 1946-47.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:px-3 focus:py-2"
          style={{ background: 'var(--panel)', color: 'var(--ink)' }}
        >
          Skip to content
        </a>

        <header className="border-b" style={{ background: 'var(--chrome)', borderColor: 'var(--line)' }}>
          <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-4 py-3">
            <Link
              href="/"
              className="flex items-baseline text-lg font-extrabold uppercase tracking-tight no-underline"
              style={{ color: 'var(--ink)' }}
            >
              NBA
              <span className="px-[1px] font-light" style={{ color: 'var(--ink-3)' }}>
                //
              </span>
              Savant
            </Link>

            <div className="ml-auto flex items-center gap-3">
              <PlayerSearch />
            </div>
          </div>
        </header>

        <SiteNav />

        <ScoreboardBar />

        <main id="main" className="mx-auto max-w-[1440px] px-4 py-6">
          {children}
        </main>

        <footer
          className="mt-12 border-t px-4 py-6 text-xs"
          style={{ borderColor: 'var(--line)', color: 'var(--ink-3)' }}
        >
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3">
            <span>
              Every season since 1946-47 from basketball-reference.com; scores, box scores, play-by-play,
              shots, rosters and transactions from the NBA&apos;s own feeds. Shot charts before 2026-27 are
              derived to match each player&apos;s published shooting splits.
            </span>
            <a href="/api-docs" className="link">
              API docs
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
