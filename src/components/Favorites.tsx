'use client';

import { useEffect, useSyncExternalStore } from 'react';

/**
 * A viewer's favorite teams and players, kept in this browser only. Players
 * carry their current team so their games can be pinned like a team's.
 */
export type Favorites = { teams: string[]; players: { id: number; team: string | null }[] };

const KEY = 'favorites';
const EMPTY: Favorites = { teams: [], players: [] };

// Private windows and blocked storage throw; they just get no favorites.
const raw = () => {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
};

// useSyncExternalStore wants the same object back until the stored string changes.
let last = '';
let parsed = EMPTY;
const snapshot = () => {
  const r = raw();
  if (r !== last) {
    last = r;
    try {
      parsed = { ...EMPTY, ...JSON.parse(r) };
    } catch {
      parsed = EMPTY;
    }
  }
  return parsed;
};

// 'storage' fires for other tabs; our own writes announce themselves.
const subscribe = (cb: () => void) => {
  window.addEventListener('storage', cb);
  window.addEventListener(KEY, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(KEY, cb);
  };
};

const save = (f: Favorites) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(f));
  } catch {}
  window.dispatchEvent(new Event(KEY));
};

/** Empty on the server and the first render, so hydration matches; fills in right after. */
export const useFavorites = () => useSyncExternalStore(subscribe, snapshot, () => EMPTY);

/** Every team whose games a viewer wants up top: their teams, and their players' teams. */
export const favoriteTeams = (f: Favorites) =>
  new Set([...f.teams, ...f.players.flatMap((p) => (p.team ? [p.team] : []))]);

/** The star in a team or player page's header. */
export function FavoriteStar(props: { team: string } | { player: number; team: string | null }) {
  const f = useFavorites();
  const player = 'player' in props ? props.player : null;
  const saved = player === null ? undefined : f.players.find((p) => p.id === player);
  const on = player === null ? f.teams.includes(props.team!) : !!saved;

  // A traded player's games should follow him to his new team.
  useEffect(() => {
    if (saved && saved.team !== props.team) {
      save({ ...f, players: f.players.map((p) => (p === saved ? { ...p, team: props.team } : p)) });
    }
  }, [saved, props.team, f]);

  const toggle = () => {
    if (player === null) {
      const t = props.team!;
      save({ ...f, teams: on ? f.teams.filter((x) => x !== t) : [...f.teams, t] });
    } else {
      save({ ...f, players: on ? f.players.filter((p) => p.id !== player) : [...f.players, { id: player, team: props.team }] });
    }
  };

  return (
    <button
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? 'Remove from favorites' : 'Add to favorites'}
      title={on ? 'Remove from favorites' : 'Add to favorites — their games go first on Scores'}
      className="rounded px-1 text-xl leading-none transition-colors hover:bg-[var(--panel-2)]"
      style={{ color: on ? 'var(--s4)' : 'var(--ink-3)' }}
    >
      {on ? '★' : '☆'}
    </button>
  );
}
