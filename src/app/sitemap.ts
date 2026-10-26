import type { MetadataRoute } from 'next';
import { latestSeason, prisma } from '@/lib/db';
import { SITE_URL } from '@/lib/og';

export const revalidate = 86400;

const PAGES = [
  '', 'scores', 'game-feed', 'schedule', 'standings', 'leaders', 'players', 'team-stats', 'teams',
  'transactions', 'playoffs', 'draft', 'injuries', 'depth-charts', 'awards', 'salaries', 'compare', 'defense', 'lineups', 'shots', 'explorer',
];

// ponytail: one file, under the 50k-URL cap while games stay current-season only;
// split with generateSitemaps() if every season's games ever go in.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const season = await latestSeason();
  const [teams, players, games] = await Promise.all([
    prisma.team.findMany({ select: { abbreviation: true } }),
    prisma.player.findMany({ select: { id: true } }),
    season ? prisma.game.findMany({ where: { seasonId: season.id }, select: { id: true, date: true } }) : [],
  ]);
  return [
    ...PAGES.map((p) => ({ url: `${SITE_URL}/${p}`, changeFrequency: 'daily' as const })),
    ...teams.map((t) => ({ url: `${SITE_URL}/teams/${t.abbreviation}` })),
    ...players.map((p) => ({ url: `${SITE_URL}/players/${p.id}` })),
    ...games.map((g) => ({ url: `${SITE_URL}/games/${g.id}`, lastModified: g.date })),
  ];
}
