'use client';

import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Headshot } from '@/components/Headshot';
import { Icon } from '@/components/icons';
import { TeamMark } from '@/components/TeamMark';
import { todayEt } from '@/lib/dates';
import { CUBE, TABS } from '@/lib/nav';
import { FORMER_NAMES, SUCCESSOR, TEAMS } from '../../prisma/teams';

type Player = { id: number; name: string; team: string | null; position: string | null };
type Game = { id: number; home: string; away: string; status: string; homeScore: number; awayScore: number };
type Recent = { href: string; label: string };

const PAGES = [{ href: '/', label: 'Home' }, ...TABS.general, ...TABS.savant, ...CUBE];

/** The leaderboards worth jumping to by stat name. Each opens the leaders page at that board. */
const STATS = [
  ['Points', 'ppg'], ['Rebounds', 'rpg'], ['Assists', 'apg'], ['Steals', 'spg'], ['Blocks', 'bpg'], ['Threes made', 'tpm'],
  ['True shooting %', 'tsPct'], ['Effective FG %', 'efgPct'], ['Usage %', 'usgPct'], ['PER', 'per'], ['Box plus/minus', 'bpm'],
  ['Win shares', 'ws'], ['VORP', 'vorp'], ['Shot-making', 'shotMaking'], ['Shot quality', 'xEfg'], ['On/off net rating', 'onOff'],
  ['Clutch points', 'clutchPts'],
];

/**
 * Each franchise that still plays or folded, with every name it went by: relocated
 * rows (Seattle SuperSonics) fold into the team they became (Oklahoma City Thunder).
 */
const FRANCHISES = TEAMS.filter((t) => !SUCCESSOR[t.abbreviation]).map((t) => ({
  abbr: t.abbreviation,
  color: t.primaryColor,
  name: `${t.city} ${t.name}`,
  keywords: [
    t.abbreviation,
    ...(FORMER_NAMES[t.abbreviation] ?? []),
    ...TEAMS.filter((o) => SUCCESSOR[o.abbreviation] === t.abbreviation).flatMap((o) => [`${o.city} ${o.name}`, o.abbreviation]),
  ],
}));

const RECENT_KEY = 'recent-searches';
const readRecent = (): Recent[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
};

const item =
  'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm data-[selected=true]:bg-[var(--panel-2)]';
const group =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[0.6875rem] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.14em] [&_[cmdk-group-heading]]:text-[var(--ink-3)]';

