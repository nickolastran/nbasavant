import { TEAMS } from '../../prisma/teams';

/** Today's 30 franchises: the NBA's own id block. Relocated and folded teams use ids past it. */
export const TEAM_OPTIONS = [
  { value: '', label: 'All teams' },
  ...TEAMS.filter((t) => t.id <= 1610612766)
    .sort((a, b) => a.abbreviation.localeCompare(b.abbreviation))
    .map((t) => ({ value: t.abbreviation, label: `${t.abbreviation} — ${t.city} ${t.name}` })),
];

export const POSITION_OPTIONS = [
  { value: '', label: 'All positions' },
  ...['PG', 'SG', 'SF', 'PF', 'C'].map((p) => ({ value: p, label: p })),
];

export const seasonOptions = (seasons: { key: string }[]) =>
  seasons.map((s) => ({ value: s.key, label: s.key }));

export const TEAM_COLORS = Object.fromEntries(
  TEAMS.map((t) => [t.abbreviation, t.primaryColor]),
);
