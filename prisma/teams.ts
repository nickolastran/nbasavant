/** Real NBA team metadata: every franchise that has played since the BAA tipped off in 1946-47. */
export const TEAMS = [
  { id: 1610612737, abbreviation: 'ATL', city: 'Atlanta', name: 'Hawks', conference: 'East', division: 'Southeast', primaryColor: '#e03a3e' },
  { id: 1610612738, abbreviation: 'BOS', city: 'Boston', name: 'Celtics', conference: 'East', division: 'Atlantic', primaryColor: '#007a33' },
  { id: 1610612751, abbreviation: 'BKN', city: 'Brooklyn', name: 'Nets', conference: 'East', division: 'Atlantic', primaryColor: '#000000' },
  { id: 1610612766, abbreviation: 'CHA', city: 'Charlotte', name: 'Hornets', conference: 'East', division: 'Southeast', primaryColor: '#1d1160' },
  { id: 1610612741, abbreviation: 'CHI', city: 'Chicago', name: 'Bulls', conference: 'East', division: 'Central', primaryColor: '#ce1141' },
  { id: 1610612739, abbreviation: 'CLE', city: 'Cleveland', name: 'Cavaliers', conference: 'East', division: 'Central', primaryColor: '#860038' },
  { id: 1610612742, abbreviation: 'DAL', city: 'Dallas', name: 'Mavericks', conference: 'West', division: 'Southwest', primaryColor: '#00538c' },
  { id: 1610612743, abbreviation: 'DEN', city: 'Denver', name: 'Nuggets', conference: 'West', division: 'Northwest', primaryColor: '#0e2240' },
  { id: 1610612765, abbreviation: 'DET', city: 'Detroit', name: 'Pistons', conference: 'East', division: 'Central', primaryColor: '#c8102e' },
  { id: 1610612744, abbreviation: 'GSW', city: 'Golden State', name: 'Warriors', conference: 'West', division: 'Pacific', primaryColor: '#1d428a' },
  { id: 1610612745, abbreviation: 'HOU', city: 'Houston', name: 'Rockets', conference: 'West', division: 'Southwest', primaryColor: '#ce1141' },
  { id: 1610612754, abbreviation: 'IND', city: 'Indiana', name: 'Pacers', conference: 'East', division: 'Central', primaryColor: '#002d62' },
  { id: 1610612746, abbreviation: 'LAC', city: 'Los Angeles', name: 'Clippers', conference: 'West', division: 'Pacific', primaryColor: '#c8102e' },
  { id: 1610612747, abbreviation: 'LAL', city: 'Los Angeles', name: 'Lakers', conference: 'West', division: 'Pacific', primaryColor: '#552583' },
  { id: 1610612763, abbreviation: 'MEM', city: 'Memphis', name: 'Grizzlies', conference: 'West', division: 'Southwest', primaryColor: '#5d76a9' },
  { id: 1610612748, abbreviation: 'MIA', city: 'Miami', name: 'Heat', conference: 'East', division: 'Southeast', primaryColor: '#98002e' },
  { id: 1610612749, abbreviation: 'MIL', city: 'Milwaukee', name: 'Bucks', conference: 'East', division: 'Central', primaryColor: '#00471b' },
  { id: 1610612750, abbreviation: 'MIN', city: 'Minnesota', name: 'Timberwolves', conference: 'West', division: 'Northwest', primaryColor: '#0c2340' },
  { id: 1610612740, abbreviation: 'NOP', city: 'New Orleans', name: 'Pelicans', conference: 'West', division: 'Southwest', primaryColor: '#0c2340' },
  { id: 1610612752, abbreviation: 'NYK', city: 'New York', name: 'Knicks', conference: 'East', division: 'Atlantic', primaryColor: '#006bb6' },
  { id: 1610612760, abbreviation: 'OKC', city: 'Oklahoma City', name: 'Thunder', conference: 'West', division: 'Northwest', primaryColor: '#007ac1' },
  { id: 1610612753, abbreviation: 'ORL', city: 'Orlando', name: 'Magic', conference: 'East', division: 'Southeast', primaryColor: '#0077c0' },
  { id: 1610612755, abbreviation: 'PHI', city: 'Philadelphia', name: '76ers', conference: 'East', division: 'Atlantic', primaryColor: '#006bb6' },
  { id: 1610612756, abbreviation: 'PHX', city: 'Phoenix', name: 'Suns', conference: 'West', division: 'Pacific', primaryColor: '#1d1160' },
  { id: 1610612757, abbreviation: 'POR', city: 'Portland', name: 'Trail Blazers', conference: 'West', division: 'Northwest', primaryColor: '#e03a3e' },
  { id: 1610612758, abbreviation: 'SAC', city: 'Sacramento', name: 'Kings', conference: 'West', division: 'Pacific', primaryColor: '#5a2d81' },
  { id: 1610612759, abbreviation: 'SAS', city: 'San Antonio', name: 'Spurs', conference: 'West', division: 'Southwest', primaryColor: '#c4ced4' },
  { id: 1610612761, abbreviation: 'TOR', city: 'Toronto', name: 'Raptors', conference: 'East', division: 'Atlantic', primaryColor: '#ce1141' },
  { id: 1610612762, abbreviation: 'UTA', city: 'Utah', name: 'Jazz', conference: 'West', division: 'Northwest', primaryColor: '#002b5c' },
  { id: 1610612764, abbreviation: 'WAS', city: 'Washington', name: 'Wizards', conference: 'East', division: 'Southeast', primaryColor: '#002b5c' },
  // Relocated franchises kept as their own rows so pre-move seasons aren't
  // labelled with the current city. stats.nba.com reuses one id per franchise
  // across relocations, so these ids are ours (the next free ones in the block).
  { id: 1610612767, abbreviation: 'SEA', city: 'Seattle', name: 'SuperSonics', conference: 'West', division: 'Northwest', primaryColor: '#00653a' },
  { id: 1610612768, abbreviation: 'VAN', city: 'Vancouver', name: 'Grizzlies', conference: 'West', division: 'Midwest', primaryColor: '#00727a' },
  { id: 1610612769, abbreviation: 'NJN', city: 'New Jersey', name: 'Nets', conference: 'East', division: 'Atlantic', primaryColor: '#002a60' },
  // Earlier relocations, back to 1946-47, keyed by basketball-reference's
  // abbreviation. conference/division here are only a fallback: each season's
  // real alignment is stored on TeamStats, straight from that year's standings.
  { id: 1610612770, abbreviation: 'MNL', city: 'Minneapolis', name: 'Lakers', conference: 'West', division: 'Western', primaryColor: '#1d428a' },
  { id: 1610612771, abbreviation: 'PHW', city: 'Philadelphia', name: 'Warriors', conference: 'East', division: 'Eastern', primaryColor: '#1d428a' },
  { id: 1610612772, abbreviation: 'SFW', city: 'San Francisco', name: 'Warriors', conference: 'West', division: 'Western', primaryColor: '#1d428a' },
  { id: 1610612773, abbreviation: 'TRI', city: 'Tri-Cities', name: 'Blackhawks', conference: 'West', division: 'Western', primaryColor: '#c8102e' },
  { id: 1610612774, abbreviation: 'MLH', city: 'Milwaukee', name: 'Hawks', conference: 'West', division: 'Western', primaryColor: '#c8102e' },
  { id: 1610612775, abbreviation: 'STL', city: 'St. Louis', name: 'Hawks', conference: 'West', division: 'Western', primaryColor: '#c8102e' },
  { id: 1610612776, abbreviation: 'FTW', city: 'Fort Wayne', name: 'Pistons', conference: 'West', division: 'Western', primaryColor: '#c8102e' },
  { id: 1610612777, abbreviation: 'ROC', city: 'Rochester', name: 'Royals', conference: 'West', division: 'Western', primaryColor: '#002d62' },
  { id: 1610612778, abbreviation: 'CIN', city: 'Cincinnati', name: 'Royals', conference: 'East', division: 'Eastern', primaryColor: '#002d62' },
  { id: 1610612779, abbreviation: 'KCK', city: 'Kansas City', name: 'Kings', conference: 'West', division: 'Midwest', primaryColor: '#c8102e' },
  { id: 1610612780, abbreviation: 'SYR', city: 'Syracuse', name: 'Nationals', conference: 'East', division: 'Eastern', primaryColor: '#c8102e' },
  { id: 1610612781, abbreviation: 'CHZ', city: 'Chicago', name: 'Zephyrs', conference: 'West', division: 'Western', primaryColor: '#006bb6' },
  { id: 1610612782, abbreviation: 'BAL', city: 'Baltimore', name: 'Bullets', conference: 'East', division: 'Eastern', primaryColor: '#002b5c' },
  { id: 1610612783, abbreviation: 'SDR', city: 'San Diego', name: 'Rockets', conference: 'West', division: 'Western', primaryColor: '#006bb6' },
  { id: 1610612784, abbreviation: 'BUF', city: 'Buffalo', name: 'Braves', conference: 'East', division: 'Atlantic', primaryColor: '#006bb6' },
  { id: 1610612785, abbreviation: 'SDC', city: 'San Diego', name: 'Clippers', conference: 'West', division: 'Pacific', primaryColor: '#006bb6' },
  { id: 1610612786, abbreviation: 'NOJ', city: 'New Orleans', name: 'Jazz', conference: 'East', division: 'Central', primaryColor: '#5a2d81' },
  { id: 1610612787, abbreviation: 'NYN', city: 'New York', name: 'Nets', conference: 'East', division: 'Atlantic', primaryColor: '#002a60' },
  // Franchises that folded, most of them in the BAA's first four seasons.
  { id: 1610612788, abbreviation: 'AND', city: 'Anderson', name: 'Packers', conference: 'West', division: 'Western', primaryColor: '#c8102e' },
  { id: 1610612789, abbreviation: 'BLB', city: 'Baltimore', name: 'Bullets', conference: 'East', division: 'Eastern', primaryColor: '#c8102e' },
  { id: 1610612790, abbreviation: 'CHS', city: 'Chicago', name: 'Stags', conference: 'West', division: 'Western', primaryColor: '#c8102e' },
  { id: 1610612791, abbreviation: 'CLR', city: 'Cleveland', name: 'Rebels', conference: 'West', division: 'Western', primaryColor: '#002d62' },
  { id: 1610612792, abbreviation: 'DNN', city: 'Denver', name: 'Nuggets', conference: 'West', division: 'Western', primaryColor: '#0e2240' },
  { id: 1610612793, abbreviation: 'DTF', city: 'Detroit', name: 'Falcons', conference: 'West', division: 'Western', primaryColor: '#c8102e' },
  { id: 1610612794, abbreviation: 'INJ', city: 'Indianapolis', name: 'Jets', conference: 'West', division: 'Western', primaryColor: '#002d62' },
  { id: 1610612795, abbreviation: 'INO', city: 'Indianapolis', name: 'Olympians', conference: 'West', division: 'Western', primaryColor: '#002d62' },
  { id: 1610612796, abbreviation: 'PIT', city: 'Pittsburgh', name: 'Ironmen', conference: 'West', division: 'Western', primaryColor: '#16181c' },
  { id: 1610612797, abbreviation: 'PRO', city: 'Providence', name: 'Steamrollers', conference: 'East', division: 'Eastern', primaryColor: '#002d62' },
  { id: 1610612798, abbreviation: 'SHE', city: 'Sheboygan', name: 'Red Skins', conference: 'West', division: 'Western', primaryColor: '#c8102e' },
  { id: 1610612799, abbreviation: 'STB', city: 'St. Louis', name: 'Bombers', conference: 'West', division: 'Western', primaryColor: '#c8102e' },
  { id: 1610612800, abbreviation: 'TRH', city: 'Toronto', name: 'Huskies', conference: 'East', division: 'Eastern', primaryColor: '#002d62' },
  { id: 1610612801, abbreviation: 'WAT', city: 'Waterloo', name: 'Hawks', conference: 'West', division: 'Western', primaryColor: '#c8102e' },
  { id: 1610612802, abbreviation: 'WSC', city: 'Washington', name: 'Capitols', conference: 'East', division: 'Eastern', primaryColor: '#002b5c' },
];

/** Relocated franchises' old rows, by the current team they became. Folded franchises have none. */
export const SUCCESSOR: Record<string, string> = {
  SEA: 'OKC', VAN: 'MEM', NJN: 'BKN', NYN: 'BKN', MNL: 'LAL', PHW: 'GSW', SFW: 'GSW',
  TRI: 'ATL', MLH: 'ATL', STL: 'ATL', FTW: 'DET', ROC: 'SAC', CIN: 'SAC', KCK: 'SAC',
  SYR: 'PHI', CHZ: 'WAS', BAL: 'WAS', SDR: 'HOU', BUF: 'LAC', SDC: 'LAC', NOJ: 'UTA',
};

/** Names a current franchise went by without getting a row of its own (renamed in place). */
export const FORMER_NAMES: Record<string, string[]> = {
  WAS: ['Capital Bullets', 'Washington Bullets'],
  CHA: ['Charlotte Bobcats'],
  NOP: ['New Orleans Hornets', 'New Orleans/Oklahoma City Hornets'],
};
