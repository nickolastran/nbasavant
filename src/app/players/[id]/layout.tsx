import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';

/**
 * Settles "no such player" before loading.tsx streams its skeleton: once the
 * skeleton is sent the status is 200, so a notFound() in the page is too late.
 */
export default async function PlayerLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || !(await prisma.player.count({ where: { id } }))) notFound();
  return children;
}
