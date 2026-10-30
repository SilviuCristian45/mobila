'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  addOpening,
  addRectRoom,
  addWall,
  dot,
  duplicateObject,
  moveNode,
  openingCenterRange,
  removeObject,
  removeOpening,
  removeRoom,
  removeWall,
  roomDeletionImpact,
  updateObject,
  updateOpening,
  wallDeletionImpact,
  wallFrame,
  type OpeningType,
  type ProjectDocument,
  type Pt,
  type Result,
} from '@/domain';
import { formatLength } from '@/lib/format';
import { describeCommitFailure } from '@/lib/messages';
import { selectGeometry } from '@/state/selectors';
import type { CommitResult, ProjectSession, SessionState } from '@/state/session';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Alert } from '@/ui/feedback';
import { PlanCanvas, type CanvasHandlers } from './PlanCanvas';
import { PropertiesPanel, ROOM_TYPES, type RunEdit } from './PropertiesPanel';
import type { Drag, Notice, Selection, SelectionKind, Tool, WallDraft } from './types';
import {
  ZOOM_STEP,
  fitView,
  nearestNode,
  snapToGrid,
  toWorld,
  zoomAt,
  type Size,
  type View,
} from './view';

const DEFAULT_SIZE: Size = { w: 800, h: 560 };
/** Pragul (px) de la care o apăsare devine tragere. */
const DRAG_THRESHOLD_PX = 4;
/** Raza (px) de captare a nodurilor existente. */
const SNAP_RADIUS_PX = 12;
/** Pasul de poziționare al golurilor la tragere (mm). */
const OPENING_STEP_MM = 10;

const isTyping = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

type Gesture =
  | { type: 'pan'; startX: number; startY: number; view: View }
  | { type: 'node'; nodeId: string; startX: number; startY: number; active: boolean }
  | { type: 'opening'; openingId: string; startX: number; startY: number; active: boolean }
  | {
      type: 'object';
      objectId: string;
      startX: number;
      startY: number;
      /** Decalajul cursor → centrul obiectului la apăsare (fără salt la începutul tragerii). */
      grab: Pt;
      active: boolean;
    };

type Confirm = { title: string; description: string; label: string; action: () => string | null };

const defaultGenId = (): string => crypto.randomUUID().slice(0, 8);

function exists(doc: ProjectDocument, s: Selection): boolean {
  if (!s) return false;
  const table = { node: doc.nodes, wall: doc.walls, room: doc.rooms, opening: doc.openings }[
    s.kind
  ];
  return s.id in table;
}

const ELEMENT_LABEL: Record<SelectionKind, string> = {
  node: 'Nod',
  wall: 'Perete',
  room: 'Cameră',
  opening: 'Gol',
};

/**
 * Editorul 2D (Etapa 2b): plan SVG cu zoom/deplasare, selecție, tragere de noduri și goluri, desenare de pereți,
 * panou de proprietăți și comenzi de tastatură. Nu ține nimic din document: toate modificările trec prin
 * `session.apply` (validare completă, undo/redo, autosave). Gesturile (tragere) lucrează pe un document temporar
 * și confirmă O SINGURĂ dată, la final.
 */
