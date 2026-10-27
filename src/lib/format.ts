// Formatare pentru afișare (doar pe client: datele vin din IndexedDB, niciodată din prerandare).
const dateTime = new Intl.DateTimeFormat('ro-RO', { dateStyle: 'medium', timeStyle: 'short' });

export function formatDateTime(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso : dateTime.format(new Date(t));
}

/** „1 cameră”, „2 camere”, „20 de camere” (regulile românești pentru plural). */
export function pluralRo(n: number, one: string, many: string, manyWithDe: string): string {
  if (n === 1) return `1 ${one}`;
  const lastTwo = n % 100;
  return lastTwo === 0 || (lastTwo > 0 && lastTwo < 20) ? `${n} ${many}` : `${n} ${manyWithDe}`;
}
