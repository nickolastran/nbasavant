'use client';

import { useEffect, useState } from 'react';
import { localTip } from '@/lib/dates';

/** A game's status with any "7:30 pm ET" tip-off shown in the viewer's zone. The server prints ET; the browser swaps it after hydration. */
export function Tip({ day, status }: { day: string; status: string }) {
  const [text, setText] = useState(status);
  useEffect(() => setText(localTip(day, status)), [day, status]);
  return <>{text}</>;
}