/**
 * The command palette: Cmd/Ctrl-K (or the header button) opens one box that
 * searches pages, teams, players, tonight's games and stat boards. Pages,
 * teams and stats match locally; players come from /api/players, debounced.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);

  // Opening it loads what doesn't depend on the query: recents and tonight's games.
  useEffect(() => {
    if (!open) return;
    setRecent(readRecent());
    fetch(`/api/games?limit=30&date=${todayEt()}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setGames)
      .catch(() => setGames([]));
  }, [open]);

  useEffect(() => {
    setFailed(false);
    if (q.trim().length < 2) {
      setPlayers([]);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/players?q=${encodeURIComponent(q)}&limit=8`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        setPlayers(await res.json());
      } catch {
        if (ctrl.signal.aborted) return;
        setPlayers([]);
        setFailed(true);
      }
      setLoading(false);
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const go = (href: string, label: string) => {
    const next = [{ href, label }, ...readRecent().filter((r) => r.href !== href)].slice(0, 6);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // No storage: recents just don't persist.
    }
    setOpen(false);
    setQ('');
    router.push(href);
  };

  const typing = q.trim().length > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search players, teams, games and pages"
        aria-keyshortcuts="Meta+K Control+K"
        className="flex h-8 items-center gap-2 rounded-md border px-2.5 text-[0.8125rem] transition-colors hover:bg-[var(--panel-2)]"
        style={{ borderColor: 'var(--line)', background: 'var(--panel)', color: 'var(--ink-2)' }}
      >
        <Icon name="search" size={14} />
        <span className="max-sm:hidden">Search</span>
        <kbd className="rounded border px-1 text-[0.625rem] max-sm:hidden" style={{ borderColor: 'var(--line)' }}>
          ⌘K
        </kbd>
      </button>

      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Search NBA Savant"
        overlayClassName="fixed inset-0 z-50 bg-black/40"
        contentClassName="fixed left-1/2 top-[12vh] z-50 w-[min(36rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)] shadow-3"
      >
        <div className="flex items-center gap-2 border-b px-3" style={{ borderColor: 'var(--line)', color: 'var(--ink-3)' }}>
          <Icon name="search" />
          <Command.Input
            value={q}
            onValueChange={setQ}
            placeholder="Search players, teams, games, stats, pages"
            className="h-12 flex-1 border-0 bg-transparent p-0 text-base text-[var(--ink)] outline-none focus-visible:outline-none"
          />
          <kbd className="rounded border px-1.5 py-0.5 text-[0.625rem]" style={{ borderColor: 'var(--line)' }}>
            Esc
          </kbd>
        </div>

        <Command.List className="max-h-[60vh] overflow-auto p-1.5">
          <Command.Empty className="px-3 py-6 text-center text-sm text-[var(--ink-3)]">
            {loading ? 'Searching…' : failed ? 'Player search is unavailable right now. Pages and teams still work.' : 'Nothing matches.'}
          </Command.Empty>

          {!typing && recent.length > 0 && (
            <Command.Group heading="Recent" className={group}>
              {recent.map((r) => (
                <Command.Item key={`recent ${r.href}`} value={`recent ${r.label}`} onSelect={() => go(r.href, r.label)} className={item}>
                  {r.label}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {players.length > 0 && (
            <Command.Group heading="Players" className={group}>
              {players.map((p) => (
                // The API already matched these; the query is a keyword so cmdk keeps them whatever was typed.
                <Command.Item key={p.id} value={`${p.name} ${p.id}`} keywords={[q]} onSelect={() => go(`/players/${p.id}`, p.name)} className={item}>
                  <span className="grid h-8 w-8 shrink-0 place-items-center">
                    <Headshot id={p.id} name="" className="h-8 w-8 rounded-full bg-[var(--panel-2)] object-cover object-top" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                  <span className="eyebrow">{[p.position, p.team].filter(Boolean).join(' · ')}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {typing && (
            <Command.Group heading="Teams" className={group}>
              {FRANCHISES.map((t) => (
                <Command.Item key={t.abbr} value={t.name} keywords={t.keywords} onSelect={() => go(`/teams/${t.abbr}`, t.name)} className={item}>
                  <TeamMark abbr={t.abbr} color={t.color} size={24} />
                  <span className="flex-1 font-semibold">{t.name}</span>
                  <span className="eyebrow">Team</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {games.length > 0 && (
            <Command.Group heading="Today's games" className={group}>
              {games.map((g) => (
                <Command.Item
                  key={g.id}
                  value={`${g.away} at ${g.home} game`}
                  onSelect={() => go(`/games/${g.id}`, `${g.away} at ${g.home}`)}
                  className={item}
                >
                  <TeamMark abbr={g.away} size={20} />
                  <span className="font-semibold">
                    {g.away} at {g.home}
                  </span>
                  <TeamMark abbr={g.home} size={20} />
                  <span className="eyebrow ml-auto">
                    {g.status.startsWith('Final') ? `${g.awayScore}-${g.homeScore} ${g.status}` : g.status}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          <Command.Group heading="Pages" className={group}>
            {PAGES.map((p) => (
              <Command.Item key={p.href} value={p.label} keywords={p.hint ? [p.hint] : undefined} onSelect={() => go(p.href, p.label)} className={item}>
                <span className="flex-1">{p.label}</span>
                {p.hint && <span className="text-[0.6875rem] text-[var(--ink-3)]">{p.hint}</span>}
              </Command.Item>
            ))}
          </Command.Group>

          {typing && (
            <Command.Group heading="Stat leaders" className={group}>
              {STATS.map(([label, key]) => (
                <Command.Item key={key} value={`${label} leaders`} onSelect={() => go(`/leaders#${key}`, `${label} leaders`)} className={item}>
                  <Icon name="chart" />
                  <span className="flex-1">{label}</span>
                  <span className="eyebrow">Leaders</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </Command.Dialog>
    </>
  );
}
