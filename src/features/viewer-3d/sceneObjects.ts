// SceneDescription → obiecte Three.js (geometrii). Modul PUR față de browser: nu atinge window/WebGL, deci se poate
// testa în Node. Nu conține calcule geometrice ale proiectului (prisme, goluri, îmbinări vin gata din domeniu).
import * as THREE from 'three';
import type { BoxDesc, FinishTarget, Pt, SceneDescription, SurfaceLook } from '@/domain';
import { buildMesh, buildParts, resolveRecipe, type SlotLooks } from '@/catalog';
import { uvTransform } from '@/materials';

export const WALL_COLOR = '#e7e5e4';
export const EDGE_COLOR = '#78716c';
/** Unghiul (grade) peste care o muchie se desenează ca linie de contur. */
const EDGE_THRESHOLD_DEG = 30;

export interface WallMeshData {
  id: string;
  wallId: string;
  /** Aspectele fețelor (chei în `scene.looks`); grupele geometriei: 0 = stânga, 1 = dreapta, 2 = restul. */
  left: string | null;
  right: string | null;
  geometry: THREE.BufferGeometry;
  edges: THREE.BufferGeometry;
  /** Cota de jos a prismei, în metri (geometria se extrudează de la 0). */
  y: number;
}
export interface FloorMeshData {
  id: string;
  roomId: string;
  geometry: THREE.BufferGeometry;
  colorHex: string;
  look: string | null;
}
export interface ObjectMeshData {
  id: string;
  /** Plasă cu culori pe vârf (un singur mesh per obiect); partajată între obiecte identice. */
  geometry: THREE.BufferGeometry;
  /** Baza obiectului (centrul amprentei, la cota de jos), în metri. */
  position: [number, number, number];
  rotationY: number;
  /** Lățime, înălțime, adâncime (m): cutia de selecție. */
  size: [number, number, number];
  /** Rețeta lipsă/necunoscută: obiectul e o cutie de înlocuire. */
  placeholder: boolean;
  /** Materialele grupelor geometriei (rugozitate, metalicitate), în ordinea grupelor. */
  materials: Array<{ roughness: number; metalness: number }>;
}
/** Cutie în spațiu 3D (metri, Y sus). */
export interface SceneBounds {
  min: [number, number, number];
  max: [number, number, number];
}
export interface SceneObjects {
  walls: WallMeshData[];
  floors: FloorMeshData[];
  objects: ObjectMeshData[];
  bounds: SceneBounds | null;
  dispose: () => void;
}

/**
 * Geometrii de obiecte reutilizate între reconstruiri ale scenei: un obiect nemodificat (sau o copie identică) nu își
 * regenerează plasa. Proprietarul apelează `prune` după fiecare reconstruire și `clear` la demontare.
 */
export class GeometryCache {
  private readonly map = new Map<string, THREE.BufferGeometry>();
  get(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let g = this.map.get(key);
    if (!g) {
      g = make();
      this.map.set(key, g);
    }
    return g;
  }
  prune(used: ReadonlySet<string>): void {
    for (const [k, g] of this.map)
      if (!used.has(k)) {
        g.dispose();
        this.map.delete(k);
      }
  }
  clear(): void {
    for (const g of this.map.values()) g.dispose();
    this.map.clear();
  }
  get size(): number {
    return this.map.size;
  }
}

/** Aspectul zonelor finisate ale unui obiect, din `scene.looks`. */
export function slotLooksOf(b: BoxDesc, looks: Record<string, SurfaceLook>): SlotLooks {
  const out: SlotLooks = {};
  for (const [slot, key] of Object.entries(b.slots)) {
    const l = looks[key];
    if (l)
      out[slot as keyof SlotLooks] = {
        hex: l.baseColorHex,
        roughness: l.roughness,
        metalness: l.metalness,
      };
  }
  return out;
}

export const objectGeometryKey = (b: BoxDesc, looks: Record<string, SurfaceLook> = {}): string =>
  JSON.stringify([b.recipe, b.size, b.params, b.colorHex, slotLooksOf(b, looks)]);

