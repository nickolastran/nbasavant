import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';

/** A real 404 for an unknown game; see players/[id]/layout.tsx. */
export default async function GameLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || !(await prisma.game.count({ where: { id } }))) notFound();
  return children;
}
