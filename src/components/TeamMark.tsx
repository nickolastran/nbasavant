'use client';

import { useState } from 'react';

/**
 * The three relocated franchises predate nba.com's logo CDN, so they fall back
 * to a colour block. Everyone else gets the real mark from `public/logos`.
 */
export function TeamMark({
  abbr,
  color = 'var(--mid)',
  size = 24,
}: {
  abbr: string;
  color?: string;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  const box = { width: size, height: size };
  if (broken) return <span className="shrink-0 rounded" style={{ ...box, background: color }} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/logos/${abbr}.svg`}
      alt=""
      {...box}
      className="team-mark shrink-0 object-contain"
      style={box}
      onError={() => setBroken(true)}
      // A logo that failed before hydration never fires onError for React; catch it on mount.
      ref={(img) => {
        if (img?.complete && !img.naturalWidth) setBroken(true);
      }}
    />
  );
}
