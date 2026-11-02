// Gesturile cu pointerul pe planul 2D: apăsări pe fundal / noduri / pereți / camere / obiecte / goluri / mânere, mișcare, eliberare,
// anulare. Gesturile lucrează pe un document temporar (`drag`) și confirmă O SINGURĂ dată, la eliberare. Mutat din
// `PlanEditor.tsx` fără schimbări de comportament (audit F-16).
import type {
  Dispatch,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  RefObject,
  SetStateAction,
} from 'react';
import {
  addWall,
  dot,
  moveNode,
  moveObjects,
  moveRoom,
  moveRoomEdge,
  openingCenterRange,
  rectInteriorSize,
  resizeRoomSide,
  roomEdges,
  updateObject,
  updateOpening,
  wallFrame,
  type ProjectDocument,
  type Result,
} from '@/domain';
import type { ProjectSession } from '@/state/session';
import type { CanvasHandlers } from './PlanCanvas';
import { DRAG_THRESHOLD_PX, OPENING_STEP_MM, SNAP_RADIUS_PX, type Gesture } from './editorSupport';
import type { Drag, Notice, RoomPreset, Selection, Tool, WallDraft } from './types';
import { nearestNode, snapToGrid, toWorld, type View } from './view';

export interface CanvasHandlersContext {
  svgRef: RefObject<SVGSVGElement | null>;
  view: View;
  setView: Dispatch<SetStateAction<View>>;
  autoFit: MutableRefObject<boolean>;
  grid: number;
  doc: ProjectDocument;
  session: ProjectSession;
  genId: () => string;
  editable: boolean;
  tool: Tool;
  draft: WallDraft | null;
  setDraft: (d: WallDraft | null) => void;
  setNotice: Dispatch<SetStateAction<Notice | null>>;
  runNotice: (label: string, op: (d: ProjectDocument) => Result<ProjectDocument>) => boolean;
  selection: Selection;
  setSelection: (s: Selection) => void;
  groupIds: string[];
  groupSet: ReadonlySet<string>;
  onSelectObject?: (id: string | null) => void;
  setExtraIds: (ids: string[], owner: string | null) => void;
  placing: RoomPreset | null;
  dropGhost: () => void;
  gesture: MutableRefObject<Gesture | null>;
  dragRef: MutableRefObject<Drag | null>;
  setDrag: (d: Drag | null) => void;
}

