// Operații de editare a planului (Etapa 2b). Pure: întorc un document NOU sau o eroare în română; nu citesc ceasul și nu
// generează ID-uri (vin din `genId`). Validitatea geometrică completă o verifică `ProjectSession.commit` (schemă + integritate
// + geometrie) — aici se verifică doar precondițiile care dau mesaje mai clare decât o listă de coduri de integritate.
import { cloneDocument } from '../factory';
import { analyzeGeometry, rectAxesFromInterior, openingRange, pairKey, type Pt } from '../geometry';
import type { Result } from '../result';
import type { Opening, ProjectDocument, Room, Wall } from '../schema';

export type IdGenerator = () => string;

/** Primul ID liber (nu există în `taken`); `null` dacă generatorul nu produce valori noi. */
function freshId(genId: IdGenerator, taken: (id: string) => boolean): string | null {
  for (let i = 0; i < 50; i++) {
    const id = genId();
    if (!taken(id)) return id;
  }
  return null;
}

const levelIdOf = (doc: ProjectDocument): string | null => Object.keys(doc.levels)[0] ?? null;
const isInt = (n: number): boolean => Number.isInteger(n);
const isEvenPos = (n: number): boolean => Number.isInteger(n) && n > 0 && n % 2 === 0;

// ───────────── noduri ─────────────

/** Mută un nod în `to` (coordonate întregi, mm). */
export function moveNode(doc: ProjectDocument, nodeId: string, to: Pt): Result<ProjectDocument> {
  const node = doc.nodes[nodeId];
  if (!node) return { ok: false, error: 'Nodul nu mai există.' };
  if (!isInt(to.x) || !isInt(to.y))
    return { ok: false, error: 'Coordonatele trebuie să fie numere întregi (mm).' };
  if (node.x === to.x && node.y === to.y) return { ok: true, value: doc };
  return { ok: true, value: { ...doc, nodes: { ...doc.nodes, [nodeId]: { ...node, ...to } } } };
}

// ───────────── pereți ─────────────

/** Un capăt de perete nou: un nod existent sau un punct (se creează un nod nou). */
export type NodeRef = { nodeId: string } | { x: number; y: number };

export interface NewWallOptions {
  thicknessMm?: number;
  heightMm?: number;
}

/** Adaugă un perete între două capete (noduri existente sau puncte noi). */
export function addWall(
  doc: ProjectDocument,
  from: NodeRef,
  to: NodeRef,
  genId: IdGenerator,
  options: NewWallOptions = {},
): Result<{ doc: ProjectDocument; wallId: string }> {
  const levelId = levelIdOf(doc);
  if (!levelId) return { ok: false, error: 'Proiectul nu are niciun nivel.' };
  const thicknessMm = options.thicknessMm ?? doc.settings.defaultWallThicknessMm;
  const heightMm = options.heightMm ?? doc.settings.defaultWallHeightMm;
  if (!isEvenPos(thicknessMm))
    return { ok: false, error: 'Grosimea trebuie să fie un număr par pozitiv de mm.' };
  if (!isInt(heightMm) || heightMm <= 0)
    return { ok: false, error: 'Înălțimea trebuie să fie un număr întreg pozitiv de mm.' };

  const next = cloneDocument(doc);
  const ends: string[] = [];
  for (const ref of [from, to]) {
    if ('nodeId' in ref) {
      if (!next.nodes[ref.nodeId]) return { ok: false, error: 'Nodul ales nu mai există.' };
      ends.push(ref.nodeId);
      continue;
    }
    if (!isInt(ref.x) || !isInt(ref.y))
      return { ok: false, error: 'Coordonatele trebuie să fie numere întregi (mm).' };
    const existing = Object.values(next.nodes).find((n) => n.x === ref.x && n.y === ref.y);
    if (existing) {
      ends.push(existing.id);
      continue;
    }
    const id = freshId(genId, (c) => c in next.nodes);
    if (!id) return { ok: false, error: 'Nu s-a putut genera un identificator nou.' };
    next.nodes[id] = { id, levelId, x: ref.x, y: ref.y };
    ends.push(id);
  }
  const [a, b] = ends as [string, string];
  if (a === b) return { ok: false, error: 'Peretele are începutul și sfârșitul în același punct.' };
  const dup = Object.values(next.walls).find(
    (w) => pairKey(w.startNodeId, w.endNodeId) === pairKey(a, b),
  );
  if (dup) return { ok: false, error: 'Există deja un perete între aceste două puncte.' };
  const wallId = freshId(genId, (c) => c in next.walls);
  if (!wallId) return { ok: false, error: 'Nu s-a putut genera un identificator nou.' };
  next.walls[wallId] = {
    id: wallId,
    levelId,
    startNodeId: a,
    endNodeId: b,
    thicknessMm,
    heightMm,
    baseOffsetMm: 0,
  };
  return { ok: true, value: { doc: next, wallId } };
}

