// Materiale și finisaje: compatibilitate cu suprafețele, rezolvarea aspectului (look) și operațiile de aplicare.
// Definiția materialului = `Finish` din `catalogSnapshot.finishes` (copiat la prima utilizare; proiectul rămâne autonom);
// aplicarea = `FinishAssignment` (țintă + proprietăți ale aplicării). Pur: nu cunoaște catalogul aplicației, Three sau DOM.
import { cloneDocument } from '../factory';
import { analyzeGeometry, type GeometryModel } from '../geometry';
import { stableHash } from '../hash';
import type { Result } from '../result';
import type {
  Finish,
  FinishAssignment,
  FinishLook,
  FinishSurface,
  FinishTarget,
  ObjectFinishSlot,
  ProjectDocument,
} from '../schema';

export type TexturePattern = Extract<
  Finish['appearance']['texture'],
  { type: 'procedural' }
>['pattern'];

// ───────────── compatibilitate ─────────────

const DERIVED_SURFACES: Record<Finish['kind'], FinishSurface[]> = {
  tile: ['floor', 'wall'],
  wall_tile: ['wall'],
  parquet: ['floor'],
  paint: ['wall'],
  surface: ['floor', 'wall'],
  furniture: ['object'],
};

/** Tipurile de suprafață pe care se poate aplica materialul (explicite sau derivate din `kind`). */
export const finishSurfaces = (f: Finish): readonly FinishSurface[] =>
  f.surfaces ?? DERIVED_SURFACES[f.kind];

export const targetSurface = (t: FinishTarget): FinishSurface =>
  t.kind === 'roomFloor' ? 'floor' : t.kind === 'wallSide' ? 'wall' : 'object';

export const SURFACE_LABEL: Record<FinishSurface, string> = {
  floor: 'podea',
  wall: 'perete',
  object: 'mobilier',
};

/** `null` dacă materialul se poate aplica pe țintă; altfel un mesaj în română. */
export function incompatibility(f: Finish, target: FinishTarget): string | null {
  const surface = targetSurface(target);
  if (finishSurfaces(f).includes(surface)) return null;
  const ok = finishSurfaces(f)
    .map((s) => SURFACE_LABEL[s])
    .join(', ');
  return `„${f.name.ro}” nu se poate aplica pe ${SURFACE_LABEL[surface]} (compatibil doar cu: ${ok}).`;
}

// ───────────── aspect rezolvat (definiție + aplicare) ─────────────

export interface ResolvedTexture {
  pattern: TexturePattern;
  groutColorHex: string;
  offsetPct: 0 | 33 | 50;
  toneVariation: number;
  seed: number;
  /** Dimensiunea piesei (mm): placă de gresie, scândură (lățime × lungime) sau modulul motivului. */
  pieceWidthMm: number;
  pieceHeightMm: number;
  /** Rostul dintre piese (mm). */
  groutMm: number;
  /** Din aplicare: 0,25–4 (1 = dimensiunea reală a pieselor). */
  scale: number;
  /** Din aplicare: grade. */
  rotationDeg: number;
}

/** Aspectul unei suprafețe: JSON pur, referit din scenă prin `key` (conținut identic ⇒ aceeași cheie). */
export interface SurfaceLook {
  key: string;
  finishId: string;
  baseColorHex: string;
  roughness: number;
  metalness: number;
  opacity: number;
  texture: ResolvedTexture | null;
}

const PATTERN_DEFAULT_MM: Record<TexturePattern, [number, number]> = {
  tile_grid: [600, 600],
  marble_tile: [600, 600],
  plank: [140, 1200],
  speckle: [1000, 1000],
  flagstone: [1000, 1000],
  wallpaper: [200, 200],
  brushed: [500, 500],
};

