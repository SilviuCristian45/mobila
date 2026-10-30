// Mediu NODE: transformarea SceneDescription → obiecte Three.js nu cere WebGL sau DOM.
import { describe, expect, it } from 'vitest';
import { Box3 } from 'three';
import { polygonArea } from '@/domain/geometry';
import { buildScene } from '@/domain/scene';
import { buildSceneObjects, frameCamera, sceneBounds } from '@/features/viewer-3d/sceneObjects';
import { mk } from '../reference/builders';
import { studioProject } from '../reference/projects';

const doc = studioProject();
const scene = buildScene(doc);

/** Cutia unei geometrii după rotația −90° pe X și translația pe Y aplicate de canvas. */
function worldBox(g: { geometry: import('three').BufferGeometry; y: number }): Box3 {
  const b = g.geometry
    .clone()
    .rotateX(-Math.PI / 2)
    .translate(0, g.y, 0);
  b.computeBoundingBox();
  return b.boundingBox!;
}

/** Volum (m³) al unei plase triunghiulare închise, din volumele semnate ale tetraedrelor. */
function meshVolume(g: import('three').BufferGeometry): number {
  const ng = g.index ? g.toNonIndexed() : g;
  const p = ng.getAttribute('position');
  let v = 0;
  for (let i = 0; i < p.count; i += 3) {
    const [ax, ay, az] = [p.getX(i), p.getY(i), p.getZ(i)];
    const [bx, by, bz] = [p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)];
    const [cx, cy, cz] = [p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2)];
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return Math.abs(v);
}

describe('SceneDescription → obiecte Three.js', () => {
  const objects = buildSceneObjects(scene);

  it('câte un obiect pentru fiecare prismă de perete și fiecare podea din scenă', () => {
    expect(objects.walls).toHaveLength(scene.prisms.length);
    expect(objects.walls).toHaveLength(12); // vezi scene.test.ts: 4 + 3 + 5×1
    expect(objects.floors).toHaveLength(scene.floors.length);
    expect(objects.floors.map((f) => f.colorHex)).toEqual(scene.floors.map((f) => f.colorHex));
  });

  it('pereții au înălțimile din document (în metri, Y sus) și coincid cu poligonul din plan', () => {
    for (const [i, w] of objects.walls.entries()) {
      const p = scene.prisms[i]!;
      const box = worldBox(w);
      expect(box.min.y).toBeCloseTo(p.y0 / 1000, 6);
      expect(box.max.y).toBeCloseTo(p.y1 / 1000, 6);
      const xs = p.polygon.map((q) => q.x / 1000);
      const zs = p.polygon.map((q) => q.y / 1000);
      expect(box.min.x).toBeCloseTo(Math.min(...xs), 6);
      expect(box.max.x).toBeCloseTo(Math.max(...xs), 6);
      expect(box.min.z).toBeCloseTo(Math.min(...zs), 6);
      expect(box.max.z).toBeCloseTo(Math.max(...zs), 6);
    }
  });

  it('golurile: fereastra lasă parapet (0–0,9 m) și buiandrug (2,1–2,6 m); ușa doar buiandrug', () => {
    const spans = (wallId: string) =>
      scene.prisms
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => p.wallId === wallId)
        .map(({ i }) => {
          const b = worldBox(objects.walls[i]!);
          return [b.min.y, b.max.y].map((v) => Math.round(v * 1000) / 1000 + 0);
        });
    expect(spans('w1')).toEqual([
      [0, 2.6],
      [0, 0.9],
      [2.1, 2.6],
      [0, 2.6],
    ]);
    expect(spans('w2')).toEqual([
      [0, 2.6],
      [2.1, 2.6],
      [0, 2.6],
    ]);
  });

  it('podeaua este plată la cota 0 și acoperă poligonul camerei', () => {
    for (const [i, f] of objects.floors.entries()) {
      const box = worldBox({ geometry: f.geometry, y: 0 });
      expect(box.min.y).toBeCloseTo(0, 9);
      expect(box.max.y).toBeCloseTo(0, 9);
      const poly = scene.floors[i]!.polygon;
      expect(box.min.x).toBeCloseTo(Math.min(...poly.map((q) => q.x)) / 1000, 6);
      expect(box.max.z).toBeCloseTo(Math.max(...poly.map((q) => q.y)) / 1000, 6);
    }
  });

  it('volumul fiecărei prisme extrudate = aria din domeniu × înălțimea (fără suprapuneri sau goluri parazite)', () => {
    for (const [i, w] of objects.walls.entries()) {
      const p = scene.prisms[i]!;
      const expected = (polygonArea(p.polygon) / 1e6) * ((p.y1 - p.y0) / 1000);
      expect(meshVolume(w.geometry)).toBeCloseTo(expected, 4);
    }
  });

  it('dispose eliberează geometriile', () => {
    const o = buildSceneObjects(scene);
    let n = 0;
    for (const w of o.walls) w.geometry.addEventListener('dispose', () => n++);
    o.dispose();
    expect(n).toBe(o.walls.length);
  });
});

describe('încadrarea camerei', () => {
  it('bounds acoperă tot proiectul; înălțimea maximă = cel mai înalt perete', () => {
    const b = sceneBounds(scene)!;
    expect(b.min[1]).toBe(0);
    expect(b.max[1]).toBeCloseTo(2.6, 9);
    for (const p of scene.prisms)
      for (const q of p.polygon) {
        expect(q.x / 1000).toBeGreaterThanOrEqual(b.min[0] - 1e-9);
        expect(q.x / 1000).toBeLessThanOrEqual(b.max[0] + 1e-9);
        expect(q.y / 1000).toBeGreaterThanOrEqual(b.min[2] - 1e-9);
        expect(q.y / 1000).toBeLessThanOrEqual(b.max[2] + 1e-9);
      }
  });
  it('scenă fără geometrie → fără bounds, dar camera are o poziție finită', () => {
    const empty = buildScene(mk([], [], {}));
    expect(sceneBounds(empty)).toBeNull();
    const pose = frameCamera(null);
    for (const v of [...pose.position, ...pose.target]) expect(Number.isFinite(v)).toBe(true);
  });
  it('toate colțurile cutiei proiectului sunt în interiorul frustumului camerei', async () => {
    const { PerspectiveCamera, Vector3 } = await import('three');
    const b = sceneBounds(scene)!;
    for (const aspect of [0.6, 1.5, 2.4]) {
      const pose = frameCamera(b, 45, aspect);
      const cam = new PerspectiveCamera(45, aspect, pose.near, pose.far);
      cam.position.set(...pose.position);
      cam.lookAt(...pose.target);
      cam.updateMatrixWorld();
      cam.updateProjectionMatrix();
      for (const x of [b.min[0], b.max[0]])
        for (const y of [b.min[1], b.max[1]])
          for (const z of [b.min[2], b.max[2]]) {
            const v = new Vector3(x, y, z).project(cam);
            expect(Math.abs(v.x)).toBeLessThanOrEqual(1);
            expect(Math.abs(v.y)).toBeLessThanOrEqual(1);
            expect(v.z).toBeLessThan(1);
          }
    }
  });
});
