import { Icon, ICON_NAMES } from '@/components/icons';
import { LogoMark, Wordmark } from '@/components/Logo';
import { TeamMark } from '@/components/TeamMark';
import { contrastRatio, onColor } from '@/lib/colors';
import { TEAMS } from '../../../prisma/teams';

export const metadata = { title: 'Brand', description: 'NBA Savant colors, type, logo and usage.' };

const SURFACES = ['surface', 'panel', 'panel-2', 'line', 'line-2', 'ink', 'ink-2', 'ink-3', 'accent'];
const SCALES: { name: string; note: string; vars: string[]; labels?: string[] }[] = [
  {
    name: 'Diverging (percentiles)',
    note: 'Blue is below the field, gray is the middle, red is above. Always shown with the number.',
    vars: ['div-1', 'div-2', 'div-3', 'div-4', 'div-5'],
    labels: ['0-20', '21-40', '41-59', '60-79', '80-100'],
  },
  { name: 'Sequential (counts, frequency)', note: 'Light to dark, so it reads in grayscale.', vars: ['seq-1', 'seq-2', 'seq-3', 'seq-4', 'seq-5'] },
  { name: 'Categorical (series)', note: 'Fixed order. Each series also gets its own marker shape.', vars: ['s1', 's2', 's3', 's4', 's5', 's6'] },
  { name: 'Plus / minus', note: 'Paired with a sign or an arrow, never color alone.', vars: ['pos', 'neg'], labels: ['+4.2', '−3.1'] },
];
const TYPE = [
  { name: 'Display', cls: 'display text-5xl font-bold tnum', sample: '128–121', spec: 'Archivo Narrow 700, scores and stat tiles' },
  { name: 'Heading', cls: 'text-3xl font-bold tracking-tight', sample: 'Every game, every shot', spec: 'Archivo 700, tight tracking' },
  { name: 'Body', cls: 'text-sm', sample: 'Live scores, standings and leaderboards from the NBA’s own feeds.', spec: 'Archivo 400, 13px' },
  { name: 'Eyebrow', cls: 'eyebrow', sample: 'Performance of the night', spec: 'Archivo 600, 11px, caps, 0.14em' },
  { name: 'Numbers', cls: 'font-mono text-lg tnum', sample: '27.4  61.2%  +8.9', spec: 'IBM Plex Mono, tabular, on the Savant side' },
];
const RULES: { ok: boolean; text: string }[] = [
  { ok: true, text: 'Set the wordmark in ink on paper or white, or reversed on ink.' },
  { ok: true, text: 'Keep clear space around the mark equal to one of its dots.' },
  { ok: true, text: 'Use team colors as accents: a rule, a bar, a dot.' },
  { ok: true, text: 'Print the value next to every colored mark.' },
  { ok: false, text: 'Don’t recolor the mark’s three dots; they are the percentile scale.' },
  { ok: false, text: 'Don’t set body text on a team color.' },
  { ok: false, text: 'Don’t use red and blue for anything but above and below average.' },
  { ok: false, text: 'Don’t stretch, outline or add effects to the wordmark.' },
];

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="border-t pt-6" style={{ borderColor: 'var(--line)' }}>
    <h2 className="eyebrow mb-4">{title}</h2>
    {children}
  </section>
);

