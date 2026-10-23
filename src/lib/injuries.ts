/**
 * The NBA's official injury report: the league's own list, per game, of who is
 * Out, Doubtful, Questionable, Probable or Available and why. The league only
 * publishes it as a PDF, a new one every 15 minutes on game days, all linked
 * from one page per season. This finds the right report for a game, reads its
 * table, and hands back that game's rows.
 */
import { getDocumentProxy } from 'unpdf';
import { TEAMS } from '../../prisma/teams';
import { todayEt } from './dates';

export type Injury = { team: string; name: string; status: string; reason: string };
/** One positioned word off a PDF page: x from the left, y from the bottom, in points. */
export type Word = { x: number; y: number; str: string };

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
// Today's franchises only: "Denver Nuggets" is also the 1949-50 team.
const TEAM_BY_NAME = new Map(
  TEAMS.filter((t) => t.id <= 1610612766).map((t) => [`${t.city} ${t.name}`, t.abbreviation]),
);

/** "Udeh, Jr., Ernest" -> "Ernest Udeh Jr."; "Allen, Jarrett" -> "Jarrett Allen". */
export function displayName(listed: string) {
  const parts = listed.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return listed.trim();
  const first = parts.pop()!;
  return `${first} ${parts.join(' ')}`;
}

/**
 * The report's rows from its words, page by page in reading order. Columns
 * come from the header row's own positions; only the first page has one, and
 * the rest keep its layout. A row is anchored on its status cell. The game,
 * matchup and team cells appear only on a group's first row, so they carry
 * down, across pages too. A team that hasn't filed yet is a row of its own
 * with only "NOT YET SUBMITTED"; it still counts as a row, for its matchup
 * and team. A long reason wraps onto lines just above and below
 * its row, so each reason line goes to the nearest row; one that runs over a
 * page break finishes at the top of the next page, above that page's first row.
 */
export function rowsFromWords(pages: Word[][]) {
  const out: (Injury & { matchup: string; date: string })[] = [];
  let cols: Record<'matchup' | 'team' | 'player' | 'status' | 'reason', number> | null = null;
  let date = '';
  let matchup = '';
  let team = '';
  const between = (lo: number, hi: number) => (w: Word) => w.x >= lo && w.x < hi;
  const join = (ws: Word[]) =>
    ws
      .map((w) => w.str)
      .join(' ')
      .replace(/(\w)- (\w)/g, '$1-$2'); // "Two- Way" was one word broken over a line
  const byX = (a: Word, b: Word) => a.x - b.x;

  for (const words of pages) {
    const head = (w: string) => words.find((x) => x.str === w);
    const [m, t, p, c, r] = ['Matchup', 'Team', 'Player', 'Current', 'Reason'].map(head);
    if (m && t && p && c && r) cols = { matchup: m.x - 4, team: t.x - 4, player: p.x - 4, status: c.x - 4, reason: r.x - 4 };
    if (!cols) continue;
    const k = cols;
    // Below the header (or the page title on a continued page), above the page-number footer.
    const top = m ? m.y - 2 : 525;
    const body = words.filter((w) => w.y < top && w.y > 60);

    // A row is wherever there's a status, a team or a matchup.
    const anchors = [
      ...new Set(body.filter((w) => w.x >= k.matchup && w.x < k.reason && !between(k.player, k.status)(w)).map((w) => Math.round(w.y))),
    ].sort((a, b) => b - a);
    if (!anchors.length) continue;
    const reasonWords = body.filter((w) => w.x >= k.reason);
    const spill = reasonWords.filter((w) => w.y > anchors[0] + 10);
    if (spill.length && out.length) out.at(-1)!.reason += ` ${join(spill.sort((a, b) => b.y - a.y || a.x - b.x))}`;

    for (const y of anchors) {
      const row = body.filter((w) => Math.abs(w.y - y) <= 3).sort(byX);
      const d = join(row.filter((w) => w.x < k.matchup)).match(/\d+\/\d+\/\d{4}/);
      if (d) date = d[0];
      const mu = join(row.filter(between(k.matchup, k.team)));
      if (mu) matchup = mu;
      const tm = join(row.filter(between(k.team, k.player)));
      if (tm) team = TEAM_BY_NAME.get(tm) ?? tm;
      const name = join(row.filter(between(k.player, k.status)));
      const status = join(row.filter(between(k.status, k.reason)));
      // Each wrapped reason line belongs to the row it sits closest to.
      const reason = join(
        reasonWords
          .filter((w) => !spill.includes(w))
          .filter((w) => anchors.reduce((best, a) => (Math.abs(w.y - a) < Math.abs(w.y - best) ? a : best)) === y)
          .sort((a, b) => b.y - a.y || a.x - b.x),
      );
      if (name && status) out.push({ date, matchup, team, name: displayName(name), status, reason });
    }
  }
  return out;
}