export function useCanvasHandlers(ctx: CanvasHandlersContext): CanvasHandlers {
  const {
    svgRef,
    view,
    setView,
    autoFit,
    grid,
    doc,
    session,
    genId,
    editable,
    tool,
    draft,
    setDraft,
    setNotice,
    runNotice,
    selection,
    setSelection,
    groupIds,
    groupSet,
    onSelectObject,
    setExtraIds,
    placing,
    dropGhost,
    gesture,
    dragRef,
    setDrag,
  } = ctx;
  const worldOf = (e: { clientX: number; clientY: number }) => {
    const rect = svgRef.current?.getBoundingClientRect();
    return toWorld(view, e.clientX - (rect?.left ?? 0), e.clientY - (rect?.top ?? 0));
  };
  const snapPoint = (e: { clientX: number; clientY: number; altKey: boolean }) => {
    const w = worldOf(e);
    return e.altKey ? { x: Math.round(w.x), y: Math.round(w.y) } : snapToGrid(w, grid);
  };
  const capture = (e: ReactPointerEvent<Element>) => {
    try {
      svgRef.current?.setPointerCapture?.(e.pointerId);
    } catch {
      /* indisponibil (ex. test) — gestul funcționează și fără captare */
    }
  };

  /** Capătul propus pentru perete: nod existent aproape de cursor, altfel punctul de pe grilă. */
  const wallEndpoint = (e: { clientX: number; clientY: number; altKey: boolean }) => {
    const w = worldOf(e);
    const hit = nearestNode(Object.values(doc.nodes), w, SNAP_RADIUS_PX / view.zoom);
    if (hit) return { ref: { nodeId: hit.id }, at: { x: hit.x, y: hit.y }, snapNodeId: hit.id };
    const at = snapPoint(e);
    return { ref: { x: at.x, y: at.y }, at, snapNodeId: null };
  };

  const wallToolClick = (e: { clientX: number; clientY: number; altKey: boolean }) => {
    if (!editable) return;
    const end = wallEndpoint(e);
    if (!draft) {
      setDraft({ start: end.ref, from: end.at, to: end.at, snapNodeId: end.snapNodeId });
      setNotice(null);
      return;
    }
    if (draft.from.x === end.at.x && draft.from.y === end.at.y) return;
    let wallId: string | null = null;
    const ok = runNotice('Adaugă perete', (d) => {
      const r = addWall(d, draft.start, end.ref, genId);
      if (!r.ok) return r;
      wallId = r.value.wallId;
      return { ok: true, value: r.value.doc };
    });
    if (!ok || !wallId) return; // mesajul de eroare e afișat; firul rămâne, utilizatorul alege alt punct
    const created = session.getState().doc.walls[wallId];
    setSelection({ kind: 'wall', id: wallId });
    // lanț: următorul perete pornește din capătul celui creat
    if (created) {
      const n = session.getState().doc.nodes[created.endNodeId];
      if (n)
        setDraft({
          start: { nodeId: n.id },
          from: { x: n.x, y: n.y },
          to: { x: n.x, y: n.y },
          snapNodeId: n.id,
        });
    } else setDraft(null);
  };

  const handlers: CanvasHandlers = {
    onBackgroundDown: (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      if (placing) {
        if (e.button === 0) dropGhost();
        return;
      }
      if (tool === 'wall' && e.button === 0) return wallToolClick(e);
      setSelection(null);
      onSelectObject?.(null);
      setExtraIds([], null);
      setNotice(null);
      gesture.current = { type: 'pan', startX: e.clientX, startY: e.clientY, view };
      capture(e);
    },
    onEdgeDown: (roomId, index, e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (placing || !editable) return;
      const edges = roomEdges(doc, roomId);
      const edge = edges.ok ? edges.value[index] : undefined;
      if (!edge) return;
      gesture.current = {
        type: 'edge',
        roomId,
        index,
        startX: e.clientX,
        startY: e.clientY,
        grab: worldOf(e),
        normal: edge.normal,
        active: false,
      };
      capture(e);
    },
    onSideDown: (roomId, side, e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (placing || !editable) return;
      const size = rectInteriorSize(doc, roomId);
      if (!size.ok) return;
      gesture.current = {
        type: 'side',
        roomId,
        side,
        startX: e.clientX,
        startY: e.clientY,
        grab: worldOf(e),
        startLengthMm: side === 'n' || side === 's' ? size.value.depthMm : size.value.widthMm,
        active: false,
      };
      capture(e);
    },
    onElementDown: (kind, id, e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (placing) return dropGhost();
      if (tool === 'wall') return wallToolClick(e);
      setNotice(null);
      if (kind === 'object') {
        setSelection(null);
        const o = doc.objects[id];
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          // Shift / Ctrl + clic: adaugă sau scoate obiectul din selecție (fără tragere)
          if (groupSet.has(id)) {
            const rest = groupIds.filter((g) => g !== id);
            onSelectObject?.(rest[0] ?? null);
            setExtraIds(rest.slice(1), rest[0] ?? null);
          } else {
            onSelectObject?.(id);
            setExtraIds(groupIds, id);
          }
          return;
        }
        // clic pe un membru al unui grup: grupul rămâne selectat și se trage împreună
        const inGroup = groupSet.has(id) && groupIds.length > 1;
        onSelectObject?.(id);
        setExtraIds(inGroup ? groupIds.filter((g) => g !== id) : [], id);
        if (!editable || !o) return;
        const w = worldOf(e);
        gesture.current = {
          type: 'object',
          groupIds: inGroup ? groupIds : undefined,
          objectId: id,
          startX: e.clientX,
          startY: e.clientY,
          grab: { x: w.x - o.position.x, y: w.y - o.position.y },
          active: false,
        };
        capture(e);
        return;
      }
      setSelection({ kind, id });
      if (!editable) return;
      if (kind === 'node')
        gesture.current = {
          type: 'node',
          nodeId: id,
          startX: e.clientX,
          startY: e.clientY,
          active: false,
        };
      else if (kind === 'opening')
        gesture.current = {
          type: 'opening',
          openingId: id,
          startX: e.clientX,
          startY: e.clientY,
          active: false,
        };
      else if (kind === 'room') {
        if (selection?.kind === 'room' && selection.id === id) {
          // camera deja selectată: tragerea ei o mută întreagă (cu obiectele din ea)
          const probe = moveRoom(doc, id, { x: 1, y: 0 });
          gesture.current = {
            type: 'room',
            roomId: id,
            startX: e.clientX,
            startY: e.clientY,
            grab: worldOf(e),
            blocked: probe.ok ? null : probe.error,
            active: false,
          };
        } else {
          // prima apăsare doar selectează; tragerea continuă să deplaseze planul (camerele sunt mari)
          autoFit.current = false;
          gesture.current = { type: 'pan', startX: e.clientX, startY: e.clientY, view };
        }
      } else return;
      capture(e);
    },
    onMove: (e) => {
      const g = gesture.current;
      if (!g) {
        if (tool === 'wall' && draft) {
          const end = wallEndpoint(e);
          setDraft({ ...draft, to: end.at, snapNodeId: end.snapNodeId });
        }
        return;
      }
      if (g.type === 'pan') {
        autoFit.current = false;
        setView({
          ...g.view,
          panX: g.view.panX + e.clientX - g.startX,
          panY: g.view.panY + e.clientY - g.startY,
        });
        return;
      }
      if (!g.active && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < DRAG_THRESHOLD_PX)
        return;
      g.active = true;
      if (g.type === 'node') {
        setDrag({ kind: 'node', nodeId: g.nodeId, to: snapPoint(e) });
      } else if (g.type === 'edge') {
        const w = worldOf(e);
        const along = (w.x - g.grab.x) * g.normal.x + (w.y - g.grab.y) * g.normal.y;
        const deltaMm = e.altKey ? Math.round(along) : Math.round(along / grid) * grid;
        setDrag({ kind: 'roomEdge', roomId: g.roomId, index: g.index, deltaMm });
      } else if (g.type === 'side') {
        const w = worldOf(e);
        // spre exterior = dimensiune mai mare: est/sud cresc cu deplasarea pozitivă, vest/nord cu cea negativă
        const along =
          g.side === 'e'
            ? w.x - g.grab.x
            : g.side === 'w'
              ? g.grab.x - w.x
              : g.side === 's'
                ? w.y - g.grab.y
                : g.grab.y - w.y;
        const raw = g.startLengthMm + along;
        const lengthMm = e.altKey ? Math.round(raw) : Math.round(raw / grid) * grid;
        setDrag({ kind: 'roomSide', roomId: g.roomId, side: g.side, lengthMm });
      } else if (g.type === 'room') {
        if (g.blocked) {
          setNotice({ tone: 'info', text: g.blocked });
          gesture.current = null;
          return;
        }
        const w = worldOf(e);
        const snap = (v: number) => (e.altKey ? Math.round(v) : Math.round(v / grid) * grid);
        setDrag({
          kind: 'room',
          roomId: g.roomId,
          delta: { x: snap(w.x - g.grab.x), y: snap(w.y - g.grab.y) },
        });
      } else if (g.type === 'object') {
        const w = worldOf(e);
        const at = { x: w.x - g.grab.x, y: w.y - g.grab.y };
        setDrag({
          kind: 'object',
          objectId: g.objectId,
          groupIds: g.groupIds,
          to: e.altKey ? { x: Math.round(at.x), y: Math.round(at.y) } : snapToGrid(at, grid),
        });
      } else {
        const o = doc.openings[g.openingId];
        const wall = o && doc.walls[o.wallId];
        if (!o || !wall) return;
        const frame = wallFrame(doc, wall);
        const w = worldOf(e);
        const s = dot({ x: w.x - frame.start.x, y: w.y - frame.start.y }, frame.d);
        let offset = Math.round(s / OPENING_STEP_MM) * OPENING_STEP_MM;
        const range = openingCenterRange(doc, wall.id, o.widthMm);
        if (range) offset = Math.min(range.max, Math.max(range.min, offset));
        setDrag({ kind: 'opening', openingId: g.openingId, offsetMm: offset });
      }
    },
    onUp: () => {
      const g = gesture.current;
      gesture.current = null;
      if (!g || g.type === 'pan') return;
      const finished = dragRef.current;
      setDrag(null);
      if (!finished || !g.active) return; // doar un clic: selecția a avut loc deja
      // O SINGURĂ scriere în document, la finalul gestului; dacă e respinsă, documentul rămâne neschimbat (revenire).
      if (finished.kind === 'node') {
        const { nodeId, to } = finished;
        const ok = runNotice('Mută nodul', (d) => moveNode(d, nodeId, to));
        if (!ok)
          setNotice((n) =>
            n ? { ...n, text: `${n.text} Nodul a revenit la poziția anterioară.` } : n,
          );
      } else if (finished.kind === 'roomEdge') {
        const { roomId, index, deltaMm } = finished;
        const ok = runNotice('Mută latura camerei', (d) => moveRoomEdge(d, roomId, index, deltaMm));
        if (!ok)
          setNotice((n) =>
            n ? { ...n, text: `${n.text} Camera a revenit la dimensiunea anterioară.` } : n,
          );
      } else if (finished.kind === 'roomSide') {
        const { roomId, side, lengthMm } = finished;
        const ok = runNotice('Redimensionează camera', (d) =>
          resizeRoomSide(d, roomId, side, lengthMm),
        );
        if (!ok)
          setNotice((n) =>
            n ? { ...n, text: `${n.text} Camera a revenit la dimensiunea anterioară.` } : n,
          );
      } else if (finished.kind === 'room') {
        const { roomId, delta } = finished;
        const ok = runNotice('Mută camera', (d) => moveRoom(d, roomId, delta));
        if (!ok)
          setNotice((n) =>
            n ? { ...n, text: `${n.text} Camera a revenit la poziția anterioară.` } : n,
          );
      } else if (finished.kind === 'object') {
        const { objectId, to, groupIds: moved } = finished;
        const ok = moved
          ? runNotice(`Mută ${moved.length} obiecte`, (d) => {
              const from = d.objects[objectId]?.position ?? to;
              return moveObjects(d, moved, { x: to.x - from.x, y: to.y - from.y });
            })
          : runNotice('Mută obiectul', (d) => updateObject(d, objectId, { position: to }));
        if (!ok)
          setNotice((n) =>
            n
              ? {
                  ...n,
                  text: `${n.text} ${moved ? 'Obiectele au revenit' : 'Obiectul a revenit'} la poziția anterioară.`,
                }
              : n,
          );
      } else {
        const { openingId, offsetMm } = finished;
        const ok = runNotice('Mută golul', (d) => updateOpening(d, openingId, { offsetMm }));
        if (!ok)
          setNotice((n) =>
            n ? { ...n, text: `${n.text} Golul a revenit la poziția anterioară.` } : n,
          );
      }
    },
    onCancel: () => {
      gesture.current = null;
      setDrag(null);
    },
  };
  return handlers;
}