function objectGeometry(b: BoxDesc, looks: Record<string, SurfaceLook>): THREE.BufferGeometry {
  const { parts } = buildParts(b.recipe, b.size, b.params);
  const mesh = buildMesh(parts, b.colorHex, slotLooksOf(b, looks));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(mesh.normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(mesh.colors, 3));
  mesh.groups.forEach((grp, i) => g.addGroup(grp.start, grp.count, i));
  g.userData.materials = mesh.groups.map((grp) => ({
    roughness: grp.roughness,
    metalness: grp.metalness,
  }));
  g.computeBoundingSphere();
  return g;
}

// ───────────── pereți: prismă cu grupe pe fețe și UV în lume ─────────────

const sub3 = (a: number[], b: number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const cross3 = (a: number[], b: number[]) => [
  a[1]! * b[2]! - a[2]! * b[1]!,
  a[2]! * b[0]! - a[0]! * b[2]!,
  a[0]! * b[1]! - a[1]! * b[0]!,
];

/**
 * Prisma unui perete (patrulater în plan × înălțime), în spațiul local al extruziunii (x, −y_plan, z în sus; mesh-ul se rotește −90° pe X).
 * Grupe: 0 = fața stângă, 1 = fața dreaptă, 2 = capete/sus/jos. UV în lume: s (de-a lungul peretelui, mm) și înălțimea (mm) → textura
 * își păstrează scara și continuitatea între prismele aceluiași perete.
 */
export function prismGeometry(
  polygon: readonly Pt[],
  y0Mm: number,
  y1Mm: number,
  leftLook: SurfaceLook | null,
  rightLook: SurfaceLook | null,
): THREE.BufferGeometry {
  const depth = (y1Mm - y0Mm) / 1000;
  const P = polygon.map((p) => [p.x / 1000, -p.y / 1000]);
  const v = (i: number, z: number) => [P[i]![0]!, P[i]![1]!, z];
  const cx = P.reduce((a, p) => a + p[0]!, 0) / P.length;
  const cy = P.reduce((a, p) => a + p[1]!, 0) / P.length;
  const inside = [cx, cy, depth / 2];
  const pos: number[] = [];
  const uvs: number[] = [];
  const groups: Array<[number, number]> = [];
  const tri = (a: number[], b: number[], c: number[], uv: (p: number[]) => [number, number]) => {
    const n = cross3(sub3(b, a), sub3(c, a));
    const m = [
      (a[0]! + b[0]! + c[0]!) / 3,
      (a[1]! + b[1]! + c[1]!) / 3,
      (a[2]! + b[2]! + c[2]!) / 3,
    ];
    const d = sub3(m, inside);
    const flip = n[0]! * d[0]! + n[1]! * d[1]! + n[2]! * d[2]! < 0;
    const t = flip ? [a, c, b] : [a, b, c];
    for (const p of t) {
      pos.push(p[0]!, p[1]!, p[2]!);
      const [u, w] = uv(p);
      uvs.push(u, w);
    }
  };
  const quad = (i: number, j: number, uv: (p: number[]) => [number, number]) => {
    tri(v(i, 0), v(j, 0), v(j, depth), uv);
    tri(v(i, 0), v(j, depth), v(i, depth), uv);
  };
  const none = (): [number, number] => [0, 0];
  // direcția peretelui (plan, mm): de la începutul feței stângi la capătul ei
  const dx = polygon[1]!.x - polygon[0]!.x;
  const dy = polygon[1]!.y - polygon[0]!.y;
  const dl = Math.hypot(dx, dy) || 1;
  const faceUv = (look: SurfaceLook | null) => {
    if (!look?.texture) return none;
    const t = uvTransform(look.texture);
    return (p: number[]) => {
      const planX = p[0]! * 1000;
      const planY = -p[1]! * 1000;
      return t((planX * dx + planY * dy) / dl, y0Mm + p[2]! * 1000);
    };
  };
  const start = () => pos.length / 3;
  let at = start();
  quad(0, 1, faceUv(leftLook)); // stânga
  groups.push([at, start() - at]);
  at = start();
  quad(2, 3, faceUv(rightLook)); // dreapta
  groups.push([at, start() - at]);
  at = start();
  quad(1, 2, none);
  quad(3, 0, none);
  tri(v(0, 0), v(1, 0), v(2, 0), none);
  tri(v(0, 0), v(2, 0), v(3, 0), none);
  tri(v(0, depth), v(1, depth), v(2, depth), none);
  tri(v(0, depth), v(2, depth), v(3, depth), none);
  groups.push([at, start() - at]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  groups.forEach(([s0, c], i) => g.addGroup(s0, c, i));
  return g;
}

/** Podea: poligon triangulat, cu UV în lume (x, y din plan) ca textura să păstreze scara reală. */
function floorGeometry(polygon: readonly Pt[], look: SurfaceLook | null): THREE.BufferGeometry {
  const g = new THREE.ShapeGeometry(shapeFrom(polygon));
  if (look?.texture) {
    const t = uvTransform(look.texture);
    const p = g.getAttribute('position');
    const uv: number[] = [];
    for (let i = 0; i < p.count; i++) uv.push(...t(p.getX(i) * 1000, -p.getY(i) * 1000));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  }
  return g;
}

/** Conturul suprafeței selectate (segmente de linie, metri, spațiul lumii): perimetrul podelei sau dreptunghiurile feței peretelui. */
export function surfaceOutline(
  scene: SceneDescription,
  sel: FinishTarget | null,
): Float32Array | null {
  if (!sel || sel.kind === 'objectSlot') return null;
  const seg: number[] = [];
  const line = (a: number[], b: number[]) => seg.push(a[0]!, a[1]!, a[2]!, b[0]!, b[1]!, b[2]!);
  if (sel.kind === 'roomFloor') {
    const f = scene.floors.find((x) => x.roomId === sel.roomId);
    if (!f) return null;
    const q = f.polygon.map((p) => [p.x / 1000, 0.006, p.y / 1000]);
    q.forEach((p, i) => line(p, q[(i + 1) % q.length]!));
  } else {
    for (const pr of scene.prisms) {
      if (pr.wallId !== sel.wallId) continue;
      const [a, b] =
        sel.side === 'left' ? [pr.polygon[0]!, pr.polygon[1]!] : [pr.polygon[2]!, pr.polygon[3]!];
      const cx = pr.polygon.reduce((m, p) => m + p.x, 0) / pr.polygon.length;
      const cy = pr.polygon.reduce((m, p) => m + p.y, 0) / pr.polygon.length;
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const l = Math.hypot(dx, dy) || 1;
      let nx = dy / l,
        ny = -dx / l;
      if (nx * ((a.x + b.x) / 2 - cx) + ny * ((a.y + b.y) / 2 - cy) < 0) {
        nx = -nx;
        ny = -ny;
      }
      const o = 0.004; // 4 mm în afara feței
      const c = [
        [a.x / 1000 + nx * o, pr.y0 / 1000, a.y / 1000 + ny * o],
        [b.x / 1000 + nx * o, pr.y0 / 1000, b.y / 1000 + ny * o],
        [b.x / 1000 + nx * o, pr.y1 / 1000, b.y / 1000 + ny * o],
        [a.x / 1000 + nx * o, pr.y1 / 1000, a.y / 1000 + ny * o],
      ];
      c.forEach((p, i) => line(p, c[(i + 1) % 4]!));
    }
  }
  return seg.length > 0 ? new Float32Array(seg) : null;
}

/** Plan (x, y în mm, Y în jos) → Shape; după rotația −90° pe X: (x, ys, z) → (x, z, −ys) = (x, z, y_plan). */
function shapeFrom(polygon: readonly Pt[]): THREE.Shape {
  return new THREE.Shape(polygon.map((p) => new THREE.Vector2(p.x / 1000, -p.y / 1000)));
}

export function sceneBounds(scene: SceneDescription): SceneBounds | null {
  let minX = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxZ = -Infinity,
    maxY = 0;
  const visit = (polygon: readonly Pt[]) => {
    for (const p of polygon) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.y);
      maxZ = Math.max(maxZ, p.y);
    }
  };
  for (const p of scene.prisms) {
    visit(p.polygon);
    maxY = Math.max(maxY, p.y1);
  }
  for (const f of scene.floors) visit(f.polygon);
  for (const b of scene.boxes) {
    // amprenta rotită a obiectului (cutie circumscrisă), în mm
    const hw = (b.size[0] * 1000) / 2,
      hd = (b.size[2] * 1000) / 2;
    const c = Math.cos(b.rotationY),
      s = Math.sin(b.rotationY);
    for (const [x, z] of [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ] as const) {
      const wx = b.center[0] * 1000 + x * c + z * s;
      const wz = b.center[2] * 1000 - x * s + z * c;
      minX = Math.min(minX, wx);
      maxX = Math.max(maxX, wx);
      minZ = Math.min(minZ, wz);
      maxZ = Math.max(maxZ, wz);
    }
    maxY = Math.max(maxY, (b.center[1] + b.size[1] / 2) * 1000);
  }
  if (!Number.isFinite(minX)) return null;
  return { min: [minX / 1000, 0, minZ / 1000], max: [maxX / 1000, maxY / 1000, maxZ / 1000] };
}

