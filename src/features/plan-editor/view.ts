// Matematica vizualizării planului (pură): spațiul lume (mm, Y în jos) ↔ spațiul ecran (px) — ARCHITECTURE §5.2.
//   ecran = lume × zoom + pan        lume = (ecran − pan) / zoom
import type { Pt } from '@/domain';

export interface View {
  /** px per mm. */
  zoom: number;
  panX: number;
  panY: number;
}
export interface Size {
  w: number;
  h: number;
}

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 2;
export const ZOOM_STEP = 1.25;

export const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export const toWorld = (v: View, sx: number, sy: number): Pt => ({
  x: (sx - v.panX) / v.zoom,
  y: (sy - v.panY) / v.zoom,
});
export const toScreen = (v: View, p: Pt): Pt => ({
  x: p.x * v.zoom + v.panX,
  y: p.y * v.zoom + v.panY,
});

/** Zoom în jurul unui punct de pe ecran (punctul rămâne sub cursor). */
export function zoomAt(v: View, factor: number, sx: number, sy: number): View {
  const zoom = clampZoom(v.zoom * factor);
  const k = zoom / v.zoom;
  return { zoom, panX: sx - (sx - v.panX) * k, panY: sy - (sy - v.panY) * k };
}

/** Vizualizarea care cuprinde toate punctele, centrată; fără puncte: origine lângă colțul stânga-sus, 0,1 px/mm (primul perete/prima cameră apar în câmp fără salt). */
export function fitView(points: readonly Pt[], size: Size, marginPx = 56): View {
  if (points.length === 0) return { zoom: 0.1, panX: marginPx, panY: marginPx };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1000);
  const spanY = Math.max(maxY - minY, 1000);
  const zoom = clampZoom(
    Math.min((size.w - 2 * marginPx) / spanX, (size.h - 2 * marginPx) / spanY),
  );
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { zoom, panX: size.w / 2 - cx * zoom, panY: size.h / 2 - cy * zoom };
}

export const snapToGrid = (p: Pt, gridMm: number): Pt => ({
  x: Math.round(p.x / gridMm) * gridMm,
  y: Math.round(p.y / gridMm) * gridMm,
});

/** Cel mai apropiat nod aflat la cel mult `radiusMm` de `p`. */
export function nearestNode<T extends Pt>(nodes: readonly T[], p: Pt, radiusMm: number): T | null {
  let best: T | null = null;
  let bestD = radiusMm;
  for (const n of nodes) {
    const d = Math.hypot(n.x - p.x, n.y - p.y);
    if (d <= bestD) {
      best = n;
      bestD = d;
    }
  }
  return best;
}

/** Unghiul unui text de-a lungul unui segment, mereu citibil (fără text cu capul în jos), în grade. */
export function readableAngleDeg(a: Pt, b: Pt): number {
  let deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (deg > 90) deg -= 180;
  else if (deg <= -90) deg += 180;
  return deg;
}

/** Centrul de greutate al unui poligon simplu (pentru etichete); media vârfurilor dacă aria e 0. */
export function polygonCentroid(poly: readonly Pt[]): Pt {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const f = p.x * q.y - q.x * p.y;
    a += f;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = Math.max(poly.length, 1);
    return {
      x: poly.reduce((s, p) => s + p.x, 0) / n,
      y: poly.reduce((s, p) => s + p.y, 0) / n,
    };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}
