// Tesselare: părți → triunghiuri (poziții, normale plate, culoare pe triunghi). Pur: folosit de scena 3D (BufferGeometry)
// și de previzualizările SVG, deci un singur drum pentru geometrie. Nu depinde de Three.
import { roleMaterial, type Part, type SlotLooks, type V3 } from './parts';

/** Număr de segmente la cilindri și elipsoizi (multiplu de 4: punctele extreme cad exact pe axe). */
export const SEGMENTS = 16;
const RINGS = 6; // inele de latitudine la elipsoid (pari: ecuatorul există)

export interface Mesh {
  /** 9 numere per triunghi (3 vârfuri × xyz). */
  positions: Float32Array;
  /** 9 numere per triunghi: aceeași normală plată pentru cele 3 vârfuri. */
  normals: Float32Array;
  /** 9 numere per triunghi: culoare RGB 0–1 per vârf. */
  colors: Float32Array;
  triangles: number;
  /** Grupe de vârfuri cu același material (rugozitate/metalicitate): un material Three per grup. */
  groups: Array<{ start: number; count: number; roughness: number; metalness: number }>;
}

type Tri = [V3, V3, V3];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Orientează triunghiul astfel încât normala să privească în afară (față de `inside`, un punct interior). */
function outward(t: Tri, inside: V3): Tri {
  const n = cross(sub(t[1], t[0]), sub(t[2], t[0]));
  const c: V3 = [
    (t[0][0] + t[1][0] + t[2][0]) / 3 - inside[0],
    (t[0][1] + t[1][1] + t[2][1]) / 3 - inside[1],
    (t[0][2] + t[1][2] + t[2][2]) / 3 - inside[2],
  ];
  return n[0] * c[0] + n[1] * c[1] + n[2] * c[2] >= 0 ? t : [t[0], t[2], t[1]];
}

function boxTris(part: Part): Tri[] {
  const [cx, cy, cz] = part.center;
  const [hx, hy, hz] = [part.size[0] / 2, part.size[1] / 2, part.size[2] / 2];
  const v = (sx: number, sy: number, sz: number): V3 => [cx + sx * hx, cy + sy * hy, cz + sz * hz];
  const quads: Array<[V3, V3, V3, V3]> = [
    [v(-1, -1, -1), v(1, -1, -1), v(1, 1, -1), v(-1, 1, -1)], // spate
    [v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1)], // față
    [v(-1, -1, -1), v(-1, -1, 1), v(-1, 1, 1), v(-1, 1, -1)], // stânga
    [v(1, -1, -1), v(1, -1, 1), v(1, 1, 1), v(1, 1, -1)], // dreapta
    [v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1), v(-1, -1, 1)], // jos
    [v(-1, 1, -1), v(1, 1, -1), v(1, 1, 1), v(-1, 1, 1)], // sus
  ];
  const out: Tri[] = [];
  for (const [a, b, c, d] of quads) {
    out.push(outward([a, b, c], part.center), outward([a, c, d], part.center));
  }
  return out;
}

function cylinderTris(part: Part): Tri[] {
  const axis = part.axis ?? 'y';
  // indici: a = axa, u/v = planul secțiunii
  const [ia, iu, iv] = axis === 'y' ? [1, 0, 2] : axis === 'x' ? [0, 1, 2] : [2, 0, 1];
  const c = part.center;
  const ru = part.size[iu!]! / 2;
  const rv = part.size[iv!]! / 2;
  const half = part.size[ia!]! / 2;
  const taper = part.taper ?? 1;
  const at = (angle: number, top: boolean): V3 => {
    const k = top ? taper : 1;
    const p: number[] = [c[0], c[1], c[2]];
    p[ia!] = c[ia!]! + (top ? half : -half);
    p[iu!] = c[iu!]! + Math.cos(angle) * ru * k;
    p[iv!] = c[iv!]! + Math.sin(angle) * rv * k;
    return p as unknown as V3;
  };
  const centerOf = (top: boolean): V3 => {
    const p: number[] = [c[0], c[1], c[2]];
    p[ia!] = c[ia!]! + (top ? half : -half);
    return p as unknown as V3;
  };
  const out: Tri[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const a0 = (i / SEGMENTS) * Math.PI * 2;
    const a1 = ((i + 1) / SEGMENTS) * Math.PI * 2;
    const b0 = at(a0, false),
      b1 = at(a1, false),
      t0 = at(a0, true),
      t1 = at(a1, true);
    out.push(outward([b0, b1, t1], c), outward([b0, t1, t0], c));
    out.push(outward([centerOf(false), b0, b1], c));
    if (taper > 1e-6) out.push(outward([centerOf(true), t0, t1], c));
  }
  return out;
}

