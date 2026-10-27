// Bani: sume ÎNTREGI în unități minore (bani). O singură rotunjire pe linie; totalurile însumează liniile rotunjite.
import { step, type Traced } from '../trace';

/** Rotunjire „half away from zero”. */
export const roundHalfAway = (x: number): number => (x < 0 ? -Math.round(-x) : Math.round(x)) + 0; // `+ 0` normalizează −0

/** Cantitățile zecimale se rotunjesc intern la 1e-3 (DATA_MODEL §8.3). */
export const roundQty = (x: number): number => roundHalfAway(x * 1000) / 1000;

/** Rotunjire în sus cu toleranță, ca `4,0000000001` să nu devină 5 (ARCHITECTURE §8.2). */
export const CEIL_EPSILON = 1e-9;
export const ceilEps = (x: number): number => {
  const r = Math.ceil(x - CEIL_EPSILON);
  return r === 0 ? 0 : r; // evită −0 (ceil(−1e-9) = −0)
};

export interface Totals {
  netMinor: number;
  vatMinor: number;
  grossMinor: number;
}

export const zeroTotals = (): Totals => ({ netMinor: 0, vatMinor: 0, grossMinor: 0 });
export const addTotals = (a: Totals, b: Totals): Totals => ({
  netMinor: a.netMinor + b.netMinor,
  vatMinor: a.vatMinor + b.vatMinor,
  grossMinor: a.grossMinor + b.grossMinor,
});

function assertInteger(name: string, v: number): void {
  if (!Number.isInteger(v)) throw new RangeError(`${name} trebuie să fie întreg (primit ${v})`);
}

/**
 * Totalul unei linii. Prețuri cu TVA: brut = round(q × preț), net = round(brut × 10000 / (10000 + TVA)), TVA = brut − net.
 * Prețuri fără TVA: net = round(q × preț), TVA = round(net × TVA / 10000), brut = net + TVA.
 */
export function lineMoney(
  quantity: number,
  unitPriceMinor: number,
  vatBp: number,
  pricesIncludeVat: boolean,
): Traced<Totals> {
  assertInteger('prețul unitar', unitPriceMinor);
  assertInteger('TVA (puncte-bază)', vatBp);
  if (quantity < 0 || unitPriceMinor < 0)
    throw new RangeError('cantitatea și prețul nu pot fi negative');
  const trace = [];
  if (pricesIncludeVat) {
    const gross = roundHalfAway(quantity * unitPriceMinor);
    trace.push(
      step(
        'Total brut linie',
        'round(cantitate × preț unitar)',
        { cantitate: quantity, 'preț (bani)': unitPriceMinor },
        gross,
        'round',
      ),
    );
    const net = roundHalfAway((gross * 10000) / (10000 + vatBp));
    trace.push(
      step(
        'Net linie (preț cu TVA)',
        'round(brut × 10000 / (10000 + TVA bp))',
        { 'brut (bani)': gross, 'TVA (bp)': vatBp },
        net,
        'round',
      ),
    );
    trace.push(step('TVA linie', 'brut − net', { brut: gross, net }, gross - net));
    return { value: { netMinor: net, vatMinor: gross - net, grossMinor: gross }, trace };
  }
  const net = roundHalfAway(quantity * unitPriceMinor);
  trace.push(
    step(
      'Net linie',
      'round(cantitate × preț unitar)',
      { cantitate: quantity, 'preț (bani)': unitPriceMinor },
      net,
      'round',
    ),
  );
  const vat = roundHalfAway((net * vatBp) / 10000);
  trace.push(
    step(
      'TVA linie',
      'round(net × TVA bp / 10000)',
      { 'net (bani)': net, 'TVA (bp)': vatBp },
      vat,
      'round',
    ),
  );
  trace.push(step('Total brut linie', 'net + TVA', { net, vat }, net + vat));
  return { value: { netMinor: net, vatMinor: vat, grossMinor: net + vat }, trace };
}

/**
 * Împarte `total` (întreg) proporțional cu `weights` prin metoda celei mai mari rămășițe: suma părților = total, exact.
 * Deterministă: independentă de ordinea cheilor (egalitățile se rezolvă după cheie).
 */
export function allocate(
  total: number,
  weights: Readonly<Record<string, number>>,
): Record<string, number> {
  assertInteger('totalul de alocat', total);
  const keys = Object.keys(weights).sort();
  const out: Record<string, number> = {};
  if (keys.length === 0) return out;
  const sum = keys.reduce((a, k) => a + Math.max(0, weights[k]!), 0);
  if (sum <= 0) {
    keys.forEach((k, i) => (out[k] = i === 0 ? total : 0));
    return out;
  }
  const raw = keys.map((k) => ({ k, v: (total * Math.max(0, weights[k]!)) / sum }));
  let used = 0;
  for (const r of raw) {
    out[r.k] = Math.floor(r.v);
    used += out[r.k]!;
  }
  const byRemainder = [...raw].sort(
    (a, b) => b.v - Math.floor(b.v) - (a.v - Math.floor(a.v)) || a.k.localeCompare(b.k),
  );
  for (let i = 0; i < total - used; i++) out[byRemainder[i % byRemainder.length]!.k]! += 1;
  return out;
}
