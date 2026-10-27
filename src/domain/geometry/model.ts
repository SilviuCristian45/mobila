// Analiza geometrică a unui document: îmbinări, amprente, interioare de camere și validare controlată.
// Datele care depășesc limitele MVP sunt RESPINSE cu coduri explicite, nu calculate „cumva”.
import type { ProjectDocument, Room, WallSide } from '../schema';
import { isSimplePolygon, polygonArea, signedArea, segmentsCrossProperly } from './polygon';
import {
  add,
  dot,
  distToSegment,
  EPS,
  intersectLines,
  leftNormal,
  len,
  mul,
  rightNormal,
  sub,
  type Pt,
} from './vec';
import {
  MIN_WALL_ANGLE_DEG,
  computeJoins,
  incidentWalls,
  validateOpeningsOnWall,
  wallFootprint,
  type Joins,
  type WallFootprint,
} from './walls';

/** Peste această limită validarea pereche-cu-pereche (O(n²)) este refuzată. */
export const MAX_WALLS_FOR_VALIDATION = 3000;

export type GeometryIssueCode =
  | 'too-many-walls'
  | 'node-missing'
  | 'level-count'
  | 'wall-degenerate'
  | 'wall-duplicate'
  | 'nodes-coincide'
  | 'wall-crossing'
  | 'node-on-wall'
  | 'wall-angle-too-sharp'
  | 'wall-too-short-for-joins'
  | 'room-loop-invalid'
  | 'room-wall-missing'
  | 'room-wall-reused'
  | 'room-not-simple'
  | 'room-collapsed'
  | 'opening-wall-missing'
  | 'opening-out-of-range'
  | 'opening-overlap'
  | 'opening-too-tall';

export interface GeometryIssue {
  code: GeometryIssueCode;
  path: string;
  message: string;
}

export interface RoomEdge {
  wallId: string;
  /** Fața peretelui orientată spre interiorul camerei (în cadrul peretelui start→end). */
  side: WallSide;
  /** Capetele laturii interioare (după îmbinări). */
  start: Pt;
  end: Pt;
  lengthMm: number;
}

export interface RoomInterior {
  roomId: string;
  polygon: Pt[];
  edges: RoomEdge[];
  areaMm2: number;
  /** Bucla de noduri e orară pe ecran (aria semnată > 0)? */
  clockwise: boolean;
}

export interface GeometryModel {
  joins: Joins;
  footprints: Map<string, WallFootprint>;
  rooms: Map<string, RoomInterior>;
  issues: GeometryIssue[];
}

export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

type InteriorResult =
  { ok: true; value: RoomInterior } | { ok: false; issue: Omit<GeometryIssue, 'path'> };

