'use client';

import { useRouter } from 'next/navigation';
import { DatePicker } from '@/components/DatePicker';

/** The calendar button on /game-feed: picking a day shows that day's leaders. */
export function FeedDate({ date }: { date: string }) {
  const router = useRouter();
  return <DatePicker value={date} onChange={(d) => router.push(`/game-feed?date=${d}`)} />;
}
