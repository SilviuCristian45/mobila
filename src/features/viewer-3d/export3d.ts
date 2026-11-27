// Export 3D client-side (GLB / OBJ / STL) folosind exportatoarele oficiale din Three.js.
// Se încarcă leneș (`import('./export3d')`) doar la cerere: 0 KB în pachetul inițial.
// Strict în `src/features/viewer-3d/` (respectă regula depcruise `three-doar-in-viewer-3d`).
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import type { ProjectDocument, SceneDescription } from '@/domain';
import { buildMesh, buildParts, type Params, type SlotLooks } from '@/catalog';
import { MaterialCache } from './materialCache';
import { CUTAWAY_SCALE, WALL_COLOR, buildSceneObjects } from './sceneObjects';

export type Export3DFormat = 'glb' | 'obj' | 'stl';

export interface ProjectExportOptions {
  format: Export3DFormat;
  includeStructure: boolean;
  includeObjects: boolean;
  cutaway: boolean;
}

export interface PieceExportInput {
  name: string;
  recipe: { id: string; version: number };
  sizeMm: { widthMm: number; depthMm: number; heightMm: number };
  params: Params;
  colorHex: string;
  slotLooks: SlotLooks;
  hideFronts: boolean;
}

export interface Export3DStage {
  label: string;
  progress: number;
}

export interface Export3DResult {
  blob: Blob;
  mime: string;
  sizeBytes: number;
}

const MIME_BY_FORMAT: Record<Export3DFormat, string> = {
  glb: 'model/gltf-binary',
  obj: 'text/plain;charset=utf-8',
  stl: 'model/stl',
};

/** Cedează un cadru browserului ca indicatorul de încărcare să se randeze fluid înainte de serializare. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 30));
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function canEncodeTextures(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    return c.getContext('2d') !== null;
  } catch {
    return false;
  }
}

function safeNodeName(raw: string, fallback: string): string {
  const cleaned = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._ -]/g, '_')
    .trim();
  return cleaned || fallback;
}

async function serializeRoot(
  root: THREE.Object3D,
  format: Export3DFormat,
  onStage?: (s: Export3DStage) => void,
): Promise<Export3DResult> {
  root.updateMatrixWorld(true);
  const mime = MIME_BY_FORMAT[format];

  if (format === 'glb') {
    onStage?.({ label: 'Împachetez scena în format GLB (glTF 2.0)…', progress: 65 });
    await nextPaint();
    const exporter = new GLTFExporter();
    const buffer = (await exporter.parseAsync(root, { binary: true })) as ArrayBuffer;
    const blob = new Blob([buffer], { type: mime });
    onStage?.({ label: 'Pregătesc descărcarea…', progress: 95 });
    return { blob, mime, sizeBytes: blob.size };
  }

  if (format === 'obj') {
    onStage?.({ label: 'Generez geometria în format OBJ…', progress: 65 });
    await nextPaint();
    const exporter = new OBJExporter();
    const text = exporter.parse(root);
    const header =
      '# Exportat din RoomCraft Design Studio\n# Unitate: 1 unitate = 1 metru (Y sus)\n';
    const blob = new Blob([header + text], { type: mime });
    onStage?.({ label: 'Pregătesc descărcarea…', progress: 95 });
    return { blob, mime, sizeBytes: blob.size };
  }

  onStage?.({ label: 'Triangulez mesh-ul în format STL binar…', progress: 65 });
  await nextPaint();
  const exporter = new STLExporter();
  const view = exporter.parse(root, { binary: true });
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  const blob = new Blob([bytes], { type: mime });
  onStage?.({ label: 'Pregătesc descărcarea…', progress: 95 });
  return { blob, mime, sizeBytes: blob.size };
}

/**
 * Construiește o scenă Three.js curată, cu ierarhie pe nume (Podele / Pereți / Obiecte), scară metrică exactă (1u = 1m),
 * o serializează în `.glb`, `.obj` sau `.stl` și eliberează complet resursele temporare.
 */
