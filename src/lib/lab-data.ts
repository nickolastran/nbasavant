import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/db';
import { COUNT_KEYS, type Unit } from '@/lib/lineup';

export type LabPlayer = { id: number; name: string; pos: string | null; min: number };

/**
 * One team's season as five-man units (its lineup stints summed by who was on
 * the floor) and the players in them, most minutes first. Units, not stints:
 * a few hundred rows instead of thousands, and every lab tool only asks
 * "who was on together".
 */
async function build(seasonId: number, teamId: number) {
  const base = { players: true, seconds: true, pts: true, oppPts: true, poss: true, oppPoss: true, gameId: true } as const;
  const counts = Object.fromEntries(COUNT_KEYS.map((k) => [k, true])) as Record<(typeof COUNT_KEYS)[number], true>;
  // The four-factor counts are a later migration. A database that hasn't had it yet still gets the lab, without them.
  const stints: (Unit & { gameId: number })[] = await prisma.stint
    .findMany({ where: { seasonId, teamId }, select: { ...base, ...counts } })
    .catch(() => prisma.stint.findMany({ where: { seasonId, teamId }, select: base }));
  const byKey = new Map<string, Unit>();
  const seconds = new Map<number, number>();
  for (const s of stints) {
    const key = s.players.join();
    const u = byKey.get(key) ?? { players: s.players, seconds: 0, pts: 0, oppPts: 0, poss: 0, oppPoss: 0 };
    u.seconds += s.seconds; u.pts += s.pts; u.oppPts += s.oppPts; u.poss += s.poss; u.oppPoss += s.oppPoss;
    for (const k of COUNT_KEYS) if (s[k] !== undefined) u[k] = (u[k] ?? 0) + s[k]!;
    byKey.set(key, u);
    for (const id of s.players) seconds.set(id, (seconds.get(id) ?? 0) + s.seconds);
  }
  const people = await prisma.player.findMany({ where: { id: { in: [...seconds.keys()] } }, select: { id: true, fullName: true, position: true } });
  const roster: LabPlayer[] = people
    .map((p) => ({ id: p.id, name: p.fullName, pos: p.position, min: Math.round((seconds.get(p.id) ?? 0) / 60) }))
    .sort((a, b) => b.min - a.min);
  const round = (v: number) => Math.round(v * 10) / 10;
  return {
    units: [...byKey.values()].map((u) => ({ ...u, seconds: round(u.seconds), poss: round(u.poss), oppPoss: round(u.oppPoss) })),
    roster,
    games: new Set(stints.map((s) => s.gameId)).size,
  };
}

export const teamLab = unstable_cache(build, ['team-lab'], { revalidate: 300 });
export type TeamLab = Awaited<ReturnType<typeof build>>;
