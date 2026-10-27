// Urma de calcul (FR-17): fiecare valoare derivată vine cu pașii care au produs-o.
// Urma este produsă de ACELEAȘI funcții care calculează valoarea; nu e o reconstrucție separată.

export type TraceValue = number | string;
export type Rounding = 'ceil' | 'round' | 'none';

export interface TraceStep {
  label: string;
  formula: string;
  inputs: Record<string, TraceValue>;
  result: TraceValue;
  rounding: Rounding;
}

export interface Traced<T> {
  value: T;
  trace: TraceStep[];
}

export const step = (
  label: string,
  formula: string,
  inputs: Record<string, TraceValue>,
  result: TraceValue,
  rounding: Rounding = 'none',
): TraceStep => ({ label, formula, inputs, result, rounding });
