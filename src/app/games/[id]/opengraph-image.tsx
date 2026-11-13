import { prisma } from '@/lib/db';
import { OG_SIZE, imageData, ogCard } from '@/lib/og';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Game card';

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const game = await prisma.game.findUnique({
    where: { id: Number((await params).id) || 0 },
    include: { homeTeam: true, awayTeam: true },
  });
  if (!game) return ogCard({ eyebrow: 'Game', title: 'Not found' });

  const away = game.awayTeam.abbreviation;
  const home = game.homeTeam.abbreviation;
  const [awayLogo, homeLogo] = await Promise.all([imageData(`/logos/${away}.svg`), imageData(`/logos/${home}.svg`)]);
  const played = game.status.startsWith('Final') || game.homeScore + game.awayScore > 0;
  const day = game.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const mark = (src: string | null) => (src ? <img src={src} width={150} height={150} alt="" /> : null);

  return ogCard({
    eyebrow: [game.label, day].filter(Boolean).join(' · '),
    title: played ? `${away} ${game.awayScore}, ${home} ${game.homeScore}` : `${away} at ${home}`,
    subtitle: game.status,
    accent: game.homeTeam.primaryColor,
    art: (
      <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
        {mark(awayLogo)}
        {mark(homeLogo)}
      </div>
    ),
  });
}