/** Poligonul interior al camerei (A.2): decalare cu t/2 spre interior, intersecții consecutive, treaptă la grosimi diferite. */
export function computeRoomInterior(
  doc: ProjectDocument,
  room: Room,
  wallByPair: ReadonlyMap<string, string>,
): InteriorResult {
  const pts: Pt[] = [];
  for (const id of room.nodeLoop) {
    const n = doc.nodes[id];
    if (!n) return { ok: false, issue: { code: 'node-missing', message: `nod inexistent: ${id}` } };
    pts.push({ x: n.x, y: n.y });
  }
  if (new Set(room.nodeLoop).size !== room.nodeLoop.length) {
    return {
      ok: false,
      issue: { code: 'room-loop-invalid', message: 'noduri repetate în bucla camerei' },
    };
  }
  const axisArea = signedArea(pts);
  if (Math.abs(axisArea) < EPS) {
    return {
      ok: false,
      issue: { code: 'room-loop-invalid', message: 'bucla camerei are arie zero' },
    };
  }
  if (!isSimplePolygon(pts)) {
    return {
      ok: false,
      issue: { code: 'room-not-simple', message: 'axele camerei se autointersectează' },
    };
  }
  const cw = axisArea > 0;
  const n = pts.length;
  const usedWalls = new Set<string>();
  const edges = [];
  for (let i = 0; i < n; i++) {
    const a = room.nodeLoop[i]!;
    const b = room.nodeLoop[(i + 1) % n]!;
    const wallId = wallByPair.get(pairKey(a, b));
    if (!wallId)
      return {
        ok: false,
        issue: { code: 'room-wall-missing', message: `lipsește peretele între ${a} și ${b}` },
      };
    if (usedWalls.has(wallId))
      return {
        ok: false,
        issue: {
          code: 'room-wall-reused',
          message: `peretele ${wallId} apare de două ori în buclă`,
        },
      };
    usedWalls.add(wallId);
    const wall = doc.walls[wallId]!;
    const p = pts[i]!;
    const q = pts[(i + 1) % n]!;
    const v = sub(q, p);
    const u = mul(v, 1 / len(v));
    edges.push({
      wall,
      p,
      u,
      t: wall.thicknessMm,
      nrm: cw ? rightNormal(u) : leftNormal(u),
      aligned: wall.startNodeId === a,
    });
  }
  const inAt: Pt[] = [];
  const outAt: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = edges[(i - 1 + n) % n]!;
    const b = edges[i]!;
    if (dot(a.u, b.u) < -1 + 1e-9) {
      return {
        ok: false,
        issue: { code: 'room-loop-invalid', message: 'întoarcere de 180° în buclă' },
      };
    }
    const node = b.p;
    const pa = add(node, mul(a.nrm, a.t / 2));
    const pb = add(node, mul(b.nrm, b.t / 2));
    const P = intersectLines(pa, a.u, pb, b.u);
    if (P) {
      inAt.push(P);
      outAt.push(P);
    } else if (a.t === b.t) {
      inAt.push(pb);
      outAt.push(pb);
    } else {
      inAt.push(pa); // treaptă: perpendiculară pe axă exact în nod
      outAt.push(pb);
    }
  }
  const polygon: Pt[] = [];
  for (let i = 0; i < n; i++) {
    polygon.push(inAt[i]!);
    if (inAt[i] !== outAt[i]) polygon.push(outAt[i]!);
  }
  const roomEdges: RoomEdge[] = edges.map((e, i) => {
    const start = outAt[i]!;
    const end = inAt[(i + 1) % n]!;
    const interiorIsRightOfTraversal = cw;
    const rightOfWall = e.aligned ? interiorIsRightOfTraversal : !interiorIsRightOfTraversal;
    return {
      wallId: e.wall.id,
      side: rightOfWall ? 'right' : 'left',
      start,
      end,
      lengthMm: dot(sub(end, start), e.u),
    };
  });
  const interiorSigned = signedArea(polygon);
  const collapsed =
    roomEdges.some((e) => e.lengthMm <= 1e-6) ||
    Math.sign(interiorSigned) !== Math.sign(axisArea) ||
    Math.abs(interiorSigned) >= Math.abs(axisArea) ||
    !isSimplePolygon(polygon);
  if (collapsed) {
    return {
      ok: false,
      issue: {
        code: 'room-collapsed',
        message: 'grosimile pereților consumă camera (latură interioară ≤ 0 sau contur invalid)',
      },
    };
  }
  return {
    ok: true,
    value: {
      roomId: room.id,
      polygon,
      edges: roomEdges,
      areaMm2: polygonArea(polygon),
      clockwise: cw,
    },
  };
}

