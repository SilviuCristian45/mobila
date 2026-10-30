// Previzualizare izometrică a unui obiect ca poligoane 2D (SVG), din aceleași părți și aceeași tesselare ca scena 3D.
// Pur: fără WebGL, deci 41 de miniaturi nu consumă contexte grafice și se pot testa în Node.
import { partTriangles } from './mesh';
import { roleMaterial, type Part, type SlotLooks } from './parts';

export interface PreviewPolygon {
  /** `x1,y1 x2,y2 x3,y3` în spațiul viewBox-ului. */
  points: string;
  fill: string;
}
export interface Preview {
  viewBox: string;
  polygons: PreviewPolygon[];
}

const YAW = (-32 * Math.PI) / 180;
const PITCH = (24 * Math.PI) / 180;
const LIGHT = norm3([-0.45, 0.8, 0.55]);

function norm3(v: number[]): [number, number, number] {
  const l = Math.hypot(v[0]!, v[1]!, v[2]!) || 1;
  return [v[0]! / l, v[1]! / l, v[2]! / l];
}

const hexRgb = (hex: string): number[] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const toHex = (c: number[]): string =>
  `#${c
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

/** Fața privește spre observator: rotație în jurul lui Y, apoi înclinare. Întoarce [ecranX, ecranY(sus+), adâncime]. */
function project(p: readonly number[], c: number, s: number, cp: number, sp: number) {
  const x1 = p[0]! * c + p[2]! * s;
  const z1 = -p[0]! * s + p[2]! * c;
  return [x1, p[1]! * cp - z1 * sp, z1 * cp + p[1]! * sp] as const;
}

export function buildPreview(
  parts: readonly Part[],
  bodyHex: string,
  size = 100,
  slots: SlotLooks = {},
): Preview {
  const c = Math.cos(YAW),
    s = Math.sin(YAW),
    cp = Math.cos(PITCH),
    sp = Math.sin(PITCH);
  const tris: Array<{
    pts: Array<readonly [number, number, number]>;
    depth: number;
    fill: string;
  }> = [];
  for (const part of parts) {
    const base = hexRgb(roleMaterial(part.color, bodyHex, slots).hex);
    for (const t of partTriangles(part)) {
      const q = t.map((v) => project(v, c, s, cp, sp));
      // normala în spațiul ecranului: față vizibilă dacă privește spre observator
      const a = [q[1]![0] - q[0]![0], q[1]![1] - q[0]![1], q[1]![2] - q[0]![2]];
      const b = [q[2]![0] - q[0]![0], q[2]![1] - q[0]![1], q[2]![2] - q[0]![2]];
      const n = norm3([
        a[1]! * b[2]! - a[2]! * b[1]!,
        a[2]! * b[0]! - a[0]! * b[2]!,
        a[0]! * b[1]! - a[1]! * b[0]!,
      ]); // în coordonatele (ecranX, ecranY sus, adâncime)
      // în spațiul ecranului observatorul privește dinspre +adâncime: față vizibilă ⇔ normala are componentă pozitivă pe adâncime
      if (n[2] <= 0) continue;
      const lambert = 0.5 + 0.5 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
      const lit = base.map((v) => v * (0.55 + 0.6 * lambert));
      tris.push({
        pts: q as unknown as Array<readonly [number, number, number]>,
        depth: (q[0]![2] + q[1]![2] + q[2]![2]) / 3,
        fill: toHex(lit),
      });
    }
  }
  tris.sort((a, b) => a.depth - b.depth);
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const t of tris)
    for (const p of t.pts) {
      minX = Math.min(minX, p[0]);
      maxX = Math.max(maxX, p[0]);
      minY = Math.min(minY, -p[1]);
      maxY = Math.max(maxY, -p[1]);
    }
  if (!Number.isFinite(minX)) return { viewBox: `0 0 ${size} ${size}`, polygons: [] };
  const span = Math.max(maxX - minX, maxY - minY) || 1;
  const k = (size * 0.9) / span;
  const ox = (size - (maxX - minX) * k) / 2 - minX * k;
  const oy = (size - (maxY - minY) * k) / 2 - minY * k;
  const f = (n: number) => Math.round(n * 100) / 100;
  return {
    viewBox: `0 0 ${size} ${size}`,
    polygons: tris.map((t) => ({
      points: t.pts.map((p) => `${f(p[0] * k + ox)},${f(-p[1] * k + oy)}`).join(' '),
      fill: t.fill,
    })),
  };
}
