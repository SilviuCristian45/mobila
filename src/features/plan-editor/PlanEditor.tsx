'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  addOpening,
  addRectRoom,
  addWall,
  footprintOfObject,
  moveNode,
  moveObjects,
  moveRoom,
  moveRoomEdge,
  resizeRoomSide,
  updateObject,
  updateOpening,
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
import {
  IconCopy,
  IconFit,
  IconMinus,
  IconPanelRight,
  IconPlus,
  IconRotateCw,
  IconTrash,
  IconX,
} from '@/ui/icons';
import { ElementList } from './ElementList';
import { PlanCanvas } from './PlanCanvas';
import { PlanHint } from './PlanHint';
import { PlanToolbar, type LeftDrawerTab } from './PlanToolbar';
import { PropertiesPanel, type RunEdit } from './PropertiesPanel';
import { RoomList } from './RoomList';
import { RoomPalette } from './RoomPalette';
import { DEFAULT_SIZE, defaultGenId, exists, type Confirm, type Gesture } from './editorSupport';
import { STATUS_TONE_CLASS, selectionAnnouncement, sessionStatusLine } from './planStatus';
import { orient } from './roomPresets';
import type { Drag, Notice, RoomPreset, Selection, SelectionKind, Tool, WallDraft } from './types';
import { useCanvasHandlers } from './useCanvasHandlers';
import { usePlacement } from './usePlacement';
import { usePlanKeyboard } from './usePlanKeyboard';
import { useSelectionActions } from './useSelectionActions';
import { ZOOM_STEP, fitView, zoomAt, type Size, type View } from './view';

/**
 * Editorul 2D în arhitectura „Full-Viewport Studio” (3 zone):
 * - Stânga: Tool Rail vertical (52px) + Left Drawer retractabil (Camere/Zone, Catalog, Materiale, Structură).
 * - Centru: Canvas full-bleed + Floating HUD (Contextual Top Action Pill, Bottom-Left Micro-Hint, Bottom-Right Zoom Pill).
 * - Dreapta: Inspector Contextual retractabil (296px).
 */
