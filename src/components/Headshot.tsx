'use client';

import { useState } from 'react';

/**
 * The NBA's headshot for a person id. Players the site couldn't match to an
 * NBA id, and many from before the 1990s, have none; the image just goes away.
 */
export function Headshot({ id, name }: { id: number; name: string }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`}
      alt={name}
      width={130}
      height={95}
      referrerPolicy="no-referrer"
      onError={() => setOk(false)}
      className="h-[95px] w-[130px] shrink-0 self-end object-contain object-bottom"
    />
  );
}
