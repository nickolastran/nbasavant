import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { SiteSearch } from '@/components/SiteSearch';
import { ScoreboardBar } from '@/components/ScoreboardBar';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteNav } from '@/components/SiteNav';

export const metadata: Metadata = {
  title: { default: 'NBA Savant', template: '%s · NBA Savant' },
  description: 'Live scores, standings, stats and Savant-style analytics for every NBA season since 1946-47.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:px-3 focus:py-2"
          style={{ background: 'var(--panel)', color: 'var(--ink)' }}
        >
          Skip to content
        </a>

        <header className="border-b" style={{ background: 'var(--chrome)', borderColor: 'var(--line)' }}>
          <div className="flex items-center gap-4 px-4 py-3">
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
              <SiteSearch />
            </div>
          </div>
        </header>

        <SiteNav />

        <ScoreboardBar />

        <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6">
          {children}
        </main>

        <SiteFooter />
      </body>
    </html>
  );
}
