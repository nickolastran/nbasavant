/**
 * The AdvancedTable's view (sort, columns, filters, search, shading) as URL
 * params, so every view is a link. Only what differs from the table's
 * defaults is written; params the table doesn't own are left alone.
 */

export type Sort = { id: string; desc: boolean };
export type Op = 'gte' | 'lte' | 'eq';
export type Filter = { key: string; op: Op; value: string };
export type TableState = {
  sort: Sort[];
  /** A named column preset, or null for the table's full default set. */
  preset: string | null;
  /** A hand-picked set of visible column keys; wins over `preset`. */
  cols: string[] | null;
  filters: Filter[];
  q: string;
  shade: boolean;
};

const KEYS = ['sort', 'preset', 'cols', 'f', 'q', 'shade'];
const sortStr = (s: Sort[]) => s.map((x) => `${x.id}.${x.desc ? 'desc' : 'asc'}`).join(',');
const filterStr = (f: Filter[]) => f.map((x) => `${x.key}.${x.op}.${x.value}`).join(',');

/** `base` with this state written over it. */
export function encodeState(s: TableState, base: URLSearchParams, defaults: TableState) {
  const sp = new URLSearchParams(base);
  KEYS.forEach((k) => sp.delete(k));
  if (sortStr(s.sort) !== sortStr(defaults.sort)) sp.set('sort', sortStr(s.sort));
  if (s.cols) sp.set('cols', s.cols.join(','));
  // "all" spells out "no preset" for a table whose default is one.
  else if (s.preset !== defaults.preset) sp.set('preset', s.preset ?? 'all');
  if (s.filters.length) sp.set('f', filterStr(s.filters));
  if (s.q) sp.set('q', s.q);
  if (s.shade !== defaults.shade) sp.set('shade', s.shade ? '1' : '0');
  return sp;
}

/** The state a URL describes; anything missing or malformed falls back to the default. */
export function decodeState(sp: URLSearchParams, defaults: TableState): TableState {
  const sort = (sp.get('sort') ?? '')
    .split(',')
    .map((part) => part.split('.'))
    .filter(([id]) => id)
    .map(([id, dir]) => ({ id, desc: dir !== 'asc' }));
  const filters = (sp.get('f') ?? '').split(',').flatMap((part): Filter[] => {
    // The value may itself hold a dot (20.5), so only the first two split.
    const [key, op, ...rest] = part.split('.');
    const value = rest.join('.');
    if (!key || !value || !['gte', 'lte', 'eq'].includes(op)) return [];
    if (op !== 'eq' && !Number.isFinite(Number(value))) return [];
    return [{ key, op: op as Op, value }];
  });
  const cols = sp.get('cols')?.split(',').filter(Boolean);
  const shade = sp.get('shade');
  return {
    sort: sort.length ? sort : defaults.sort,
    preset: cols?.length || sp.get('preset') === 'all' ? null : sp.get('preset') ?? defaults.preset,
    cols: cols?.length ? cols : null,
    filters,
    q: sp.get('q') ?? '',
    shade: shade === '0' ? false : shade === '1' ? true : defaults.shade,
  };
}

const fold = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Rows passing every filter and, if there is a search, matching it on the lead column. */
export function applyFilters<T extends Record<string, unknown>>(rows: T[], filters: Filter[], q: string, leadKey: string) {
  const words = fold(q).split(/\s+/).filter(Boolean);
  return rows.filter((r) => {
    if (words.length && !words.every((w) => fold(r[leadKey]).includes(w))) return false;
    return filters.every((f) => {
      const v = r[f.key];
      if (f.op === 'eq') return fold(v) === fold(f.value);
      // A stat that wasn't recorded passes no numeric test.
      if (typeof v !== 'number') return false;
      return f.op === 'gte' ? v >= Number(f.value) : v <= Number(f.value);
    });
  });
}
