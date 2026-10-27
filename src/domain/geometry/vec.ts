// Vectori 2D. Convenție de plan: X spre dreapta, Y în JOS (ca ecranul), unități: mm.
export interface Pt {
  x: number;
  y: number;
}

export const EPS = 1e-9;

export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
export const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y;
export const cross = (a: Pt, b: Pt): number => a.x * b.y - a.y * b.x;
export const len = (a: Pt): number => Math.hypot(a.x, a.y);
export const dist = (a: Pt, b: Pt): number => len(sub(a, b));

/** „Stânga” unui privitor care merge pe `d` (Y în jos): d=(1,0) → (0,−1). */
export const leftNormal = (d: Pt): Pt => ({ x: d.y, y: -d.x });
export const rightNormal = (d: Pt): Pt => ({ x: -d.y, y: d.x });

/** Intersecția a două drepte (punct + direcție); `null` dacă sunt paralele. */
export function intersectLines(p1: Pt, d1: Pt, p2: Pt, d2: Pt): Pt | null {
  const c = cross(d1, d2);
  if (Math.abs(c) < EPS) return null;
  const t = cross(sub(p2, p1), d2) / c;
  return add(p1, mul(d1, t));
}

/** Distanța de la punctul `p` la segmentul `ab`. */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return dist(p, add(a, mul(ab, t)));
}
