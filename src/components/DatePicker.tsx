'use client';

import { useId, useRef, useState } from 'react';
import { todayEt } from '@/lib/dates';

const pad = (n: number) => String(n).padStart(2, '0');
const WEEK = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** "MON, SEP 21, 2026" — the date the way a scoreboard prints it. */
const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`)
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .toUpperCase();

/**
 * The scoreboard's date button and its month calendar: « » a year, ‹ › a
 * month, the picked day filled, today (a New York day) outlined. Rides on the
 * native popover, so outside clicks and Escape close it for free.
 */
export function DatePicker({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ y: 2000, m: 0 });
  const today = todayEt();

  const shift = (months: number) =>
    setView(({ y, m }) => ({ y: y + Math.floor((m + months) / 12), m: (((m + months) % 12) + 12) % 12 }));

  const pick = (iso: string) => {
    onChange(iso);
    pop.current?.hidePopover();
  };

  const lead = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const month = new Date(Date.UTC(view.y, view.m, 1))
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .toUpperCase();

  const nav = 'flex h-7 w-7 items-center justify-center rounded border text-sm leading-none transition-colors hover:bg-[var(--panel-2)]';
  const navStyle = { borderColor: 'var(--line-2)', background: 'var(--panel)' };

  return (
    <>
      <button
        ref={btn}
        popoverTarget={id}
        className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded border px-2.5 py-1 transition-colors hover:bg-[var(--panel-2)]"
        style={{ borderColor: 'var(--line-2)', background: 'var(--panel)' }}
        aria-label={`Pick a date, showing ${value ? longDate(value) : 'none'}`}
      >
        <span aria-hidden className="text-[0.75rem]" style={{ color: 'var(--ink-3)' }}>
          ▦
        </span>
        <span className="tnum text-[0.6875rem] font-semibold tracking-[0.06em]">
          {/* Phones drop the ", 2026" to keep the row on one line. */}
          {value ? longDate(value).slice(0, -6) : '—'}
          {value && <span className="hidden sm:inline">{longDate(value).slice(-6)}</span>}
        </span>
      </button>

      <div
        ref={pop}
        id={id}
        popover="auto"
        // Top-layer popovers are fixed and centred by default; pin this one under its button.
        onToggle={(e) => {
          if (e.newState !== 'open' || !btn.current) return;
          const r = btn.current.getBoundingClientRect();
          e.currentTarget.style.top = `${r.bottom + window.scrollY + 6}px`;
          e.currentTarget.style.left = `${r.left + window.scrollX}px`;
          const [y, m] = (value || today).split('-').map(Number);
          setView({ y, m: m - 1 });
        }}
        className="absolute inset-auto m-0 w-[17rem] rounded-md border p-3"
        style={{ borderColor: 'var(--line)', background: 'var(--panel)', color: 'var(--ink)', boxShadow: 'var(--shadow)' }}
      >
        <div className="mb-2 flex items-center gap-1">
          <button onClick={() => shift(-12)} aria-label="Previous year" className={nav} style={navStyle}>
            «
          </button>
          <button onClick={() => shift(-1)} aria-label="Previous month" className={nav} style={navStyle}>
            ‹
          </button>
          <span className="flex-1 text-center text-[0.6875rem] font-semibold tracking-[0.14em]" aria-live="polite">
            {month}
          </span>
          <button onClick={() => shift(1)} aria-label="Next month" className={nav} style={navStyle}>
            ›
          </button>
          <button onClick={() => shift(12)} aria-label="Next year" className={nav} style={navStyle}>
            »
          </button>
        </div>

        <div className="grid grid-cols-7 gap-0.5 text-center">
          {WEEK.map((d, i) => (
            <span key={i} className="eyebrow py-1">
              {d}
            </span>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <span key={`pad${i}`} />
          ))}
          {Array.from({ length: days }, (_, i) => {
            const iso = `${view.y}-${pad(view.m + 1)}-${pad(i + 1)}`;
            const on = iso === value;
            return (
              <button
                key={iso}
                onClick={() => pick(iso)}
                aria-pressed={on}
                aria-current={iso === today ? 'date' : undefined}
                className="tnum h-8 rounded border text-sm transition-colors hover:bg-[var(--panel-2)]"
                style={{
                  borderColor: iso === today && !on ? 'var(--accent)' : 'transparent',
                  background: on ? 'var(--accent)' : undefined,
                  color: on ? '#fff' : 'var(--ink)',
                  fontWeight: on ? 700 : 400,
                }}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => pick(today)}
          className="eyebrow mt-2 w-full rounded border py-1.5 transition-colors hover:bg-[var(--panel-2)]"
          style={{ borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}
        >
          Today
        </button>
      </div>
    </>
  );
}
