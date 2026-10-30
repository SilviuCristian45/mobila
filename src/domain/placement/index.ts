// Poziționarea obiectelor: amprentă, snapping (grilă, pereți, obiecte, montaj), validare și redimensionare din mânere.
// Pur și comun planului 2D și vederii 3D (o singură logică). Nu modifică documentul: întoarce candidați și probleme;
// aplicarea trece prin `updateObject` + `session.apply`. Convenții: rotația e orară pe ecran (Y în jos); fața obiectului
// privește spre (−sinθ, cosθ); spatele e la −adâncime/2. Unități: mm.
import {
  distToSegment,
  dot,
  pointInPolygon,
  sub,
  wallFrame,
  type GeometryModel,
  type Pt,
} from '../geometry';
import type { CatalogItem, PlacedObject, ProjectDocument } from '../schema';
import { normalizeRotation, type ObjectSize } from '../objects';

const rad = (deg: number): number => (deg * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;

/** Colțurile amprentei în plan: (−l/2,−a/2), (l/2,−a/2), (l/2,a/2), (−l/2,a/2) rotite orar cu `rotationDeg`. */
export function footprintOf(
  position: Pt,
  rotationDeg: number,
  widthMm: number,
  depthMm: number,
): Pt[] {
  const c = Math.cos(rad(rotationDeg));
  const s = Math.sin(rad(rotationDeg));
  const hw = widthMm / 2;
  const hd = depthMm / 2;
  return (
    [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ] as const
  ).map(([x, y]) => ({ x: position.x + x * c - y * s, y: position.y + x * s + y * c }));
}
export const footprintOfObject = (o: PlacedObject): Pt[] =>
  footprintOf(o.position, o.rotationDeg, o.size.widthMm, o.size.depthMm);

/** Direcția feței (versor în plan) pentru o rotație. */
export const frontOf = (rotationDeg: number): Pt => ({
  x: -Math.sin(rad(rotationDeg)),
  y: Math.cos(rad(rotationDeg)),
});

/** Rotația la pasul dat (grade); `step` ≤ 0 sau `null` = fără rotunjire. */
export function snapAngle(degrees: number, step: number | null): number {
  const v = step && step > 0 ? Math.round(degrees / step) * step : degrees;
  return normalizeRotation(v);
}

// ───────────── fețe interioare ─────────────

export interface InteriorFace {
  roomId: string;
  wallId: string;
  side: 'left' | 'right';
  a: Pt;
  b: Pt;
  /** Normala spre interiorul camerei (versor). */
  n: Pt;
  /** Versor de-a lungul feței (a → b). */
  u: Pt;
  length: number;
}

/** Fețele interioare ale tuturor camerelor (din geometria domeniului, nu recalculată). */
export function interiorFaces(doc: ProjectDocument, geometry: GeometryModel): InteriorFace[] {
  const out: InteriorFace[] = [];
  for (const room of geometry.rooms.values())
    for (const e of room.edges) {
      const wall = doc.walls[e.wallId];
      if (!wall) continue;
      const f = wallFrame(doc, wall);
      const n = e.side === 'left' ? f.nL : { x: -f.nL.x, y: -f.nL.y };
      const dx = e.end.x - e.start.x;
      const dy = e.end.y - e.start.y;
      const length = Math.hypot(dx, dy);
      if (length < 1) continue;
      out.push({
        roomId: room.roomId,
        wallId: e.wallId,
        side: e.side,
        a: e.start,
        b: e.end,
        n,
        u: { x: dx / length, y: dy / length },
        length,
      });
    }
  return out;
}

// ───────────── snapping ─────────────

export interface SnapSettings {
  /** Pasul grilei (mm) sau `null` = fără snap la grilă. */
  gridMm: number | null;
  /** Lipire de pereți (obiecte de podea). Obiectele de perete rămân lipite oricum. */
  walls: boolean;
  /** Aliniere la obiecte apropiate. */
  objects: boolean;
  /** Distanța (mm) sub care se lipește. */
  thresholdMm: number;
}
export const DEFAULT_SNAP_THRESHOLD_MM = 120;
export const NO_SNAP: SnapSettings = { gridMm: null, walls: false, objects: false, thresholdMm: 0 };

export interface Guide {
  kind: 'wall' | 'object';
  a: Pt;
  b: Pt;
}
export interface SnapResult {
  position: Pt;
  rotationDeg: number;
  /** Peretele de care e lipit un obiect montat pe perete. */
  wallId?: string;
  guides: Guide[];
  snapped: Array<'grid' | 'wall' | 'object' | 'mount'>;
}

const round = (p: Pt): Pt => ({ x: Math.round(p.x), y: Math.round(p.y) });
const snapTo = (v: number, step: number): number => Math.round(v / step) * step;
const itemOf = (doc: ProjectDocument, o: PlacedObject): CatalogItem | undefined =>
  doc.catalogSnapshot.items[o.catalogItemId];

/**
 * Poziția finală a unui obiect trasat spre `raw`. Reguli:
 * - **perete**: obiectul stă lipit de cea mai apropiată față interioară (spatele pe față, fața spre cameră, rotație dedusă);
 *   rămâne lipit chiar și cu snapping-ul dezactivat — nu se poate pune în mijlocul camerei;
 * - **podea**: centrul pe grilă; apoi lipire de pereți (marginea amprentei pe față, la ≤ prag, cu ≤ 2 pereți neparaleli ⇒ colț);
 *   apoi aliniere/lipire de marginile obiectelor apropiate (doar obiecte aliniate la axe, pe fiecare axă separat;
 *   un perete are prioritate pe axa lui);
 * - **tavan**: ca podeaua, fără lipire de pereți.
 */
export function snapPlacement(
  doc: ProjectDocument,
  geometry: GeometryModel,
  objectId: string,
  raw: { position: Pt; rotationDeg: number },
  settings: SnapSettings,
): SnapResult {
  const obj = doc.objects[objectId];
  const item = obj ? itemOf(doc, obj) : undefined;
  if (!obj || !item)
    return { position: round(raw.position), rotationDeg: raw.rotationDeg, guides: [], snapped: [] };
  const hw = obj.size.widthMm / 2;
  const hd = obj.size.depthMm / 2;
  const snapped: SnapResult['snapped'] = [];
  const guides: Guide[] = [];

  if (item.mounting === 'wall') {
    const faces = interiorFaces(doc, geometry);
    let best: { f: InteriorFace; d: number } | null = null;
    for (const f of faces) {
      const d = distToSegment(raw.position, f.a, f.b);
      if (!best || d < best.d) best = { f, d };
    }
    if (!best)
      return { position: round(raw.position), rotationDeg: raw.rotationDeg, guides, snapped };
    const f = best.f;
    const mid = f.length / 2;
    const t =
      f.length <= 2 * hw
        ? mid
        : Math.max(hw, Math.min(f.length - hw, dot(sub(raw.position, f.a), f.u)));
    const q = { x: f.a.x + f.u.x * t + f.n.x * hd, y: f.a.y + f.u.y * t + f.n.y * hd };
    return {
      position: round(q),
      rotationDeg: normalizeRotation(deg(Math.atan2(-f.n.x, f.n.y))),
      wallId: f.wallId,
      guides: [{ kind: 'wall', a: f.a, b: f.b }],
      snapped: ['mount'],
    };
  }

  let p: Pt = { ...raw.position };
  const rot = raw.rotationDeg;
  if (settings.gridMm) {
    p = { x: snapTo(p.x, settings.gridMm), y: snapTo(p.y, settings.gridMm) };
    snapped.push('grid');
  }
  const wallAxes = new Set<'x' | 'y'>();

  if (item.mounting === 'floor' && settings.walls) {
    const faces = interiorFaces(doc, geometry);
    const used: Pt[] = [];
    for (let pass = 0; pass < 2; pass++) {
      const corners = footprintOf(p, rot, obj.size.widthMm, obj.size.depthMm);
      let best: { f: InteriorFace; g: number } | null = null;
      for (const f of faces) {
        if (used.some((n) => Math.abs(n.x * f.n.x + n.y * f.n.y) > 0.7)) continue; // aceeași direcție: deja lipit
        const g = Math.min(...corners.map((c) => dot(sub(c, f.a), f.n)));
        const ts = corners.map((c) => dot(sub(c, f.a), f.u));
        if (Math.max(...ts) < 0 || Math.min(...ts) > f.length) continue; // nu e lângă această față
        if (Math.abs(g) <= settings.thresholdMm && (!best || Math.abs(g) < Math.abs(best.g)))
          best = { f, g };
      }
      if (!best) break;
      p = { x: p.x - best.f.n.x * best.g, y: p.y - best.f.n.y * best.g };
      used.push(best.f.n);
      guides.push({ kind: 'wall', a: best.f.a, b: best.f.b });
      if (Math.abs(best.f.n.x) > 0.7) wallAxes.add('x');
      else if (Math.abs(best.f.n.y) > 0.7) wallAxes.add('y');
      if (!snapped.includes('wall')) snapped.push('wall');
    }
  }

  const r90 = ((rot % 90) + 90) % 90;
  if (settings.objects && (r90 < 0.5 || r90 > 89.5)) {
    const swap = Math.round(rot / 90) % 2 !== 0;
    const w = swap ? obj.size.depthMm : obj.size.widthMm;
    const d = swap ? obj.size.widthMm : obj.size.depthMm;
    for (const axis of ['x', 'y'] as const) {
      if (wallAxes.has(axis)) continue;
      const other = axis === 'x' ? 'y' : 'x';
      const half = (axis === 'x' ? w : d) / 2;
      const halfOther = (axis === 'x' ? d : w) / 2;
      let best: { delta: number; o: PlacedObject; edge: number } | null = null;
      for (const o of Object.values(doc.objects)) {
        if (o.id === objectId) continue;
        const oi = itemOf(doc, o);
        if (!oi || oi.mounting !== item.mounting) continue;
        const r = ((o.rotationDeg % 90) + 90) % 90;
        if (r > 0.5 && r < 89.5) continue;
        const oswap = Math.round(o.rotationDeg / 90) % 2 !== 0;
        const ow = oswap ? o.size.depthMm : o.size.widthMm;
        const od = oswap ? o.size.widthMm : o.size.depthMm;
        const oh = (axis === 'x' ? ow : od) / 2;
        const ohOther = (axis === 'x' ? od : ow) / 2;
        // relevant doar dacă sunt apropiate pe axa cealaltă
        const gapOther = Math.abs(p[other] - o.position[other]) - (halfOther + ohOther);
        if (gapOther > settings.thresholdMm) continue;
        const mMin = p[axis] - half,
          mMax = p[axis] + half;
        const oMin = o.position[axis] - oh,
          oMax = o.position[axis] + oh;
        for (const [delta, edge] of [
          [oMin - mMin, oMin],
          [oMax - mMax, oMax],
          [oMax - mMin, oMax],
          [oMin - mMax, oMin],
        ] as const)
          if (
            Math.abs(delta) <= settings.thresholdMm &&
            (!best || Math.abs(delta) < Math.abs(best.delta))
          )
            best = { delta, o, edge };
      }
      if (best) {
        p = { ...p, [axis]: p[axis] + best.delta };
        const span = 2000;
        guides.push(
          axis === 'x'
            ? {
                kind: 'object',
                a: { x: best.edge, y: best.o.position.y - span / 2 },
                b: { x: best.edge, y: best.o.position.y + span / 2 },
              }
            : {
                kind: 'object',
                a: { x: best.o.position.x - span / 2, y: best.edge },
                b: { x: best.o.position.x + span / 2, y: best.edge },
              },
        );
        if (!snapped.includes('object')) snapped.push('object');
      }
    }
  }
  return { position: round(p), rotationDeg: rot, guides, snapped };
}

// ───────────── validare ─────────────

export interface PlacementIssue {
  code:
    'outside-room' | 'crosses-wall' | 'wall-mount-incompatible' | 'overlap' | 'taller-than-ceiling';
  /** `error` blochează gestul (se revine la ultima poziție validă); `warning` doar informează. */
  severity: 'error' | 'warning';
  message: string;
  otherId?: string;
}
export const hasBlocking = (issues: readonly PlacementIssue[]): boolean =>
  issues.some((i) => i.severity === 'error');

/** Adâncimea minimă de suprapunere (mm) a două poligoane convexe; 0 dacă sunt separate (SAT). */
export function penetration(a: readonly Pt[], b: readonly Pt[]): number {
  let min = Infinity;
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const ax = { x: q.y - p.y, y: p.x - q.x };
      const l = Math.hypot(ax.x, ax.y);
      if (l === 0) continue;
      const n = { x: ax.x / l, y: ax.y / l };
      const pa = a.map((v) => v.x * n.x + v.y * n.y);
      const pb = b.map((v) => v.x * n.x + v.y * n.y);
      const ov =
        Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
      if (ov <= 0) return 0;
      min = Math.min(min, ov);
    }
  return Number.isFinite(min) ? min : 0;
}

