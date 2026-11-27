'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  OBJECT_FINISH_SLOTS,
  OBJECT_SLOT_LABEL,
  addObject,
  applyFinish,
  clearFinish,
  computeCutList,
  cutListToCsv,
  defaultParams,
  resolveLook,
  setLineOverride,
  suggestPlacement,
  updateObject,
  type CatalogItem,
  type Finish,
  type ObjectFinishSlot,
  type ObjectParams,
  type ObjectSize,
  type PlacedObject,
} from '@/domain';
import {
  BUILTIN_ITEMS,
  isCustomFurnitureCategory,
  optionLabel,
  paramLabel,
  type SlotLooks,
} from '@/catalog';
import { BUILTIN_MATERIALS, swatchDataUrl } from '@/materials';
import { cutListFileName, downloadTextFile } from '@/lib/download';
import { formatMoney } from '@/lib/format';
import { newId } from '@/lib/ids';
import { describeCommitFailure } from '@/lib/messages';
import { selectGeometry } from '@/state/selectors';
import type { CommitResult, ProjectSession, SessionState } from '@/state/session';
import { Button } from '@/ui/Button';
import { Alert, Badge } from '@/ui/feedback';
import { InspectorSection, NumberField, SelectField, TextField } from '@/ui/fields';
import {
  IconCustomFurniture,
  IconDownload,
  IconEye,
  IconEyeOff,
  IconPlan2D,
  IconPlus,
  IconRotateCcw,
  IconRuler,
} from '@/ui/icons';

export type CustomPreviewPreset = 'perspective' | 'front' | 'side' | 'top';

export interface CustomPreviewProps {
  recipe: { id: string; version: number };
  sizeMm: ObjectSize;
  params: ObjectParams;
  colorHex: string;
  slotLooks: SlotLooks;
  hideFronts: boolean;
  viewPreset: CustomPreviewPreset;
  viewNonce: number;
  showDimensions: boolean;
}

type ConfigTab = 'structure' | 'materials' | 'cutlist';

const CUSTOM_TEMPLATES = BUILTIN_ITEMS.filter((i) => isCustomFurnitureCategory(i.category));
const FURNITURE_MATERIALS = BUILTIN_MATERIALS.filter((m) => m.kind === 'furniture');

const SLOT_LABELS_CUSTOM: Record<ObjectFinishSlot, string> = {
  body: 'Carcasă (PAL)',
  front: 'Fronturi (MDF / PAL)',
  top: 'Blat / Interior lemn',
  metal: 'Feronerie / Cadru metalic',
};

const failure = (r: Extract<CommitResult, { ok: false }>): string =>
  r.reason === 'invalid' ? describeCommitFailure(r) : r.message;

interface DraftPiece {
  editingObjectId: string | null;
  item: CatalogItem;
  name: string;
  size: ObjectSize;
  params: ObjectParams;
  colorHex: string;
  /** `finishId` ales pentru fiecare zonă (slot) a piesei. */
  slotMaterials: Partial<Record<ObjectFinishSlot, string>>;
}

function draftFromTemplate(item: CatalogItem): DraftPiece {
  return {
    editingObjectId: null,
    item,
    name: item.name.ro,
    size: { ...item.defaultSize },
    params: defaultParams(item),
    colorHex: item.defaultColorHex ?? '#d4c8b8',
    slotMaterials: {
      body: 'mat.furn.sonoma-oak',
      front: 'mat.furn.cashmere',
    },
  };
}

function draftFromExisting(
  obj: PlacedObject,
  item: CatalogItem,
  doc: SessionState['doc'],
): DraftPiece {
  const slotMaterials: Partial<Record<ObjectFinishSlot, string>> = {};
  for (const a of Object.values(doc.finishAssignments)) {
    if (a.target.kind === 'objectSlot' && a.target.objectId === obj.id) {
      slotMaterials[a.target.slot] = a.finishId;
    }
  }
  return {
    editingObjectId: obj.id,
    item,
    name: obj.name ?? item.name.ro,
    size: { ...obj.size },
    params: { ...defaultParams(item), ...obj.params },
    colorHex: obj.colorHex ?? item.defaultColorHex ?? '#d4c8b8',
    slotMaterials,
  };
}

