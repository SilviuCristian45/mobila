// Camere cu pereți comuni (Etapa 8a): o cameră dreptunghiulară nouă REFOLOSEȘTE nodurile și pereții existenți care coincid
// cu ai ei și desparte pereții existenți prin colțurile ei (joncțiuni în T), ca două camere vecine să aibă UN singur
// perete între ele. Pure: întorc un document nou sau o eroare în română; ID-urile vin din `genId`.
import { cloneDocument } from '../factory';
import {
  analyzeGeometry,
  pairKey,
  pointInPolygon,
  rectAxesFromInterior,
  type Pt,
} from '../geometry';
import type { Result } from '../result';
import type { ProjectDocument } from '../schema';
import type { IdGenerator, NewRectRoom } from './types';

function freshId(genId: IdGenerator, taken: (id: string) => boolean): string | null {
  for (let i = 0; i < 50; i++) {
    const id = genId();
    if (!taken(id)) return id;
  }
  return null;
}

/** Poziția `p` față de segmentul a→b: `0` = în afara lui, `1` = pe el, strict în interior; `2` = într-un capăt. */
function onSegment(p: Pt, a: Pt, b: Pt): 0 | 1 | 2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx * (p.y - a.y) - dy * (p.x - a.x) !== 0) return 0;
  const along = dx * (p.x - a.x) + dy * (p.y - a.y);
  const len2 = dx * dx + dy * dy;
  if (along < 0 || along > len2) return 0;
  return along === 0 || along === len2 ? 2 : 1;
}

/**
 * Desparte un perete în două printr-un nod aflat pe el: peretele păstrează id-ul și devine primul segment, iar al doilea
 * segment e nou. Camerele care îl folosesc primesc nodul în buclă; golurile se mută pe segmentul care le conține
 * (refuzat dacă unul ar fi tăiat); atribuirile de finisaj ale fețelor se dublează pe noul segment.
 */
export function splitWall(
  next: ProjectDocument,
  wallId: string,
  nodeId: string,
  genId: IdGenerator,
): Result<{ newWallId: string }> {
  const wall = next.walls[wallId];
  const node = next.nodes[nodeId];
  const start = wall && next.nodes[wall.startNodeId];
  if (!wall || !node || !start) return { ok: false, error: 'Peretele de despărțit nu mai există.' };
  const newWallId = freshId(genId, (c) => c in next.walls);
  if (!newWallId) return { ok: false, error: 'Nu s-a putut genera un identificator nou.' };
  const dist = Math.hypot(node.x - start.x, node.y - start.y);

  // goluri: rămân pe primul segment, trec pe al doilea sau sunt tăiate
  for (const o of Object.values(next.openings)) {
    if (o.wallId !== wallId) continue;
    const lo = o.offsetMm - o.widthMm / 2;
    const hi = o.offsetMm + o.widthMm / 2;
    if (hi <= dist) continue;
    if (lo >= dist) {
      next.openings[o.id] = { ...o, wallId: newWallId, offsetMm: Math.round(o.offsetMm - dist) };
    } else {
      return {
        ok: false,
        error: `O ${o.type === 'door' ? 'ușă' : 'fereastră'} ar fi tăiată de peretele nou. Mut-o mai întâi.`,
      };
    }
  }
  next.walls[newWallId] = { ...wall, id: newWallId, startNodeId: nodeId };
  next.walls[wallId] = { ...wall, endNodeId: nodeId };
  // camerele care mergeau pe acest perete trec acum prin nod
  for (const room of Object.values(next.rooms)) {
    const loop = room.nodeLoop;
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i]!;
      const b = loop[(i + 1) % loop.length]!;
      if (pairKey(a, b) === pairKey(wall.startNodeId, wall.endNodeId)) {
        next.rooms[room.id] = {
          ...room,
          nodeLoop: [...loop.slice(0, i + 1), nodeId, ...loop.slice(i + 1)],
        };
        break;
      }
    }
  }
  // finisajele fețelor peretelui acoperă și al doilea segment
  for (const a of Object.values(next.finishAssignments)) {
    if (a.target.kind !== 'wallSide' || a.target.wallId !== wallId) continue;
    const id = freshId(genId, (c) => c in next.finishAssignments);
    if (!id) return { ok: false, error: 'Nu s-a putut genera un identificator nou.' };
    next.finishAssignments[id] = {
      ...JSON.parse(JSON.stringify(a)),
      id,
      target: { ...a.target, wallId: newWallId },
    };
  }
  return { ok: true, value: { newWallId } };
}

/**
 * Cameră dreptunghiulară nouă cu pereți comuni: colțurile care coincid cu noduri existente le refolosesc; un colț aflat
 * pe un perete existent îl desparte; nodurile existente aflate pe laturile camerei intră în bucla ei; între două noduri
 * consecutive se refolosește peretele existent sau se creează unul nou. Fără nicio coincidență, rezultatul e identic cu
 * `addRectRoom`. Validitatea geometrică completă o verifică commit-ul.
 */
