/**
 * The Title Zone's numbers, all in one place. Ratings are points per 100
 * possessions relative to league average; defense is flipped so better is
 * positive on both axes.
 */
export const TITLE_ZONE = {
  /** In the zone: all three must hold. */
  minNet: 3.3,
  minRelOff: -1.0,
  minRelDef: -2.5,

  /** Title marks: a star goes to a zone team with at least `starAt` of the three. */
  starAt: 2,
  /** SRS (average margin plus strength of schedule) at or above this. */
  minSrs: 4.0,
  /** Conference seed at or better than this. */
  maxSeed: 3,
  /**
   * "40-20 pace": 40 wins before 20 losses. Once either number is reached the
   * mark is settled; before that, a win rate of 2/3 after `paceMinGames` holds it.
   */
  paceWins: 40,
  paceLosses: 20,
  paceMinGames: 10,

  /** Next-five schedule: points of net rating the home team is worth. */
  homeEdge: 2.5,
  /** Average venue-adjusted opponent net at or below `easy` is easy, at or above `hard` is hard. */
  easy: -1.5,
  hard: 1.5,
  /** How many upcoming games the projection looks at. */
  lookahead: 5,

  /** "Last 10" mode. */
  recentGames: 10,
  /** Champions before this season end year are left out of the historical check (pace and rules differ too much). */
  championsSince: 1980,
} as const;

export type TitleZoneConfig = typeof TITLE_ZONE;
