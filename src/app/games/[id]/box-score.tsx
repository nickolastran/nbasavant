import Link from 'next/link';
import { PlayerLink } from '@/components/PlayerLink';
import { Headshot } from '@/components/Headshot';
import { TeamMark } from '@/components/TeamMark';

export type BoxLine = {
  playerId: number;
  name: string;
  jersey: string | null;
  started: boolean;
  min: number;
  pts: number; reb: number; oreb: number; dreb: number; ast: number;
  stl: number; blk: number; tov: number; pf: number;
  fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number;
  plusMinus: number;
};
export type Benched = { playerId: number; name: string; jersey: string | null; reason: string | null };

const HEAD = ['MIN', 'PTS', 'FG', '3PT', 'FT', 'REB', 'AST', 'TO', 'STL', 'BLK', 'OREB', 'DREB', 'PF', '+/-'];
const cell = 'px-1 py-1 text-center';
/** The player column: a set width with a rule down its right edge, so the stats start at the same place. */
const lead = 'w-64 border-r pr-3';
const rule = { borderRightColor: 'var(--line-2)' };
const pct = (m: number, a: number) => (a ? `${Math.round((m / a) * 100)}%` : '');
const sum = (lines: BoxLine[], k: keyof BoxLine) => lines.reduce((t, l) => t + (l[k] as number), 0);

function Row({ l, on }: { l: BoxLine; on: boolean }) {
  return (
    <tr className="border-t" style={{ borderColor: 'var(--line)' }}>
      <Player id={l.playerId} name={l.name} jersey={l.jersey} on={on} />
      <td className={cell}>{Math.round(l.min)}</td>
      <td className={cell}>{l.pts}</td>
      <td className={cell}>{`${l.fgm}-${l.fga}`}</td>
      <td className={cell}>{`${l.fg3m}-${l.fg3a}`}</td>
      <td className={cell}>{`${l.ftm}-${l.fta}`}</td>
      <td className={cell}>{l.reb}</td>
      <td className={cell}>{l.ast}</td>
      <td className={cell}>{l.tov}</td>
      <td className={cell}>{l.stl}</td>
      <td className={cell}>{l.blk}</td>
      <td className={cell}>{l.oreb}</td>
      <td className={cell}>{l.dreb}</td>
      <td className={cell}>{l.pf}</td>
      <td className={cell}>{l.plusMinus > 0 ? `+${l.plusMinus}` : l.plusMinus}</td>
    </tr>
  );
}

function Player({ id, name, jersey, on }: { id: number; name: string; jersey: string | null; on?: boolean }) {
  return (
    <td className={`truncate py-1 ${lead}`} style={rule}>
      <span className="flex items-center gap-2 whitespace-nowrap">
        {/* On the floor right now (live games only); the same dot the scoreboard uses for live. */}
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: on ? 'var(--hot)' : 'transparent' }}
        />
        {on && <span className="sr-only">On the court: </span>}
        <Headshot id={id} name="" className="h-6 w-6 shrink-0 rounded-full bg-[var(--panel-2)] object-cover object-top" />
        <PlayerLink id={id} className="link font-medium">
          {name}
        </PlayerLink>
        {jersey && <span style={{ color: 'var(--ink-3)' }}>#{jersey}</span>}
      </span>
    </td>
  );
}

/** A label row ("Starters", "Bench") that repeats the column heads, as a printed box score does. */
function Heads({ label }: { label: string }) {
  return (
    <tr className="text-[0.625rem] font-bold uppercase tracking-[0.06em]" style={{ background: 'var(--panel-2)', color: 'var(--ink)' }}>
      <th scope="colgroup" className={`py-1.5 pl-0 text-left ${lead}`} style={rule}>
        {label}
      </th>
      {HEAD.map((h) => (
        <th key={h} scope="col" className="px-1 py-1.5 text-center font-bold">
          {h}
        </th>
      ))}
    </tr>
  );
}

/**
 * One team's box score: starters, then the bench in the order the NBA lists
 * them, then everyone who hasn't played with why, and the team's totals with
 * its shooting percentages under them.
 */
export function TeamBox({
  team, lines, benched, final, onCourt = [],
}: {
  team: { abbreviation: string; city: string; name: string; primaryColor: string };
  lines: BoxLine[];
  benched: Benched[];
  final: boolean;
  /** Who's on the floor, while it's live. */
  onCourt?: number[];
}) {
  const starters = lines.filter((l) => l.started);
  const bench = lines.filter((l) => !l.started);
  const t = (k: keyof BoxLine) => sum(lines, k);
  return (
    <section>
      <h2 className="mb-1.5 flex items-center gap-2 text-sm font-bold">
        <TeamMark abbr={team.abbreviation} color={team.primaryColor} size={22} />
        {team.city} {team.name}
      </h2>
      <div className="relative overflow-x-auto">
        {/* Fixed column widths, so both teams' tables line up whatever the names and numbers. */}
        <table className="tnum w-full min-w-[52rem] table-fixed border-collapse text-[0.8125rem]">
          {/* The player column is set; the 14 stat columns split what's left evenly. */}
          <colgroup>
            <col className="w-64" />
          </colgroup>
          <tbody>
            {/* Logs from before our box-score sync don't say who started. */}
            {starters.length > 0 && <Heads label="Starters" />}
            {starters.map((l) => (
              <Row key={l.playerId} l={l} on={onCourt.includes(l.playerId)} />
            ))}
            <Heads label={starters.length ? 'Bench' : 'Players'} />
            {bench.map((l) => (
              <Row key={l.playerId} l={l} on={onCourt.includes(l.playerId)} />
            ))}
            {benched.map((b) => (
              <tr key={b.playerId} className="border-t" style={{ borderColor: 'var(--line)' }}>
                <Player id={b.playerId} name={b.name} jersey={b.jersey} />
                <td colSpan={HEAD.length} className="py-1 text-center text-[0.75rem]" style={{ color: 'var(--ink-3)' }}>
                  {b.reason ? `Did not play: ${b.reason}` : final ? 'Did not play' : 'Has not entered game'}
                </td>
              </tr>
            ))}
            <tr className="border-t font-semibold" style={{ borderColor: 'var(--line-2)' }}>
              <td className={`py-1 text-[0.6875rem] uppercase tracking-[0.06em] ${lead}`} style={rule}>
                Team
              </td>
              <td className={cell} />
              <td className={cell}>{t('pts')}</td>
              <td className={cell}>{`${t('fgm')}-${t('fga')}`}</td>
              <td className={cell}>{`${t('fg3m')}-${t('fg3a')}`}</td>
              <td className={cell}>{`${t('ftm')}-${t('fta')}`}</td>
              <td className={cell}>{t('reb')}</td>
              <td className={cell}>{t('ast')}</td>
              <td className={cell}>{t('tov')}</td>
              <td className={cell}>{t('stl')}</td>
              <td className={cell}>{t('blk')}</td>
              <td className={cell}>{t('oreb')}</td>
              <td className={cell}>{t('dreb')}</td>
              <td className={cell}>{t('pf')}</td>
              <td className={cell} />
            </tr>
            <tr className="border-y" style={{ color: 'var(--ink-2)', borderColor: 'var(--line)' }}>
              <td className={lead} style={rule} />
              <td className={cell} />
              <td className={cell} />
              <td className={cell}>{pct(t('fgm'), t('fga'))}</td>
              <td className={cell}>{pct(t('fg3m'), t('fg3a'))}</td>
              <td className={cell}>{pct(t('ftm'), t('fta'))}</td>
              <td colSpan={9} />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
