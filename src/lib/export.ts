'use client';

const save = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
  save(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`);
}

export function downloadJson(data: unknown, filename: string) {
  save(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `${filename}.json`);
}

const asDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

/**
 * An on-page SVG as a standalone image. Computed CSS is written onto each
 * element first (an SVG loaded into an <img> gets no stylesheet, so
 * `var(--hot)` would render black), and every <image> is inlined as a data
 * URL, since an SVG drawn to a canvas can't fetch anything.
 */
async function rasterize(svg: SVGSVGElement) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const originals = svg.querySelectorAll<SVGElement>('*');
  const copies = clone.querySelectorAll<SVGElement>('*');
  copies.forEach((el, i) => {
    const cs = getComputedStyle(originals[i]);
    for (const prop of ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'fill-opacity', 'font-size', 'font-family', 'font-weight']) {
      const v = cs.getPropertyValue(prop);
      if (v) el.style.setProperty(prop, v);
    }
  });
  await Promise.all(
    [...copies].filter((el) => el.tagName.toLowerCase() === 'image').map(async (el) => {
      const href = el.getAttribute('href') ?? el.getAttribute('xlink:href');
      if (!href || href.startsWith('data:')) return;
      try {
        el.setAttribute('href', await asDataUrl(await (await fetch(href)).blob()));
      } catch {
        el.remove(); // An image that can't be fetched would taint the canvas; the card goes out without it.
      }
    }),
  );
  const box = svg.getBoundingClientRect();
  const w = Math.round(box.width) || 600;
  const h = Math.round(box.height) || 560;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(clone))))}`;
  });
  return { img, w, h };
}

const toPng = (canvas: HTMLCanvasElement, filename: string) =>
  new Promise<void>((resolve) =>
    canvas.toBlob((blob) => {
      if (blob) save(blob, `${filename}.png`);
      resolve();
    }),
  );

/** Rasterize an on-page SVG to PNG at its on-screen size. */
export async function downloadSvgAsPng(svg: SVGSVGElement, filename: string, scale = 2) {
  const { img, w, h } = await rasterize(svg);
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = getComputedStyle(document.body).backgroundColor || '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  await toPng(canvas, filename);
}

/** The two share-card shapes: a wide one for feeds and decks, a tall one for phones. */
export const CARD_SIZES = { wide: [1200, 675], tall: [1080, 1350] } as const;
export type CardSize = keyof typeof CARD_SIZES;

/**
 * A deck-style card: the chart under a title and subtitle, with the wordmark,
 * the data credit and the date along the bottom, in the current theme's colors.
 */
export async function downloadShareCard(
  svg: SVGSVGElement,
  { title, subtitle, size = 'wide', filename = 'nba-savant' }: { title: string; subtitle?: string; size?: CardSize; filename?: string },
) {
  const [W, H] = CARD_SIZES[size];
  const { img, w, h } = await rasterize(svg);
  const css = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  const font = getComputedStyle(document.body).fontFamily;
  await document.fonts.ready;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = token('--surface', '#f6f1e7');
  ctx.fillRect(0, 0, W, H);

  const pad = 48;
  ctx.textBaseline = 'top';
  ctx.fillStyle = token('--ink', '#16181c');
  ctx.font = `800 44px ${font}`;
  ctx.fillText(title, pad, pad, W - pad * 2);
  let top = pad + 56;
  if (subtitle) {
    ctx.fillStyle = token('--ink-2', '#4d525a');
    ctx.font = `400 22px ${font}`;
    ctx.fillText(subtitle, pad, top, W - pad * 2);
    top += 36;
  }
  top += 12;

  // The footer: a hairline, the wordmark on the left, credit and date on the right.
  const foot = H - pad - 22;
  ctx.fillStyle = token('--line-2', '#c4c2bb');
  ctx.fillRect(pad, foot - 18, W - pad * 2, 1);
  ctx.fillStyle = token('--ink', '#16181c');
  ctx.font = `800 22px ${font}`;
  ctx.fillText('NBA//SAVANT', pad, foot);
  ctx.fillStyle = token('--ink-2', '#4d525a');
  ctx.font = `400 18px ${font}`;
  ctx.textAlign = 'right';
  ctx.fillText(
    `Data: NBA.com · ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
    W - pad, foot + 2,
  );

  // The chart, as large as fits between the header and the footer, centered.
  const [bw, bh] = [W - pad * 2, foot - 18 - 16 - top];
  const k = Math.min(bw / w, bh / h);
  ctx.drawImage(img, pad + (bw - w * k) / 2, top + (bh - h * k) / 2, w * k, h * k);
  await toPng(canvas, `${filename}-${size}`);
}