export interface WallPatch {
  thicknessMm?: number;
  heightMm?: number;
}

/** Schimbă grosimea (pară) și/sau înălțimea unui perete. Golurile și camerele se revalidează la `commit`. */
export function updateWall(
  doc: ProjectDocument,
  wallId: string,
  patch: WallPatch,
): Result<ProjectDocument> {
  const wall = doc.walls[wallId];
  if (!wall) return { ok: false, error: 'Peretele nu mai există.' };
  if (patch.thicknessMm !== undefined && !isEvenPos(patch.thicknessMm))
    return { ok: false, error: 'Grosimea trebuie să fie un număr par pozitiv de mm.' };
  if (patch.heightMm !== undefined && (!isInt(patch.heightMm) || patch.heightMm <= 0))
    return { ok: false, error: 'Înălțimea trebuie să fie un număr întreg pozitiv de mm.' };
  const updated: Wall = { ...wall, ...patch };
  return { ok: true, value: { ...doc, walls: { ...doc.walls, [wallId]: updated } } };
}

/** Ce se șterge odată cu un perete / o cameră (pentru confirmarea utilizatorului). */
export interface DeletionImpact {
  rooms: Room[];
  openings: Opening[];
  /** Atribuiri de finisaj care dispar. */
  assignmentIds: string[];
  /** Motive pentru care ștergerea este refuzată (nu se pot rezolva automat). */
  blockers: string[];
}

function impactOf(
  doc: ProjectDocument,
  wallIds: ReadonlySet<string>,
  roomIds: ReadonlySet<string>,
): DeletionImpact {
  const rooms = [...roomIds].map((id) => doc.rooms[id]).filter((r): r is Room => Boolean(r));
  const openings = Object.values(doc.openings).filter((o) => wallIds.has(o.wallId));
  const assignmentIds = Object.values(doc.finishAssignments)
    .filter((a) =>
      a.target.kind === 'roomFloor' ? roomIds.has(a.target.roomId) : wallIds.has(a.target.wallId),
    )
    .map((a) => a.id);
  const blockers: string[] = [];
  const attached = Object.values(doc.objects).filter((o) => o.wallId && wallIds.has(o.wallId));
  if (attached.length > 0)
    blockers.push(
      `${attached.length} obiecte sunt atașate de acest perete; mută sau șterge-le întâi.`,
    );
  const gone = new Set(assignmentIds);
  const lines = Object.values(doc.budget.manualLines).filter(
    (l) =>
      (l.roomId && roomIds.has(l.roomId)) ||
      (l.binding && 'roomId' in l.binding && roomIds.has(l.binding.roomId)) ||
      (l.binding?.kind === 'assignmentArea' && gone.has(l.binding.assignmentId)),
  );
  if (lines.length > 0)
    blockers.push(`${lines.length} linii manuale de buget sunt legate de ce ai vrea să ștergi.`);
  return { rooms, openings, assignmentIds, blockers };
}

/** Camerele a căror buclă folosește peretele. */
export function roomsUsingWall(doc: ProjectDocument, wallId: string): Room[] {
  const wall = doc.walls[wallId];
  if (!wall) return [];
  const key = pairKey(wall.startNodeId, wall.endNodeId);
  return Object.values(doc.rooms).filter((r) =>
    r.nodeLoop.some((id, i) => pairKey(id, r.nodeLoop[(i + 1) % r.nodeLoop.length]!) === key),
  );
}

