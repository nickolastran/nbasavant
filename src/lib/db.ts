import { PrismaClient } from '@prisma/client';

// Next dev reloads modules on every edit; reuse one client so we don't exhaust
// Postgres connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/** Season key -> row, cached per request path by Next's fetch-less data cache. */
export async function getSeason(key?: string) {
  if (key) return prisma.season.findUnique({ where: { key } });
  return prisma.season.findFirst({ where: { active: true }, orderBy: { startYear: 'desc' } });
}
