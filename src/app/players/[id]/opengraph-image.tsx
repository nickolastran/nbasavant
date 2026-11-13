import { prisma } from '@/lib/db';
import { fmt } from '@/lib/format';
import { OG_SIZE, imageData, ogCard } from '@/lib/og';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Player card';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id) || 0;
  const [player, line] = await Promise.all([
    prisma.player.findUnique({ where: { id }, include: { team: true } }),
    // The season's combined row has the most games when he was traded mid-year.
    prisma.playerStats.findFirst({
      where: { playerId: id },
      include: { season: true },
      orderBy: [{ season: { startYear: 'desc' } }, { gp: 'desc' }],
    }),
  ]);
  if (!player) return ogCard({ eyebrow: 'Player', title: 'Not found' });

  const photo = await imageData(`https://cdn.nba.com/headshots/nba/latest/1040x760/${id}.png`);
  return ogCard({
    eyebrow: [player.team ? `${player.team.city} ${player.team.name}` : null, player.position].filter(Boolean).join(' · ') || 'Player',
    title: player.fullName,
    subtitle: line
      ? `${line.season.key}: ${fmt(line.ppg)} PTS · ${fmt(line.rpg)} REB · ${fmt(line.apg)} AST`
      : undefined,
    accent: player.team?.primaryColor,
    art: photo ? <img src={photo} width={416} height={304} alt="" /> : undefined,
  });
}
