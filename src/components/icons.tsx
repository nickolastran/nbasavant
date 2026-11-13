/**
 * The icon set: 16px grid, 1.5px round strokes, drawn in the current text
 * color. Decorative by default; pass `label` when an icon stands alone.
 */
const PATHS = {
  search: 'M7 12.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11Zm4-1.5 3.5 3.5',
  sun: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M3 13l1-1M12 4l1-1',
  moon: 'M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7Z',
  download: 'M8 2v8m0 0L5 7m3 3 3-3M2.5 13.5h11',
  link: 'M6.5 9.5a3 3 0 0 0 4.2 0l2.3-2.3a3 3 0 0 0-4.2-4.2l-.8.8M9.5 6.5a3 3 0 0 0-4.2 0L3 8.8A3 3 0 0 0 7.2 13l.8-.8',
  check: 'm3 8.5 3.5 3.5L13 4.5',
  close: 'm4 4 8 8m0-8-8 8',
  up: 'M8 13V3m0 0L4 7m4-4 4 4',
  down: 'M8 3v10m0 0 4-4m-4 4L4 9',
  flat: 'M3 8h10',
  star: 'm8 1.8 1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.5l-3.8 2.1.7-4.3-3.1-3 4.3-.6Z',
  columns: 'M2.5 3h11v10h-11zM6.2 3v10M9.8 3v10',
  filter: 'M2 3.5h12L9.5 9v4l-3 1.5V9Z',
  share: 'M8 10V2m0 0L5 5m3-3 3 3M3 9v4.5h10V9',
  info: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM8 7.5V11M8 5v.2',
  chart: 'M2.5 13.5h11M4.5 11V7m3.5 4V3m3.5 8V5.5',
  court: 'M2 2.5h12v11H2zM5.5 2.5v4h5v-4M8 6.5v0M4 13.5a4 4 0 0 1 8 0',
} as const;

export type IconName = keyof typeof PATHS;
export const ICON_NAMES = Object.keys(PATHS) as IconName[];

export function Icon({ name, size = 16, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
