// Obiectele rămân în camera lor când conturul camerei se schimbă (Etapa 9b): o cameră vecină deformată prin mutarea unui
// perete comun, o latură mutată, o redimensionare sau un nod tras nu trebuie să lase mobilierul „în aer”, în afara camerei.
// Pură: întoarce un document nou (sau pe cel primit, dacă nimic nu trebuie mutat).
import { analyzeGeometry, pointInPolygon, signedArea, type Pt } from '../geometry';
import type { ProjectDocument } from '../schema';

/** Marja (mm) la care ajunge centrul unui obiect scos înapoi în cameră: jumătate din latura lui mai mică, între 50 și 600. */
const marginOf = (widthMm: number, depthMm: number): number =>
  Math.min(600, Math.max(50, Math.min(widthMm, depthMm) / 2));

/** Punctul de pe conturul `poly` cel mai apropiat de `p`, cu normala INTERIOARĂ a laturii pe care se află. */
function nearestOnBoundary(p: Pt, poly: readonly Pt[]): { q: Pt; inward: Pt } {
  const inwardSign = signedArea(poly) > 0 ? 1 : -1; // orar pe ecran: interiorul e la dreapta laturii
  let best: { q: Pt; inward: Pt } = { q: poly[0]!, inward: { x: 0, y: 0 } };
  let bestD = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const q = { x: a.x + t * dx, y: a.y + t * dy };
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < bestD) {
      bestD = d;
      const len = Math.sqrt(len2);
      best = { q, inward: { x: (-inwardSign * dy) / len, y: (inwardSign * dx) / len } };
    }
  }
  return best;
}

/**
 * Obiectele care erau într-o cameră în `before` și nu mai sunt în ea în `after` (conturul ei s-a schimbat) sunt aduse
 * înapoi: centrul trece pe cel mai apropiat punct al noului contur, împins spre interior cu o marjă. Obiectele care nu
 * erau în nicio cameră sau care sunt încă înăuntru rămân neatinse; dacă geometria rezultată nu se poate calcula,
 * documentul rămâne cum e (îl respinge oricum commit-ul).
 */
export function keepObjectsInRooms(
  before: ProjectDocument,
  after: ProjectDocument,
): ProjectDocument {
  const objects = Object.values(after.objects);
  if (objects.length === 0) return after;
  const rooms = (d: ProjectDocument) => analyzeGeometry(d).rooms;
  const was = rooms(before);
  const now = rooms(after);
  if (was.size === 0 || now.size === 0) return after;
  let next: ProjectDocument | null = null;
  for (const o of objects) {
    const orig = before.objects[o.id];
    if (!orig) continue;
    const home = [...was.values()].find((r) => pointInPolygon(orig.position, r.polygon));
    const poly = home && now.get(home.roomId)?.polygon;
    if (!poly || pointInPolygon(o.position, poly)) continue;
    const { q, inward } = nearestOnBoundary(o.position, poly);
    const m = marginOf(o.size.widthMm, o.size.depthMm);
    const position = { x: Math.round(q.x + inward.x * m), y: Math.round(q.y + inward.y * m) };
    next ??= { ...after, objects: { ...after.objects } };
    const moved = { ...o, position };
    delete moved.wallId; // movimentul liber desprinde obiectul de perete (ca la `updateObject`)
    next.objects[o.id] = moved;
  }
  return next ?? after;
}
