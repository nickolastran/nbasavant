import { getSeason, prisma } from '@/lib/db';
import { teamLab } from '@/lib/lab-data';
import { TEAM_OPTIONS } from '@/lib/options';

/** What every lab tool needs first: the season, the team the URL names (the first one otherwise) and its units. */
export async function labTeam(abbr: string | undefined) {
  const season = await getSeason();
  const options = TEAM_OPTIONS.filter((o) => o.value);
  const pick = options.find((o) => o.value === abbr?.toUpperCase()) ?? options[0];
  const team = await prisma.team.findUnique({ where: { abbreviation: pick.value } });
  const lab = season && team ? await teamLab(season.id, team.id) : { units: [], roster: [], games: 0 };
  return { season, team, options, lab };
}