export function resolveLook(finish: Finish, look?: FinishLook): SurfaceLook {
  const a = finish.appearance;
  const t = a.texture;
  let texture: ResolvedTexture | null = null;
  if (t.type === 'procedural') {
    const def = PATTERN_DEFAULT_MM[t.pattern];
    const w = finish.tile?.pieceWidthMm ?? def[0];
    const h = finish.tile?.pieceHeightMm ?? def[1];
    texture = {
      pattern: t.pattern,
      groutColorHex: t.groutColorHex,
      offsetPct: t.offsetPct,
      toneVariation: t.toneVariation,
      seed: t.seed,
      // scândurile au lățimea mai mică decât lungimea, indiferent de ordinea din definiție
      pieceWidthMm: t.pattern === 'plank' ? Math.min(w, h) : w,
      pieceHeightMm: t.pattern === 'plank' ? Math.max(w, h) : h,
      groutMm: finish.tile?.groutMm ?? 0,
      scale: look?.textureScale ?? 1,
      rotationDeg: look?.textureRotationDeg ?? 0,
    };
  }
  const body = {
    baseColorHex: look?.colorHex ?? a.baseColorHex,
    roughness: look?.roughness ?? a.roughness,
    metalness: a.metalness ?? 0,
    opacity: a.opacity ?? 1,
    texture,
  };
  return { key: `l${stableHash(body)}`, finishId: finish.id, ...body };
}

// ───────────── parametri relevanți pentru UI ─────────────

export interface FinishParamRules {
  color: boolean;
  textureScale: boolean;
  textureRotation: boolean;
  roughness: boolean;
  waste: boolean;
}

/**
 * Ce proprietăți ale aplicării au sens pentru material: culoarea doar pentru suprafețe uniforme (vopsea, metal, finisaje de
 * mobilier), scara și rotația doar pentru texturi, rugozitatea pentru vopsea/mobilier/metal/sticlă, rebutul doar pentru
 * materiale cu cantitate în m².
 */
export function finishParamRules(f: Finish): FinishParamRules {
  const textured = f.appearance.texture.type === 'procedural';
  const glassy = (f.appearance.opacity ?? 1) < 1;
  return {
    // finisajele de mobilier se desenează uniform (culoare, rugozitate, metalicitate): textura nu se aplică pe obiecte
    color: f.kind === 'furniture' || (!textured && !glassy),
    textureScale: textured && f.kind !== 'furniture',
    textureRotation: textured && f.kind !== 'furniture',
    roughness: !textured || f.kind === 'furniture',
    waste: f.kind !== 'furniture',
  };
}

// ───────────── ținte și atribuiri ─────────────

export const sameTarget = (a: FinishTarget, b: FinishTarget): boolean =>
  a.kind === b.kind &&
  (a.kind === 'roomFloor'
    ? a.roomId === (b as typeof a).roomId
    : a.kind === 'wallSide'
      ? a.wallId === (b as typeof a).wallId && a.side === (b as typeof a).side
      : a.objectId === (b as Extract<FinishTarget, { kind: 'objectSlot' }>).objectId &&
        a.slot === (b as Extract<FinishTarget, { kind: 'objectSlot' }>).slot);

export function assignmentsOn(doc: ProjectDocument, target: FinishTarget): FinishAssignment[] {
  return Object.values(doc.finishAssignments)
    .filter((a) => sameTarget(a.target, target))
    .sort((x, y) => x.id.localeCompare(y.id));
}

/** Elimină din snapshot finisajele care nu mai sunt folosite (și suprascrierile lor de buget). */
export function pruneUnusedFinishes(doc: ProjectDocument): ProjectDocument {
  const used = new Set(Object.values(doc.finishAssignments).map((a) => a.finishId));
  const unused = Object.keys(doc.catalogSnapshot.finishes).filter(
    (id) => !used.has(id) && doc.catalogSnapshot.finishes[id]!.priceOrigin === 'demo',
  );
  if (unused.length === 0) return doc;
  const next = cloneDocument(doc);
  for (const id of unused) {
    delete next.catalogSnapshot.finishes[id];
    delete next.budget.overrides[`finish:${id}`];
  }
  return next;
}

function validateTarget(doc: ProjectDocument, target: FinishTarget): string | null {
  if (target.kind === 'roomFloor') return doc.rooms[target.roomId] ? null : 'Camera nu mai există.';
  if (target.kind === 'wallSide')
    return doc.walls[target.wallId] ? null : 'Peretele nu mai există.';
  return doc.objects[target.objectId] ? null : 'Obiectul nu mai există.';
}

