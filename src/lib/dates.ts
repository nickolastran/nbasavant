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