/** Every report linked from the season's page (today's), oldest first. */
async function reportLinks(seasonKey: string) {
  const res = await fetch(`https://official.nba.com/nba-injury-report-${seasonKey}-season/`, {
    headers: { 'User-Agent': UA },
    next: { revalidate: 900 },
  });
  if (!res.ok) return [];
  const html = await res.text();
  return [...new Set(html.match(/https:\/\/ak-static\.cms\.nba\.com\/referee\/injury\/Injury-Report_[\w-]+\.pdf/g) ?? [])];
}

// A published report never changes, so each is read once per server.
// ponytail: unbounded beyond the trim below; an LRU if servers run for months.
const parsed = new Map<string, Awaited<ReturnType<typeof readReport>>>();

async function readReport(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, cache: 'force-cache' });
  if (!res.ok) return [];
  const pdf = await getDocumentProxy(new Uint8Array(await res.arrayBuffer()));
  const pages: Word[][] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const { items } = await (await pdf.getPage(i)).getTextContent();
    pages.push(
      (items as { str: string; transform: number[] }[])
        .filter((w) => w.str.trim())
        .map((w) => ({ x: w.transform[4], y: w.transform[5], str: w.str.trim() })),
    );
  }
  return rowsFromWords(pages);
}

async function report(url: string) {
  if (!parsed.has(url)) {
    if (parsed.size > 200) parsed.delete(parsed.keys().next().value!);
    parsed.set(url, await readReport(url));
  }
  return parsed.get(url)!;
}

/**
 * One game's rows from the newest report that lists it, with the report's
 * time ("8:00 PM ET"). The season's page links only today's reports, so a
 * game today or later is looked up there, newest first; an earlier game comes
 * from its day's last reports, which still list every game that day, at their
 * fixed addresses. null when no report covers the game (before 2026-27, or the
 * site is down).
 */
export async function gameInjuries(seasonKey: string, day: string, away: string, home: string) {
  try {
    const at = (hm: string) => `https://ak-static.cms.nba.com/referee/injury/Injury-Report_${day}_${hm}.pdf`;
    const order =
      day >= todayEt()
        ? (await reportLinks(seasonKey)).reverse()
        : ['11_45PM', '11_30PM', '11_00PM'].map(at);
    const [y, m, d] = day.split('-');
    const date = `${m}/${d}/${y}`; // the report writes MM/DD/YYYY
    for (const url of order.slice(0, 6)) {
      const rows = (await report(url)).filter((r) => r.matchup === `${away}@${home}` && r.date === date);
      if (rows.length) {
        const [, hh, mm, ap] = url.match(/_(\d{2})_(\d{2})(AM|PM)\.pdf$/) ?? [];
        return { asOf: hh ? `${Number(hh)}:${mm} ${ap} ET` : '', rows };
      }
    }
    return null;
  } catch (e) {
    console.error('injury report unavailable:', e instanceof Error ? e.message : e);
    return null;
  }
}