export async function exportProject3D(
  doc: ProjectDocument,
  scene: SceneDescription,
  options: ProjectExportOptions,
  onStage?: (s: Export3DStage) => void,
): Promise<Export3DResult> {
  onStage?.({ label: 'Construiesc geometria 3D a proiectului…', progress: 20 });
  await nextPaint();

  const objects = buildSceneObjects(scene);
  const materials = new MaterialCache();
  const encodeTex = options.format === 'glb' && canEncodeTextures();

  try {
    onStage?.({ label: 'Aplic materialele și texturile PBR…', progress: 45 });
    await nextPaint();

    const root = new THREE.Group();
    root.name = safeNodeName(doc.name, 'RoomCraft_Project');

    const surfaceMat = (lookKey: string | null, fallbackHex: string, fallbackRoughness = 0.9) => {
      const look = lookKey ? (scene.looks[lookKey] ?? null) : null;
      if (!encodeTex && look?.texture) {
        return materials.surface({ ...look, texture: null }, fallbackHex, fallbackRoughness);
      }
      return materials.surface(look, fallbackHex, fallbackRoughness);
    };

    if (options.includeStructure) {
      if (objects.floors.length > 0) {
        const floorsGroup = new THREE.Group();
        floorsGroup.name = 'Podele';
        for (const f of objects.floors) {
          const roomName = doc.rooms[f.roomId]?.name ?? f.roomId;
          const mesh = new THREE.Mesh(f.geometry, surfaceMat(f.look, f.colorHex, 0.85));
          mesh.name = safeNodeName(`Podea_${roomName}`, f.id);
          mesh.rotation.x = -Math.PI / 2;
          floorsGroup.add(mesh);
        }
        root.add(floorsGroup);
      }

      if (objects.walls.length > 0) {
        const wallsGroup = new THREE.Group();
        wallsGroup.name = 'Pereti';
        for (const w of objects.walls) {
          const mats = [
            surfaceMat(w.left, WALL_COLOR),
            surfaceMat(w.right, WALL_COLOR),
            surfaceMat(null, WALL_COLOR),
          ];
          const mesh = new THREE.Mesh(w.geometry, mats);
          mesh.name = safeNodeName(`Perete_${w.wallId}_${w.id}`, w.id);
          mesh.position.set(0, w.y, 0);
          mesh.rotation.x = -Math.PI / 2;
          if (options.cutaway) mesh.scale.set(1, 1, CUTAWAY_SCALE);
          wallsGroup.add(mesh);
        }
        root.add(wallsGroup);
      }
    }

    if (options.includeObjects && objects.objects.length > 0) {
      const objectsGroup = new THREE.Group();
      objectsGroup.name = 'Mobilier_si_Obiecte';
      for (const o of objects.objects) {
        const placed = doc.objects[o.id];
        const catItem = placed ? doc.catalogSnapshot.items[placed.catalogItemId] : undefined;
        const label = placed?.name ?? catItem?.name.ro ?? o.id;
        const mats = o.materials.map((m) => materials.object(m.roughness, m.metalness));
        const mesh = new THREE.Mesh(o.geometry, mats);
        mesh.name = safeNodeName(label, o.id);
        mesh.position.set(...o.position);
        mesh.rotation.y = o.rotationY;
        objectsGroup.add(mesh);
      }
      root.add(objectsGroup);
    }

    return await serializeRoot(root, options.format, onStage);
  } finally {
    objects.dispose();
    materials.clear();
  }
}

/** Exportă o singură piesă (ex. din Configuratorul „Mobilă la comandă”) în `.glb`, `.obj` sau `.stl`. */
export async function exportPiece3D(
  piece: PieceExportInput,
  format: Export3DFormat,
  onStage?: (s: Export3DStage) => void,
): Promise<Export3DResult> {
  onStage?.({ label: 'Construiesc geometria piesei…', progress: 25 });
  await nextPaint();

  const dims: [number, number, number] = [
    piece.sizeMm.widthMm / 1000,
    piece.sizeMm.heightMm / 1000,
    piece.sizeMm.depthMm / 1000,
  ];
  const effectiveParams: Params = piece.hideFronts
    ? { ...piece.params, _hideFronts: true }
    : piece.params;
  const { parts } = buildParts(piece.recipe, dims, effectiveParams);
  const built = buildMesh(parts, piece.colorHex, piece.slotLooks);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(built.positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(built.normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(built.colors, 3));
  built.groups.forEach((grp, i) => geometry.addGroup(grp.start, grp.count, i));
  geometry.computeBoundingSphere();

  const mats = built.groups.map(
    (grp) =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: grp.roughness,
        metalness: grp.metalness,
      }),
  );

  try {
    onStage?.({ label: 'Pregătesc materialele PBR…', progress: 45 });
    await nextPaint();

    const root = new THREE.Group();
    root.name = safeNodeName(piece.name, 'Mobila_la_comanda');
    const mesh = new THREE.Mesh(geometry, mats);
    mesh.name = safeNodeName(piece.name, 'Corp_mobilier');
    root.add(mesh);

    return await serializeRoot(root, format, onStage);
  } finally {
    geometry.dispose();
    for (const m of mats) m.dispose();
  }
}
