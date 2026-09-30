const LINKS = [
  {
    label: 'Source on GitHub',
    href: 'https://github.com/nickolastran/nbasavant',
    icon: 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z',
  },
  {
    label: 'LinkedIn',
    href: 'https://www.linkedin.com/in/nickolas-tran/',
    icon: 'M0 1.15C0 .52.52 0 1.17 0h13.66C15.48 0 16 .52 16 1.15v13.7c0 .63-.52 1.15-1.17 1.15H1.17C.52 16 0 15.48 0 14.85V1.15zM4.74 13.4V6.17H2.34v7.23h2.4zM3.54 5.18c.84 0 1.36-.56 1.36-1.25-.02-.71-.52-1.25-1.34-1.25-.82 0-1.36.54-1.36 1.25 0 .69.52 1.25 1.33 1.25h.01zM8.48 13.4V9.36c0-.22.02-.43.08-.59.18-.43.57-.88 1.23-.88.87 0 1.22.66 1.22 1.64v3.87h2.4V9.25c0-2.22-1.18-3.25-2.76-3.25-1.29 0-1.86.71-2.18 1.21V6.17h-2.4c.03.68 0 7.23 0 7.23h2.4z',
  },
  {
    label: 'Website',
    href: 'https://nickolastran.vercel.app/',
    icon: 'M8 0a8 8 0 100 16A8 8 0 008 0zm5.9 7h-2.43a12.5 12.5 0 00-1.1-4.84A6.02 6.02 0 0113.9 7zM8 14c-.73 0-1.93-1.9-2.2-5h4.4c-.27 3.1-1.47 5-2.2 5zM5.8 7c.27-3.1 1.47-5 2.2-5s1.93 1.9 2.2 5H5.8zm-.17-4.84A12.5 12.5 0 004.53 7H2.1a6.02 6.02 0 013.53-4.84zM2.1 9h2.43c.1 1.8.49 3.5 1.1 4.84A6.02 6.02 0 012.1 9zm8.27 4.84c.61-1.34 1-3.04 1.1-4.84h2.43a6.02 6.02 0 01-3.53 4.84z',
  },
];

/** Site-wide footer: credit on the left, data note and outbound links on the right. */
export function SiteFooter() {
  return (
    <footer className="mt-12 border-t" style={{ borderColor: 'var(--line)', color: 'var(--ink-2)' }}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 text-[0.6875rem] uppercase tracking-[0.08em]">
        <span>© {new Date().getFullYear()} Nickolas Tran · NBA//Savant</span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-2">Data: NBA.com, Basketball-Reference. Not affiliated with the NBA.</span>
          {LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 rounded border px-2.5 py-1 no-underline transition-colors hover:bg-[var(--panel-2)]"
              style={{ borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
            >
              <svg aria-hidden viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                <path d={l.icon} />
              </svg>
              {l.label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
