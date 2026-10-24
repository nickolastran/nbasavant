import Link from 'next/link';
import type { assistNetwork } from '@/lib/team';

/**
 * Passer down the side, scorer across the top: each cell is how many of the
 * scorer's baskets the passer set up, shaded by count. Row and column totals
 * cover everyone, including players past the cap.
 */
export function AssistNetwork({ players, pairs }: Awaited<ReturnType<typeof assistNetwork>>) {
  const cell = new Map(pairs.map((p) => [`${p.from}-${p.to}`, p]));
  const shown = players.map((p) => p.id);
  const max = Math.max(1, ...pairs.filter((p) => shown.includes(p.from) && shown.includes(p.to)).map((p) => p.ast));
  const sum = (key: 'from' | 'to', id: number) => pairs.filter((p) => p[key] === id).reduce((a, p) => a + p.ast, 0);
  const head = 'px-1.5 py-1 text-[0.625rem] font-semibold uppercase tracking-[0.04em]';
  return (
    <div className="panel overflow-x-auto p-3">
      <table className="tnum w-full border-separate text-[0.8125rem]" style={{ borderSpacing: 2 }}>
        <caption className="sr-only">Assists by passer (rows) to scorer (columns)</caption>
        <thead>
          <tr style={{ color: 'var(--ink-3)' }}>
            <th className={`${head} text-left`}>Passer ↓ · Scorer →</th>
            {players.map((p) => (
              <th key={p.id} scope="col" className={`${head} min-w-[3.25rem] text-center`}>
                <Link href={`/players/${p.id}`} className="link">
                  {p.name}
                </Link>
              </th>
            ))}
            <th scope="col" className={`${head} text-right`}>AST</th>
          </tr>
        </thead>
        <tbody>
          {players.map((from) => (
            <tr key={from.id}>
              <th scope="row" className="whitespace-nowrap py-1 pr-2 text-left font-semibold">
                <Link href={`/players/${from.id}`} className="link">
                  {from.name}
                </Link>
              </th>
              {players.map((to) => {
                const c = from.id === to.id ? undefined : cell.get(`${from.id}-${to.id}`);
                return (
                  <td
                    key={to.id}
                    className="rounded py-1 text-center"
                    // One hue, light to dark; capped at 55% so ink text stays readable in both themes.
                    style={c ? { background: `color-mix(in oklab, var(--hot) ${Math.round(8 + 47 * (c.ast / max))}%, var(--panel))` } : { color: 'var(--ink-3)' }}
                    title={c ? `${from.name} to ${to.name}: ${c.ast} assist${c.ast === 1 ? '' : 's'}, ${c.pts} points` : undefined}
                  >
                    {from.id === to.id ? '' : c ? c.ast : '·'}
                  </td>
                );
              })}
              <td className="py-1 text-right font-semibold">{sum('from', from.id)}</td>
            </tr>
          ))}
          <tr style={{ color: 'var(--ink-2)' }}>
            <th scope="row" className="py-1 pr-2 text-left text-[0.6875rem] font-semibold uppercase">
              Assisted FG
            </th>
            {players.map((p) => (
              <td key={p.id} className="py-1 text-center font-semibold">
                {sum('to', p.id)}
              </td>
            ))}
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
