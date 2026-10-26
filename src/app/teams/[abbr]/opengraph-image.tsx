import { latestSeason, prisma } from '@/lib/db';
import { OG_SIZE, imageData, ogCard } from '@/lib/og';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Team card';

export default async function Image({ params }: { params: Promise<{ abbr: string }> }) {
  const abbr = (await params).abbr.toUpperCase();
  const [team, season] = await Promise.all([prisma.team.findUnique({ where: { abbreviation: abbr } }), latestSeason()]);
  if (!team) return ogCard({ eyebrow: 'Team', title: 'Not found' });

  const [rec, logo] = await Promise.all([
    season ? prisma.teamStats.findFirst({ where: { teamId: team.id, seasonId: season.id } }) : null,
    imageData(`/logos/${abbr}.svg`),
  ]);
  return ogCard({
    eyebrow: `${team.conference} · ${team.division}`,
    title: `${team.city} ${team.name}`,
    subtitle: rec && season ? `${season.key}: ${rec.wins}-${rec.losses}` : undefined,
    accent: team.primaryColor,
    // eslint-disable-next-line @next/next/no-img-element
    art: logo ? <img src={logo} width={280} height={280} alt="" /> : undefined,
  });
}