const TOL_MM = 2;
const insideTol = (p: Pt, poly: readonly Pt[]): boolean => {
  if (pointInPolygon(p, poly)) return true;
  for (let i = 0; i < poly.length; i++)
    if (distToSegment(p, poly[i]!, poly[(i + 1) % poly.length]!) <= TOL_MM) return true;
  return false;
};
const nameOf = (doc: ProjectDocument, o: PlacedObject): string =>
  o.name ?? doc.catalogSnapshot.items[o.catalogItemId]?.name.ro ?? 'obiect';

/**
 * Problemele de poziționare ale unui obiect (starea candidat `obj`, în `doc`). Reguli simple și explicite:
 * erori — iese din cameră (colțurile nu sunt toate în aceeași cameră), traversează un perete, obiect de perete care nu e lipit
 * de un perete cu fața spre cameră; avertismente — suprapunere cu alt obiect (doar dacă și intervalele verticale se
 * suprapun: un corp de perete deasupra unui corp de podea nu e conflict) și depășirea înălțimii tavanului.
 * Nu e fizică: nu se verifică stabilitatea, obiecte puse intenționat pe/sub altele, deschideri sau treceri.
 */
export function validatePlacement(
  doc: ProjectDocument,
  geometry: GeometryModel,
  obj: PlacedObject,
): PlacementIssue[] {
  const item = itemOf(doc, obj);
  if (!item) return [];
  const issues: PlacementIssue[] = [];
  const F = footprintOfObject(obj);

  let crosses = false;
  for (const fp of geometry.footprints.values())
    if (penetration(F, fp.polygon) > 3) {
      crosses = true;
      break;
    }
  if (crosses)
    issues.push({
      code: 'crosses-wall',
      severity: 'error',
      message: 'Obiectul traversează un perete.',
    });
  else if (geometry.rooms.size > 0) {
    const inRoom = [...geometry.rooms.values()].some((r) =>
      F.every((c) => insideTol(c, r.polygon)),
    );
    if (!inRoom)
      issues.push({
        code: 'outside-room',
        severity: 'error',
        message: 'Obiectul iese din cameră.',
      });
  }

  if (item.mounting === 'wall') {
    const f = frontOf(obj.rotationDeg);
    const ok = interiorFaces(doc, geometry).some((face) => {
      const dn = dot(sub(obj.position, face.a), face.n);
      const t = dot(sub(obj.position, face.a), face.u);
      return (
        Math.abs(dn - obj.size.depthMm / 2) <= 30 &&
        t >= -1 &&
        t <= face.length + 1 &&
        dot(f, face.n) >= Math.cos(rad(5))
      );
    });
    if (!ok)
      issues.push({
        code: 'wall-mount-incompatible',
        severity: 'error',
        message:
          'Un obiect montat pe perete trebuie să stea lipit de un perete, cu fața spre cameră.',
      });
  }

  const top = obj.elevationMm + obj.size.heightMm;
  const ceiling = doc.levels[obj.levelId]?.ceilingHeightMm;
  if (ceiling !== undefined && top > ceiling)
    issues.push({
      code: 'taller-than-ceiling',
      severity: 'warning',
      message: `Obiectul depășește înălțimea tavanului (${top} mm față de ${ceiling} mm).`,
    });

  for (const o of Object.values(doc.objects)) {
    if (o.id === obj.id) continue;
    const verticalOverlap =
      obj.elevationMm < o.elevationMm + o.size.heightMm && o.elevationMm < top;
    if (!verticalOverlap) continue;
    if (penetration(F, footprintOfObject(o)) > 5)
      issues.push({
        code: 'overlap',
        severity: 'warning',
        message: `Se suprapune cu „${nameOf(doc, o)}”.`,
        otherId: o.id,
      });
  }
  return issues;
}

