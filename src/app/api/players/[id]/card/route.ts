import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { bad, json } from '@/lib/api';
import { fmt } from '@/lib/format';
import { minGames, percentileOf } from '@/lib/stats';

export type PlayerCard = {
  id: number;
  name: string;
  position: string | null;
  team: { abbr: string; name: string; color: string } | null;
  season: string | null;
  /** "27.4 pts · 8.1 reb · 6.0 ast" */
  line: string | null;
  /** Empty when he hasn't played enough of the season to rank. */
  percentiles: { label: string; value: string; pct: number }[];
};

/** GET /api/players/201939/card — the hover card: who he is, his latest season line, a few percentiles. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isFinite(id)) return bad('Invalid player id');

  const [player, mine] = await Promise.all([
    prisma.player.findUnique({ where: { id }, include: { team: true } }),
    prisma.playerStats.findFirst({ where: { playerId: id }, orderBy: { season: { startYear: 'desc' } }, include: { season: true } }),
  ]);
  if (!player) return bad('Player not found', 404);

  const percentiles: PlayerCard['percentiles'] = [];
  if (mine) {
    const [field, adv] = await Promise.all([
      prisma.playerStats.findMany({ where: { seasonId: mine.seasonId }, select: { playerId: true, gp: true, ppg: true, rpg: true, apg: true, tsPct: true } }),
      prisma.advancedStats.findMany({ where: { seasonId: mine.seasonId }, select: { playerId: true, bpm: true } }),
    ]);
    const bpm = new Map(adv.map((a) => [a.playerId, a.bpm]));
    // ponytail: qualifies on the league's most-played team, not each player's own; the player page ranks the exact way.
    const floor = minGames(Math.max(0, ...field.map((f) => f.gp)));
    const qualified = field.filter((f) => f.gp >= floor);
    const metrics: { label: string; unit?: string; get: (f: (typeof field)[number]) => number | null }[] = [
      { label: 'Points', get: (f) => f.ppg },
      { label: 'Rebounds', get: (f) => f.rpg },
      { label: 'Assists', get: (f) => f.apg },
      { label: 'True shooting', unit: '%', get: (f) => f.tsPct },
      { label: 'Box +/-', get: (f) => bpm.get(f.playerId) ?? null },
    ];
    if (mine.gp >= floor) {
      for (const m of metrics) {
        const v = m.get(mine);
        const pool = qualified.map(m.get).filter((x): x is number => x !== null);
        if (v !== null && pool.length > 1) percentiles.push({ label: m.label, value: fmt(v, 1, m.unit), pct: percentileOf(v, pool) });
      }
    }
  }

  const card: PlayerCard = {
    id: player.id,
    name: player.fullName,
    position: player.position,
    team: player.team && { abbr: player.team.abbreviation, name: `${player.team.city} ${player.team.name}`, color: player.team.primaryColor },
    season: mine?.season.key ?? null,
    line: mine && [`${fmt(mine.ppg)} pts`, mine.rpg !== null && `${fmt(mine.rpg)} reb`, mine.apg !== null && `${fmt(mine.apg)} ast`].filter(Boolean).join(' · '),
    percentiles,
  };
  return json(card, { headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=3600' } });
}