function MaterialSwatchThumb({ finish }: { finish: Finish }) {
  const look = useMemo(() => resolveLook(finish), [finish]);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- miniatură locală BMP în data-URL
    <img
      src={swatchDataUrl(look)}
      width={28}
      height={28}
      alt={finish.name.ro}
      className="h-7 w-7 shrink-0 rounded-md border border-stone-200"
    />
  );
}

/**
 * Studioul dedicat „Mobilă la comandă”:
 * - Stânga: Șabloane parametrice + Piese la comandă existente în proiect
 * - Centru: Preview 3D izolat (compus în `app/`) + Toggle „Fără uși” + Cote + Vederi rapide
 * - Dreapta: Configurator (Structură | Materiale pe zone | Fișă debitare & Cost + Export CSV) + „Plasează în plan”
 */
export function CustomFurnitureStudio({
  session,
  state,
  initialObjectId = null,
  onPlacedInPlan,
  renderPreview,
  genId = newId,
}: {
  session: ProjectSession;
  state: SessionState;
  /** Dacă utilizatorul a apăsat „Deschide în Configurator” pe o piesă din plan. */
  initialObjectId?: string | null;
  /** După plasare/actualizare în plan, selectează obiectul și opțional trece în Plan 2D. */
  onPlacedInPlan: (objectId: string, goToPlan: boolean) => void;
  /** Render prop pentru previzualizarea 3D izolată (compus în `app/` ca să nu importe Three aici). */
  renderPreview: (props: CustomPreviewProps) => ReactNode;
  genId?: () => string;
}) {
  const { doc } = state;
  const editable = !state.readOnly && !state.conflict && state.status !== 'closed';
  const currency = doc.settings.currency;

  const projectCustomObjects = useMemo(() => {
    return Object.values(doc.objects)
      .map((obj) => {
        const item = doc.catalogSnapshot.items[obj.catalogItemId];
        return item && isCustomFurnitureCategory(item.category) ? { obj, item } : null;
      })
      .filter((x): x is { obj: PlacedObject; item: CatalogItem } => x !== null);
  }, [doc.objects, doc.catalogSnapshot.items]);

  const [draft, setDraft] = useState<DraftPiece>(() => {
    if (initialObjectId && doc.objects[initialObjectId]) {
      const o = doc.objects[initialObjectId]!;
      const it = doc.catalogSnapshot.items[o.catalogItemId];
      if (it && isCustomFurnitureCategory(it.category)) return draftFromExisting(o, it, doc);
    }
    return draftFromTemplate(CUSTOM_TEMPLATES[0]!);
  });

  const [configTab, setConfigTab] = useState<ConfigTab>('structure');
  const [hideFronts, setHideFronts] = useState(false);
  const [showDimensions, setShowDimensions] = useState(true);
  const [viewPreset, setViewPreset] = useState<CustomPreviewPreset>('perspective');
  const [viewNonce, setViewNonce] = useState(0);
  const [activeSlot, setActiveSlot] = useState<ObjectFinishSlot>('body');
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(
    null,
  );

  const slotLooks = useMemo<SlotLooks>(() => {
    const out: SlotLooks = {};
    for (const slot of OBJECT_FINISH_SLOTS) {
      const fid = draft.slotMaterials[slot];
      if (!fid) continue;
      const fin =
        doc.catalogSnapshot.finishes[fid] ?? FURNITURE_MATERIALS.find((m) => m.id === fid);
      if (!fin) continue;
      const l = resolveLook(fin);
      out[slot] = { hex: l.baseColorHex, roughness: l.roughness, metalness: l.metalness };
    }
    return out;
  }, [draft.slotMaterials, doc.catalogSnapshot.finishes]);

  const cutList = useMemo(
    () => computeCutList(draft.item.recipe.id, draft.size, draft.params),
    [draft.item.recipe.id, draft.size, draft.params],
  );

  const updateSize = (key: keyof ObjectSize, val: number): string | null => {
    const lim = draft.item.sizeLimits[key];
    if (!Number.isInteger(val) || val < lim.min || val > lim.max) {
      return `Valoarea trebuie să fie între ${lim.min} și ${lim.max} mm.`;
    }
    setDraft((prev) => ({ ...prev, size: { ...prev.size, [key]: val } }));
    return null;
  };

  const setParam = (key: string, value: number | string | boolean): string | null => {
    setDraft((prev) => ({ ...prev, params: { ...prev.params, [key]: value } }));
    return null;
  };

  const commitToProject = (asNew: boolean, goToPlan: boolean) => {
    setFeedback(null);
    let targetId: string | null = null;
    const isUpdate =
      !asNew && draft.editingObjectId !== null && draft.editingObjectId in doc.objects;

    const r = session.apply(
      isUpdate ? `Actualizează „${draft.name}”` : `Plasează „${draft.name}”`,
      (d) => {
        let cur = d;
        if (isUpdate && draft.editingObjectId) {
          targetId = draft.editingObjectId;
          const up = updateObject(cur, targetId, {
            name: draft.name.trim() || null,
            size: draft.size,
            params: draft.params,
            colorHex: draft.colorHex,
          });
          if (!up.ok) return up;
          cur = up.value;
        } else {
          const place = suggestPlacement(cur, draft.item, draft.size, selectGeometry(cur));
          const added = addObject(
            cur,
            draft.item,
            {
              position: place.position,
              rotationDeg: place.rotationDeg,
              wallId: place.wallId,
              size: draft.size,
              params: draft.params,
              colorHex: draft.colorHex,
            },
            genId,
          );
          if (!added.ok) return added;
          cur = added.value.doc;
          targetId = added.value.objectId;
          if (draft.name.trim() && draft.name.trim() !== draft.item.name.ro) {
            const renamed = updateObject(cur, targetId, { name: draft.name.trim() });
            if (!renamed.ok) return renamed;
            cur = renamed.value;
          }
        }

        // Aplică finisajele pe sloturi (body, front, top, metal)
        for (const slot of OBJECT_FINISH_SLOTS) {
          const fid = draft.slotMaterials[slot];
          const target = { kind: 'objectSlot' as const, objectId: targetId!, slot };
          if (fid) {
            const mat =
              cur.catalogSnapshot.finishes[fid] ?? FURNITURE_MATERIALS.find((m) => m.id === fid);
            if (mat) {
              const applied = applyFinish(cur, mat, target, genId);
              if (!applied.ok) return applied;
              cur = applied.value.doc;
            }
          } else {
            const cleared = clearFinish(cur, target);
            if (cleared.ok) cur = cleared.value;
          }
        }

        // Sincronizează costul estimat din debitare în bugetul proiectului (suprascriere de preț unitar)
        const priceSync = setLineOverride(cur, `object:${targetId!}`, {
          unitPriceMinor: cutList.cost.totalMinor,
          note: `Mobilă la comandă: ${draft.size.widthMm}×${draft.size.depthMm}×${draft.size.heightMm} mm (${cutList.boardAreaGrossM2} m² placă, ${cutList.edgeBandMl} ml cant)`,
        });
        if (priceSync.ok) cur = priceSync.value;

        return { ok: true, value: cur };
      },
    );

    if (!r.ok) {
      setFeedback({ tone: 'error', text: failure(r) });
      return;
    }

    if (targetId) {
      setDraft((prev) => ({ ...prev, editingObjectId: targetId }));
      setFeedback({
        tone: 'success',
        text: isUpdate
          ? `Piesa „${draft.name}” a fost actualizată în plan și în buget.`
          : `Piesa „${draft.name}” a fost plasată în plan și adăugată în buget.`,
      });
      onPlacedInPlan(targetId, goToPlan);
    }
  };

  const exportCsv = () => {
    downloadTextFile(
      cutListFileName(draft.name),
      cutListToCsv(draft.name, draft.size, cutList, ';'),
      'text/csv',
    );
  };

  const L = draft.item.sizeLimits;

  return (
    <section
      aria-label="Studio mobilă la comandă"
      className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row"
      data-testid="custom-furniture-studio"
    >
      {/* COLOANA STÂNGA: Șabloane parametrice + Piese în proiect */}
      <aside
        aria-label="Șabloane și piese la comandă"
        className="studio-scroll flex shrink-0 flex-col gap-4 border-b border-stone-200 bg-surface p-3 lg:w-[252px] lg:overflow-y-auto lg:border-r lg:border-b-0"
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase">
              + Nou la comandă
            </h2>
            <Badge tone="warning">La mm</Badge>
          </div>
          <ul className="space-y-1.5">
            {CUSTOM_TEMPLATES.map((tpl) => {
              const active = draft.editingObjectId === null && draft.item.id === tpl.id;
              return (
                <li key={tpl.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(draftFromTemplate(tpl));
                      setFeedback(null);
                    }}
                    data-testid={`custom-template-${tpl.id}`}
                    className={`flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-teal-700 ${
                      active
                        ? 'border-amber-600/60 bg-amber-50/70 text-stone-950 shadow-2xs'
                        : 'border-stone-200 bg-surface-subtle text-stone-800 hover:border-stone-300 hover:bg-surface'
                    }`}
                  >
                    <IconCustomFurniture
                      size={16}
                      className={active ? 'mt-0.5 text-amber-700' : 'mt-0.5 text-stone-400'}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{tpl.name.ro}</p>
                      <p className="text-[10px] tabular-nums text-stone-500">
                        {tpl.defaultSize.widthMm} × {tpl.defaultSize.depthMm} ×{' '}
                        {tpl.defaultSize.heightMm} mm
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="space-y-2 border-t border-stone-200/80 pt-3">
          <h2 className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase">
            Piese în proiect ({projectCustomObjects.length})
          </h2>
          {projectCustomObjects.length === 0 ? (
            <p className="rounded-xl border border-dashed border-stone-200 p-3 text-xs text-stone-500">
              Nu ai plasat încă piese la comandă în acest proiect. Configurează un șablon și apasă
              „Plasează în plan”.
            </p>
          ) : (
            <ul className="space-y-1" data-testid="custom-project-pieces">
              {projectCustomObjects.map(({ obj, item }) => {
                const active = draft.editingObjectId === obj.id;
                return (
                  <li key={obj.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setDraft(draftFromExisting(obj, item, doc));
                        setFeedback(null);
                      }}
                      data-testid={`custom-piece-${obj.id}`}
                      className={`flex w-full flex-col rounded-xl border px-2.5 py-2 text-left transition-colors ${
                        active
                          ? 'border-teal-700 bg-teal-50 text-teal-950'
                          : 'border-stone-200 bg-surface-subtle text-stone-800 hover:bg-surface'
                      }`}
                    >
                      <span className="truncate text-xs font-semibold">
                        {obj.name ?? item.name.ro}
                      </span>
                      <span className="text-[10px] tabular-nums text-stone-500">
                        {obj.size.widthMm} × {obj.size.depthMm} × {obj.size.heightMm} mm
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* COLOANA CENTRALĂ: Preview 3D Izolat + Floating Controls */}
      <div className="relative flex min-h-[22rem] min-w-0 flex-1 flex-col bg-canvas">
        {renderPreview({
          recipe: draft.item.recipe,
          sizeMm: draft.size,
          params: draft.params,
          colorHex: draft.colorHex,
          slotLooks,
          hideFronts,
          viewPreset,
          viewNonce,
          showDimensions,
        })}

        {/* Floating Bottom Controls Pill */}
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex flex-wrap items-center justify-center gap-2">
          <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-full border border-stone-200/90 bg-surface/92 px-2 py-1 shadow-md backdrop-blur-md">
            <Button
              variant={hideFronts ? 'primary' : 'ghost'}
              size="xs"
              className="rounded-full"
              aria-pressed={hideFronts}
              onClick={() => setHideFronts((v) => !v)}
              data-testid="custom-toggle-interior"
            >
              {hideFronts ? <IconEyeOff size={13} /> : <IconEye size={13} />}
              {hideFronts ? 'Cu uși' : 'Vezi interiorul (fără uși)'}
            </Button>
            <Button
              variant={showDimensions ? 'secondary' : 'ghost'}
              size="xs"
              className="rounded-full"
              aria-pressed={showDimensions}
              onClick={() => setShowDimensions((v) => !v)}
              data-testid="custom-toggle-dimensions"
            >
              <IconRuler size={13} />
              Cote
            </Button>
            <span className="mx-0.5 h-4 w-px bg-stone-200" aria-hidden="true" />
            {(
              [
                ['perspective', '3D'],
                ['front', 'Față'],
                ['side', 'Lateral'],
                ['top', 'De sus'],
              ] as const
            ).map(([preset, label]) => (
              <Button
                key={preset}
                variant={viewPreset === preset ? 'secondary' : 'ghost'}
                size="xs"
                className="rounded-full"
                onClick={() => {
                  setViewPreset(preset);
                  setViewNonce((n) => n + 1);
                }}
                data-testid={`custom-view-${preset}`}
              >
                {label}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full"
              aria-label="Resetează unghiul 3D"
              title="Resetează unghiul 3D"
              onClick={() => {
                setViewPreset('perspective');
                setViewNonce((n) => n + 1);
              }}
            >
              <IconRotateCcw size={13} />
            </Button>
          </div>
        </div>
      </div>

      {/* COLOANA DREAPTA: Configurator Parametric + Materiale + Fișă Debitare */}
      <aside
        aria-label="Configurator piesă"
        className="flex shrink-0 flex-col border-t border-stone-200 bg-surface lg:w-[336px] lg:border-t-0 lg:border-l"
      >
        {/* Sub-taburi Configurator */}
        <div className="border-b border-stone-200 p-2.5">
          <div
            role="group"
            aria-label="Secțiuni configurator"
            className="grid grid-cols-3 gap-1 rounded-lg bg-stone-100 p-0.5"
          >
            {(
              [
                ['structure', 'Structură'],
                ['materials', 'Materiale'],
                ['cutlist', 'Debitare & €'],
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                aria-pressed={configTab === tab}
                onClick={() => setConfigTab(tab)}
                data-testid={`custom-tab-${tab}`}
                className={`rounded-md px-2 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-teal-700 ${
                  configTab === tab
                    ? 'bg-surface text-stone-950 shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Conținut scrollabil configurator */}
        <div className="studio-scroll flex-1 space-y-3 overflow-y-auto p-3">
          {feedback ? (
            <Alert tone={feedback.tone} title={feedback.text} testId="custom-feedback" />
          ) : null}

          {configTab === 'structure' ? (
            <div className="space-y-3" data-testid="custom-panel-structure">
              <TextField
                label="Denumire piesă"
                value={draft.name}
                disabled={!editable}
                testId="custom-piece-name"
                onCommit={(v) => {
                  setDraft((prev) => ({ ...prev, name: v || prev.item.name.ro }));
                  return null;
                }}
              />

              <InspectorSection title="Dimensiuni (mm)" defaultOpen>
                <div className="grid grid-cols-3 gap-1.5">
                  <NumberField
                    label="Lățime"
                    hint={`${L.widthMm.min}–${L.widthMm.max}`}
                    unit="mm"
                    value={draft.size.widthMm}
                    disabled={!editable}
                    min={L.widthMm.min}
                    step={10}
                    testId="custom-width"
                    onCommit={(v) => updateSize('widthMm', v)}
                  />
                  <NumberField
                    label="Adâncime"
                    hint={`${L.depthMm.min}–${L.depthMm.max}`}
                    unit="mm"
                    value={draft.size.depthMm}
                    disabled={!editable}
                    min={L.depthMm.min}
                    step={10}
                    testId="custom-depth"
                    onCommit={(v) => updateSize('depthMm', v)}
                  />
                  <NumberField
                    label="Înălțime"
                    hint={`${L.heightMm.min}–${L.heightMm.max}`}
                    unit="mm"
                    value={draft.size.heightMm}
                    disabled={!editable}
                    min={L.heightMm.min}
                    step={10}
                    testId="custom-height"
                    onCommit={(v) => updateSize('heightMm', v)}
                  />
                </div>
              </InspectorSection>

              <InspectorSection title="Compartimentare & structură" defaultOpen>
                {Object.entries(draft.item.paramSpecs).map(([key, spec]) => {
                  const current = draft.params[key] ?? spec.default;
                  if (spec.type === 'number') {
                    return (
                      <NumberField
                        key={key}
                        label={paramLabel(key)}
                        hint={`${spec.min}–${spec.max}`}
                        value={Number(current)}
                        disabled={!editable}
                        min={spec.min}
                        step={spec.step}
                        testId={`custom-param-${key}`}
                        onCommit={(v) => {
                          if (v < spec.min || v > spec.max || !Number.isInteger(v))
                            return `Între ${spec.min} și ${spec.max}.`;
                          return setParam(key, v);
                        }}
                      />
                    );
                  }
                  if (spec.type === 'enum') {
                    return (
                      <SelectField
                        key={key}
                        label={paramLabel(key)}
                        value={String(current)}
                        options={spec.options.map((o) => ({ value: o, label: optionLabel(o) }))}
                        disabled={!editable}
                        testId={`custom-param-${key}`}
                        onChange={(v) => setParam(key, v)}
                      />
                    );
                  }
                  return (
                    <label
                      key={key}
                      className="flex min-h-8 cursor-pointer items-center gap-2 text-xs text-stone-800"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(current)}
                        disabled={!editable}
                        onChange={(e) => setParam(key, e.target.checked)}
                        className="h-3.5 w-3.5 accent-teal-700"
                        data-testid={`custom-param-${key}`}
                      />
                      {paramLabel(key)}
                    </label>
                  );
                })}
              </InspectorSection>
            </div>
          ) : null}

          {configTab === 'materials' ? (
            <div className="space-y-3" data-testid="custom-panel-materials">
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase">
                  Alege zona de finisat
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {OBJECT_FINISH_SLOTS.map((slot) => {
                    const assignedId = draft.slotMaterials[slot];
                    const mat = FURNITURE_MATERIALS.find((m) => m.id === assignedId);
                    const active = activeSlot === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => setActiveSlot(slot)}
                        data-testid={`custom-slot-${slot}`}
                        className={`flex flex-col rounded-xl border p-2 text-left transition-colors ${
                          active
                            ? 'border-teal-700 bg-teal-50 text-teal-950'
                            : 'border-stone-200 bg-surface-subtle text-stone-800 hover:bg-surface'
                        }`}
                      >
                        <span className="text-[11px] font-semibold">
                          {SLOT_LABELS_CUSTOM[slot]}
                        </span>
                        <span className="truncate text-[10px] text-stone-500">
                          {mat ? mat.name.ro : `Implicit (${OBJECT_SLOT_LABEL[slot]})`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5 border-t border-stone-200/80 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold tracking-wider text-stone-500 uppercase">
                    Decor PAL / MDF / Metal
                  </span>
                  {draft.slotMaterials[activeSlot] ? (
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((prev) => {
                          const next = { ...prev.slotMaterials };
                          delete next[activeSlot];
                          return { ...prev, slotMaterials: next };
                        })
                      }
                      className="text-[11px] font-medium text-stone-500 underline hover:text-stone-900"
                    >
                      Resetează zona
                    </button>
                  ) : null}
                </div>
                <ul className="space-y-1">
                  {FURNITURE_MATERIALS.map((mat) => {
                    const selected = draft.slotMaterials[activeSlot] === mat.id;
                    return (
                      <li key={mat.id}>
                        <button
                          type="button"
                          disabled={!editable}
                          onClick={() =>
                            setDraft((prev) => ({
                              ...prev,
                              slotMaterials: { ...prev.slotMaterials, [activeSlot]: mat.id },
                            }))
                          }
                          data-testid={`custom-mat-${mat.id}`}
                          className={`flex w-full items-center gap-2.5 rounded-xl border p-2 text-left transition-colors ${
                            selected
                              ? 'border-teal-700 bg-teal-50 text-teal-950'
                              : 'border-stone-200 bg-surface-subtle text-stone-800 hover:bg-surface'
                          }`}
                        >
                          <MaterialSwatchThumb finish={mat} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">{mat.name.ro}</p>
                            <p className="text-[10px] text-stone-500">
                              +{formatMoney(mat.unitPriceMinor, currency)}/zonă
                            </p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          ) : null}

          {configTab === 'cutlist' ? (
            <div className="space-y-3" data-testid="custom-panel-cutlist">
              {/* KPI rezumat materiale */}
              <div className="grid grid-cols-2 gap-1.5">
                <div className="rounded-xl border border-stone-200 bg-surface-subtle p-2.5">
                  <p className="text-[10px] font-medium text-stone-500 uppercase">Plăci PAL/MDF</p>
                  <p
                    className="mt-0.5 text-sm font-semibold tabular-nums text-stone-900"
                    data-testid="cutlist-area"
                  >
                    {cutList.boardAreaGrossM2} m²
                  </p>
                  <p className="text-[10px] tabular-nums text-stone-500">
                    ~{cutList.sheetsNeeded} {cutList.sheetsNeeded === 1 ? 'coală' : 'coli'} (cu 15%
                    pierdere)
                  </p>
                </div>
                <div className="rounded-xl border border-stone-200 bg-surface-subtle p-2.5">
                  <p className="text-[10px] font-medium text-stone-500 uppercase">Cant ABS</p>
                  <p
                    className="mt-0.5 text-sm font-semibold tabular-nums text-stone-900"
                    data-testid="cutlist-edge"
                  >
                    {cutList.edgeBandMl} ml
                  </p>
                  <p className="text-[10px] tabular-nums text-stone-500">
                    Spate PFL: {cutList.backAreaM2} m²
                  </p>
                </div>
              </div>

              {/* Tabel panouri de debitat */}
              <InspectorSection
                title="Panouri de debitat"
                badge={`${cutList.panels.reduce((s, p) => s + p.qty, 0)} buc`}
                defaultOpen
              >
                <div className="overflow-x-auto rounded-lg border border-stone-200">
                  <table className="w-full text-left text-[11px]" data-testid="cutlist-table">
                    <thead className="bg-stone-100 text-[10px] text-stone-600 uppercase">
                      <tr>
                        <th className="px-2 py-1.5 font-semibold">Piesă</th>
                        <th className="px-2 py-1.5 text-right font-semibold">mm</th>
                        <th className="px-2 py-1.5 text-right font-semibold">Buc</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cutList.panels.map((p) => (
                        <tr key={p.id} className="border-t border-stone-200/80">
                          <td className="px-2 py-1.5">
                            <span className="font-medium text-stone-900">{p.part}</span>
                            <span className="block text-[10px] text-stone-500">
                              {p.thicknessMm} mm
                            </span>
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-stone-700">
                            {p.lengthMm}×{p.widthMm}
                          </td>
                          <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-stone-900">
                            {p.qty}×
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </InspectorSection>

              {/* Feronerie */}
              <InspectorSection title="Feronerie & accesorii" defaultOpen>
                <ul className="space-y-1 text-xs">
                  {cutList.hardware.map((h) => (
                    <li key={h.id} className="flex items-baseline justify-between gap-2">
                      <span className="text-stone-700">
                        <strong className="tabular-nums text-stone-900">
                          {h.qty} {h.unit}
                        </strong>{' '}
                        {h.name}
                      </span>
                      <span className="shrink-0 tabular-nums text-stone-600">
                        {formatMoney(h.totalMinor, currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </InspectorSection>

              {/* Defalcare cost */}
              <div className="rounded-xl border border-stone-200 bg-surface-subtle p-2.5 text-xs">
                <dl className="space-y-1 tabular-nums text-stone-600">
                  <div className="flex justify-between">
                    <dt>Plăci PAL/MDF + PFL</dt>
                    <dd>
                      {formatMoney(cutList.cost.boardsMinor + cutList.cost.backMinor, currency)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Cant ABS & debitare CNC</dt>
                    <dd>
                      {formatMoney(
                        cutList.cost.edgeBandMinor + cutList.cost.cuttingMinor,
                        currency,
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Feronerie</dt>
                    <dd>{formatMoney(cutList.cost.hardwareMinor, currency)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-stone-200 pt-1.5 font-semibold text-stone-950">
                    <dt>Total estimativ corp</dt>
                    <dd data-testid="cutlist-total">
                      {formatMoney(cutList.cost.totalMinor, currency)}
                    </dd>
                  </div>
                </dl>
              </div>

              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={exportCsv}
                data-testid="cutlist-export-csv"
              >
                <IconDownload size={14} />
                Exportă CSV debitare (atelier)
              </Button>
            </div>
          ) : null}
        </div>

        {/* Sticky Footer CTA: Preț live + Plasează / Actualizează în plan */}
        <div className="shrink-0 space-y-2 border-t border-stone-200 bg-surface p-3">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-stone-500">Cost estimat (demonstrativ)</span>
            <span className="text-sm font-bold tabular-nums text-stone-950">
              {formatMoney(cutList.cost.totalMinor, currency)}
            </span>
          </div>
          {draft.editingObjectId ? (
            <div className="grid grid-cols-2 gap-1.5">
              <Button
                variant="primary"
                size="sm"
                disabled={!editable}
                onClick={() => commitToProject(false, false)}
                data-testid="custom-update-in-plan"
              >
                Actualizează
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={!editable}
                onClick={() => commitToProject(false, true)}
                data-testid="custom-open-in-plan"
              >
                <IconPlan2D size={14} />
                Vezi în 2D
              </Button>
            </div>
          ) : (
            <Button
              variant="primary"
              size="md"
              className="w-full"
              disabled={!editable}
              onClick={() => commitToProject(true, true)}
              data-testid="custom-place-in-plan"
            >
              <IconPlus size={15} />
              Plasează în plan
            </Button>
          )}
        </div>
      </aside>
    </section>
  );
}
