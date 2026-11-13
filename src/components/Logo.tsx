/**
 * The mark: three percentile tracks with their dots at poor, average and
 * elite, the site's signature chart in 24 pixels. The wordmark sets NBA and
 * Savant in the same heavy caps with a light double slash between.
 */
export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className="shrink-0">
      <rect width="24" height="24" rx="5" fill="var(--ink)" />
      <g stroke="var(--on-ink)" strokeOpacity="0.35" strokeWidth="1.5" strokeLinecap="round">
        <path d="M5 7h14M5 12h14M5 17h14" />
      </g>
      <circle cx="8" cy="7" r="2.4" fill="var(--cold)" />
      <circle cx="12" cy="12" r="2.4" fill="var(--mid)" />
      <circle cx="17" cy="17" r="2.4" fill="var(--hot)" />
    </svg>
  );
}

export function Wordmark({ className = 'text-lg' }: { className?: string }) {
  return (
    <span className={`flex items-baseline font-extrabold uppercase tracking-tight ${className}`} style={{ color: 'var(--ink)' }}>
      NBA
      <span className="px-[1px] font-light" style={{ color: 'var(--ink-3)' }}>
        {'//'}
      </span>
      Savant
    </span>
  );
}