// ───────────── redimensionare din mânere ─────────────

export type ResizeHandle = 'w+' | 'w-' | 'd+' | 'd-' | 'h';

/** Mânerele disponibile: obiectele de perete nu își schimbă adâncimea (rămân lipite); dimensiunile fixe (min = max) nu au mâner. */
export function availableHandles(item: CatalogItem): ResizeHandle[] {
  const L = item.sizeLimits;
  const out: ResizeHandle[] = [];
  if (L.widthMm.min < L.widthMm.max) out.push('w+', 'w-');
  if (item.mounting !== 'wall' && L.depthMm.min < L.depthMm.max) out.push('d+', 'd-');
  if (L.heightMm.min < L.heightMm.max) out.push('h');
  return out;
}

export interface ResizeResult {
  size: ObjectSize;
  position: Pt;
}
const clampTo = (v: number, r: { min: number; max: number }): number =>
  Math.max(r.min, Math.min(r.max, v));

/**
 * Dimensiunile/poziția după tragerea unui mâner. `local` = poziția cursorului pe podea în cadrul obiectului (mm față de
 * centru, pe axele lui: x = lățime, y = adâncime); pentru `h`, `local.y` e cota cursorului (mm față de podea). Marginea opusă
 * rămâne pe loc; dimensiunile se limitează la catalog și se rotunjesc la `stepMm`. `proportional` scalează și celelalte
 * dimensiuni cu același factor (în limitele lor).
 */
