import { notFound } from 'next/navigation';
import { preload } from 'react-dom';
import { prisma } from '@/lib/db';

/**
 * Settles "no such player" before loading.tsx streams its skeleton: once the
 * skeleton is sent the status is 200, so a notFound() in the page is too late.
 */
export default async function PlayerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || !(await prisma.player.count({ where: { id } }))) notFound();
  // The headshot is the page's largest image, but the page itself streams in after its queries.
  // Asking for it here puts the request in the first bytes of the response.
  if (id < 2_000_000) preload(`https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`, { as: 'image', fetchPriority: 'high', referrerPolicy: 'no-referrer' });
  return children;
}
