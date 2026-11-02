// Plasarea unei camere din paletă (trasă sau armată cu un clic): fantoma de previzualizare, validarea, crearea camerei și
// ascultătorii de pointer de pe întreg ecranul din timpul tragerii. Mutat din `PlanEditor.tsx` fără schimbări de
// comportament (audit F-16).
import {
  useCallback,
  useEffect,
  useMemo,
  type Dispatch,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
} from 'react';
import {
  analyzeGeometry,
  axesFromInteriorPolygon,
  snapRoomAnchor,
  updateRoom,
  type GeometryModel,
  type ProjectDocument,
  type Pt,
  type Result,
} from '@/domain';
import type { ProjectSession } from '@/state/session';
import { DRAG_THRESHOLD_PX, buildRoom } from './editorSupport';
import { roomShape } from './roomPresets';
import type {
  Notice,
  PlacementGhost,
  RoomPreset,
  Selection,
  SelectionKind,
  Tool,
  WallDraft,
} from './types';
import { fitView, toWorld, type Size, type View } from './view';

export interface PlacementContext {
  doc: ProjectDocument;
  view: View;
  size: Size;
  editable: boolean;
  placing: RoomPreset | null;
  setPlacing: (p: RoomPreset | null) => void;
  pointerWorld: Pt | null;
  setPointerWorld: (p: Pt | null) => void;
  oriented: (p: RoomPreset) => RoomPreset;
  setTurns: Dispatch<SetStateAction<number>>;
  press: MutableRefObject<{ x: number; y: number; moved: boolean } | null>;
  svgRef: RefObject<SVGSVGElement | null>;
  geometry: GeometryModel;
  session: ProjectSession;
  genId: () => string;
  addAndSelect: <T extends { id: string }>(
    label: string,
    kind: SelectionKind,
    build: (d: ProjectDocument) => Result<{ doc: ProjectDocument } & T>,
  ) => string | null;
  setNotice: Dispatch<SetStateAction<Notice | null>>;
  setToolRaw: (t: Tool) => void;
  setDraft: (d: WallDraft | null) => void;
  setSelection: (s: Selection) => void;
  onSelectObject?: (id: string | null) => void;
  autoFit: MutableRefObject<boolean>;
  setView: Dispatch<SetStateAction<View>>;
}

