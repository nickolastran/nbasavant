import { OG_SIZE, ogCard } from '@/lib/og';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'NBA Savant';

export default function Image() {
  return ogCard({
    eyebrow: 'Every season since 1946-47',
    title: 'Live scores, stats and shot charts',
    subtitle: 'Savant-style analytics for the NBA',
  });
}