export default function BrandPage() {
  const teams = TEAMS.filter((t) => t.id <= 1610612766).sort((a, b) => a.abbreviation.localeCompare(b.abbreviation));
  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <header>
        <p className="eyebrow">Brand guidelines</p>
        <h1 className="mt-1 text-4xl font-bold tracking-tight">NBA Savant</h1>
        <p className="mt-2 max-w-prose text-sm" style={{ color: 'var(--ink-2)' }}>
          A sports page and a stats lab sharing one system. This page is drawn from the live tokens, so it shows the
          theme and mode you are in: switch General and Savant, or light and dark, in the header.
        </p>
      </header>

      <Section title="Logo">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="panel flex h-36 items-center justify-center gap-3">
            <LogoMark size={44} />
            <Wordmark className="text-3xl" />
          </div>
          <div className="flex h-36 items-center justify-center gap-3 rounded-md" style={{ background: 'var(--ink)' }}>
            <LogoMark size={44} />
            <span className="text-3xl font-extrabold uppercase tracking-tight" style={{ color: 'var(--on-ink)' }}>
              NBA<span className="px-[1px] font-light opacity-60">{'//'}</span>Savant
            </span>
          </div>
        </div>
        <p className="mt-3 max-w-prose text-sm" style={{ color: 'var(--ink-2)' }}>
          The mark is three percentile tracks with their dots at poor, average and elite: the site&apos;s signature chart
          at icon size. Minimum size 16px. The wordmark is Archivo ExtraBold caps with a light double slash.
        </p>
      </Section>

      <Section title="Color">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
          {SURFACES.map((v) => (
            <div key={v}>
              <div className="h-14 rounded-md border" style={{ background: `var(--${v})`, borderColor: 'var(--line)' }} />
              <div className="mt-1 font-mono text-[0.6875rem]">--{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {SCALES.map((s) => (
            <div key={s.name}>
              <h3 className="text-sm font-semibold">{s.name}</h3>
              <div className="mt-2 flex overflow-hidden rounded-md">
                {s.vars.map((v, i) => (
                  <div key={v} className="grid h-12 flex-1 place-items-center" style={{ background: `var(--${v})` }}>
                    {s.labels && (
                      <span className="tnum rounded bg-[var(--panel)] px-1 text-[0.625rem] font-semibold" style={{ color: 'var(--ink)' }}>
                        {s.labels[i]}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-xs" style={{ color: 'var(--ink-2)' }}>
                {s.note}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Team colors">
        <p className="mb-3 max-w-prose text-sm" style={{ color: 'var(--ink-2)' }}>
          Each team&apos;s primary color with the text color the system picks for it. Every pair is checked in the test
          suite to clear 4.5:1.
        </p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
          {teams.map((t) => {
            const text = onColor(t.primaryColor);
            return (
              <div key={t.abbreviation} className="flex items-center gap-2 rounded-md px-2 py-2" style={{ background: t.primaryColor, color: text }}>
                <span className="grid h-6 w-6 place-items-center rounded bg-white">
                  <TeamMark abbr={t.abbreviation} size={18} />
                </span>
                <span className="text-xs font-bold">{t.abbreviation}</span>
                <span className="tnum ml-auto text-[0.625rem]">{contrastRatio(t.primaryColor, text).toFixed(1)}</span>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Type">
        <div className="divide-y" style={{ borderColor: 'var(--line)' }}>
          {TYPE.map((t) => (
            <div key={t.name} className="grid items-baseline gap-2 py-3 sm:grid-cols-[7rem_minmax(0,1fr)_16rem]">
              <span className="eyebrow">{t.name}</span>
              <span className={t.cls}>{t.sample}</span>
              <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
                {t.spec}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Icons">
        <p className="mb-3 max-w-prose text-sm" style={{ color: 'var(--ink-2)' }}>
          One set: a 16px grid, 1.5px round strokes, drawn in the text color.
        </p>
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-9">
          {ICON_NAMES.map((n) => (
            <li key={n} className="panel flex flex-col items-center gap-1.5 py-3">
              <Icon name={n} size={20} />
              <span className="font-mono text-[0.625rem]" style={{ color: 'var(--ink-3)' }}>
                {n}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Do and don't">
        <ul className="grid gap-2 sm:grid-cols-2">
          {RULES.map((r) => (
            <li key={r.text} className="panel flex items-start gap-2.5 p-3 text-sm">
              <span
                className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full"
                style={{ background: r.ok ? 'var(--pos)' : 'var(--neg)', color: 'var(--on-ink)' }}
              >
                <Icon name={r.ok ? 'check' : 'close'} size={12} label={r.ok ? 'Do' : "Don't"} />
              </span>
              {r.text}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
