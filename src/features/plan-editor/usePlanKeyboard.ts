// Tastatura editorului 2D (comenzi pe plan: Delete, Escape, săgeți, R, +/−/0, V/W, Ctrl + A / D). Un singur ascultător pe
// `window`, reatașat când se schimbă ceva din contextul de mai jos; regulile de accesibilitate (ce taste acționează, în ce
// condiții de focus) stau în `keyboard.ts`. Mutat din `PlanEditor.tsx` fără schimbări de comportament (audit F-16).
import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import {
  moveNode,
  moveObjects,
  rotateRoom,
  updateObject,
  updateOpening,
  type ProjectDocument,
  type Result,
} from '@/domain';
import { isTyping, type Confirm, type Gesture } from './editorSupport';
import { planKeyAllowed } from './keyboard';
import type { Drag, RoomPreset, Selection, Tool, WallDraft } from './types';
import { ZOOM_STEP, type View } from './view';

export interface PlanKeyboardContext {
  confirm: Confirm | null;
  tool: Tool;
  setTool: (t: Tool) => void;
  doc: ProjectDocument;
  grid: number;
  selection: Selection;
  setSelection: (s: Selection) => void;
  selectedObjectId: string | null;
  groupIds: string[];
  onSelectObject?: (id: string | null) => void;
  setExtraIds: (ids: string[], owner: string | null) => void;
  duplicateSelected: () => void;
  deleteSelected: () => void;
  runNotice: (label: string, op: (d: ProjectDocument) => Result<ProjectDocument>) => boolean;
  editable: boolean;
  shortcuts: boolean;
  placing: RoomPreset | null;
  setPlacing: (p: RoomPreset | null) => void;
  setTurns: Dispatch<SetStateAction<number>>;
  setPointerWorld: (p: { x: number; y: number } | null) => void;
  press: MutableRefObject<{ x: number; y: number; moved: boolean } | null>;
  gesture: MutableRefObject<Gesture | null>;
  drag: Drag | null;
  setDrag: (d: Drag | null) => void;
  draft: WallDraft | null;
  setDraft: (d: WallDraft | null) => void;
  autoFit: MutableRefObject<boolean>;
  setView: Dispatch<SetStateAction<View>>;
  zoomBy: (factor: number) => void;
  fit: () => void;
}

export function usePlanKeyboard(ctx: PlanKeyboardContext): void {
  const {
    confirm,
    tool,
    setTool,
    doc,
    grid,
    selection,
    setSelection,
    selectedObjectId,
    groupIds,
    onSelectObject,
    setExtraIds,
    duplicateSelected,
    deleteSelected,
    runNotice,
    editable,
    shortcuts,
    placing,
    setPlacing,
    setTurns,
    setPointerWorld,
    press,
    gesture,
    drag,
    setDrag,
    draft,
    setDraft,
    autoFit,
    setView,
    zoomBy,
    fit,
  } = ctx;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirm || e.defaultPrevented || isTyping(e.target) || e.altKey) return;
      if (e.ctrlKey || e.metaKey) {
        if ((e.key === 'a' || e.key === 'A') && tool === 'select') {
          const all = Object.keys(doc.objects);
          if (all.length > 0) {
            e.preventDefault();
            setSelection(null);
            onSelectObject?.(all[0]!);
            setExtraIds(all.slice(1), all[0]!);
          }
          return;
        }
        if ((e.key === 'd' || e.key === 'D') && selectedObjectId) {
          e.preventDefault();
          duplicateSelected();
        }
        return;
      }
      const k = e.key;
      // săgețile și scurtăturile cu o tastă nu acționează în spatele unui control focalizat sau cu scurtăturile oprite
      if (!planKeyAllowed(k, e.target, shortcuts, { placing: placing !== null })) return;
      const nudge = (dx: number, dy: number) => {
        const step = (e.shiftKey ? 10 : 1) * grid;
        if (!editable && (selection || selectedObjectId)) return;
        if (selectedObjectId) {
          const o = doc.objects[selectedObjectId];
          if (o && groupIds.length > 1)
            runNotice(`Mută ${groupIds.length} obiecte`, (d) =>
              moveObjects(d, groupIds, { x: dx * step, y: dy * step }),
            );
          else if (o)
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
        if (placing) {
          setPlacing(null);
          setTurns(0);
          setPointerWorld(null);
          press.current = null;
        } else if (gesture.current || drag) {
          gesture.current = null;
          setDrag(null);
        } else if (draft) setDraft(null);
        else if (tool === 'wall') setTool('select');
        else if (selection) setSelection(null);
        else if (selectedObjectId) {
          onSelectObject?.(null);
          setExtraIds([], null);
        } else handled = false;
      } else if ((k === 'r' || k === 'R') && placing) {
        setTurns((t) => (t + 1) % 4);
      } else if (
        (k === 'r' || k === 'R') &&
        !selectedObjectId &&
        selection?.kind === 'room' &&
        editable
      ) {
        const roomId = selection.id;
        runNotice('Rotește camera', (d) => rotateRoom(d, roomId, e.shiftKey ? -1 : 1));
      } else if (
        (k === 'r' || k === 'R') &&
        selectedObjectId &&
        editable &&
        groupIds.length === 1
      ) {
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
    autoFit,
    gesture,
    press,
    setDraft,
    setPlacing,
    setPointerWorld,
    setSelection,
    setTurns,
    setView,
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
    groupIds,
    onSelectObject,
    placing,
    setExtraIds,
    runNotice,
    selection,
    selectedObjectId,
    tool,
    zoomBy,
    shortcuts,
  ]);
}