/** Analiza completă; nu aruncă. Dacă există probleme, `issues` nu e gol, iar calculele din aval trebuie refuzate. */
export function analyzeGeometry(doc: ProjectDocument): GeometryModel {
  const issues: GeometryIssue[] = [];
  const add_ = (code: GeometryIssueCode, path: string, message: string) =>
    issues.push({ code, path, message });
  const empty: GeometryModel = {
    joins: new Map(),
    footprints: new Map(),
    rooms: new Map(),
    issues,
  };

  if (Object.keys(doc.levels).length !== 1)
    add_('level-count', 'levels', 'MVP cere exact un nivel');
  const walls = Object.values(doc.walls);
  if (walls.length > MAX_WALLS_FOR_VALIDATION) {
    add_(
      'too-many-walls',
      'walls',
      `peste ${MAX_WALLS_FOR_VALIDATION} de pereți: validarea geometrică este refuzată (limită MVP)`,
    );
    return empty;
  }

  // 1) structură de bază: noduri, pereți degenerați/dubluri
  const wallByPair = new Map<string, string>();
  let structural = true;
  for (const w of walls) {
    const a = doc.nodes[w.startNodeId];
    const b = doc.nodes[w.endNodeId];
    if (!a || !b) {
      add_('node-missing', `walls.${w.id}`, 'nod inexistent');
      structural = false;
      continue;
    }
    if (w.startNodeId === w.endNodeId || (a.x === b.x && a.y === b.y)) {
      add_('wall-degenerate', `walls.${w.id}`, 'lungime zero');
      structural = false;
      continue;
    }
    const key = pairKey(w.startNodeId, w.endNodeId);
    if (wallByPair.has(key)) {
      add_(
        'wall-duplicate',
        `walls.${w.id}`,
        `există deja un perete între aceleași noduri (${wallByPair.get(key)})`,
      );
      structural = false;
    } else wallByPair.set(key, w.id);
  }
  const nodes = Object.values(doc.nodes);
  const seenPos = new Map<string, string>();
  for (const nd of nodes) {
    const k = `${nd.x},${nd.y}`;
    if (seenPos.has(k))
      add_('nodes-coincide', `nodes.${nd.id}`, `nod în aceeași poziție cu ${seenPos.get(k)}`);
    else seenPos.set(k, nd.id);
  }
  if (!structural) return empty;

  // 2) pereți care se încrucișează / noduri pe pereți
  const seg = (w: (typeof walls)[number]) => ({
    a: doc.nodes[w.startNodeId]!,
    b: doc.nodes[w.endNodeId]!,
  });
  for (let i = 0; i < walls.length; i++) {
    const wi = walls[i]!;
    const si = seg(wi);
    for (let j = i + 1; j < walls.length; j++) {
      const wj = walls[j]!;
      const sj = seg(wj);
      const share = [wi.startNodeId, wi.endNodeId].some(
        (id) => id === wj.startNodeId || id === wj.endNodeId,
      );
      if (share) continue;
      if (segmentsCrossProperly(si.a, si.b, sj.a, sj.b))
        add_('wall-crossing', `walls.${wi.id}`, `se încrucișează cu ${wj.id} fără nod comun`);
    }
    for (const nd of nodes) {
      if (nd.id === wi.startNodeId || nd.id === wi.endNodeId) continue;
      if (distToSegment(nd, si.a, si.b) < 1)
        add_('node-on-wall', `nodes.${nd.id}`, `nodul stă pe peretele ${wi.id} fără să-l împartă`);
    }
  }

  // 3) unghiuri între pereți la același nod
  const incidents = incidentWalls(doc);
  const minRad = (MIN_WALL_ANGLE_DEG * Math.PI) / 180;
  for (const [nodeId, incs] of incidents) {
    if (incs.length < 2) continue;
    for (let k = 0; k < incs.length; k++) {
      const a = incs[k]!;
      const b = incs[(k + 1) % incs.length]!;
      const gap =
        (((b.angle - a.angle) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI;
      if (incs.length > 1 && gap < minRad) {
        add_(
          'wall-angle-too-sharp',
          `nodes.${nodeId}`,
          `unghi < ${MIN_WALL_ANGLE_DEG}° între ${a.wall.id} și ${b.wall.id}`,
        );
      }
    }
  }
  if (issues.length > 0) return empty;

  // 4) îmbinări, amprente
  const joins = computeJoins(doc, incidents);
  const footprints = new Map<string, WallFootprint>();
  for (const w of walls) {
    const fp = wallFootprint(doc, joins, w);
    footprints.set(w.id, fp);
    if (fp.left.s1 - fp.left.s0 <= 0 || fp.right.s1 - fp.right.s0 <= 0) {
      add_(
        'wall-too-short-for-joins',
        `walls.${w.id}`,
        'peretele este prea scurt pentru grosimile îmbinărilor',
      );
    }
  }

  // 5) camere
  const rooms = new Map<string, RoomInterior>();
  for (const room of Object.values(doc.rooms)) {
    const r = computeRoomInterior(doc, room, wallByPair);
    if (r.ok) rooms.set(room.id, r.value);
    else issues.push({ ...r.issue, path: `rooms.${room.id}` });
  }

  // 6) goluri
  const byWall = new Map<string, (typeof doc.openings)[string][]>();
  for (const o of Object.values(doc.openings)) {
    if (!doc.walls[o.wallId]) {
      add_('opening-wall-missing', `openings.${o.id}`, 'perete inexistent');
      continue;
    }
    const list = byWall.get(o.wallId);
    if (list) list.push(o);
    else byWall.set(o.wallId, [o]);
  }
  for (const [wallId, list] of byWall) {
    const fp = footprints.get(wallId);
    if (!fp) continue;
    for (const i of validateOpeningsOnWall(doc, fp, list)) {
      const code =
        i.code === 'out-of-range'
          ? 'opening-out-of-range'
          : i.code === 'overlap'
            ? 'opening-overlap'
            : 'opening-too-tall';
      add_(code, `openings.${i.openingId}`, `gol invalid: ${i.code}`);
    }
  }
  return { joins, footprints, rooms, issues };
}
