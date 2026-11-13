import Link from 'next/link';
import { Icon, type IconName } from '@/components/icons';

export const metadata = { title: 'Lab', description: 'Lineup builder, on/off explorer and roster builder.' };

const TOOLS: { href: string; icon: IconName; title: string; body: string }[] = [
  { href: '/lab/lineups', icon: 'court', title: 'Lineup builder', body: 'Put five teammates on the floor. See what the unit has done, or an estimate if it has barely played, and compare up to three.' },
  { href: '/lab/on-off', icon: 'chart', title: 'On/Off explorer', body: 'A team with a player on the floor and off it, with-or-without splits for two or three players, and the full pairwise grid.' },
  { href: '/lab/roster', icon: 'star', title: 'Build-a-Roster', body: 'Pick eight to ten players from anywhere in the league and see the team they project to, placed on the Title Zone chart.' },
];

export default function LabPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <p className="eyebrow">The lab</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">Take the numbers apart.</h1>
      <p className="mt-2 max-w-prose text-sm" style={{ color: 'var(--ink-2)' }}>
        Three tools built on lineup data from play-by-play (2026-27 on). Samples are small early in a season; every tool shows the minutes behind its numbers.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {TOOLS.map((t) => (
          <Link key={t.href} href={t.href} className="panel block p-4 no-underline transition-transform duration-fast hover:-translate-y-0.5" style={{ color: 'var(--ink)' }}>
            <Icon name={t.icon} size={22} />
            <h2 className="mt-3 text-base font-bold">{t.title}</h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--ink-2)' }}>
              {t.body}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
