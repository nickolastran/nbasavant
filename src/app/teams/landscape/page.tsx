import Link from 'next/link';
import { Suspense } from 'react';
import { Icon } from '@/components/icons';
import { TeamMark } from '@/components/TeamMark';
import { TitleZone } from '@/components/TitleZone';
import { getSeason, lastUpdated } from '@/lib/db';
import { inZone } from '@/lib/title-zone';
import { TITLE_ZONE as cfg } from '@/lib/title-zone.config';
import { titleZoneData, type ZoneTeam } from '@/lib/title-zone-data';

export const metadata = {
  title: 'Title Zone',
  description: 'Every NBA team by offense and defense against league average, and the region where title teams live.',
};
export const revalidate = 60;

const signed = (v: number, dp = 1) => `${v > 0 ? '+' : ''}${v.toFixed(dp)}`;

export default async function LandscapePage() {
  const season = await getSeason();
  const [data, updated] = await Promise.all([season ? titleZoneData(season.id) : null, lastUpdated()]);
  if (!season || !data || !data.frames.length) {
    return (
      <div className="panel p-8 text-center text-sm" style={{ color: 'var(--ink-2)' }}>
        <h1 className="mb-1 text-lg font-bold" style={{ color: 'var(--ink)' }}>
          Title Zone
        </h1>
        No finished regular-season games yet. The chart fills in once the season tips off.
      </div>
    );
  }

  const teamOf = new Map(data.teams.map((t) => [t.id, t]));
  const now = data.frames[data.frames.length - 1].season
    .map(([id, relOff, relDef, , wins, losses]) => ({ t: teamOf.get(id)!, relOff, relDef, net: relOff + relDef, wins, losses }))
    .filter((r) => r.t)
    .sort((a, b) => b.net - a.net);
  const zone = now.filter((r) => inZone(r, cfg));
  const trend = (id: number, net: number) => {
    const before = data.prevNet[id];
    const d = before === undefined ? 0 : net - before;
    return d > 0.3 ? ({ icon: 'up', label: 'rising', color: 'var(--pos)' } as const) : d < -0.3 ? ({ icon: 'down', label: 'falling', color: 'var(--neg)' } as const) : ({ icon: 'flat', label: 'steady', color: 'var(--ink-3)' } as const);
  };
  const rising = data.movers.filter((m) => m.delta > 0).slice(0, 3);
  const falling = data.movers.filter((m) => m.delta < 0).slice(-3).reverse();
  const scheduled = data.teams.filter((t): t is ZoneTeam & { next: NonNullable<ZoneTeam['next']> } => !!t.next && t.next.games >= 3).sort((a, b) => a.next.oppNet - b.next.oppNet);
  const lastDay = data.last ? new Date(`${data.last}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';

  const Team = ({ t }: { t: ZoneTeam }) => (
    <Link href={`?team=${t.abbr}`} className="flex min-w-0 flex-1 items-center gap-2 no-underline hover:underline" style={{ color: 'var(--ink)' }} scroll={false} replace>
      <TeamMark abbr={t.abbr} color={t.color} size={18} />
      <span className="truncate font-medium">{t.name}</span>
    </Link>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Title Zone</h1>
      <p className="mb-4 mt-1 max-w-prose text-sm" style={{ color: 'var(--ink-2)' }}>
        {season.key}. Every team&apos;s offense and defense against league average, turned so that good at both is up. The hatched region
        is where title teams live.
      </p>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <Suspense fallback={<span aria-hidden className="skeleton block aspect-square w-full max-w-[760px] rounded-md" />}>
          <TitleZone teams={data.teams} frames={data.frames} />
        </Suspense>

        <aside className="space-y-4 text-sm">
          <Panel title={`In the zone now: ${zone.length} of ${now.length}`}>
            {zone.length ? (
              <ol className="divide-y">
                {zone.map((r, i) => {
                  const tr = trend(r.t.id, r.net);
                  return (
                    <li key={r.t.id} className="flex items-center gap-2 py-1.5">
                      <span className="eyebrow tnum w-4">{i + 1}</span>
                      <Team t={r.t} />
                      {r.t.star && <span title={`${r.t.marks.count} of 3 title marks`}>★</span>}
                      <span className="tnum w-11 text-right font-semibold">{signed(r.net)}</span>
                      <span style={{ color: tr.color }}>
                        <Icon name={tr.icon} size={12} label={tr.label} />
                      </span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p style={{ color: 'var(--ink-3)' }}>No team is in the zone right now.</p>
            )}
            <p className="eyebrow mt-2">Net rating · arrow: change on {lastDay}</p>
          </Panel>

          <Panel title={`Biggest movers · ${lastDay}`}>
            {data.movers.length ? (
              <>
                {([['Rising', rising], ['Falling', falling]] as const).map(([label, list]) => (
                  <div key={label} className="mb-2 last:mb-0">
                    <div className="eyebrow mb-0.5">{label}</div>
                    {list.length ? (
                      <ul className="divide-y">
                        {list.map((m) => (
                          <li key={m.teamId} className="flex items-center gap-2 py-1.5">
                            <Team t={teamOf.get(m.teamId)!} />
                            <span className="tnum shrink-0 text-xs" style={{ color: 'var(--ink-2)' }}>
                              {m.result}
                            </span>
                            <span className="tnum w-11 shrink-0 text-right font-semibold" style={{ color: m.delta > 0 ? 'var(--pos)' : 'var(--neg)' }}>
                              {signed(m.delta)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                        Nobody.
                      </p>
                    )}
                  </div>
                ))}
                <p className="eyebrow mt-2">Change in season net rating</p>
              </>
            ) : (
              <p style={{ color: 'var(--ink-3)' }}>Needs two game days.</p>
            )}
          </Panel>

          <Panel title={`Next ${cfg.lookahead}: easiest and toughest`}>
            {scheduled.length ? (
              <>
                {([['Easiest', scheduled.slice(0, 3)], ['Toughest', scheduled.slice(-3).reverse()]] as const).map(([label, list]) => (
                  <div key={label} className="mb-2 last:mb-0">
                    <div className="eyebrow mb-0.5">{label}</div>
                    <ul className="divide-y">
                      {list.map((t) => (
                        <li key={t.id} className="flex items-center gap-2 py-1.5">
                          <Team t={t} />
                          <span className="tnum shrink-0 text-xs" style={{ color: 'var(--ink-2)' }}>
                            {t.next.home}H {t.next.away}A
                          </span>
                          <span className="tnum w-11 shrink-0 text-right font-semibold">{signed(t.next.oppNet)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <p className="eyebrow mt-2">Avg. opponent net, venue-adjusted</p>
              </>
            ) : (
              <p style={{ color: 'var(--ink-3)' }}>No upcoming games on the schedule.</p>
            )}
          </Panel>

          <Panel title={`Results · ${lastDay}`}>
            <ul className="divide-y">
              {data.results.map((g) => (
                <li key={g.gameId}>
                  <Link href={`/games/${g.gameId}`} className="tnum flex items-center gap-2 py-1.5 no-underline hover:underline" style={{ color: 'var(--ink)' }}>
                    <TeamMark abbr={g.away} size={16} />
                    <span className={g.awayPts > g.homePts ? 'font-bold' : ''}>
                      {g.away} {g.awayPts}
                    </span>
                    <span style={{ color: 'var(--ink-3)' }}>@</span>
                    <TeamMark abbr={g.home} size={16} />
                    <span className={g.homePts > g.awayPts ? 'font-bold' : ''}>
                      {g.home} {g.homePts}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="How to read">
            <ul className="list-disc space-y-1.5 pl-4 text-xs" style={{ color: 'var(--ink-2)' }}>
              <li>Up is better at both ends. Right of center leans on offense, left leans on defense. The + is a league-average team.</li>
              <li>
                The zone: net rating of at least {signed(cfg.minNet)}, offense no worse than {signed(cfg.minRelOff)} and defense no worse than{' '}
                {signed(cfg.minRelDef)}.
                {data.champions && ` ${data.champions.inside} of the ${data.champions.total} champions since ${data.champions.since} finished their regular season inside it.`}
              </li>
              <li>
                ★ marks a zone team with {cfg.starAt} of three: a 40-20 pace, SRS of {signed(cfg.minSrs)} or better, a top-{cfg.maxSeed} seed.
              </li>
              <li>The gray arrow is the move since the previous game day. The dashed arrow is where the next {cfg.lookahead} games push a team that keeps playing at its level.</li>
              {data.estimated > 0 && (
                <li>
                  {data.estimated} of {data.games} games have no box score on file; their possessions are estimated from the two teams&apos; season pace.
                </li>
              )}
            </ul>
          </Panel>
        </aside>
      </div>

      <p className="eyebrow mt-5">
        Data: NBA.com, Basketball-Reference{updated && ` · Updated ${updated}`}
      </p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel p-3">
      <h2 className="mb-1.5 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}
