'use client';

import { useRouter } from 'next/navigation';
import { DatePicker } from '@/components/DatePicker';

/** The calendar button on /schedule: picking a day starts the week there, keeping any team filter. */
export function ScheduleDate({ date, team }: { date: string; team?: string }) {
  const router = useRouter();
  return (
    <DatePicker
      value={date}
      onChange={(d) => router.push(`/schedule?date=${d}${team ? `&team=${team}` : ''}`)}
    />
  );
}
