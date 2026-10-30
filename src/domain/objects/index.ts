// Obiectele plasate (mobilier etc.): parametri, dimensiuni, plasare și operații de editare. Pure: întorc un document NOU
// sau o eroare în română; nu citesc ceasul, nu generează ID-uri (vin din `genId`) și nu cunosc catalogul aplicației —
// lucrează doar cu `CatalogItem`-ul primit sau cu cel din `doc.catalogSnapshot` (ADR-011). Ștergerea: `removeObject` (cascade).
import { cloneDocument } from '../factory';
import { copyObjectFinishes } from '../finishes';
import {
  analyzeGeometry,
  pointInPolygon,
  wallFrame,
  type GeometryModel,
  type Pt,
  type RoomInterior,
} from '../geometry';
import type { Result } from '../result';
import type { CatalogItem, PlacedObject, ProjectDocument } from '../schema';

export type ParamValue = PlacedObject['params'][string];
export type ObjectParams = PlacedObject['params'];
export type ObjectSize = PlacedObject['size'];
export type ParamSpec = CatalogItem['paramSpecs'][string];

/** Distanța implicită (mm) la care se așază o copie față de original. */
export const DUPLICATE_OFFSET_MM = 300;

// ───────────── parametri ─────────────

export const paramDefault = (spec: ParamSpec): ParamValue => spec.default;

/** Valorile implicite ale tuturor parametrilor itemului. */
export function defaultParams(item: CatalogItem): ObjectParams {
  return Object.fromEntries(Object.entries(item.paramSpecs).map(([k, s]) => [k, paramDefault(s)]));
}

/** Problemele unei valori față de specificația ei (listă goală = validă). */
export function paramValueProblem(name: string, spec: ParamSpec, value: unknown): string | null {
  if (spec.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value))
      return `„${name}” trebuie să fie un număr.`;
    if (value < spec.min || value > spec.max)
      return `„${name}” trebuie să fie între ${spec.min} și ${spec.max}.`;
    if (spec.unit === 'count' && !Number.isInteger(value))
      return `„${name}” trebuie să fie un număr întreg.`;
    return null;
  }
  if (spec.type === 'enum')
    return typeof value === 'string' && spec.options.includes(value)
      ? null
      : `„${name}” trebuie să fie una dintre: ${spec.options.join(', ')}.`;
  return typeof value === 'boolean' ? null : `„${name}” trebuie să fie da/nu.`;
}

/** Valori invalide și chei necunoscute (acestea din urmă separat: în documente vechi sunt doar avertismente). */
export function paramProblems(
  item: CatalogItem,
  params: ObjectParams,
): { invalid: string[]; unknown: string[] } {
  const invalid: string[] = [];
  const unknown: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    const spec = item.paramSpecs[k];
    if (!spec) unknown.push(k);
    else {
      const p = paramValueProblem(k, spec, v);
      if (p) invalid.push(p);
    }
  }
  return { invalid, unknown };
}

// ───────────── dimensiuni ─────────────

const SIZE_LABEL = { widthMm: 'Lățimea', depthMm: 'Adâncimea', heightMm: 'Înălțimea' } as const;

/** Dimensiuni întregi, pozitive și în limitele itemului. */
export function sizeProblems(item: CatalogItem, size: ObjectSize): string[] {
  const out: string[] = [];
  for (const k of ['widthMm', 'depthMm', 'heightMm'] as const) {
    const v = size[k];
    const { min, max } = item.sizeLimits[k];
    if (!Number.isInteger(v) || v <= 0)
      out.push(`${SIZE_LABEL[k]} trebuie să fie un număr întreg pozitiv (mm).`);
    else if (v < min || v > max)
      out.push(`${SIZE_LABEL[k]} trebuie să fie între ${min} și ${max} mm.`);
  }
  return out;
}

export const normalizeRotation = (deg: number): number => {
  const r = ((deg % 360) + 360) % 360;
  const rounded = Math.round(r * 1000) / 1000;
  return rounded >= 360 ? 0 : rounded;
};

