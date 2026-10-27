import { cross, distToSegment, sub, type Pt } from './vec';

/** Aria semnată (formula șireturilor). Cu Y în jos, pozitivă = sens ORAR pe ecran. */
export function signedArea(poly: readonly Pt[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export const polygonArea = (poly: readonly Pt[]): number => Math.abs(signedArea(poly));

export function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

const orient = (p: Pt, q: Pt, r: Pt): number => Math.sign(cross(sub(q, p), sub(r, p)));

/** Intersecție PROPRIE (în interiorul ambelor segmente). */
export function segmentsCrossProperly(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  return orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0;
}

/**
 * Poligon simplu: fără intersecții între laturi neadiacente și fără vârfuri care ating o latură neadiacentă.
 * O(n²), suficient pentru camere (≤ 500 de noduri).
 */
export function isSimplePolygon(poly: readonly Pt[], touchTolerance = 1e-6): boolean {
  const n = poly.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (adjacent) continue;
      const c = poly[j]!;
      const d = poly[(j + 1) % n]!;
      if (segmentsCrossProperly(a, b, c, d)) return false;
      if (distToSegment(c, a, b) < touchTolerance || distToSegment(a, c, d) < touchTolerance)
        return false;
    }
  }
  return true;
}