export const wallDeletionImpact = (doc: ProjectDocument, wallId: string): DeletionImpact =>
  impactOf(doc, new Set([wallId]), new Set(roomsUsingWall(doc, wallId).map((r) => r.id)));

export const roomDeletionImpact = (doc: ProjectDocument, roomId: string): DeletionImpact =>
  impactOf(doc, new Set(), new Set([roomId]));

/** Elimină nodurile pe care nu le mai folosește niciun perete sau cameră. */
function pruneOrphanNodes(doc: ProjectDocument): void {
  const used = new Set<string>();
  for (const w of Object.values(doc.walls)) {
    used.add(w.startNodeId);
    used.add(w.endNodeId);
  }
  for (const r of Object.values(doc.rooms)) for (const id of r.nodeLoop) used.add(id);
  for (const id of Object.keys(doc.nodes)) if (!used.has(id)) delete doc.nodes[id];
}

function dropDependents(
  doc: ProjectDocument,
  impact: DeletionImpact,
  wallIds: ReadonlySet<string>,
): void {
  for (const o of impact.openings) delete doc.openings[o.id];
  for (const id of impact.assignmentIds) delete doc.finishAssignments[id];
  for (const r of impact.rooms) delete doc.rooms[r.id];
  for (const id of wallIds) delete doc.walls[id];
  const finishesInUse = new Set(Object.values(doc.finishAssignments).map((a) => a.finishId));
  for (const key of Object.keys(doc.budget.overrides)) {
    const i = key.indexOf(':');
    if (key.slice(0, i) === 'finish' && !finishesInUse.has(key.slice(i + 1)))
      delete doc.budget.overrides[key];
  }
  pruneOrphanNodes(doc);
}

/**
 * Șterge un perete împreună cu golurile lui. Dacă peretele face parte din camere, ștergerea e refuzată în afara cazului în
 * care `removeRooms` este `true` (atunci și camerele — fără pereți nu mai sunt camere — și finisajele lor dispar).
 * Refuză și când ar rămâne referințe pe care nu le putem repara singuri (obiecte atașate, linii manuale de buget).
 */
export function removeWall(
  doc: ProjectDocument,
  wallId: string,
  options: { removeRooms?: boolean } = {},
): Result<ProjectDocument> {
  if (!doc.walls[wallId]) return { ok: false, error: 'Peretele nu mai există.' };
  const impact = wallDeletionImpact(doc, wallId);
  if (impact.rooms.length > 0 && !options.removeRooms)
    return {
      ok: false,
      error: `Peretele delimitează ${impact.rooms.length === 1 ? 'o cameră' : `${impact.rooms.length} camere`}: confirmă ștergerea camerei.`,
    };
  if (impact.blockers.length > 0) return { ok: false, error: impact.blockers.join(' ') };
  const next = cloneDocument(doc);
  dropDependents(next, impact, new Set([wallId]));
  return { ok: true, value: next };
}

// ───────────── camere ─────────────

export interface RoomPatch {
  name?: string;
  type?: Room['type'];
  /** `null` = revine la înălțimea nivelului. */
  ceilingHeightMm?: number | null;
}

export function updateRoom(
  doc: ProjectDocument,
  roomId: string,
  patch: RoomPatch,
): Result<ProjectDocument> {
  const room = doc.rooms[roomId];
  if (!room) return { ok: false, error: 'Camera nu mai există.' };
  if (patch.name !== undefined && patch.name.trim() === '')
    return { ok: false, error: 'Numele camerei nu poate fi gol.' };
  if (
    patch.ceilingHeightMm != null &&
    (!isInt(patch.ceilingHeightMm) || patch.ceilingHeightMm <= 0)
  )
    return { ok: false, error: 'Înălțimea trebuie să fie un număr întreg pozitiv de mm.' };
  const { ceilingHeightMm, ...rest } = patch;
  const updated: Room = { ...room, ...rest };
  if (ceilingHeightMm === null) delete updated.ceilingHeightMm;
  else if (ceilingHeightMm !== undefined) updated.ceilingHeightMm = ceilingHeightMm;
  return { ok: true, value: { ...doc, rooms: { ...doc.rooms, [roomId]: updated } } };
}

/**
 * Șterge camera (pereții rămân). Finisajele ei dispar. Pereții și nodurile rămân: o cameră ștearsă nu desface planul.
 */
