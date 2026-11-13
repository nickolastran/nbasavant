import type { Metadata } from 'next';
import { Archivo, Archivo_Narrow, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { ScoreboardBar } from '@/components/ScoreboardBar';
import { SiteFooter } from '@/components/SiteFooter';
import { Toaster } from '@/components/Toast';
import { SiteHeader } from '@/components/SiteHeader';
import { SAVANT_PATHS } from '@/lib/nav';
import { SITE_URL } from '@/lib/og';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'NBA Savant', template: '%s · NBA Savant' },
  description: 'Live scores, standings, stats and Savant-style analytics for every NBA season since 1946-47.',
  openGraph: { siteName: 'NBA Savant', type: 'website' },
  twitter: { card: 'summary_large_image' },
};

// Archivo for text; its Narrow cut for big numbers (scores, stat tiles), set by `.display`.
const archivo = Archivo({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const narrow = Archivo_Narrow({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
// The Savant side sets every number in a mono face (`--font-num`).
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-mono', display: 'swap' });

/**
 * Runs before first paint: the saved theme (or the system's) and the mode this
 * route belongs to go on <html>, so the page never flashes the wrong palette.
 */
const PRE_PAINT = `(function(){try{var d=document.documentElement,t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';d.dataset.theme=t;d.dataset.mode=new RegExp(${JSON.stringify(SAVANT_PATHS)}).test(location.pathname)?'savant':'general'}catch(e){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${narrow.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PRE_PAINT }} />
        {/* Headshots come from the NBA's CDN on nearly every page. */}
        <link rel="preconnect" href="https://cdn.nba.com" />
      </head>
      <body className="flex min-h-screen flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:px-3 focus:py-2"
          style={{ background: 'var(--panel)', color: 'var(--ink)' }}
        >
          Skip to content
        </a>

        <SiteHeader />

        <ScoreboardBar />

        <main id="main" className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6">
          {children}
        </main>

        <SiteFooter />
        <Toaster />
      </body>
    </html>
  );
}
