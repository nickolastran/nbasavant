/**
 * A season's playoff bracket, worked out from its games alone: two teams
 * meeting in the playoffs is a series, and a series' round is how many series
 * its teams have played before it. That holds for every format since 1947,
 * byes included, and needs no bracket feed.
 */

export type BracketGame = {
  id: number;
  date: Date;
  home: number;
  away: number;
  homeScore: number;
  awayScore: number;
  status: string;
};
export type BracketTeam = {
  id: number; abbr: string; name: string; color: string; conference: string | null; pct: number;
  /** Best record in its division. */
  divisionWinner: boolean;
};
export type Side = { team: BracketTeam; wins: number; seed: number | null };
export type Series = {
  round: number;
  /** The higher seed: the home team in game 1. */
  top: Side;
  bottom: Side;
  games: BracketGame[];
  winner: number | null;
};
export type Bracket = {
  /** Series by round, first round first. */
  rounds: Series[][];
  /**
   * The 16-team, two-conference bracket (1983-84 on), each half's rounds in
   * slot order with null for a series not set yet. Null in other formats.
   */
  halves: { conference: string; rounds: (Series | null)[][] }[] | null;
  finals: Series | null;
};

const played = (g: BracketGame) => g.status.startsWith('Final');

/**
 * `live`: the season is still going, so a series is only over at four wins.
 * A finished season's series went to whoever won more, best-of-3 or 5 included.
 * `divisionSeeds`: 2004-05 to 2014-15, when a division winner was seeded above
 * a better record that still had home court.
 */
export function bracket(
  games: BracketGame[], teams: Map<number, BracketTeam>, { live, divisionSeeds = false }: { live: boolean; divisionSeeds?: boolean },
): Bracket {
  const byPair = new Map<string, BracketGame[]>();
  for (const g of [...games].sort((a, b) => a.date.getTime() - b.date.getTime())) {
    const key = [g.home, g.away].sort((a, b) => a - b).join('-');
    byPair.set(key, [...(byPair.get(key) ?? []), g]);
  }

  const all = [...byPair.values()].map((gs): Series => {
    const [top, bottom] = [gs[0].home, gs[0].away].map((id) => ({
      team: teams.get(id)!,
      seed: null,
      wins: gs.filter((g) => played(g) && (g.home === id ? g.homeScore > g.awayScore : g.awayScore > g.homeScore)).length,
    }));
    const lead = top.wins > bottom.wins ? top : bottom.wins > top.wins ? bottom : null;
    const over = lead && (lead.wins >= 4 || (!live && gs.every(played)));
    return { round: 0, top, bottom, games: gs, winner: over ? lead.team.id : null };
  });

  // In order of game 1, a series is one round past the later of its teams' last
  // ones, so a team with a bye joins in round 2.
  // ponytail: two bye teams meeting each other (1974-76) read as round 1; BR's
  // playoff summary page names rounds if that ever matters.
  const last = new Map<number, number>();
  for (const s of all) {
    s.round = 1 + Math.max(last.get(s.top.team.id) ?? 0, last.get(s.bottom.team.id) ?? 0);
    last.set(s.top.team.id, s.round).set(s.bottom.team.id, s.round);
  }
  const rounds = Array.from({ length: Math.max(0, ...all.map((s) => s.round)) }, (_, i) => all.filter((s) => s.round === i + 1));
  const halves = halvesOf(rounds, divisionSeeds);
  // A modern bracket's Finals is round 4 (its round 2 can hold one series early on);
  // other formats end on a single series.
  const finals = halves ? rounds[3]?.[0] ?? null : rounds.length > 1 && rounds.at(-1)!.length === 1 ? rounds.at(-1)![0] : null;
  // The Finals show each side's conference seed.
  const seeds = new Map(halves?.flatMap((h) => h.rounds[0].flatMap((s) => [s!.top, s!.bottom].map((x) => [x.team.id, x.seed]))));
  if (finals) for (const x of [finals.top, finals.bottom]) x.seed = seeds.get(x.team.id) ?? null;
  return { rounds, halves, finals };
}

const ids = (s: Series) => [s.top.team.id, s.bottom.team.id];

/** The one series in `round` that any of `teams` played in. */
const find = (rounds: Series[][], round: number, teams: number[]) =>
  rounds[round - 1]?.find((s) => ids(s).some((id) => teams.includes(id))) ?? null;

function halvesOf(rounds: Series[][], divisionSeeds: boolean): Bracket['halves'] {
  const first = rounds[0] ?? [];
  const confs = [...new Set(first.map((s) => s.top.team.conference))];
  if (first.length !== 8 || confs.length !== 2 || confs.some((c) => !c)) return null;
  if (divisionSeeds) {
    for (const s of first) if (s.bottom.team.divisionWinner && !s.top.team.divisionWinner) [s.top, s.bottom] = [s.bottom, s.top];
  }

  return (confs as string[]).sort().map((conference) => {
    // ponytail: equal records order by game-1 home court, not the real tiebreakers.
    const tops = first.filter((s) => s.top.team.conference === conference).sort((a, b) => b.top.team.pct - a.top.team.pct);
    // The first-round series whose winner meets `t`'s winner in the second round, once one is set.
    const pairOf = (t: Series) => {
      const next = find(rounds, 2, ids(t));
      return next && tops.find((u) => u !== t && ids(u).some((id) => ids(next).includes(id)));
    };
    // The best record is the 1 seed, and its partner the 4/5 series. Taking the
    // partner from the second round when it's known keeps a division winner
    // seeded above a better record (2006-2015) in its true slot.
    const one = tops[0];
    const known = tops.slice(1).find((t) => t !== pairOf(one) && pairOf(t));
    const partner = pairOf(one) ?? (known ? tops.find((t) => t !== one && t !== known && t !== pairOf(known))! : tops[3]);
    const [two, three] = tops.filter((t) => t !== one && t !== partner);
    const slots = [one, partner, three, two];
    [1, 4, 3, 2].forEach((seed, i) => {
      slots[i].top.seed = seed;
      slots[i].bottom.seed = 9 - seed;
    });
    const seeds = new Map(slots.flatMap((s) => [s.top, s.bottom].map((x) => [x.team.id, x.seed] as const)));

    // Later rounds keep everyone's seed and put the team out of the upper slot on top.
    const place = (s: Series | null, upper: number[]) => {
      if (!s) return null;
      for (const x of [s.top, s.bottom]) x.seed = seeds.get(x.team.id) ?? null;
      if (!upper.includes(s.top.team.id)) [s.top, s.bottom] = [s.bottom, s.top];
      return s;
    };
    const half = [...ids(one), ...ids(partner)];
    const rest = [...ids(three), ...ids(two)];
    return {
      conference,
      rounds: [
        slots,
        [place(find(rounds, 2, half), ids(one)), place(find(rounds, 2, rest), ids(three))],
        [place(find(rounds, 3, [...half, ...rest]), half)],
      ],
    };
  });
}