export function PlanEditor({
  session,
  state,
  genId = defaultGenId,
  selectedObjectId: selectedObjectIdProp = null,
  onSelectObject,
  onSelectionChange,
  sidePanel,
  side = null,
  onSideChange,
  leftDrawerContent,
  leftDrawerRef,
  scope = 'interior',
}: {
  session: ProjectSession;
  state: SessionState;
  genId?: () => string;
  /** Obiectul selectat (starea de selecție a obiectelor e comună cu vizualizarea 3D și cu panoul de proprietăți). */
  selectedObjectId?: string | null;
  onSelectObject?: (id: string | null) => void;
  /** Raportează selecția de nod/perete/cameră/gol (folosită de panoul de materiale ca țintă sugerată). */
  onSelectionChange?: (s: Selection) => void;
  /** Conținut contextual în inspectorul din dreapta (ex. ObjectPanel / ErrorBoundary din `app/`). */
  sidePanel?: ReactNode;
  /** Tab extern activ în Left Drawer (`catalog` sau `materials`), controlat de `app/`. */
  side?: 'catalog' | 'materials' | null;
  onSideChange?: (s: 'catalog' | 'materials' | null) => void;
  /** Conținutul panoului extern din Left Drawer (ex. MaterialsPanel). */
  leftDrawerContent?: ReactNode;
  /** Callback ref pe containerul Left Drawer pentru portalul CatalogBrowser. */
  leftDrawerRef?: (el: HTMLDivElement | null) => void;
  /** Modul de lucru al paletei: camere interioare sau zone exterioare. */
  scope?: 'interior' | 'exterior';
}) {
  const { doc } = state;
  const editable = !state.readOnly && !state.conflict && state.status !== 'closed';
  const fitPoints = (d: ProjectDocument): Pt[] => [
    ...Object.values(d.nodes),
    ...Object.values(d.objects).flatMap((o) => footprintOfObject(o)),
  ];

  const svgRef = useRef<SVGSVGElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<Size>(DEFAULT_SIZE);
  const [view, setView] = useState<View>(() => fitView(fitPoints(doc), DEFAULT_SIZE));
  const autoFit = useRef(true);
  const [selectionRaw, setSelection] = useState<Selection>(null);
  const [localDrawer, setLocalDrawer] = useState<'rooms' | 'structure' | null>('rooms');
  const [inspectorOpen, setInspectorOpen] = useState(true);
  /** Obiecte selectate în plus față de cel principal (`selectedObjectId`): selecție multiplă cu Shift / Ctrl + clic. */
  const [extra, setExtra] = useState<{ owner: string | null; ids: string[] }>({
    owner: null,
    ids: [],
  });
  const setExtraIds = useCallback(
    (ids: string[], owner: string | null) => setExtra({ owner, ids }),
    [],
  );
  const [toolRaw, setToolRaw] = useState<Tool>('select');
  const [drag, setDragState] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const setDrag = useCallback((d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  }, []);
  const [draftRaw, setDraft] = useState<WallDraft | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const [placing, setPlacing] = useState<RoomPreset | null>(null);
  const [pointerWorld, setPointerWorld] = useState<Pt | null>(null);
  const [turns, setTurns] = useState(0);
  const oriented = useCallback((p: RoomPreset): RoomPreset => orient(p, turns), [turns]);
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const activeDrawer: LeftDrawerTab = side ?? localDrawer;
  const handleSelectDrawer = useCallback(
    (tab: LeftDrawerTab) => {
      if (tab === 'catalog' || tab === 'materials') {
        onSideChange?.(tab);
      } else {
        onSideChange?.(null);
        setLocalDrawer(tab);
      }
    },
    [onSideChange],
  );

  // fără drept de editare nu există unealtă de desenare și nici fir în curs
  const tool: Tool = editable ? toolRaw : 'select';
  const draft = tool === 'wall' ? draftRaw : null;
  const setTool = useCallback((t: Tool) => {
    setToolRaw(t);
    setDraft(null);
  }, []);

  /** Scurtături cu o singură tastă (W, V, R, +, −, 0): comutator (WCAG 2.1.4), memorat în browser. */
  const [shortcuts, setShortcutsState] = useState<boolean>(() => {
    try {
      return localStorage.getItem('rc:shortcuts') !== 'off';
    } catch {
      return true;
    }
  });
  const setShortcuts = useCallback((on: boolean) => {
    setShortcutsState(on);
    try {
      localStorage.setItem('rc:shortcuts', on ? 'on' : 'off');
    } catch {
      /* fără stocare */
    }
  }, []);

  const selection = exists(doc, selectionRaw) ? selectionRaw : null;
  const selectedObjectId =
    selectedObjectIdProp && selectedObjectIdProp in doc.objects ? selectedObjectIdProp : null;
  const grid = doc.settings.gridMm;

  const groupIds = useMemo(
    () =>
      selectedObjectId
        ? [
            selectedObjectId,
            ...(extra.owner === selectedObjectId ? extra.ids : []).filter(
              (id) => id !== selectedObjectId && id in doc.objects,
            ),
          ]
        : [],
    [selectedObjectId, extra, doc.objects],
  );
  const groupSet = useMemo(() => new Set(groupIds), [groupIds]);

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
        : drag.kind === 'roomEdge'
          ? moveRoomEdge(doc, drag.roomId, drag.index, drag.deltaMm)
          : drag.kind === 'roomSide'
            ? resizeRoomSide(doc, drag.roomId, drag.side, drag.lengthMm)
            : drag.kind === 'room'
              ? moveRoom(doc, drag.roomId, drag.delta)
              : drag.kind === 'object'
                ? drag.groupIds
                  ? moveObjects(doc, drag.groupIds, {
                      x: drag.to.x - (doc.objects[drag.objectId]?.position.x ?? drag.to.x),
                      y: drag.to.y - (doc.objects[drag.objectId]?.position.y ?? drag.to.y),
                    })
                  : updateObject(doc, drag.objectId, { position: drag.to })
                : updateOpening(doc, drag.openingId, { offsetMm: drag.offsetMm });
    return r.ok ? r.value : doc;
  }, [doc, drag]);
  const geometry = useMemo(() => selectGeometry(draftDoc), [draftDoc]);
  const issues = geometry.issues;

  // ───────────── vizualizare ─────────────
  const fit = useCallback(() => {
    autoFit.current = true;
    setView(fitView(fitPoints(doc), size));
  }, [doc, size]);

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
    if (autoFit.current) setView(fitView(fitPoints(doc), size));
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

  const focusRoom = useCallback(
    (roomId: string) => {
      setSelection({ kind: 'room', id: roomId });
      onSelectObject?.(null);
      setNotice(null);
      const poly = geometry.rooms.get(roomId)?.polygon;
      if (!poly || poly.length === 0) return;
      const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
      const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
      const sx = cx * view.zoom + view.panX;
      const sy = cy * view.zoom + view.panY;
      if (sx < 0 || sy < 0 || sx > size.w || sy > size.h) {
        autoFit.current = false;
        setView({ ...view, panX: size.w / 2 - cx * view.zoom, panY: size.h / 2 - cy * view.zoom });
      }
    },
    [geometry.rooms, view, size, onSelectObject],
  );

  // ───────────── plasarea unei camere din paletă ─────────────
  const { ghost, dropGhost, startPlacing, placeCentered } = usePlacement({
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
    press,
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
  });

  const { deleteSelected, duplicateSelected } = useSelectionActions({
    doc,
    editable,
    selection,
    setSelection,
    selectedObjectId,
    groupIds,
    onSelectObject,
    setExtraIds,
    genId,
    run,
    runNotice,
    setConfirm,
    setNotice,
  });

  // ───────────── gesturi cu pointerul ─────────────
  const handlers = useCanvasHandlers({
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
  });

  // ───────────── tastatură ─────────────
  usePlanKeyboard({
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
  });

  // ───────────── afișare ─────────────
  const unit = doc.settings.displayUnit;
  const invalidLive = drag && issues.length > 0;
  const announcement = selectionAnnouncement({
    doc,
    geometry,
    selection,
    selectedObjectId,
    groupIds,
  });
  const statusLine = sessionStatusLine(state);
  const scaleLabel = formatLength(100 / view.zoom, unit);

  return (
    <section
      aria-label="Editor plan 2D"
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      data-testid="plan-editor"
      data-editable={editable}
    >
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
        data-testid="selection-announcer"
      >
        {announcement}
      </div>

      {/* Benzi de avertisment/stare critică (doar-citire, conflict, eroare geometrică) */}
      {statusLine || (issues.length > 0 && !drag) ? (
        <div className="shrink-0 space-y-1.5 border-b border-stone-200 bg-surface px-3 py-1.5">
          {statusLine ? (
            <p
              role="status"
              data-testid="plan-status"
              className={`rounded-lg border px-3 py-1.5 text-xs ${STATUS_TONE_CLASS[statusLine.tone]}`}
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
        </div>
      ) : null}

      {/* 3-Zone Studio Shell */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* ZONA 1A: Left Tool Rail (52px) */}
        <PlanToolbar
          tool={tool}
          setTool={setTool}
          editable={editable}
          canDelete={
            editable && ((!!selection && selection.kind !== 'node') || groupIds.length > 0)
          }
          onDelete={deleteSelected}
          activeDrawer={activeDrawer}
          onSelectDrawer={handleSelectDrawer}
          scope={scope}
        />

        {/* ZONA 1B: Left Retractable Drawer (284px) */}
        {activeDrawer !== null ? (
          <div
            aria-label={
              activeDrawer === 'catalog'
                ? 'Catalog de obiecte'
                : activeDrawer === 'materials'
                  ? 'Materiale și finisaje'
                  : activeDrawer === 'structure'
                    ? 'Structură proiect'
                    : scope === 'exterior'
                      ? 'Zone exterioare'
                      : 'Camere și structură'
            }
            className="studio-scroll max-h-72 shrink-0 overflow-y-auto border-b border-stone-200 bg-surface p-3 lg:max-h-none lg:w-[284px] lg:border-r lg:border-b-0"
            data-testid="studio-left-drawer"
          >
            {/* Portal host pentru CatalogBrowser (montat de CatalogPanel în ErrorBoundary) */}
            <div ref={leftDrawerRef} className={activeDrawer === 'catalog' ? '' : 'hidden'} />

            {activeDrawer === 'materials' ? leftDrawerContent : null}

            {activeDrawer === 'rooms' ? (
              <div className="space-y-3">
                <RoomPalette
                  unit={unit}
                  editable={editable}
                  activeId={placing?.id ?? null}
                  scope={scope}
                  onPress={startPlacing}
                  onPlaceCentered={placeCentered}
                />
                <RoomList
                  doc={doc}
                  geometry={geometry}
                  selectedId={selection?.kind === 'room' ? selection.id : null}
                  onSelect={focusRoom}
                />
                <ElementList
                  doc={doc}
                  unit={unit}
                  onSelect={(kind, id) => setSelection({ kind, id })}
                />
              </div>
            ) : null}

            {activeDrawer === 'structure' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold tracking-tight text-stone-900">
                    Structură proiect
                  </h2>
                  <button
                    type="button"
                    onClick={() => handleSelectDrawer(null)}
                    aria-label="Închide panoul de structură"
                    className="rounded-md p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                  >
                    <IconX size={14} />
                  </button>
                </div>
                <RoomList
                  doc={doc}
                  geometry={geometry}
                  selectedId={selection?.kind === 'room' ? selection.id : null}
                  onSelect={focusRoom}
                />
                <ElementList
                  doc={doc}
                  unit={unit}
                  onSelect={(kind, id) => setSelection({ kind, id })}
                />
                {Object.keys(doc.objects).length > 0 ? (
                  <div className="border-t border-stone-200/80 pt-3">
                    <h3 className="mb-1.5 text-[11px] font-semibold tracking-wider text-stone-500 uppercase">
                      Obiecte ({Object.keys(doc.objects).length})
                    </h3>
                    <ul className="space-y-0.5 text-xs">
                      {Object.values(doc.objects).map((o) => {
                        const label =
                          o.name ?? doc.catalogSnapshot.items[o.catalogItemId]?.name.ro ?? o.id;
                        const active = o.id === selectedObjectId;
                        return (
                          <li key={o.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelection(null);
                                onSelectObject?.(o.id);
                              }}
                              className={`flex w-full items-center justify-between rounded-lg px-2 py-1 text-left ${
                                active
                                  ? 'bg-teal-50 font-medium text-teal-900'
                                  : 'text-stone-700 hover:bg-stone-100'
                              }`}
                            >
                              <span className="truncate">{label}</span>
                              <span className="ml-2 shrink-0 text-[10px] tabular-nums text-stone-400">
                                {o.size.widthMm}×{o.size.depthMm}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          /* Păstrăm host-ul portalului în DOM chiar dacă drawer-ul e ascuns */
          <div ref={leftDrawerRef} className="hidden" />
        )}

        {/* ZONA 2: Canvas Full-Bleed + Floating HUD */}
        <div className="relative flex min-h-[24rem] min-w-0 flex-1 flex-col bg-canvas">
          <div
            ref={boxRef}
            tabIndex={0}
            role="group"
            aria-label="Zona planului"
            aria-describedby="plan-hint"
            className="relative h-full min-h-80 flex-1 overflow-hidden bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-700"
            data-testid="plan-box"
          >
            <PlanCanvas
              svgRef={svgRef}
              doc={draftDoc}
              geometry={geometry}
              view={view}
              size={size}
              selection={selection}
              selectedObjectIds={groupSet}
              tool={tool}
              editable={editable}
              drag={drag}
              draft={draft}
              ghost={ghost}
              handlers={handlers}
            />

            {/* Floating Top-Right Inspector Toggle (când inspectorul e ascuns) */}
            {!inspectorOpen ? (
              <button
                type="button"
                onClick={() => setInspectorOpen(true)}
                aria-label="Arată inspectorul de proprietăți"
                title="Arată inspectorul de proprietăți"
                className="absolute top-3 right-3 z-10 inline-flex h-8 items-center gap-1.5 rounded-full border border-stone-200/90 bg-surface/92 px-3 text-xs font-medium text-stone-700 shadow-sm backdrop-blur-md hover:bg-surface hover:text-stone-950"
              >
                <IconPanelRight size={14} />
                Inspector
              </button>
            ) : null}

            {/* Floating Top-Center Contextual Action Bar (plasare cameră / selecție multiplă / plan gol) */}
            <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-col items-center gap-2">
              {placing ? (
                <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-full border border-teal-200 bg-surface/95 px-3 py-1.5 text-xs font-medium text-stone-800 shadow-md backdrop-blur-md">
                  <span>
                    Plasează <strong className="text-teal-900">„{placing.label}”</strong>
                  </span>
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() => setTurns((t) => (t + 1) % 4)}
                    title="Rotește camera din paletă cu 90° (R)"
                    data-testid="placing-rotate"
                    className="rounded-full"
                  >
                    <IconRotateCw size={12} />
                    Rotește camera (R)
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      setPlacing(null);
                      setPointerWorld(null);
                      setTurns(0);
                    }}
                    className="rounded-full text-stone-500"
                  >
                    Anulează (Esc)
                  </Button>
                </div>
              ) : null}

              {groupIds.length > 1 ? (
                <div
                  className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-full border border-teal-200 bg-teal-50/95 px-3.5 py-1.5 text-xs text-teal-950 shadow-md backdrop-blur-md"
                  data-testid="multi-selection"
                >
                  <span className="font-semibold">{groupIds.length} obiecte selectate</span>
                  <span className="hidden text-teal-800 sm:inline">
                    · Trage sau folosește săgețile
                  </span>
                  <Button
                    size="xs"
                    variant="secondary"
                    disabled={!editable}
                    onClick={duplicateSelected}
                    className="rounded-full"
                  >
                    <IconCopy size={12} />
                    Duplică
                  </Button>
                  <Button
                    size="xs"
                    variant="danger"
                    disabled={!editable}
                    onClick={deleteSelected}
                    className="rounded-full"
                  >
                    <IconTrash size={12} />
                    Șterge
                  </Button>
                </div>
              ) : null}

              {Object.keys(doc.nodes).length === 0 && Object.keys(doc.objects).length === 0 ? (
                <p
                  className="max-w-lg rounded-2xl border border-stone-200/80 bg-surface/90 px-4 py-2.5 text-center text-xs text-stone-700 shadow-sm backdrop-blur-md"
                  data-testid="plan-empty"
                >
                  {scope === 'exterior'
                    ? 'Planul exterior este gol. Alege o zonă exterioară din panoul stâng sau adaugă garduri, garaje, copaci și mașini din catalog.'
                    : 'Planul este gol. Trage o cameră din panoul stâng, desenează pereți cu unealta Perete (W) sau introdu coordonate în dreapta.'}
                </p>
              ) : null}

              {invalidLive ? (
                <p
                  role="status"
                  className="rounded-full border border-red-300 bg-red-50/95 px-4 py-1.5 text-xs font-medium text-red-900 shadow-sm backdrop-blur-md"
                  data-testid="drag-invalid"
                >
                  Poziția aceasta ar produce un plan invalid. Dacă o eliberezi aici, mutarea se
                  anulează.
                </p>
              ) : null}
            </div>

            {/* Floating Bottom Bar: Micro-Hint (stânga) + Zoom & Scurtături Pill (dreapta/centru) */}
            <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex flex-wrap items-end justify-between gap-2">
              <PlanHint placing={placing !== null} tool={tool} drawing={draft !== null} />

              <div className="pointer-events-auto ml-auto flex flex-wrap items-center gap-1 rounded-full border border-stone-200/90 bg-surface/92 px-2 py-1 text-xs shadow-md backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => zoomBy(1 / ZOOM_STEP)}
                  aria-label="Micșorează"
                  title="Micșorează (−)"
                  data-testid="zoom-out"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-teal-700"
                >
                  <IconMinus size={14} />
                </button>
                <span
                  className="min-w-[6.5rem] px-1 text-center text-[11px] font-medium tabular-nums text-stone-700"
                  data-testid="zoom-level"
                >
                  100 px ≈ {scaleLabel}
                </span>
                <button
                  type="button"
                  onClick={() => zoomBy(ZOOM_STEP)}
                  aria-label="Mărește"
                  title="Mărește (+)"
                  data-testid="zoom-in"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-stone-700 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-teal-700"
                >
                  <IconPlus size={14} />
                </button>
                <span className="mx-0.5 h-4 w-px bg-stone-200" aria-hidden="true" />
                <button
                  type="button"
                  onClick={fit}
                  title="Potrivește planul în fereastră (0)"
                  data-testid="zoom-fit"
                  className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium text-stone-700 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-teal-700"
                >
                  <IconFit size={13} />
                  Potrivește
                </button>
                <span className="mx-0.5 h-4 w-px bg-stone-200" aria-hidden="true" />
                <label
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-medium text-stone-600 select-none hover:bg-stone-100"
                  title="Scurtături cu o singură tastă: W perete, V selectare, R rotire, + − zoom, 0 potrivire. Oprește-le dacă te încurcă."
                >
                  <input
                    type="checkbox"
                    checked={shortcuts}
                    onChange={(e) => setShortcuts(e.target.checked)}
                    className="h-3.5 w-3.5 accent-teal-700"
                    data-testid="shortcuts-toggle"
                  />
                  <span>Scurtături</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* ZONA 3: Right Contextual Inspector (296px, retractabil) */}
        {inspectorOpen ? (
          <aside
            aria-label="Proprietăți"
            className="studio-scroll flex shrink-0 flex-col border-t border-stone-200 bg-surface lg:w-[296px] lg:overflow-y-auto lg:border-t-0 lg:border-l"
            data-testid="studio-right-inspector"
          >
            <div className="flex items-center justify-between border-b border-stone-200/80 px-3 py-2">
              <span className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase">
                {selectedObjectId
                  ? 'Inspector obiect'
                  : selection
                    ? 'Inspector selecție'
                    : 'Inspector plan'}
              </span>
              <button
                type="button"
                onClick={() => setInspectorOpen(false)}
                aria-label="Ascunde inspectorul de proprietăți"
                title="Ascunde inspectorul"
                className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-800"
              >
                <IconPanelRight size={14} />
              </button>
            </div>

            <div className="space-y-3 p-3">
              {notice ? (
                <Alert
                  tone={notice.tone}
                  title={notice.tone === 'error' ? 'Nu s-a putut aplica' : 'Informație'}
                  testId="plan-notice"
                >
                  {notice.text}
                </Alert>
              ) : null}

              {/* CatalogPanel / ObjectPanel (montat o singură dată în ErrorBoundary) */}
              {sidePanel}

              {/* Când un obiect este selectat, inspectorul afișează strict ObjectPanel (fără zgomot); altfel PropertiesPanel */}
              {!selectedObjectId ? (
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
              ) : null}
            </div>
          </aside>
        ) : (
          /* Păstrăm sidePanel (CatalogPanel) montat pentru portalul CatalogBrowser chiar dacă inspectorul e ascuns */
          <div className="hidden">{sidePanel}</div>
        )}
      </div>

      {confirm ? (
        <ConfirmDialog
          title={confirm.title}
          description={confirm.description}
          confirmLabel={confirm.label}
          onConfirm={async () => confirm.action()}
          secondary={
            confirm.secondary
              ? {
                  label: confirm.secondary.label,
                  onConfirm: async () => confirm.secondary!.action(),
                }
              : undefined
          }
          onClose={() => setConfirm(null)}
        />
      ) : null}
    </section>
  );
}
