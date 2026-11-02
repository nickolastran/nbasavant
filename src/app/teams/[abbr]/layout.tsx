import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';

/** A real 404 for an unknown team; see players/[id]/layout.tsx. */
export default async function TeamLayout({ children, params }: { children: React.ReactNode; params: Promise<{ abbr: string }> }) {
  const abbreviation = (await params).abbr.toUpperCase();
  if (!(await prisma.team.count({ where: { abbreviation } }))) notFound();
  return children;
}