export function PlanEditor({
  session,
  state,
  genId = defaultGenId,
  selectedObjectId: selectedObjectIdProp = null,
  onSelectObject,
  onSelectionChange,
  sidePanel,
}: {
  session: ProjectSession;
  state: SessionState;
  genId?: () => string;
  /** Obiectul selectat (starea de selecție a obiectelor e comună cu vizualizarea 3D și cu panoul de proprietăți). */
  selectedObjectId?: string | null;
  onSelectObject?: (id: string | null) => void;
  /** Raportează selecția de nod/perete/cameră/gol (folosită de panoul de materiale ca țintă sugerată). */
  onSelectionChange?: (s: Selection) => void;
  /** Conținut deasupra panoului de proprietăți (catalogul și proprietățile obiectului, compuse în `app/`). */
  sidePanel?: ReactNode;
}) {
  const { doc } = state;
  const editable = !state.readOnly && !state.conflict && state.status !== 'closed';

  const svgRef = useRef<SVGSVGElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>(DEFAULT_SIZE);
  const [view, setView] = useState<View>(() => fitView(Object.values(doc.nodes), DEFAULT_SIZE));
  const autoFit = useRef(true);
  const [selectionRaw, setSelection] = useState<Selection>(null);
  const [toolRaw, setToolRaw] = useState<Tool>('select');
  const [drag, setDragState] = useState<Drag | null>(null);
  /** Ultima poziție propusă de gest, citită SINCRON la eliberare (starea React poate fi încă neactualizată după ultimul pointermove). */
  const dragRef = useRef<Drag | null>(null);
  const setDrag = useCallback((d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  }, []);
  const [draftRaw, setDraft] = useState<WallDraft | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const gesture = useRef<Gesture | null>(null);

  // fără drept de editare nu există unealtă de desenare și nici fir în curs (derivat, nu efect)
  const tool: Tool = editable ? toolRaw : 'select';
  const draft = tool === 'wall' ? draftRaw : null;
  const setTool = useCallback((t: Tool) => {
    setToolRaw(t);
    setDraft(null);
  }, []);
  const selection = exists(doc, selectionRaw) ? selectionRaw : null;
  const selectedObjectId =
    selectedObjectIdProp && selectedObjectIdProp in doc.objects ? selectedObjectIdProp : null;
  const grid = doc.settings.gridMm;
  // o selecție de nod/perete/cameră/gol elimină selecția de obiect (și invers, în gesturi)
  useEffect(() => {
    if (selection) onSelectObject?.(null);
  }, [selection, onSelectObject]);
  useEffect(() => {
    onSelectionChange?.(selection);
  }, [selection, onSelectionChange]);

  // ───────────── document temporar în timpul gestului ─────────────
  const draftDoc = useMemo(() => {
    if (!drag) return doc;
    const r =
      drag.kind === 'node'
        ? moveNode(doc, drag.nodeId, drag.to)
        : drag.kind === 'object'
          ? updateObject(doc, drag.objectId, { position: drag.to })
          : updateOpening(doc, drag.openingId, { offsetMm: drag.offsetMm });
    return r.ok ? r.value : doc;
  }, [doc, drag]);
  const geometry = useMemo(() => selectGeometry(draftDoc), [draftDoc]);
  const issues = geometry.issues;

  // ───────────── vizualizare ─────────────
  const fit = useCallback(() => {
    autoFit.current = true;
    setView(fitView(Object.values(doc.nodes), size));
  }, [doc.nodes, size]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0 && el.clientHeight > 0)
        setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (autoFit.current) setView(fitView(Object.values(doc.nodes), size));
    // doar la schimbarea dimensiunii: modificările documentului nu mută planul sub mâna utilizatorului
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      autoFit.current = false;
      const rect = el.getBoundingClientRect();
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      setView((v) => zoomAt(v, factor, e.clientX - rect.left, e.clientY - rect.top));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      autoFit.current = false;
      setView((v) => zoomAt(v, factor, size.w / 2, size.h / 2));
    },
    [size],
  );

  // ───────────── modificări ─────────────
  const failure = (r: Extract<CommitResult, { ok: false }>): string =>
    r.reason === 'invalid' ? describeCommitFailure(r) : r.message;

  const run: RunEdit = useCallback(
    (label, operation) => {
      const r = session.apply(label, operation);
      return r.ok ? null : failure(r);
    },
    [session],
  );

  /** Ca `run`, dar raportează eșecul în banda de mesaje (pentru gesturi și taste, care nu au un câmp de formular). */
  const runNotice = useCallback(
    (label: string, operation: (d: ProjectDocument) => Result<ProjectDocument>): boolean => {
      const err = run(label, operation);
      setNotice(err ? { tone: 'error', text: err } : null);
      return err === null;
    },
    [run],
  );

  const addAndSelect = useCallback(
    <T extends { id: string }>(
      label: string,
      kind: SelectionKind,
      build: (d: ProjectDocument) => Result<{ doc: ProjectDocument } & T>,
    ): string | null => {
      let created: string | null = null;
      const err = run(label, (d) => {
        const r = build(d);
        if (!r.ok) return r;
        created = r.value.id;
        return { ok: true, value: r.value.doc };
      });
      if (err) return err;
      if (created) setSelection({ kind, id: created });
      setNotice(null);
      return null;
    },
    [run],
  );

  const onAddOpening = useCallback(
    (wallId: string, type: OpeningType) => {
      const err = addAndSelect(
        type === 'door' ? 'Adaugă ușă' : 'Adaugă fereastră',
        'opening',
        (d) => {
          const r = addOpening(d, wallId, type, genId);
          return r.ok ? { ok: true, value: { doc: r.value.doc, id: r.value.openingId } } : r;
        },
      );
      if (err) setNotice({ tone: 'error', text: err });
    },
    [addAndSelect, genId],
  );

  const onAddWall = useCallback(
    (v: { x1: number; y1: number; x2: number; y2: number }): string | null =>
      addAndSelect('Adaugă perete', 'wall', (d) => {
        const r = addWall(d, { x: v.x1, y: v.y1 }, { x: v.x2, y: v.y2 }, genId);
        return r.ok ? { ok: true, value: { doc: r.value.doc, id: r.value.wallId } } : r;
      }),
    [addAndSelect, genId],
  );

  const onAddRoom = useCallback(
    (v: { widthMm: number; depthMm: number; x: number; y: number }): string | null =>
      addAndSelect('Adaugă cameră', 'room', (d) => {
        const r = addRectRoom(
          d,
          { widthMm: v.widthMm, depthMm: v.depthMm, anchor: { x: v.x, y: v.y } },
          genId,
        );
        return r.ok ? { ok: true, value: { doc: r.value.doc, id: r.value.roomId } } : r;
      }),
    [addAndSelect, genId],
  );

  const deleteSelected = useCallback(() => {
    if (!editable) return;
    if (selectedObjectId) {
      const id = selectedObjectId;
      if (runNotice('Șterge obiect', (d) => removeObject(d, id))) onSelectObject?.(null);
      return;
    }
    if (!selection) return;
    if (selection.kind === 'node') {
      setNotice({
        tone: 'info',
        text: 'Un nod dispare singur când ștergi ultimul perete care îl folosește.',
      });
      return;
    }
    const { id } = selection;
    if (selection.kind === 'opening') {
      if (runNotice('Șterge gol', (d) => removeOpening(d, id))) setSelection(null);
      return;
    }
    if (selection.kind === 'wall') {
      const impact = wallDeletionImpact(doc, id);
      if (impact.rooms.length === 0) {
        if (runNotice('Șterge perete', (d) => removeWall(d, id))) setSelection(null);
        return;
      }
      const parts = [
        `camerele: ${impact.rooms.map((r) => r.name).join(', ')}`,
        impact.openings.length > 0 ? `${impact.openings.length} goluri` : null,
        impact.assignmentIds.length > 0 ? `${impact.assignmentIds.length} finisaje` : null,
      ].filter(Boolean);
      setConfirm({
        title: 'Ștergi peretele și camerele lui?',
        description: `Peretele face parte din ${impact.rooms.length === 1 ? 'o cameră' : 'mai multe camere'}, care nu mai pot exista fără el. Se șterg: ${parts.join('; ')}. Poți anula cu Ctrl+Z.`,
        label: 'Șterge',
        action: () => {
          const err = run('Șterge perete și camere', (d) =>
            removeWall(d, id, { removeRooms: true }),
          );
          if (!err) setSelection(null);
          return err;
        },
      });
      return;
    }
    const impact = roomDeletionImpact(doc, id);
    setConfirm({
      title: 'Ștergi camera?',
      description: `Pereții rămân în plan.${impact.assignmentIds.length > 0 ? ` Se șterg și ${impact.assignmentIds.length} finisaje atribuite camerei.` : ''} Poți anula cu Ctrl+Z.`,
      label: 'Șterge camera',
      action: () => {
        const err = run('Șterge cameră', (d) => removeRoom(d, id));
        if (!err) setSelection(null);
        return err;
      },
    });
  }, [selection, selectedObjectId, onSelectObject, editable, doc, run, runNotice]);

  const duplicateSelected = useCallback(() => {
    if (!editable || !selectedObjectId) return;
    const src = selectedObjectId;
    let created: string | null = null;
    const ok = runNotice('Duplică obiect', (d) => {
      const r = duplicateObject(d, src, genId);
      if (!r.ok) return r;
      created = r.value.objectId;
      return { ok: true, value: r.value.doc };
    });
    if (ok && created) onSelectObject?.(created);
  }, [editable, selectedObjectId, runNotice, genId, onSelectObject]);

  // ───────────── gesturi cu pointerul ─────────────
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
      if (tool === 'wall' && e.button === 0) return wallToolClick(e);
      setSelection(null);
      onSelectObject?.(null);
      setNotice(null);
      gesture.current = { type: 'pan', startX: e.clientX, startY: e.clientY, view };
      capture(e);
    },
    onElementDown: (kind, id, e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (tool === 'wall') return wallToolClick(e);
      setNotice(null);
      if (kind === 'object') {
        setSelection(null);
        onSelectObject?.(id);
        const o = doc.objects[id];
        if (!editable || !o) return;
        const w = worldOf(e);
        gesture.current = {
          type: 'object',
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
      else return;
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
      } else if (g.type === 'object') {
        const w = worldOf(e);
        const at = { x: w.x - g.grab.x, y: w.y - g.grab.y };
        setDrag({
          kind: 'object',
          objectId: g.objectId,
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
      } else if (finished.kind === 'object') {
        const { objectId, to } = finished;
        const ok = runNotice('Mută obiectul', (d) => updateObject(d, objectId, { position: to }));
        if (!ok)
          setNotice((n) =>
            n ? { ...n, text: `${n.text} Obiectul a revenit la poziția anterioară.` } : n,
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

  // ───────────── tastatură ─────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirm || e.defaultPrevented || isTyping(e.target) || e.altKey) return;
      if (e.ctrlKey || e.metaKey) {
        if ((e.key === 'd' || e.key === 'D') && selectedObjectId) {
          e.preventDefault();
          duplicateSelected();
        }
        return;
      }
      const k = e.key;
      const nudge = (dx: number, dy: number) => {
        const step = (e.shiftKey ? 10 : 1) * grid;
        if (!editable && (selection || selectedObjectId)) return;
        if (selectedObjectId) {
          const o = doc.objects[selectedObjectId];
          if (o)
            runNotice('Mută obiectul', (d) =>
              updateObject(d, o.id, {
                position: { x: o.position.x + dx * step, y: o.position.y + dy * step },
              }),
            );
        } else if (selection?.kind === 'node') {
          const n = doc.nodes[selection.id];
          if (n)
            runNotice('Mută nodul', (d) =>
              moveNode(d, n.id, { x: n.x + dx * step, y: n.y + dy * step }),
            );
        } else if (selection?.kind === 'opening') {
          const o = doc.openings[selection.id];
          if (o && dx !== 0) {
            runNotice('Mută golul', (d) =>
              updateOpening(d, o.id, { offsetMm: o.offsetMm + dx * step }),
            );
          }
        } else {
          autoFit.current = false;
          setView((v) => ({ ...v, panX: v.panX - dx * 60, panY: v.panY - dy * 60 }));
        }
      };
      let handled = true;
      if (k === 'Delete' || k === 'Backspace') deleteSelected();
      else if (k === 'Escape') {
        if (gesture.current || drag) {
          gesture.current = null;
          setDrag(null);
        } else if (draft) setDraft(null);
        else if (tool === 'wall') setTool('select');
        else if (selection) setSelection(null);
        else if (selectedObjectId) onSelectObject?.(null);
        else handled = false;
      } else if ((k === 'r' || k === 'R') && selectedObjectId && editable) {
        const o = doc.objects[selectedObjectId];
        if (o)
          runNotice('Rotește obiectul', (d) =>
            updateObject(d, o.id, { rotationDeg: o.rotationDeg + (e.shiftKey ? -90 : 90) }),
          );
      } else if (k === 'ArrowLeft') nudge(-1, 0);
      else if (k === 'ArrowRight') nudge(1, 0);
      else if (k === 'ArrowUp') nudge(0, -1);
      else if (k === 'ArrowDown') nudge(0, 1);
      else if (k === '+' || k === '=') zoomBy(ZOOM_STEP);
      else if (k === '-' || k === '_') zoomBy(1 / ZOOM_STEP);
      else if (k === '0') fit();
      else if (k === 'v' || k === 'V') setTool('select');
      else if ((k === 'w' || k === 'W') && editable) setTool('wall');
      else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    setTool,
    setDrag,
    confirm,
    doc,
    drag,
    draft,
    editable,
    fit,
    grid,
    deleteSelected,
    duplicateSelected,
    onSelectObject,
    runNotice,
    selection,
    selectedObjectId,
    tool,
    zoomBy,
  ]);

  // ───────────── afișare ─────────────
  const unit = doc.settings.displayUnit;
  const wallList = Object.values(doc.walls);
  const roomList = Object.values(doc.rooms);
  const openingList = Object.values(doc.openings);
  const invalidLive = drag && issues.length > 0;
  const statusLine = state.readOnly
    ? {
        tone: 'warning' as const,
        text: 'Doar citire: proiectul nu poate fi modificat în acest tab.',
      }
    : state.conflict
      ? {
          tone: 'error' as const,
          text: 'Conflict de versiuni: editarea e oprită până rezolvi conflictul (vezi mesajul de mai sus).',
        }
      : state.status === 'closed'
        ? { tone: 'warning' as const, text: 'Sesiunea s-a încheiat.' }
        : state.error
          ? {
              tone: 'error' as const,
              text: 'Salvarea a eșuat; modificările rămân în memorie. Poți continua sau exporta o copie.',
            }
          : state.status === 'saving'
            ? { tone: 'info' as const, text: 'Se salvează…' }
            : null;
  const toneClass = {
    info: 'border-sky-300 bg-sky-50 text-sky-900',
    warning: 'border-amber-300 bg-amber-50 text-amber-900',
    error: 'border-red-300 bg-red-50 text-red-900',
    success: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  };

  return (
    <section
      aria-label="Editor plan 2D"
      className="space-y-3"
      data-testid="plan-editor"
      data-editable={editable}
    >
      {statusLine ? (
        <p
          role="status"
          data-testid="plan-status"
          className={`rounded-lg border px-3 py-2 text-sm ${toneClass[statusLine.tone]}`}
        >
          {statusLine.text}
        </p>
      ) : null}

      {issues.length > 0 && !drag ? (
        <Alert tone="error" title="Planul conține probleme geometrice" testId="plan-invalid">
          <ul className="list-disc pl-5">
            {issues.slice(0, 5).map((i) => (
              <li key={`${i.code}-${i.path}`}>{i.message}</li>
            ))}
          </ul>
          {issues.length > 5 ? <p>… și încă {issues.length - 5}.</p> : null}
        </Alert>
      ) : null}

      <div
        role="toolbar"
        aria-label="Unelte plan"
        className="flex flex-wrap items-center gap-2"
        data-testid="plan-toolbar"
      >
        <Button
          variant={tool === 'select' ? 'primary' : 'secondary'}
          aria-pressed={tool === 'select'}
          onClick={() => setTool('select')}
          title="Selectează și mută (V)"
          data-testid="tool-select"
        >
          Selectează
        </Button>
        <Button
          variant={tool === 'wall' ? 'primary' : 'secondary'}
          aria-pressed={tool === 'wall'}
          disabled={!editable}
          onClick={() => setTool(tool === 'wall' ? 'select' : 'wall')}
          title="Desenează pereți (W)"
          data-testid="tool-wall"
        >
          Perete nou
        </Button>
        <span className="mx-1 hidden h-6 w-px bg-stone-300 sm:block" aria-hidden="true" />
        <Button
          onClick={() => zoomBy(1 / ZOOM_STEP)}
          aria-label="Micșorează"
          title="Micșorează (−)"
          data-testid="zoom-out"
        >
          −
        </Button>
        <Button
          onClick={() => zoomBy(ZOOM_STEP)}
          aria-label="Mărește"
          title="Mărește (+)"
          data-testid="zoom-in"
        >
          +
        </Button>
        <Button onClick={fit} title="Potrivește planul în fereastră (0)" data-testid="zoom-fit">
          Potrivește
        </Button>
        <span className="text-xs text-stone-600" data-testid="zoom-level">
          Scară: 100 px ≈ {formatLength(100 / view.zoom, unit)}
        </span>
        <span className="ml-auto" />
        <Button
          variant="danger"
          disabled={!editable || !selection || selection.kind === 'node'}
          onClick={deleteSelected}
          title="Șterge elementul selectat (Delete)"
          data-testid="toolbar-delete"
        >
          Șterge
        </Button>
      </div>

      <p className="text-xs text-stone-600" data-testid="plan-hint">
        {tool === 'wall'
          ? draft
            ? 'Alege sfârșitul peretelui. Esc oprește desenarea.'
            : 'Alege începutul peretelui (un nod existent sau un punct din grilă).'
          : 'Trage nodurile ca să muți pereții și golurile ca să le repoziționezi; trage fundalul ca să deplasezi planul. Săgețile mută elementul selectat.'}
      </p>

      <div className="flex flex-col gap-4 lg:flex-row">
        <div
          ref={boxRef}
          className="relative h-[55vh] min-h-80 flex-1 overflow-hidden rounded-xl border border-stone-300 bg-stone-50"
          data-testid="plan-box"
        >
          <PlanCanvas
            svgRef={svgRef}
            doc={draftDoc}
            geometry={geometry}
            view={view}
            size={size}
            selection={selection}
            selectedObjectId={selectedObjectId}
            tool={tool}
            editable={editable}
            drag={drag}
            draft={draft}
            handlers={handlers}
          />
          {Object.keys(doc.nodes).length === 0 ? (
            <p
              className="pointer-events-none absolute inset-x-4 top-4 rounded-lg bg-white/90 p-3 text-center text-sm text-stone-700"
              data-testid="plan-empty"
            >
              Planul este gol. Adaugă o cameră dreptunghiulară din panoul din dreapta sau desenează
              pereți cu unealta „Perete nou”.
            </p>
          ) : null}
          {invalidLive ? (
            <p
              role="status"
              className="pointer-events-none absolute inset-x-4 bottom-4 rounded-lg border border-red-300 bg-red-50 p-2 text-center text-sm text-red-900"
              data-testid="drag-invalid"
            >
              Poziția aceasta ar produce un plan invalid. Dacă o eliberezi aici, mutarea se
              anulează.
            </p>
          ) : null}
        </div>

        <aside aria-label="Proprietăți" className="space-y-4 lg:w-80 lg:shrink-0">
          {sidePanel}
          {notice ? (
            <Alert
              tone={notice.tone}
              title={notice.tone === 'error' ? 'Nu s-a putut aplica' : 'Informație'}
              testId="plan-notice"
            >
              {notice.text}
            </Alert>
          ) : null}
          <div className="rounded-xl border border-stone-200 bg-white p-4">
            <PropertiesPanel
              doc={doc}
              geometry={geometry}
              selection={selection}
              editable={editable}
              run={run}
              select={(s) => {
                setSelection(s);
                setNotice(null);
              }}
              onAddOpening={onAddOpening}
              onDelete={deleteSelected}
              onWallFromNode={(nodeId) => {
                const n = doc.nodes[nodeId];
                if (!n) return;
                setTool('wall');
                setDraft({
                  start: { nodeId },
                  from: { x: n.x, y: n.y },
                  to: { x: n.x, y: n.y },
                  snapNodeId: nodeId,
                });
              }}
              onAddRoom={onAddRoom}
              onAddWall={onAddWall}
            />
          </div>
          <details
            className="rounded-xl border border-stone-200 bg-white p-4"
            data-testid="element-list"
          >
            <summary className="cursor-pointer text-sm font-semibold text-stone-900">
              Elemente din plan ({roomList.length} camere · {wallList.length} pereți ·{' '}
              {openingList.length} goluri)
            </summary>
            <ul className="mt-2 space-y-1 text-sm">
              {roomList.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setSelection({ kind: 'room', id: r.id })}
                  >
                    {ELEMENT_LABEL.room} „{r.name}” (
                    {ROOM_TYPES.find((t) => t.value === r.type)?.label})
                  </button>
                </li>
              ))}
              {wallList.map((w, i) => (
                <li key={w.id}>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setSelection({ kind: 'wall', id: w.id })}
                  >
                    {ELEMENT_LABEL.wall} {i + 1}
                  </button>
                </li>
              ))}
              {openingList.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setSelection({ kind: 'opening', id: o.id })}
                  >
                    {o.type === 'door' ? 'Ușă' : 'Fereastră'} ({formatLength(o.widthMm, unit)})
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </aside>
      </div>

      {confirm ? (
        <ConfirmDialog
          title={confirm.title}
          description={confirm.description}
          confirmLabel={confirm.label}
          onConfirm={async () => confirm.action()}
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </section>
  );
}
