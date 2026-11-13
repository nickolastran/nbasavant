'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import { toast } from '@/components/Toast';
import { CARD_SIZES, type CardSize, downloadShareCard } from '@/lib/export';

/**
 * Share a chart: a 1200×675 or 1080×1350 card with its title, subtitle,
 * wordmark and date, or a link to the page as it stands (filters live in the URL).
 */
export function ShareMenu({
  svg, title, subtitle, filename,
}: {
  /** The chart's <svg>, read when a card is asked for. */
  svg: () => SVGSVGElement | null;
  title: string;
  subtitle?: string;
  filename?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const card = async (size: CardSize) => {
    setOpen(false);
    const el = svg();
    if (!el) return;
    try {
      await downloadShareCard(el, { title, subtitle, size, filename });
      toast('Card saved');
    } catch {
      toast('Could not make the card');
    }
  };
  const link = async () => {
    setOpen(false);
    try {
      await navigator.clipboard.writeText(location.href);
      toast('Link copied');
    } catch {
      toast('Could not copy the link');
    }
  };

  const row = 'flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-normal hover:bg-[var(--panel-2)]';
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="btn-ghost flex items-center gap-1.5"
      >
        <Icon name="share" size={12} />
        Share
      </button>
      {open && (
        <div role="menu" className="panel absolute right-0 top-full z-30 mt-1 w-48 overflow-hidden shadow-2">
          {(Object.keys(CARD_SIZES) as CardSize[]).map((s) => (
            <button key={s} role="menuitem" className={row} onClick={() => card(s)}>
              <Icon name="download" size={14} />
              <span>
                PNG card {CARD_SIZES[s][0]}×{CARD_SIZES[s][1]}
              </span>
            </button>
          ))}
          <button role="menuitem" className={`${row} border-t`} style={{ borderColor: 'var(--line)' }} onClick={link}>
            <Icon name="link" size={14} />
            Copy link
          </button>
        </div>
      )}
    </div>
  );
}
