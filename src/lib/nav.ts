/** The site's two halves and where each page lives. Shared by the nav, the palette and the pre-paint script. */
export type Mode = 'general' | 'savant';

/** Routes on the analytics side. Everything else is General. A string so the pre-paint script can inline it. */
export const SAVANT_PATHS =
  '^/(explorer|compare|shots|defense|lineups|lab|brand|teams/(landscape|fingerprints)|players/compare-scatter)(/|$)';

export const modeOf = (path: string): Mode => (new RegExp(SAVANT_PATHS).test(path) ? 'savant' : 'general');

export type NavItem = { href: string; label: string; hint?: string };

/** The always-visible section row, per mode. General's order matches the printed box score's. */
export const TABS: Record<Mode, NavItem[]> = {
  general: [
    { href: '/scores', label: 'Scores' },
    { href: '/game-feed', label: 'Game Feed' },
    { href: '/schedule', label: 'Schedule' },
    { href: '/standings', label: 'Standings' },
    { href: '/leaders', label: 'Stat Leaders' },
    { href: '/players', label: 'Player Stats' },
    { href: '/team-stats', label: 'Team Stats' },
    { href: '/teams', label: 'Teams' },
    { href: '/transactions', label: 'Transactions' },
  ],
  savant: [
    { href: '/explorer', label: 'Leaderboards' },
    { href: '/teams/landscape', label: 'Title Zone' },
    { href: '/players/compare-scatter', label: 'Player Scatter' },
    { href: '/teams/fingerprints', label: 'Fingerprints' },
    { href: '/compare', label: 'Compare' },
    { href: '/shots', label: 'Shot Charts' },
    { href: '/defense', label: 'Defense' },
    { href: '/lineups', label: 'Lineups' },
    { href: '/lab', label: 'Lab' },
  ],
};

/** The cube: everything that doesn't earn a permanent tab. */
export const CUBE: NavItem[] = [
  { href: '/draft', label: 'Draft', hint: 'Classes and career output' },
  { href: '/injuries', label: 'Injuries', hint: 'Report and status' },
  { href: '/depth-charts', label: 'Depth Charts', hint: 'Rotations by position' },
  { href: '/playoffs', label: 'Playoffs', hint: 'Bracket for every season' },
  { href: '/awards', label: 'Awards', hint: 'MVP, DPOY, ROY race' },
  { href: '/salaries', label: 'Salaries', hint: 'Cap sheets and deals' },
  { href: '/brand', label: 'Brand', hint: 'Colors, type and logo' },
  { href: '/api-docs', label: 'API', hint: 'The data, as JSON' },
];

/** Where the mode toggle lands. */
export const HOME: Record<Mode, string> = { general: '/', savant: '/explorer' };