export function removeRoom(doc: ProjectDocument, roomId: string): Result<ProjectDocument> {
  if (!doc.rooms[roomId]) return { ok: false, error: 'Camera nu mai există.' };
  const impact = roomDeletionImpact(doc, roomId);
  if (impact.blockers.length > 0) return { ok: false, error: impact.blockers.join(' ') };
  const next = cloneDocument(doc);
  dropDependents(next, impact, new Set());
  return { ok: true, value: next };
}

export interface NewRectRoom {
  /** Dimensiuni interioare (față interioară la față interioară), mm. */
  widthMm: number;
  depthMm: number;
  /** Colțul interior stânga-sus. */
  anchor: Pt;
  thicknessMm?: number;
  name?: string;
}

/** Cameră dreptunghiulară nouă: 4 noduri, 4 pereți și camera, după dimensiunile interioare (A.4). */
export function addRectRoom(
  doc: ProjectDocument,
  spec: NewRectRoom,
  genId: IdGenerator,
): Result<{ doc: ProjectDocument; roomId: string }> {
  const levelId = levelIdOf(doc);
  if (!levelId) return { ok: false, error: 'Proiectul nu are niciun nivel.' };
  const t = spec.thicknessMm ?? doc.settings.defaultWallThicknessMm;
  const axes = rectAxesFromInterior(
    spec.widthMm,
    spec.depthMm,
    { n: t, e: t, s: t, w: t },
    spec.anchor,
  );
  if (!axes.ok) return axes;
  const next = cloneDocument(doc);
  const nodeIds: string[] = [];
  for (const p of axes.value) {
    const id = freshId(genId, (c) => c in next.nodes);
    if (!id) return { ok: false, error: 'Nu s-a putut genera un identificator nou.' };
    next.nodes[id] = { id, levelId, x: p.x, y: p.y };
    nodeIds.push(id);
  }
  for (let i = 0; i < 4; i++) {
    const id = freshId(genId, (c) => c in next.walls);
    if (!id) return { ok: false, error: 'Nu s-a putut genera un identificator nou.' };
    next.walls[id] = {
      id,
      levelId,
      startNodeId: nodeIds[i]!,
      endNodeId: nodeIds[(i + 1) % 4]!,
      thicknessMm: t,
      heightMm: next.settings.defaultWallHeightMm,
      baseOffsetMm: 0,
    };
  }
  const roomId = freshId(genId, (c) => c in next.rooms);
  if (!roomId) return { ok: false, error: 'Nu s-a putut genera un identificator nou.' };
  next.rooms[roomId] = {
    id: roomId,
    levelId,
    name: spec.name ?? `Cameră ${Object.keys(next.rooms).length + 1}`,
    type: 'other',
    nodeLoop: nodeIds,
  };
  return { ok: true, value: { doc: next, roomId } };
}

// ───────────── goluri (uși și ferestre) ─────────────

export type OpeningType = Opening['type'];

/** Dimensiuni implicite ale editorului pentru un gol nou (mm); înălțimea se limitează la peretele ales. */
export const DEFAULT_OPENING: Record<
  OpeningType,
  { widthMm: number; heightMm: number; sillHeightMm: number }
> = {
  door: { widthMm: 900, heightMm: 2100, sillHeightMm: 0 },
  window: { widthMm: 1200, heightMm: 1200, sillHeightMm: 900 },
};

/** Intervalul admis pentru CENTRUL unui gol de lățime `widthMm` pe perete (A.5), sau `null` dacă nu încape. */
export function openingCenterRange(
  doc: ProjectDocument,
  wallId: string,
  widthMm: number,
): { min: number; max: number } | null {
  const fp = analyzeGeometry(doc).footprints.get(wallId);
  if (!fp) return null;
  const { lo, hi } = openingRange(fp, doc.settings.openingEdgeMarginMm);
  const min = Math.ceil(lo + widthMm / 2);
  const max = Math.floor(hi - widthMm / 2);
  return min <= max ? { min, max } : null;
}