export function addRectRoomShared(
  doc: ProjectDocument,
  spec: NewRectRoom,
  genId: IdGenerator,
): Result<{ doc: ProjectDocument; roomId: string }> {
  const levelId = Object.keys(doc.levels)[0];
  if (!levelId) return { ok: false, error: 'Proiectul nu are niciun nivel.' };
  const t = spec.thicknessMm ?? doc.settings.defaultWallThicknessMm;
  const axes = rectAxesFromInterior(
    spec.widthMm,
    spec.depthMm,
    { n: t, e: t, s: t, w: t },
    spec.anchor,
  );
  if (!axes.ok) return axes;
  // fără suprapuneri: geometria prinde pereții care se taie, dar nu o cameră cuprinsă într-alta sau una peste alta cu un
  // singur perete comun
  const [c0, , c2] = axes.value;
  const [x0, x1, y0, y1] = [c0.x, c2.x, c0.y, c2.y];
  const overlap = 'Camera ar suprapune o cameră sau alte elemente existente.';
  for (const room of analyzeGeometry(doc).rooms.values())
    if (axes.value.some((p) => pointInPolygon(p, room.polygon)))
      return { ok: false, error: overlap };
  for (const n of Object.values(doc.nodes))
    if (n.levelId === levelId && n.x > x0 && n.x < x1 && n.y > y0 && n.y < y1)
      return { ok: false, error: overlap };
  const next = cloneDocument(doc);
  const idErr = { ok: false as const, error: 'Nu s-a putut genera un identificator nou.' };

  // 1) colțurile: nod existent, nod nou pe un perete (îl desparte) sau nod nou liber
  const corners: string[] = [];
  for (const p of axes.value) {
    const same = Object.values(next.nodes).find(
      (n) => n.levelId === levelId && n.x === p.x && n.y === p.y,
    );
    if (same) {
      corners.push(same.id);
      continue;
    }
    const id = freshId(genId, (c) => c in next.nodes);
    if (!id) return idErr;
    next.nodes[id] = { id, levelId, x: p.x, y: p.y };
    const host = Object.values(next.walls).find((w) => {
      const a = next.nodes[w.startNodeId];
      const b = next.nodes[w.endNodeId];
      return a && b && w.levelId === levelId && onSegment(p, a, b) === 1;
    });
    if (host) {
      const split = splitWall(next, host.id, id, genId);
      if (!split.ok) return split;
    }
    corners.push(id);
  }

  // 2) laturile: colț → (noduri existente de pe latură, în ordine) → colț următor
  const loop: string[] = [];
  const edges: Array<[string, string]> = [];
  for (let i = 0; i < 4; i++) {
    const aId = corners[i]!;
    const bId = corners[(i + 1) % 4]!;
    const a = next.nodes[aId]!;
    const b = next.nodes[bId]!;
    const between = Object.values(next.nodes)
      .filter(
        (n) => n.levelId === levelId && n.id !== aId && n.id !== bId && onSegment(n, a, b) === 1,
      )
      .sort((m, n) => Math.hypot(m.x - a.x, m.y - a.y) - Math.hypot(n.x - a.x, n.y - a.y));
    const chain = [aId, ...between.map((n) => n.id), bId];
    loop.push(...chain.slice(0, -1));
    for (let k = 0; k + 1 < chain.length; k++) edges.push([chain[k]!, chain[k + 1]!]);
  }

  // 3) pereții: refolosiți unde există, noi în rest
  for (const [u, v] of edges) {
    const exists = Object.values(next.walls).some(
      (w) => pairKey(w.startNodeId, w.endNodeId) === pairKey(u, v),
    );
    if (exists) continue;
    const id = freshId(genId, (c) => c in next.walls);
    if (!id) return idErr;
    next.walls[id] = {
      id,
      levelId,
      startNodeId: u,
      endNodeId: v,
      thicknessMm: t,
      heightMm: next.settings.defaultWallHeightMm,
      baseOffsetMm: 0,
    };
  }
  const key = [...loop].sort().join('|');
  if (Object.values(next.rooms).some((r) => [...r.nodeLoop].sort().join('|') === key))
    return { ok: false, error: 'Există deja o cameră cu aceleași pereți.' };
  const roomId = freshId(genId, (c) => c in next.rooms);
  if (!roomId) return idErr;
  next.rooms[roomId] = {
    id: roomId,
    levelId,
    name: spec.name ?? `Cameră ${Object.keys(next.rooms).length + 1}`,
    type: 'other',
    nodeLoop: loop,
  };
  return { ok: true, value: { doc: next, roomId } };
}
