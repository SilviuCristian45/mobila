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

const num2 = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 });
const num1 = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 1 });

/** Lungime din mm în unitatea de afișare a proiectului (`mm` | `cm` | `m`); doar formatare, stocarea rămâne în mm. */
export function formatLength(mm: number, unit: 'mm' | 'cm' | 'm'): string {
  if (unit === 'mm') return `${num1.format(mm)} mm`;
  if (unit === 'cm') return `${num1.format(mm / 10)} cm`;
  return `${num2.format(mm / 1000)} m`;
}

/** Suprafață din mm² în m², cu două zecimale. */
export const formatAreaM2 = (mm2: number): string => `${num2.format(mm2 / 1_000_000)} m²`;