/** Adaugă un gol în cel mai apropiat de mijloc loc liber al peretelui (respectă marja și distanța între goluri). */
export function addOpening(
  doc: ProjectDocument,
  wallId: string,
  type: OpeningType,
  genId: IdGenerator,
): Result<{ doc: ProjectDocument; openingId: string }> {
  const wall = doc.walls[wallId];
  if (!wall) return { ok: false, error: 'Peretele nu mai există.' };
  const base = DEFAULT_OPENING[type];
  const heightMm = Math.min(base.heightMm, wall.heightMm - base.sillHeightMm);
  if (heightMm <= 0) return { ok: false, error: 'Peretele este prea jos pentru acest gol.' };
  const range = openingCenterRange(doc, wallId, base.widthMm);
  if (!range) return { ok: false, error: 'Peretele este prea scurt pentru acest gol.' };
  const gap = doc.settings.openingGapMm;
  const others = Object.values(doc.openings)
    .filter((o) => o.wallId === wallId)
    .sort((a, b) => a.offsetMm - b.offsetMm);
  const fits = (c: number) =>
    others.every((o) => Math.abs(o.offsetMm - c) >= (o.widthMm + base.widthMm) / 2 + gap);
  // candidați: mijlocul, apoi lipit de fiecare vecin (în ambele părți), apoi capetele intervalului
  const mid = Math.round((range.min + range.max) / 2);
  const candidates = [
    mid,
    range.min,
    range.max,
    ...others.flatMap((o) => {
      const d = Math.ceil((o.widthMm + base.widthMm) / 2 + gap);
      return [o.offsetMm - d, o.offsetMm + d];
    }),
  ]
    .filter((c) => c >= range.min && c <= range.max && fits(c))
    .sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
  const offsetMm = candidates[0];
  if (offsetMm === undefined) return { ok: false, error: 'Nu mai este loc liber pe acest perete.' };
  const openingId = freshId(genId, (c) => c in doc.openings);
  if (!openingId) return { ok: false, error: 'Nu s-a putut genera un identificator nou.' };
  const opening: Opening = {
    id: openingId,
    wallId,
    type,
    offsetMm,
    widthMm: base.widthMm,
    heightMm,
    sillHeightMm: base.sillHeightMm,
    ...(type === 'door' ? { swing: { hinge: 'start' as const, side: 'left' as const } } : {}),
  };
  return {
    ok: true,
    value: { doc: { ...doc, openings: { ...doc.openings, [openingId]: opening } }, openingId },
  };
}

export interface OpeningPatch {
  offsetMm?: number;
  widthMm?: number;
  heightMm?: number;
  sillHeightMm?: number;
  /** Doar pentru uși. */
  swing?: NonNullable<Opening['swing']>;
}

/** Repoziționează / redimensionează un gol pe același perete. Suprapunerile și limitele se verifică la `commit`. */
export function updateOpening(
  doc: ProjectDocument,
  openingId: string,
  patch: OpeningPatch,
): Result<ProjectDocument> {
  const opening = doc.openings[openingId];
  if (!opening) return { ok: false, error: 'Golul nu mai există.' };
  for (const [k, v] of Object.entries(patch))
    if (k !== 'swing' && !isInt(v as number))
      return { ok: false, error: 'Valorile trebuie să fie numere întregi (mm).' };
  if (
    (patch.widthMm !== undefined && patch.widthMm <= 0) ||
    (patch.heightMm !== undefined && patch.heightMm <= 0)
  )
    return { ok: false, error: 'Lățimea și înălțimea trebuie să fie pozitive.' };
  if (patch.sillHeightMm !== undefined && patch.sillHeightMm < 0)
    return { ok: false, error: 'Pragul nu poate fi negativ.' };
  if (patch.swing && opening.type !== 'door')
    return { ok: false, error: 'Sensul de deschidere se setează doar la uși.' };
  const updated: Opening = { ...opening, ...patch };
  return { ok: true, value: { ...doc, openings: { ...doc.openings, [openingId]: updated } } };
}

export function removeOpening(doc: ProjectDocument, openingId: string): Result<ProjectDocument> {
  if (!doc.openings[openingId]) return { ok: false, error: 'Golul nu mai există.' };
  const openings = { ...doc.openings };
  delete openings[openingId];
  return { ok: true, value: { ...doc, openings } };
}