function sphereTris(part: Part): Tri[] {
  const [cx, cy, cz] = part.center;
  const [rx, ry, rz] = [part.size[0] / 2, part.size[1] / 2, part.size[2] / 2];
  const pt = (lat: number, lon: number): V3 => [
    cx + Math.cos(lat) * Math.cos(lon) * rx,
    cy + Math.sin(lat) * ry,
    cz + Math.cos(lat) * Math.sin(lon) * rz,
  ];
  const out: Tri[] = [];
  for (let r = 0; r < RINGS; r++) {
    const l0 = -Math.PI / 2 + (r / RINGS) * Math.PI;
    const l1 = -Math.PI / 2 + ((r + 1) / RINGS) * Math.PI;
    for (let i = 0; i < SEGMENTS; i++) {
      const o0 = (i / SEGMENTS) * Math.PI * 2;
      const o1 = ((i + 1) / SEGMENTS) * Math.PI * 2;
      const a = pt(l0, o0),
        b = pt(l0, o1),
        c = pt(l1, o1),
        d = pt(l1, o0);
      if (r > 0) out.push(outward([a, b, c], part.center));
      if (r < RINGS - 1) out.push(outward([a, c, d], part.center));
    }
  }
  return out;
}

export function partTriangles(part: Part): Tri[] {
  return part.shape === 'box'
    ? boxTris(part)
    : part.shape === 'cylinder'
      ? cylinderTris(part)
      : sphereTris(part);
}

const rgb01 = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

/** Toate părțile într-o singură plasă (un singur mesh per obiect în scenă). */
export function buildMesh(parts: readonly Part[], bodyHex: string, slots: SlotLooks = {}): Mesh {
  const tris: Array<{
    t: Tri;
    color: [number, number, number];
    key: string;
    r: number;
    m: number;
  }> = [];
  for (const p of parts) {
    const mat = roleMaterial(p.color, bodyHex, slots);
    const color = rgb01(mat.hex);
    const r = Math.round(mat.roughness * 100) / 100;
    const m = Math.round(mat.metalness * 100) / 100;
    const key = `${r}|${m}`;
    for (const t of partTriangles(p)) tris.push({ t, color, key, r, m });
  }
  // triunghiurile aceluiași material, contigue (grupe); ordinea relativă rămâne cea a părților
  const order = [...new Set(tris.map((x) => x.key))].sort();
  tris.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  const groups: Mesh['groups'] = [];
  tris.forEach((x, i) => {
    const g = groups[groups.length - 1];
    if (g && g.roughness === x.r && g.metalness === x.m) g.count += 3;
    else groups.push({ start: i * 3, count: 3, roughness: x.r, metalness: x.m });
  });
  const positions = new Float32Array(tris.length * 9);
  const normals = new Float32Array(tris.length * 9);
  const colors = new Float32Array(tris.length * 9);
  tris.forEach(({ t, color }, i) => {
    const n = norm(cross(sub(t[1], t[0]), sub(t[2], t[0])));
    for (let k = 0; k < 3; k++) {
      const o = i * 9 + k * 3;
      positions.set(t[k]!, o);
      normals.set(n, o);
      colors.set(color, o);
    }
  });
  return { positions, normals, colors, triangles: tris.length, groups };
}