export function buildSceneObjects(scene: SceneDescription, cache?: GeometryCache): SceneObjects {
  const walls: WallMeshData[] = scene.prisms.map((p) => {
    const geometry = prismGeometry(
      p.polygon,
      p.y0,
      p.y1,
      p.left ? (scene.looks[p.left] ?? null) : null,
      p.right ? (scene.looks[p.right] ?? null) : null,
    );
    return {
      id: p.id,
      wallId: p.wallId,
      left: p.left,
      right: p.right,
      geometry,
      edges: new THREE.EdgesGeometry(geometry, EDGE_THRESHOLD_DEG),
      y: p.y0 / 1000,
    };
  });
  const floors: FloorMeshData[] = scene.floors.map((f) => ({
    id: f.id,
    roomId: f.roomId,
    geometry: floorGeometry(f.polygon, f.look ? (scene.looks[f.look] ?? null) : null),
    colorHex: f.colorHex,
    look: f.look,
  }));
  const used = new Set<string>();
  const own: THREE.BufferGeometry[] = [];
  const objects: ObjectMeshData[] = scene.boxes.map((b) => {
    const key = objectGeometryKey(b, scene.looks);
    used.add(key);
    const geometry = cache
      ? cache.get(key, () => objectGeometry(b, scene.looks))
      : objectGeometry(b, scene.looks);
    if (!cache) own.push(geometry);
    return {
      id: b.id,
      geometry,
      position: [b.center[0], b.center[1] - b.size[1] / 2, b.center[2]],
      rotationY: b.rotationY,
      size: b.size,
      placeholder: !b.recipe || resolveRecipe(b.recipe.id, b.recipe.version) === null,
      materials: geometry.userData.materials as ObjectMeshData['materials'],
    };
  });
  cache?.prune(used);
  return {
    walls,
    floors,
    objects,
    bounds: sceneBounds(scene),
    dispose: () => {
      for (const w of walls) {
        w.geometry.dispose();
        w.edges.dispose();
      }
      for (const f of floors) f.geometry.dispose();
      for (const g of own) g.dispose();
    },
  };
}

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
  near: number;
  far: number;
  /** Distanța maximă de orbitare/zoom. */
  maxDistance: number;
}

const EMPTY_BOUNDS: SceneBounds = { min: [0, 0, 0], max: [4, 2.6, 3] };

/** Poziția camerei care încadrează întreaga cutie (sferă circumscrisă), privind din colț, de sus. */
export function frameCamera(bounds: SceneBounds | null, fovDeg = 45, aspect = 1.5): CameraPose {
  const b = bounds ?? EMPTY_BOUNDS;
  const target: [number, number, number] = [
    (b.min[0] + b.max[0]) / 2,
    (b.min[1] + b.max[1]) / 2,
    (b.min[2] + b.max[2]) / 2,
  ];
  const radius = Math.max(
    0.5,
    Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2,
  );
  const vFov = (fovDeg * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(aspect, 0.1));
  const distance = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 1.1;
  const dir = new THREE.Vector3(0.6, 0.75, 0.9).normalize();
  return {
    position: [
      target[0] + dir.x * distance,
      target[1] + dir.y * distance,
      target[2] + dir.z * distance,
    ],
    target,
    near: Math.max(0.05, distance / 200),
    far: distance * 20,
    maxDistance: distance * 4,
  };
}