/** Elevația implicită: podea 0; perete = valoarea din catalog; tavan = înălțimea tavanului − înălțimea obiectului. */
export function defaultElevation(
  doc: ProjectDocument,
  item: CatalogItem,
  heightMm: number,
  levelId: string,
): number {
  if (item.mounting === 'floor') return 0;
  if (item.mounting === 'wall') return item.defaultElevationMm;
  const ceiling = doc.levels[levelId]?.ceilingHeightMm ?? doc.settings.defaultWallHeightMm;
  return Math.max(0, ceiling - heightMm);
}

// ───────────── plasare ─────────────

export interface Placement {
  position: Pt;
  rotationDeg: number;
  wallId?: string;
}

function roomAnchor(r: RoomInterior): Pt {
  let a = 0,
    cx = 0,
    cy = 0;
  const p = r.polygon;
  for (let i = 0; i < p.length; i++) {
    const q = p[i]!,
      n = p[(i + 1) % p.length]!;
    const c = q.x * n.y - n.x * q.y;
    a += c;
    cx += (q.x + n.x) * c;
    cy += (q.y + n.y) * c;
  }
  if (Math.abs(a) > 1e-6) {
    const c = { x: cx / (3 * a), y: cy / (3 * a) };
    if (pointInPolygon(c, p)) return c;
  }
  const xs = p.map((q) => q.x),
    ys = p.map((q) => q.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/**
 * Locul propus pentru un obiect nou: în prima cameră (după id) — centrat, decalat dacă e deja ocupat; obiectele montate
 * pe perete se lipesc de prima latură a camerei, cu fața spre interior. Fără camere: originea planului.
 * `rotationDeg` = 0 ⇒ fața obiectului privește spre +Y din plan; rotația e orară pe ecran.
 */
export function suggestPlacement(
  doc: ProjectDocument,
  item: CatalogItem,
  size: ObjectSize = item.defaultSize,
  geometry: GeometryModel = analyzeGeometry(doc),
): Placement {
  const rooms = [...geometry.rooms.values()].sort((a, b) => (a.roomId < b.roomId ? -1 : 1));
  const room = rooms[0];
  if (!room) return { position: { x: 0, y: 0 }, rotationDeg: 0 };

  if (item.mounting === 'wall') {
    const edge = [...room.edges].sort((a, b) => b.lengthMm - a.lengthMm)[0];
    const wall = edge && doc.walls[edge.wallId];
    if (edge && wall) {
      const f = wallFrame(doc, wall);
      const inward = edge.side === 'left' ? f.nL : { x: -f.nL.x, y: -f.nL.y };
      const mid = { x: (edge.start.x + edge.end.x) / 2, y: (edge.start.y + edge.end.y) / 2 };
      const half = size.depthMm / 2;
      return {
        position: {
          x: Math.round(mid.x + inward.x * half),
          y: Math.round(mid.y + inward.y * half),
        },
        // fața (0,1) rotită cu θ = (−sinθ, cosθ) trebuie să coincidă cu normala spre interior
        rotationDeg: normalizeRotation((Math.atan2(-inward.x, inward.y) * 180) / Math.PI),
        wallId: wall.id,
      };
    }
  }

  const c = roomAnchor(room);
  const free = (p: Pt) =>
    !Object.values(doc.objects).some(
      (o) =>
        Math.abs(o.position.x - p.x) < (o.size.widthMm + size.widthMm) / 2 &&
        Math.abs(o.position.y - p.y) < (o.size.depthMm + size.depthMm) / 2,
    );
  const fits = (p: Pt) =>
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].every(([sx, sy]) =>
      pointInPolygon(
        { x: p.x + sx! * (size.widthMm / 2), y: p.y + sy! * (size.depthMm / 2) },
        room.polygon,
      ),
    );
  const origin = { x: Math.round(c.x), y: Math.round(c.y) };
  // candidați pe o grilă de 100 mm în jurul centrului camerei, cei mai apropiați întâi: primul loc liber care încape
  const xs = room.polygon.map((q) => q.x),
    ys = room.polygon.map((q) => q.y);
  const step = 100;
  const cands: Pt[] = [];
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += step)
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += step) cands.push({ x, y });
  cands.sort((p, q) => Math.hypot(p.x - c.x, p.y - c.y) - Math.hypot(q.x - c.x, q.y - c.y));
  const spot = cands.find((p) => fits(p) && free(p));
  const p = spot ?? origin; // camera plină sau prea mică: centrul camerei (utilizatorul mută obiectul)
  return { position: p, rotationDeg: 0 };
}

