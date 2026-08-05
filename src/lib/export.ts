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

/**
 * Rasterize an on-page SVG to PNG. Computed CSS variables are resolved first —
 * an SVG loaded into an <img> gets no stylesheet, so `var(--hot)` would render
 * as black otherwise.
 */
export function downloadSvgAsPng(svg: SVGSVGElement, filename: string, scale = 2) {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const originals = svg.querySelectorAll<SVGElement>('*');
  clone.querySelectorAll<SVGElement>('*').forEach((el, i) => {
    const cs = getComputedStyle(originals[i]);
    for (const prop of ['fill', 'stroke', 'stroke-width', 'opacity', 'font-size', 'font-family']) {
      const v = cs.getPropertyValue(prop);
      if (v) el.style.setProperty(prop, v);
    }
  });
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  const box = svg.getBoundingClientRect();
  const w = Math.round(box.width) || 600;
  const h = Math.round(box.height) || 560;
  const url = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(clone))))}`;

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = w * scale;
    canvas.height = h * scale;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = getComputedStyle(document.body).backgroundColor || '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => blob && save(blob, `${filename}.png`));
  };
  img.src = url;
}
