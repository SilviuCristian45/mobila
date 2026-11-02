'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  addOpening,
  addRectRoom,
  moveRoomEdge,
  addWall,
  moveNode,
  moveRoom,
  moveObjects,
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
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Alert } from '@/ui/feedback';
import { PlanCanvas } from './PlanCanvas';
import { DEFAULT_SIZE, defaultGenId, exists, type Confirm, type Gesture } from './editorSupport';
import { PropertiesPanel, type RunEdit } from './PropertiesPanel';
import { ElementList } from './ElementList';
import { PlanHint } from './PlanHint';
import { PlanToolbar } from './PlanToolbar';
import { STATUS_TONE_CLASS, selectionAnnouncement, sessionStatusLine } from './planStatus';
import { useSelectionActions } from './useSelectionActions';
import { usePlacement } from './usePlacement';
import { useCanvasHandlers } from './useCanvasHandlers';
import { usePlanKeyboard } from './usePlanKeyboard';
import { RoomList } from './RoomList';
import { RoomPalette } from './RoomPalette';
import { orient } from './roomPresets';
import type { Drag, Notice, RoomPreset, Selection, SelectionKind, Tool, WallDraft } from './types';
import { ZOOM_STEP, fitView, zoomAt, type Size, type View } from './view';

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
  /** Camera din paletă care se plasează (trasă cu mouse-ul sau armată cu un clic) și poziția cursorului în lume. */
  const [placing, setPlacing] = useState<RoomPreset | null>(null);
  const [pointerWorld, setPointerWorld] = useState<Pt | null>(null);
  /** Camera din paletă e rotită cu 90° (lățimea și adâncimea inversate); tasta R o comută cât timp se plasează. */
  const [turns, setTurns] = useState(0);
  const oriented = useCallback((p: RoomPreset): RoomPreset => orient(p, turns), [turns]);
  /** Apăsarea care a pornit de pe paletă: după ea decidem între „trage și lasă” și „armat, apoi clic pe plan”. */
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  // fără drept de editare nu există unealtă de desenare și nici fir în curs (derivat, nu efect)
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
      /* fără stocare: comutatorul rămâne valabil doar în această sesiune */
    }
  }, []);
  const selection = exists(doc, selectionRaw) ? selectionRaw : null;
  const selectedObjectId =
    selectedObjectIdProp && selectedObjectIdProp in doc.objects ? selectedObjectIdProp : null;
  const grid = doc.settings.gridMm;
  // grupul = obiectul principal + cele adăugate; fără obiect principal nu există grup (extrasele vechi nu reapar)
  // extrasele aparțin obiectului principal pentru care au fost alese: dacă principalul se schimbă din altă parte
  // (panou, 3D), ele nu mai contează
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

  /** Selectează o cameră din listă; dacă e în afara ferestrei, centrează vederea pe ea (zoom neschimbat). */
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

  return (
    <section
      aria-label="Editor plan 2D"
      className="space-y-3"
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
      {statusLine ? (
        <p
          role="status"
          data-testid="plan-status"
          className={`rounded-lg border px-3 py-2 text-sm ${STATUS_TONE_CLASS[statusLine.tone]}`}
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

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-2 lg:sticky lg:top-2 lg:h-[calc(100dvh-12rem)] lg:min-h-[28rem]">
          <PlanToolbar
            tool={tool}
            setTool={setTool}
            editable={editable}
            zoomBy={zoomBy}
            fit={fit}
            scaleLabel={formatLength(100 / view.zoom, unit)}
            shortcuts={shortcuts}
            setShortcuts={setShortcuts}
            canDelete={editable && !!selection && selection.kind !== 'node'}
            onDelete={deleteSelected}
          />

          <RoomPalette
            unit={unit}
            editable={editable}
            activeId={placing?.id ?? null}
            onPress={startPlacing}
            onPlaceCentered={placeCentered}
          />

          <PlanHint
            placing={placing !== null}
            tool={tool}
            drawing={draft !== null}
            onRotatePlacing={() => setTurns((t) => (t + 1) % 4)}
          />

          <div
            ref={boxRef}
            tabIndex={0}
            role="group"
            aria-label="Zona planului"
            aria-describedby="plan-hint"
            className="relative h-[60vh] min-h-80 flex-1 overflow-hidden rounded-xl border border-stone-300 bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 lg:h-auto"
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
            {groupIds.length > 1 ? (
              <p
                className="pointer-events-none absolute inset-x-3 top-3 rounded-lg bg-teal-50/95 px-3 py-2 text-sm text-teal-900 shadow-sm"
                data-testid="multi-selection"
              >
                {groupIds.length} obiecte selectate. Trage-le sau folosește săgețile ca să le muți
                împreună; Delete le șterge, Ctrl+D le duplică, Shift + clic scoate un obiect din
                selecție.
              </p>
            ) : null}
            {Object.keys(doc.nodes).length === 0 ? (
              <p
                className="pointer-events-none absolute inset-x-4 top-4 rounded-lg bg-surface/90 p-3 text-center text-sm text-stone-700"
                data-testid="plan-empty"
              >
                Planul este gol. Adaugă o cameră dreptunghiulară din panoul din dreapta sau
                desenează pereți cu unealta „Perete nou”.
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
        </div>

        <aside
          aria-label="Proprietăți"
          className="space-y-4 lg:sticky lg:top-2 lg:max-h-[calc(100dvh-12rem)] lg:w-80 lg:shrink-0 lg:overflow-y-auto lg:pr-1"
        >
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
          <RoomList
            doc={doc}
            geometry={geometry}
            selectedId={selection?.kind === 'room' ? selection.id : null}
            onSelect={focusRoom}
          />
          <div className="rounded-xl border border-stone-200 bg-surface p-4">
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
          <ElementList doc={doc} unit={unit} onSelect={(kind, id) => setSelection({ kind, id })} />
        </aside>
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