export function resizeFromHandle(
  obj: PlacedObject,
  item: CatalogItem,
  handle: ResizeHandle,
  local: Pt,
  opts: { stepMm?: number | null; proportional?: boolean; ceilingMm?: number } = {},
): ResizeResult | null {
  if (!availableHandles(item).includes(handle)) return null;
  const L = item.sizeLimits;
  const step = opts.stepMm && opts.stepMm > 0 ? opts.stepMm : 1;
  const r = (v: number) => Math.round(v / step) * step;
  const s = obj.size;
  let w = s.widthMm,
    d = s.depthMm,
    h = s.heightMm;
  let shiftX = 0,
    shiftY = 0;

  const dim = handle[0] as 'w' | 'd' | 'h';
  const old = dim === 'w' ? w : dim === 'd' ? d : h;
  let target: number;
  if (handle === 'w+') target = local.x + w / 2;
  else if (handle === 'w-') target = w / 2 - local.x;
  else if (handle === 'd+') target = local.y + d / 2;
  else if (handle === 'd-') target = d / 2 - local.y;
  else
    target =
      item.mounting === 'ceiling'
        ? (opts.ceilingMm ?? obj.elevationMm + h) - local.y
        : local.y - obj.elevationMm;
  const range = dim === 'w' ? L.widthMm : dim === 'd' ? L.depthMm : L.heightMm;
  let next = clampTo(r(target), range);

  if (opts.proportional) {
    const f = next / old;
    const lo = Math.max(L.widthMm.min / w, L.depthMm.min / d, L.heightMm.min / h);
    const hi = Math.min(L.widthMm.max / w, L.depthMm.max / d, L.heightMm.max / h);
    const ff = Math.max(lo, Math.min(hi, f));
    w = clampTo(Math.round(w * ff), L.widthMm);
    d = item.mounting === 'wall' ? d : clampTo(Math.round(d * ff), L.depthMm);
    h = clampTo(Math.round(h * ff), L.heightMm);
    next = dim === 'w' ? w : dim === 'd' ? d : h;
  } else if (dim === 'w') w = next;
  else if (dim === 'd') d = next;
  else h = next;

  if (handle === 'w+') shiftX = (w - s.widthMm) / 2;
  else if (handle === 'w-') shiftX = -(w - s.widthMm) / 2;
  else if (handle === 'd+') shiftY = (d - s.depthMm) / 2;
  else if (handle === 'd-') shiftY = -(d - s.depthMm) / 2;
  const c = Math.cos(rad(obj.rotationDeg));
  const sn = Math.sin(rad(obj.rotationDeg));
  return {
    size: { widthMm: w, depthMm: d, heightMm: h },
    position: {
      x: Math.round(obj.position.x + shiftX * c - shiftY * sn),
      y: Math.round(obj.position.y + shiftX * sn + shiftY * c),
    },
  };
}
