import { ImageResponse } from 'next/og';

/** Absolute origin for share links, the sitemap and OG image URLs. */
export const SITE_URL =
  process.env.SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000');

export const OG_SIZE = { width: 1200, height: 630 };

/**
 * An image as a data URI, or null when it isn't there. Satori throws on a
 * broken <img>, and plenty of old players have no headshot.
 */
export async function imageData(url: string) {
  try {
    const res = await fetch(url.startsWith('/') ? `${SITE_URL}${url}` : url);
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? 'image/png';
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
  } catch {
    return null;
  }
}

/** The newsprint share card every page's preview is built on. */
export function ogCard({
  eyebrow,
  title,
  subtitle,
  accent = '#1450c8',
  art,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  accent?: string;
  art?: React.ReactNode;
}) {
  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%', background: '#f2f1ec', color: '#16181c' }}>
        <div style={{ width: 24, height: '100%', background: accent }} />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '64px 72px' }}>
          <div style={{ display: 'flex', fontSize: 30, letterSpacing: 2, textTransform: 'uppercase' }}>
            NBA<span style={{ color: '#8b8f96', padding: '0 4px' }}>//</span>Savant
          </div>
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 48 }}>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <div style={{ fontSize: 30, color: '#4d525a', textTransform: 'uppercase', letterSpacing: 1 }}>{eyebrow}</div>
              <div style={{ fontSize: title.length > 22 ? 64 : 84, lineHeight: 1.05, marginTop: 12 }}>{title}</div>
              {subtitle && <div style={{ fontSize: 30, color: '#4d525a', marginTop: 24 }}>{subtitle}</div>}
            </div>
            {art}
          </div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