export function usePlacement(ctx: PlacementContext): {
  ghost: PlacementGhost | null;
  dropGhost: () => void;
  startPlacing: (preset: RoomPreset, e: ReactPointerEvent<HTMLButtonElement>) => void;
  placeCentered: (preset: RoomPreset) => void;
} {
  const {
    doc,
    view,
    size,
    editable,
    placing,
    setPlacing,
    pointerWorld,
    setPointerWorld,
    oriented,
    setTurns,
    press: pressRef,
    svgRef,
    geometry,
    session,
    genId,
    addAndSelect,
    setNotice,
    setToolRaw,
    setDraft,
    setSelection,
    onSelectObject,
    autoFit,
    setView,
  } = ctx;
  /** Previzualizarea (și validarea) unei camere din paletă cu centrul în punctul `world`. */
  const ghostAt = useCallback(
    (preset: RoomPreset, world: Pt): PlacementGhost => {
      const shape = roomShape(preset);
      const thicknessMm = doc.settings.defaultWallThicknessMm;
      const raw = { x: world.x - preset.widthMm / 2, y: world.y - preset.depthMm / 2 };
      const snap = snapRoomAnchor(
        doc,
        {
          widthMm: preset.widthMm,
          depthMm: preset.depthMm,
          shape: preset.notch ? shape : undefined,
        },
        raw,
        doc.settings.gridMm,
        Math.max(60, 14 / view.zoom),
      );
      let n = 0;
      const built = buildRoom(doc, preset, snap.anchor, () => `ghost${++n}`);
      const found = built.ok ? analyzeGeometry(built.value.doc).issues : [];
      const interior = shape.map((p) => ({ x: p.x + snap.anchor.x, y: p.y + snap.anchor.y }));
      const axes = axesFromInteriorPolygon(interior, thicknessMm);
      return {
        preset,
        anchor: snap.anchor,
        thicknessMm,
        valid: built.ok && found.length === 0,
        error: !built.ok ? built.error : (found[0]?.message ?? null),
        snapped: snap.snappedX || snap.snappedY,
        interior,
        axes: axes.ok ? axes.value : [],
      };
    },
    [doc, view.zoom],
  );
  const ghost = useMemo<PlacementGhost | null>(
    () => (placing && pointerWorld && editable ? ghostAt(oriented(placing), pointerWorld) : null),
    [placing, pointerWorld, editable, ghostAt, oriented],
  );

  /** Creează camera din paletă în `anchor` (colț interior), cu numele și tipul presetului. */
  const placeRoom = useCallback(
    (preset: RoomPreset, anchor: Pt): boolean => {
      const same = Object.values(doc.rooms).filter((r) => r.type === preset.type).length;
      const name = same === 0 ? preset.label : `${preset.label} ${same + 1}`;
      const err = addAndSelect('Adaugă cameră', 'room', (d) => {
        const r = buildRoom(d, preset, anchor, genId, name);
        if (!r.ok) return r;
        const u = updateRoom(r.value.doc, r.value.roomId, { type: preset.type });
        return u.ok ? { ok: true, value: { doc: u.value, id: r.value.roomId } } : u;
      });
      if (err) setNotice({ tone: 'error', text: err });
      else if (autoFit.current) {
        // vederea nu a fost mișcată de utilizator: dacă noua cameră iese din cadru, planul se re-potrivește
        const pts = Object.values(session.getState().doc.nodes);
        const out = pts.some((p) => {
          const sx = p.x * view.zoom + view.panX;
          const sy = p.y * view.zoom + view.panY;
          return sx < 16 || sy < 16 || sx > size.w - 16 || sy > size.h - 16;
        });
        if (out) setView(fitView(pts, size));
      }
      return err === null;
    },
    [doc.rooms, addAndSelect, genId, session, view, size, autoFit, setNotice, setView],
  );
  /** Plasează camera din paletă cu centrul în `world`; dacă nu încape, spune de ce și nu creează nimic. */
  const dropAt = useCallback(
    (preset: RoomPreset, world: Pt): boolean => {
      const gh = ghostAt(preset, world);
      if (!gh.valid) {
        setNotice({
          tone: 'error',
          text: `Camera nu încape aici${gh.error ? `: ${gh.error}` : ''}. Alege alt loc.`,
        });
        return false;
      }
      return placeRoom(preset, gh.anchor);
    },
    [ghostAt, placeRoom, setNotice],
  );
  const dropGhost = useCallback(() => {
    if (placing && pointerWorld && dropAt(oriented(placing), pointerWorld)) {
      setPlacing(null);
      setTurns(0);
    }
  }, [placing, pointerWorld, dropAt, oriented, setPlacing, setTurns]);
  const startPlacing = (preset: RoomPreset, e: ReactPointerEvent<HTMLButtonElement>) => {
    if (placing?.id === preset.id && !pressRef.current) {
      setPlacing(null); // apăsat din nou pe cea armată: anulează
      return;
    }
    setToolRaw('select');
    setDraft(null);
    setSelection(null);
    onSelectObject?.(null);
    setNotice(null);
    setPointerWorld(null);
    setTurns(0);
    setPlacing(preset);
    pressRef.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  /** Plasare de la tastatură: în centrul planului; dacă nu încape, alipită în dreapta construcției existente. */
  const placeCentered = (preset: RoomPreset) => {
    if (!editable) return;
    const t = doc.settings.defaultWallThicknessMm;
    const c = toWorld(view, size.w / 2, size.h / 2);
    const centered = snapRoomAnchor(
      doc,
      {
        widthMm: preset.widthMm,
        depthMm: preset.depthMm,
        shape: preset.notch ? roomShape(preset) : undefined,
      },
      { x: c.x - preset.widthMm / 2, y: c.y - preset.depthMm / 2 },
      doc.settings.gridMm,
      Math.max(60, 14 / view.zoom),
    ).anchor;
    const outer = [...geometry.footprints.values()].flatMap((fp) => fp.polygon);
    const candidates = [centered];
    if (outer.length > 0) {
      candidates.push({
        x: Math.round(Math.max(...outer.map((p) => p.x))) + t,
        y: Math.round(Math.min(...outer.map((p) => p.y))) + t,
      });
    }
    const fits = (anchor: Pt) => {
      let n = 0;
      const built = buildRoom(doc, preset, anchor, () => `probe${++n}`);
      return built.ok && analyzeGeometry(built.value.doc).issues.length === 0;
    };
    placeRoom(preset, candidates.find(fits) ?? centered);
  };
  // cât timp se plasează o cameră, urmărim pointerul pe tot ecranul (tragerea pornește de pe paletă, în afara planului)
  useEffect(() => {
    if (!placing) return;
    const overPlan = (e: PointerEvent) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      return inside ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : null;
    };
    const onMove = (e: PointerEvent) => {
      const p = pressRef.current;
      if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) >= DRAG_THRESHOLD_PX) p.moved = true;
      const at = overPlan(e);
      setPointerWorld(at ? toWorld(view, at.x, at.y) : null);
    };
    const onUp = (e: PointerEvent) => {
      const p = pressRef.current;
      pressRef.current = null;
      if (!p) return;
      if (!p.moved) return; // simplu clic pe paletă: camera rămâne armată până la clicul pe plan
      const at = overPlan(e);
      if (at && placing) dropAt(oriented(placing), toWorld(view, at.x, at.y));
      setPlacing(null);
      setTurns(0); // tras și lăsat (pe plan sau în afara lui): s-a terminat
      setPointerWorld(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [placing, view, dropAt, oriented, pressRef, setPlacing, setPointerWorld, setTurns, svgRef]);

  return { ghost, dropGhost, startPlacing, placeCentered };
}