// ───────────── operații ─────────────

function freshId(genId: () => string, taken: (id: string) => boolean): string | null {
  for (let i = 0; i < 50; i++) {
    const id = genId();
    if (!taken(id)) return id;
  }
  return null;
}

const levelIdOf = (doc: ProjectDocument): string | null => Object.keys(doc.levels)[0] ?? null;
const isInt = (n: number): boolean => Number.isInteger(n);

export interface NewObjectOptions {
  position: Pt;
  rotationDeg?: number;
  wallId?: string;
  size?: ObjectSize;
  params?: ObjectParams;
  colorHex?: string;
}

/**
 * Adaugă un obiect din catalog. La prima utilizare itemul se copiază în `catalogSnapshot` (ADR-011); dacă proiectul are
 * deja o copie a itemului, aceea rămâne în vigoare (o versiune nouă din catalogul aplicației nu schimbă proiectul).
 */
export function addObject(
  doc: ProjectDocument,
  item: CatalogItem,
  options: NewObjectOptions,
  genId: () => string,
): Result<{ doc: ProjectDocument; objectId: string }> {
  const levelId = levelIdOf(doc);
  if (!levelId) return { ok: false, error: 'Proiectul nu are niciun nivel.' };
  if (!isInt(options.position.x) || !isInt(options.position.y))
    return { ok: false, error: 'Poziția trebuie să fie în milimetri întregi.' };
  const snap = doc.catalogSnapshot.items[item.id] ?? item;
  const size = options.size ?? snap.defaultSize;
  const sp = sizeProblems(snap, size);
  if (sp.length > 0) return { ok: false, error: sp[0]! };
  const params = { ...defaultParams(snap), ...(options.params ?? {}) };
  const pp = paramProblems(snap, params);
  if (pp.invalid.length > 0 || pp.unknown.length > 0)
    return { ok: false, error: pp.invalid[0] ?? `Parametru necunoscut: ${pp.unknown[0]}.` };
  const next = cloneDocument(doc);
  const objectId = freshId(genId, (c) => c in next.objects);
  if (!objectId) return { ok: false, error: 'Nu s-a putut genera un identificator nou.' };
  if (!next.catalogSnapshot.items[item.id]) next.catalogSnapshot.items[item.id] = item;
  const obj: PlacedObject = {
    id: objectId,
    levelId,
    catalogItemId: item.id,
    position: { x: options.position.x, y: options.position.y },
    elevationMm: defaultElevation(next, snap, size.heightMm, levelId),
    rotationDeg: normalizeRotation(options.rotationDeg ?? 0),
    size: { ...size },
    params,
  };
  if (options.wallId && next.walls[options.wallId]) obj.wallId = options.wallId;
  if (options.colorHex) obj.colorHex = options.colorHex;
  next.objects[objectId] = obj;
  return { ok: true, value: { doc: next, objectId } };
}

export interface ObjectPatch {
  /** `null` șterge numele (revine la numele din catalog). */
  name?: string | null;
  position?: Pt;
  rotationDeg?: number;
  size?: Partial<ObjectSize>;
  /** Se îmbină peste parametrii existenți. */
  params?: ObjectParams;
  /** `null` revine la culoarea implicită a itemului. */
  colorHex?: string | null;
  elevationMm?: number;
  /** Peretele de care e lipit un obiect montat pe perete (la o mutare liberă legătura se șterge;  o șterge explicit). */
  wallId?: string | null;
}

