/**
 * The NBA runs on New York time. After 8 pm ET the UTC date is already
 * tomorrow, which is mid-game on most nights, so "today" is always asked of
 * the Eastern calendar. en-CA formats as YYYY-MM-DD.
 */
export const todayEt = (now = new Date()) =>
  now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

/** A YYYY-MM-DD day moved by n days. */
export const shiftDay = (day: string, n: number) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** A scheduled tip-off ("7:30 pm ET" on an ET day) as an instant, or null for anything else ("Final", "1st Qtr"). */
export function tipAt(day: string, status: string) {
  const m = /^(\d{1,2}):(\d{2})\s*(am|pm)\s*ET$/i.exec(status);
  if (!m) return null;
  const hh = String((+m[1] % 12) + (m[3].toLowerCase() === 'pm' ? 12 : 0)).padStart(2, '0');
  // New York's offset that day, "GMT-04:00" or "GMT-05:00". Tip-offs are never near the 2 am DST switch.
  const off = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'longOffset' })
    .formatToParts(new Date(`${day}T12:00:00Z`))
    .find((p) => p.type === 'timeZoneName')!.value.slice(3);
  return new Date(`${day}T${hh}:${m[2]}:00${off}`);
}

/**
 * A scheduled tip-off in the viewer's own zone, or `tz` if given: "4:30 pm PDT".
 * Anything else ("Final", "Q3 5:21") passes through.
 */
export function localTip(day: string, status: string, tz?: string) {
  const at = tipAt(day, status);
  if (!at) return status;
  return at
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short', timeZone: tz })
    .replace(/\b(AM|PM)\b/, (s) => s.toLowerCase());
}