export function lookProblems(look: FinishLook): string[] {
  const out: string[] = [];
  if (look.colorHex !== undefined && !/^#[0-9a-fA-F]{6}$/.test(look.colorHex))
    out.push('Culoarea trebuie să aibă forma #rrggbb.');
  if (look.textureScale !== undefined && !(look.textureScale >= 0.25 && look.textureScale <= 4))
    out.push('Scara texturii trebuie să fie între 0,25 și 4.');
  if (
    look.textureRotationDeg !== undefined &&
    !(look.textureRotationDeg >= 0 && look.textureRotationDeg < 360)
  )
    out.push('Rotația texturii trebuie să fie între 0° și 359°.');
  if (look.roughness !== undefined && !(look.roughness >= 0 && look.roughness <= 1))
    out.push('Rugozitatea trebuie să fie între 0 și 1.');
  return out;
}

const freshId = (genId: () => string, taken: (id: string) => boolean): string | null => {
  for (let i = 0; i < 50; i++) {
    const id = genId();
    if (!taken(id)) return id;
  }
  return null;
};

export interface ApplyOptions {
  look?: FinishLook;
  wastePct?: number;
}

/**
 * Aplică un material pe o țintă. Verifică compatibilitatea; înlocuiește ce era deja pe aceeași țintă (o față de perete, o
 * podea sau o zonă de obiect are un singur material); copiază materialul în `catalogSnapshot` dacă proiectul nu îl are
 * (un material deja prezent rămâne cel din proiect — nu se schimbă la o versiune nouă a catalogului).
 */
export function applyFinish(
  doc: ProjectDocument,
  finish: Finish,
  target: FinishTarget,
  genId: () => string,
  options: ApplyOptions = {},
): Result<{ doc: ProjectDocument; assignmentId: string }> {
  const bad = validateTarget(doc, target);
  if (bad) return { ok: false, error: bad };
  const def = doc.catalogSnapshot.finishes[finish.id] ?? finish;
  const inc = incompatibility(def, target);
  if (inc) return { ok: false, error: inc };
  const look = options.look ?? {};
  const lp = lookProblems(look);
  if (lp.length > 0) return { ok: false, error: lp[0]! };
  const wastePct = options.wastePct ?? (target.kind === 'objectSlot' ? 0 : def.defaultWastePct);
  if (!(wastePct >= 0 && wastePct <= 100))
    return { ok: false, error: 'Rebutul trebuie să fie între 0 și 100%.' };

  const next = cloneDocument(doc);
  for (const a of assignmentsOn(next, target)) delete next.finishAssignments[a.id];
  const id = freshId(genId, (c) => c in next.finishAssignments);
  if (!id) return { ok: false, error: 'Nu s-a putut genera un identificator nou.' };
  if (!next.catalogSnapshot.finishes[finish.id]) next.catalogSnapshot.finishes[finish.id] = finish;
  const a: FinishAssignment = { id, target, finishId: finish.id, wastePct };
  if (Object.keys(look).length > 0) a.look = look;
  next.finishAssignments[id] = a;
  return { ok: true, value: { doc: pruneUnusedFinishes(next), assignmentId: id } };
}

/** Fețele interioare ale pereților unei camere, ca ținte (`wallSide`). */
export function roomWallTargets(
  doc: ProjectDocument,
  roomId: string,
  geometry: GeometryModel = analyzeGeometry(doc),
): FinishTarget[] {
  const room = geometry.rooms.get(roomId);
  if (!room) return [];
  return room.edges.map((e) => ({ kind: 'wallSide' as const, wallId: e.wallId, side: e.side }));
}

/** Același material pe toate fețele interioare ale pereților unei camere (un singur pas). */
export function applyFinishToRoomWalls(
  doc: ProjectDocument,
  finish: Finish,
  roomId: string,
  genId: () => string,
  options: ApplyOptions = {},
  geometry?: GeometryModel,
): Result<{ doc: ProjectDocument; assignmentIds: string[] }> {
  const targets = roomWallTargets(doc, roomId, geometry);
  if (targets.length === 0) return { ok: false, error: 'Camera nu are pereți valizi.' };
  let cur = doc;
  const ids: string[] = [];
  for (const t of targets) {
    const r = applyFinish(cur, finish, t, genId, options);
    if (!r.ok) return r;
    cur = r.value.doc;
    ids.push(r.value.assignmentId);
  }
  return { ok: true, value: { doc: cur, assignmentIds: ids } };
}

/** Modifică proprietățile aplicării; `null` șterge o proprietate (revine la valoarea materialului). */
export type LookPatch = { [K in keyof FinishLook]?: FinishLook[K] | null };

export function updateAssignmentLook(
  doc: ProjectDocument,
  assignmentId: string,
  patch: LookPatch,
  wastePct?: number,
): Result<ProjectDocument> {
  const a = doc.finishAssignments[assignmentId];
  if (!a) return { ok: false, error: 'Aplicarea nu mai există.' };
  const merged: Record<string, unknown> = { ...(a.look ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete merged[k];
    else if (v !== undefined) merged[k] = v;
  }
  const look = merged as FinishLook;
  const lp = lookProblems(look);
  if (lp.length > 0) return { ok: false, error: lp[0]! };
  if (wastePct !== undefined && !(wastePct >= 0 && wastePct <= 100))
    return { ok: false, error: 'Rebutul trebuie să fie între 0 și 100%.' };
  const next: FinishAssignment = { ...a, wastePct: wastePct ?? a.wastePct };
  if (Object.keys(look).length > 0) next.look = look;
  else delete next.look;
  if (JSON.stringify(next) === JSON.stringify(a)) return { ok: true, value: doc };
  return {
    ok: true,
    value: { ...doc, finishAssignments: { ...doc.finishAssignments, [assignmentId]: next } },
  };
}

/** Elimină materialul de pe o țintă (și curăță snapshot-ul și suprascrierile rămase fără sursă) într-un singur pas. */
export function clearFinish(doc: ProjectDocument, target: FinishTarget): Result<ProjectDocument> {
  const existing = assignmentsOn(doc, target);
  if (existing.length === 0) return { ok: false, error: 'Nu există niciun material aplicat aici.' };
  const bound = Object.values(doc.budget.manualLines).filter((l) => {
    const b = l.binding;
    return b?.kind === 'assignmentArea' && existing.some((a) => a.id === b.assignmentId);
  });
  if (bound.length > 0)
    return {
      ok: false,
      error: `Aplicarea este legată de liniile manuale de buget: ${bound.map((l) => l.description || l.id).join(', ')}.`,
    };
  const next = cloneDocument(doc);
  for (const a of existing) delete next.finishAssignments[a.id];
  return { ok: true, value: pruneUnusedFinishes(next) };
}

/** Copiază aplicările de pe un obiect pe copia lui (duplicarea păstrează finisajele). */
export function copyObjectFinishes(
  doc: ProjectDocument,
  fromObjectId: string,
  toObjectId: string,
  genId: () => string,
): ProjectDocument {
  const src = Object.values(doc.finishAssignments).filter(
    (a) => a.target.kind === 'objectSlot' && a.target.objectId === fromObjectId,
  );
  if (src.length === 0) return doc;
  const next = cloneDocument(doc);
  for (const a of src) {
    const id = freshId(genId, (c) => c in next.finishAssignments);
    if (!id) break;
    const target = a.target as Extract<FinishTarget, { kind: 'objectSlot' }>;
    next.finishAssignments[id] = JSON.parse(
      JSON.stringify({ ...a, id, target: { ...target, objectId: toObjectId } }),
    );
  }
  return next;
}

export const OBJECT_SLOT_LABEL: Record<ObjectFinishSlot, string> = {
  body: 'Corp',
  front: 'Fronturi și accente',
  top: 'Blat, lemn sau cadru',
  metal: 'Elemente metalice',
};
