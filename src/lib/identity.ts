/**
 * One player, two sources. basketball-reference names him by slug
 * ("jamesle01"); the NBA's feeds by person id (2544). The site keys players by
 * the NBA id, so each slug is resolved once: by name, then by the seasons he
 * played, which is what tells two Chris Johnsons apart.
 */

/** Letters NFD leaves alone because they aren't an accent on a base letter. */
const LETTERS: Record<string, string> = { ı: 'i', ł: 'l', ø: 'o', đ: 'd', ß: 'ss', æ: 'ae', œ: 'oe' };

export const normName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[ıłøđßæœ]/g, (c) => LETTERS[c])
    .replace(/[.'’`-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // Only a trailing suffix: "J.R. Smith" is J.R., not a junior.
    .replace(/ (jr|sr|ii|iii|iv)$/, '');

/** A player the NBA knows. from/to are the start years of his first and last seasons. */
export type Candidate = { id: number; first: string; last: string; from: number; to: number };

const overlap = (a0: number, a1: number, b0: number, b1: number) =>
  Math.min(a1, b1) - Math.max(a0, b0) + 1;

/**
 * The candidate whose career overlaps most with [from, to]. A year of slack
 * either side absorbs the sources disagreeing about when a season "starts".
 * undefined: nobody from that era. null: a tie, so no safe answer.
 */
function pick(cands: Candidate[], from: number, to: number): number | null | undefined {
  const fits = cands
    .filter((c) => overlap(c.from, c.to, from - 1, to + 1) > 0)
    .map((c) => ({ id: c.id, score: overlap(c.from, c.to, from, to) }))
    .sort((a, b) => b.score - a.score);
  if (!fits.length) return undefined;
  return fits.length === 1 || fits[0].score > fits[1].score ? fits[0].id : null;
}

export function matcher(candidates: Candidate[]) {
  const byName = new Map<string, Candidate[]>();
  const bySurname = new Map<string, (Candidate & { given: string })[]>();
  const add = <T>(m: Map<string, T[]>, k: string, v: T) => m.set(k, [...(m.get(k) ?? []), v]);

  for (const c of candidates) {
    const [first, last] = [normName(c.first), normName(c.last)];
    // Both orders: the NBA files Sun Yue as first "Yue", last "Sun".
    // Trimmed before de-duplicating: a one-name player (Nenê) would otherwise
    // be filed twice under the same key and tie with himself.
    for (const key of new Set([`${first} ${last}`.trim(), `${last} ${first}`.trim()])) add(byName, key, c);
    add(bySurname, last.split(' ').at(-1)!, { ...c, given: first.replace(/ /g, '') });
  }

  return (name: string, from: number, to: number): number | null => {
    const key = normName(name);
    const exact = pick(byName.get(key) ?? [], from, to);
    if (exact !== undefined) return exact;

    // Nicknames: Ron / Ronald, Vince / Vincent, Adama-Alpha / Adama. Same
    // surname, one given name a prefix of the other, same era, one answer.
    const words = key.split(' ');
    const given = words.slice(0, -1).join('');
    if (!given) return null;
    const nick = (bySurname.get(words.at(-1)!) ?? []).filter(
      (c) => c.given && (c.given.startsWith(given) || given.startsWith(c.given)),
    );
    return pick(nick, from, to) ?? null;
  };
}

/**
 * The id the old ingest hashed out of a slug (FNV-1a). Players the matcher
 * can't place keep it, so their URLs don't move between ingests.
 */
export function legacyId(slug: string) {
  let h = 0x811c9dc5;
  for (const ch of slug) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  return h >>> 1 || 1;
}

/**
 * Slugs the matcher gets wrong or can't place, pinned by hand. Only players
 * from 2015 on need to be here: before that no NBA feed refers to them, so an
 * unmatched old-timer costs a missing bio, not a duplicate player.
 */
export const OVERRIDES: Record<string, number> = {};

export function resolvePlayer(
  slug: string,
  name: string,
  from: number,
  to: number,
  match: (name: string, from: number, to: number) => number | null,
  overrides: Record<string, number> = OVERRIDES,
): { id: number; matched: boolean } {
  const id = overrides[slug] ?? match(name, from, to);
  return id ? { id, matched: true } : { id: legacyId(slug), matched: false };
}