/** Modifică un obiect: validează dimensiunile și parametrii față de itemul din `catalogSnapshot`. */
export function updateObject(
  doc: ProjectDocument,
  objectId: string,
  patch: ObjectPatch,
): Result<ProjectDocument> {
  const obj = doc.objects[objectId];
  if (!obj) return { ok: false, error: 'Obiectul nu mai există.' };
  const item = doc.catalogSnapshot.items[obj.catalogItemId];
  if (!item) return { ok: false, error: 'Itemul de catalog al obiectului lipsește din proiect.' };

  const next: PlacedObject = {
    ...obj,
    position: { ...obj.position },
    size: { ...obj.size },
    params: { ...obj.params },
  };
  if (patch.name !== undefined) {
    if (patch.name === null || patch.name.trim() === '') delete next.name;
    else next.name = patch.name.trim();
  }
  if (patch.position) {
    if (!isInt(patch.position.x) || !isInt(patch.position.y))
      return { ok: false, error: 'Poziția trebuie să fie în milimetri întregi.' };
    next.position = { x: patch.position.x, y: patch.position.y };
    // o mutare liberă desprinde obiectul de perete (legătura rămâne doar pentru plasarea inițială)
    delete next.wallId;
  }
  if (patch.wallId !== undefined) {
    if (patch.wallId === null) delete next.wallId;
    else if (doc.walls[patch.wallId]) next.wallId = patch.wallId;
    else return { ok: false, error: 'Peretele nu mai există.' };
  }
  if (patch.rotationDeg !== undefined) {
    if (!Number.isFinite(patch.rotationDeg))
      return { ok: false, error: 'Rotația trebuie să fie un număr.' };
    next.rotationDeg = normalizeRotation(patch.rotationDeg);
  }
  if (patch.size) {
    next.size = { ...next.size, ...patch.size };
    const sp = sizeProblems(item, next.size);
    if (sp.length > 0) return { ok: false, error: sp[0]! };
    if (
      item.mounting === 'ceiling' &&
      patch.elevationMm === undefined &&
      patch.size.heightMm !== undefined
    )
      next.elevationMm = defaultElevation(doc, item, next.size.heightMm, obj.levelId);
  }
  if (patch.params) {
    next.params = { ...next.params, ...patch.params };
    const pp = paramProblems(item, patch.params);
    if (pp.invalid.length > 0) return { ok: false, error: pp.invalid[0]! };
    if (pp.unknown.length > 0)
      return { ok: false, error: `Parametru necunoscut: ${pp.unknown[0]}.` };
  }
  if (patch.colorHex !== undefined) {
    if (patch.colorHex === null) delete next.colorHex;
    else if (/^#[0-9a-fA-F]{6}$/.test(patch.colorHex)) next.colorHex = patch.colorHex;
    else return { ok: false, error: 'Culoarea trebuie să aibă forma #rrggbb.' };
  }
  if (patch.elevationMm !== undefined) {
    if (!isInt(patch.elevationMm) || patch.elevationMm < 0)
      return { ok: false, error: 'Elevația trebuie să fie un număr întreg ≥ 0 (mm).' };
    if (item.mounting === 'floor' && patch.elevationMm !== 0)
      return { ok: false, error: 'Obiectele de podea stau pe podea (elevație 0).' };
    next.elevationMm = patch.elevationMm;
  }
  if (JSON.stringify(next) === JSON.stringify(obj)) return { ok: true, value: doc };
  return { ok: true, value: { ...doc, objects: { ...doc.objects, [objectId]: next } } };
}

/** Copie a obiectului, decalată; nu copiază suprascrierile de buget ale originalului. */
export function duplicateObject(
  doc: ProjectDocument,
  objectId: string,
  genId: () => string,
  offset: Pt = { x: DUPLICATE_OFFSET_MM, y: DUPLICATE_OFFSET_MM },
): Result<{ doc: ProjectDocument; objectId: string }> {
  const obj = doc.objects[objectId];
  if (!obj) return { ok: false, error: 'Obiectul nu mai există.' };
  const next = cloneDocument(doc);
  const id = freshId(genId, (c) => c in next.objects);
  if (!id) return { ok: false, error: 'Nu s-a putut genera un identificator nou.' };
  const copy: PlacedObject = JSON.parse(JSON.stringify(obj));
  copy.id = id;
  copy.position = {
    x: obj.position.x + Math.round(offset.x),
    y: obj.position.y + Math.round(offset.y),
  };
  delete copy.wallId;
  next.objects[id] = copy;
  return { ok: true, value: { doc: copyObjectFinishes(next, objectId, id, genId), objectId: id } };
}
