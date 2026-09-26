import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { page, respond } from '@/lib/api';

const SORTS = ['netRtg', 'ortg', 'drtg', 'pace', 'wins', 'efgPct', 'tsPct', 'tovPct', 'sos'] as const;

/** GET /api/teams?season=2024-25&conference=East&sort=netRtg */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const { limit, offset } = page(sp, 30);
  const season = sp.get('season');
  const conference = sp.get('conference');
  const sortKey = (SORTS as readonly string[]).includes(sp.get('sort') ?? '')
    ? (sp.get('sort') as (typeof SORTS)[number])
    : 'netRtg';
  const dir = sp.get('dir') === 'asc' ? 1 : -1;

  const rows = await prisma.teamStats.findMany({
    where: {
      ...(season ? { season: { key: season } } : {}),
      ...(conference ? { conference } : {}),
    },
    // At most 30 rows per season, so sort in memory and page after — sorting
    // before paging is the only way `sort` means anything.
    include: { team: true, season: { select: { key: true } } },
  });

  const out = rows
    .map((r) => ({
      teamId: r.teamId,
      team: r.team.abbreviation,
      color: r.team.primaryColor,
      name: r.name ?? `${r.team.city} ${r.team.name}`,
      conference: r.conference,
      division: r.division,
      season: r.season.key,
      gp: r.gp, wins: r.wins, losses: r.losses,
      pace: r.pace, ortg: r.ortg, drtg: r.drtg, netRtg: r.netRtg,
      efgPct: r.efgPct, tsPct: r.tsPct, tovPct: r.tovPct,
      orebPct: r.orebPct, drebPct: r.drebPct, ftRate: r.ftRate,
      oppEfgPct: r.oppEfgPct, oppTovPct: r.oppTovPct,
      sos: r.sos,
      drtgByPosition: r.drtgByPosition,
    }))
    // drtg is a "lower is better" stat: descending should mean best defense first.
    .sort((a, b) =>
      a[sortKey] === null ? 1 : b[sortKey] === null ? -1 : (a[sortKey]! - b[sortKey]!) * (sortKey === 'drtg' ? -dir : dir),
    )
    .slice(offset, offset + limit);

  return respond(out, sp, `teams-${season ?? 'all'}`);
}
