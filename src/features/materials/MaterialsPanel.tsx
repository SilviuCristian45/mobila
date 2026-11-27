'use client';

import { useCallback, useId, useMemo, useState } from 'react';
import {
  applyFinish,
  applyFinishToRoomWalls,
  assignmentsOn,
  clearFinish,
  finishParamRules,
  finishSurfaces,
  OBJECT_SLOT_LABEL,
  resolveLook,
  roomWallTargets,
  updateAssignmentLook,
  type Finish,
  type FinishAssignment,
  type FinishLook,
  type FinishSurface,
  type FinishTarget,
  type LookPatch,
  type ObjectFinishSlot,
  type ProjectDocument,
  type Result,
} from '@/domain';
import { buildParts, slotsOfParts } from '@/catalog';
import {
  BUILTIN_MATERIALS,
  MATERIAL_CATEGORIES,
  SURFACE_NAMES,
  searchMaterials,
  swatchDataUrl,
} from '@/materials';
import { formatMoney } from '@/lib/format';
import { newId } from '@/lib/ids';
import { describeCommitFailure } from '@/lib/messages';
import { selectBudget, selectGeometry } from '@/state/selectors';
import type { CommitResult, ProjectSession, SessionState } from '@/state/session';
import { Button } from '@/ui/Button';
import { ColorField } from '@/ui/ColorField';
import { Alert } from '@/ui/feedback';
import { InspectorSection, NumberField } from '@/ui/fields';
import { IconSearch, IconTrash, IconX } from '@/ui/icons';

const failure = (r: Extract<CommitResult, { ok: false }>): string =>
  r.reason === 'invalid' ? describeCommitFailure(r) : r.message;

type PanelTarget =
  | { kind: 'floor'; roomId: string }
  | { kind: 'roomWalls'; roomId: string }
  | { kind: 'face'; wallId: string; side: 'left' | 'right' }
  | { kind: 'slot'; slot: ObjectFinishSlot };

const encode = (t: PanelTarget): string =>
  t.kind === 'floor'
    ? `floor:${t.roomId}`
    : t.kind === 'roomWalls'
      ? `walls:${t.roomId}`
      : t.kind === 'face'
        ? `face:${t.wallId}:${t.side}`
        : `slot:${t.slot}`;
const decode = (v: string): PanelTarget | null => {
  const [k, a, b] = v.split(':');
  if (k === 'floor' && a) return { kind: 'floor', roomId: a };
  if (k === 'walls' && a) return { kind: 'roomWalls', roomId: a };
  if (k === 'face' && a && (b === 'left' || b === 'right'))
    return { kind: 'face', wallId: a, side: b };
  if (k === 'slot' && a) return { kind: 'slot', slot: a as ObjectFinishSlot };
  return null;
};

const surfaceOf = (t: PanelTarget): FinishSurface =>
  t.kind === 'floor' ? 'floor' : t.kind === 'slot' ? 'object' : 'wall';

export interface PlanSelectionInfo {
  kind: 'node' | 'wall' | 'room' | 'opening';
  id: string;
}

const chip = (active: boolean) =>
  `shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-700 ${
    active
      ? 'border-primary bg-primary text-white shadow-2xs'
      : 'border-stone-200 bg-surface-subtle text-stone-700 hover:border-stone-300 hover:bg-surface'
  }`;

function Swatch({ finish, px = 52 }: { finish: Finish; px?: number }) {
  const look = useMemo(() => resolveLook(finish), [finish]);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- miniatură generată local (BMP în data-URL)
    <img
      src={swatchDataUrl(look)}
      width={px}
      height={px}
      alt={`Previzualizare: ${finish.name.ro}`}
      className="rounded-lg border border-stone-200 shadow-2xs"
      data-testid="material-swatch"
    />
  );
}

/**
 * Panoul „Materiale și finisaje” pentru Left Drawer-ul studioului: alegi o țintă, previzualizezi și aplici materiale.
 */
export function MaterialsPanel({
  session,
  state,
  selectedObjectId,
  planSelection,
  surfaceTarget,
  onSurfaceTarget,
  onClose,
  genId = newId,
  materials = BUILTIN_MATERIALS,
  defaultCategory = null,
}: {
  session: ProjectSession;
  state: SessionState;
  selectedObjectId: string | null;
  planSelection: PlanSelectionInfo | null;
  surfaceTarget: FinishTarget | null;
  onSurfaceTarget: (t: FinishTarget | null) => void;
  onClose: () => void;
  genId?: () => string;
  materials?: readonly Finish[];
  defaultCategory?: string | null;
}) {
  const { doc } = state;
  const editable = !state.readOnly && !state.conflict && state.status !== 'closed';
  const geometry = selectGeometry(doc);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(defaultCategory);
  const targetId = useId();

  const rooms = useMemo(
    () =>
      Object.values(doc.rooms).sort(
        (a, b) => a.name.localeCompare(b.name) || (a.id < b.id ? -1 : 1),
      ),
    [doc.rooms],
  );
  const options = useMemo(() => {
    const out: Array<{ group: string; value: string; label: string }> = [];
    for (const r of rooms) {
      const g = geometry.rooms.get(r.id);
      out.push({
        group: r.name,
        value: encode({ kind: 'floor', roomId: r.id }),
        label: `Podeaua camerei „${r.name}”`,
      });
      out.push({
        group: r.name,
        value: encode({ kind: 'roomWalls', roomId: r.id }),
        label: `Toți pereții camerei „${r.name}”`,
      });
      (g?.edges ?? []).forEach((e, i) =>
        out.push({
          group: r.name,
          value: encode({ kind: 'face', wallId: e.wallId, side: e.side }),
          label: `Peretele ${i + 1} (fața dinspre „${r.name}”)`,
        }),
      );
    }
    return out;
  }, [rooms, geometry]);

  const object = selectedObjectId ? doc.objects[selectedObjectId] : undefined;
  const objectItem = object ? doc.catalogSnapshot.items[object.catalogItemId] : undefined;
  const slots = useMemo(() => {
    if (!object || !objectItem) return [] as ObjectFinishSlot[];
    const { parts } = buildParts(
      objectItem.recipe,
      [object.size.widthMm / 1000, object.size.heightMm / 1000, object.size.depthMm / 1000],
      object.params,
    );
    return slotsOfParts(parts);
  }, [object, objectItem]);

  const suggested: PanelTarget | null = (() => {
    if (surfaceTarget?.kind === 'roomFloor') return { kind: 'floor', roomId: surfaceTarget.roomId };
    if (surfaceTarget?.kind === 'wallSide')
      return { kind: 'face', wallId: surfaceTarget.wallId, side: surfaceTarget.side };
    if (selectedObjectId && slots.length > 0) return { kind: 'slot', slot: slots[0]! };
    if (planSelection?.kind === 'room') return { kind: 'floor', roomId: planSelection.id };
    if (planSelection?.kind === 'wall') {
      for (const r of rooms) {
        const e = geometry.rooms.get(r.id)?.edges.find((x) => x.wallId === planSelection.id);
        if (e) return { kind: 'face', wallId: e.wallId, side: e.side };
      }
    }
    return rooms[0] ? { kind: 'floor', roomId: rooms[0].id } : null;
  })();

  const sig = JSON.stringify([suggested, selectedObjectId]);
  const [explicit, setExplicit] = useState<{ sig: string; value: PanelTarget } | null>(null);
  const target: PanelTarget | null = explicit && explicit.sig === sig ? explicit.value : suggested;

  const domainTargets = useCallback(
    (t: PanelTarget): FinishTarget[] =>
      t.kind === 'floor'
        ? [{ kind: 'roomFloor', roomId: t.roomId }]
        : t.kind === 'roomWalls'
          ? roomWallTargets(doc, t.roomId, geometry)
          : t.kind === 'face'
            ? [{ kind: 'wallSide', wallId: t.wallId, side: t.side }]
            : selectedObjectId
              ? [{ kind: 'objectSlot', objectId: selectedObjectId, slot: t.slot }]
              : [],
    [doc, geometry, selectedObjectId],
  );
  const targets = target ? domainTargets(target) : [];
  const single = targets.length === 1 ? targets[0]! : null;
  const applied: FinishAssignment[] = targets.flatMap((t) => assignmentsOn(doc, t));
  const current = single ? (assignmentsOn(doc, single)[0] ?? null) : null;
  const surface = target ? surfaceOf(target) : null;

  const edit = useCallback(
    (label: string, op: (d: ProjectDocument) => Result<ProjectDocument>): string | null => {
      const r = session.apply(label, op);
      setError(null);
      return r.ok ? null : failure(r);
    },
    [session],
  );
  const run = useCallback(
    (label: string, op: (d: ProjectDocument) => Result<ProjectDocument>): string | null => {
      const err = edit(label, op);
      setError(err);
      return err;
    },
    [edit],
  );

  const choose = (m: Finish) => {
    if (!target) return;
    if (target.kind === 'roomWalls') {
      run(`Aplică „${m.name.ro}” pe pereți`, (d) => {
        const r = applyFinishToRoomWalls(d, m, target.roomId, genId, {}, selectGeometry(d));
        return r.ok ? { ok: true, value: r.value.doc } : r;
      });
      return;
    }
    const t = targets[0];
    if (!t) return;
    run(`Aplică „${m.name.ro}”`, (d) => {
      const r = applyFinish(d, m, t, genId);
      return r.ok ? { ok: true, value: r.value.doc } : r;
    });
  };

  const remove = () => {
    let first = true;
    run('Elimină materialul', (d) => {
      let cur = d;
      for (const t of targets) {
        if (assignmentsOn(cur, t).length === 0) continue;
        const r = clearFinish(cur, t);
        if (!r.ok) return r;
        cur = r.value;
        first = false;
      }
      return first
        ? { ok: false, error: 'Nu există niciun material aplicat aici.' }
        : { ok: true, value: cur };
    });
  };

  const patchLook = (label: string, patch: LookPatch, waste?: number): string | null =>
    current ? edit(label, (d) => updateAssignmentLook(d, current.id, patch, waste)) : null;

  const list = useMemo(
    () => searchMaterials(query, { surface, category }, materials),
    [query, surface, category, materials],
  );

  const budget = useMemo(() => {
    try {
      const b = selectBudget(doc);
      const rows = b.lines.filter((l) => l.key.startsWith('finish:'));
      const sum = rows.reduce((a, l) => a + l.totals.grossMinor, 0);
      return { rows, sum, error: null as string | null };
    } catch (e) {
      return {
        rows: [],
        sum: 0,
        error: e instanceof Error ? e.message : 'Estimarea nu se poate calcula.',
      };
    }
  }, [doc]);
  const currency = doc.settings.currency;

  return (
    <section
      aria-label="Materiale și finisaje"
      className="space-y-2.5"
      data-testid="materials-panel"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold tracking-tight text-stone-900">
          Materiale & Finisaje
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Închide panoul de materiale"
          title="Închide panoul de materiale"
          data-testid="materials-close"
          className="rounded-md p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-teal-700"
        >
          <IconX size={14} />
        </button>
      </div>

      {error ? (
        <Alert tone="error" title="Nu s-a putut aplica" testId="materials-error">
          {error}
        </Alert>
      ) : null}
      {!editable ? (
        <p
          className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900"
          role="status"
        >
          Proiectul este doar pentru citire în acest tab: materialele nu se pot modifica.
        </p>
      ) : null}

      {/* Țintă */}
      {rooms.length === 0 && !object ? (
        <p
          className="rounded-xl border border-stone-200 bg-surface-subtle p-3 text-xs text-stone-700"
          data-testid="materials-no-target"
        >
          Adaugă o cameră în planul 2D (sau selectează un obiect) ca să poți aplica materiale.
        </p>
      ) : (
        <div className="space-y-1">
          <label htmlFor={targetId} className="block text-[11px] font-medium text-stone-600">
            Aplică pe
          </label>
          <select
            id={targetId}
            value={target ? encode(target) : ''}
            onChange={(e) => {
              const t = decode(e.target.value);
              if (t) setExplicit({ sig, value: t });
              if (t?.kind === 'floor') onSurfaceTarget({ kind: 'roomFloor', roomId: t.roomId });
              else if (t?.kind === 'face')
                onSurfaceTarget({ kind: 'wallSide', wallId: t.wallId, side: t.side });
            }}
            className="min-h-8 w-full rounded-lg border border-stone-200 bg-surface-subtle px-2.5 py-1 text-xs text-stone-900 focus-visible:border-teal-600 focus-visible:bg-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-700"
            data-testid="materials-target"
          >
            {slots.length > 0 && object ? (
              <optgroup label={`Obiect: ${object.name ?? objectItem?.name.ro ?? 'selectat'}`}>
                {slots.map((s) => (
                  <option key={s} value={encode({ kind: 'slot', slot: s })}>
                    {OBJECT_SLOT_LABEL[s]}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {target && !slotOrOption(target, options) ? (
              <optgroup label="Selecție">
                <option value={encode(target)}>{extraLabel(target)}</option>
              </optgroup>
            ) : null}
            {[...new Set(options.map((o) => o.group))].map((g) => (
              <optgroup key={g} label={g}>
                {options
                  .filter((o) => o.group === g)
                  .map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <p className="text-[11px] text-stone-500" data-testid="materials-surface-hint">
            Suprafață:{' '}
            <span className="font-medium text-stone-700">
              {surface ? SURFACE_NAMES[surface] : '—'}
            </span>{' '}
            (doar materiale compatibile)
          </p>
        </div>
      )}

      {/* Material aplicat */}
      {target ? (
        <div
          className="rounded-xl border border-stone-200/80 bg-surface-subtle p-2.5"
          data-testid="materials-current"
        >
          {applied.length === 0 ? (
            <p className="text-xs text-stone-600">Nu este aplicat niciun material aici.</p>
          ) : (
            <AppliedSummary
              doc={doc}
              applied={applied}
              total={targets.length}
              single={current}
              editable={editable}
              onRemove={remove}
              onPatch={patchLook}
            />
          )}
        </div>
      ) : null}

      {/* Căutare + categorii */}
      <div className="space-y-2">
        <div className="relative">
          <label htmlFor={`${targetId}-q`} className="sr-only">
            Caută material
          </label>
          <IconSearch
            size={14}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-stone-400"
          />
          <input
            id={`${targetId}-q`}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Caută parchet, gresie, stejar…"
            className="min-h-8 w-full rounded-lg border border-stone-200 bg-surface-subtle py-1 pr-2.5 pl-8 text-xs text-stone-900 placeholder:text-stone-400 focus-visible:border-teal-600 focus-visible:bg-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-700"
            data-testid="materials-search"
          />
        </div>
        <div
          className="studio-scroll flex gap-1 overflow-x-auto pb-1"
          role="group"
          aria-label="Categorii de materiale"
        >
          <button
            type="button"
            className={chip(category === null)}
            aria-pressed={category === null}
            onClick={() => setCategory(null)}
            data-testid="materials-category-all"
          >
            Toate
          </button>
          {MATERIAL_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={chip(category === c.id)}
              aria-pressed={category === c.id}
              onClick={() => setCategory(c.id)}
              data-testid={`materials-category-${c.id}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <p
        className="text-[11px] tabular-nums text-stone-500"
        role="status"
        data-testid="materials-count"
      >
        {list.length} {list.length === 1 ? 'material' : 'materiale'}
      </p>

      {list.length === 0 ? (
        <p
          className="rounded-xl border border-stone-200 bg-surface-subtle p-3 text-xs text-stone-600"
          data-testid="materials-empty"
        >
          Niciun material compatibil găsit{query ? ` pentru „${query}”` : ''}. Schimbă ținta,
          categoria sau termenul căutat.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-1.5" data-testid="materials-list">
          {list.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                disabled={!editable || !target}
                onClick={() => choose(m)}
                title={`Aplică „${m.name.ro}” (compatibil: ${finishSurfaces(m)
                  .map((s) => SURFACE_NAMES[s])
                  .join(', ')})`}
                className="flex h-full w-full flex-col items-center gap-1 rounded-xl border border-stone-200 bg-surface-subtle p-2 text-center transition-all hover:border-teal-600 hover:bg-surface hover:shadow-xs focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-60 aria-pressed:border-teal-700 aria-pressed:bg-teal-50"
                aria-pressed={applied.some((a) => a.finishId === m.id)}
                data-testid={`material-${m.id}`}
              >
                <Swatch finish={m} />
                <span className="line-clamp-2 text-[11px] leading-tight font-medium text-stone-900">
                  {m.name.ro}
                </span>
                <span className="text-[10px] tabular-nums text-stone-500">
                  {priceLabel(m, currency)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Estimare compactă */}
      <InspectorSection title="Estimare materiale" defaultOpen>
        <div
          className="rounded-lg border border-stone-200/80 bg-surface-subtle p-2.5 text-xs text-stone-700"
          data-testid="materials-budget"
        >
          {budget.error ? (
            <p role="alert" className="text-red-800">
              {budget.error}
            </p>
          ) : budget.rows.length === 0 ? (
            <p className="text-stone-500">Niciun material aplicat încă.</p>
          ) : (
            <>
              <ul className="space-y-0.5 text-[11px]">
                {budget.rows.map((l) => (
                  <li
                    key={l.key}
                    className="flex justify-between gap-2"
                    data-testid={`materials-budget-${l.key.slice(7)}`}
                  >
                    <span className="truncate">
                      {l.description} — {l.effective.quantity} {l.unit}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatMoney(l.totals.grossMinor, currency)}
                    </span>
                  </li>
                ))}
              </ul>
              <p
                className="mt-1.5 flex justify-between border-t border-stone-200 pt-1.5 font-semibold tabular-nums text-stone-900"
                data-testid="materials-budget-total"
              >
                <span>Total materiale</span>
                <span>{formatMoney(budget.sum, currency)}</span>
              </p>
            </>
          )}
          <p className="mt-2 text-[10px] leading-relaxed text-stone-500">
            Prețuri demonstrative, nu prețuri de piață. Cantitățile folosesc suprafețele din plan
            (arii nete, cu rebut, rotunjite la ambalaj); manopera nu este inclusă. Finisajele de
            mobilier sunt un supliment față de prețul obiectului.
          </p>
        </div>
      </InspectorSection>
    </section>
  );
}

const slotOrOption = (t: PanelTarget, options: Array<{ value: string }>): boolean =>
  t.kind === 'slot' || options.some((o) => o.value === encode(t));
const extraLabel = (t: PanelTarget): string =>
  t.kind === 'face'
    ? `Perete ${t.wallId}, fața ${t.side === 'left' ? 'stângă' : 'dreaptă'} (în afara camerelor)`
    : t.kind === 'floor'
      ? 'Podea'
      : 'Pereți';

function priceLabel(m: Finish, currency: string): string {
  const unit = { m2: 'm²', box: 'cutie', piece: 'zonă', liter: 'L', can: 'doză' }[m.priceUnit];
  return `${formatMoney(m.unitPriceMinor, currency)}/${unit}`;
}

function AppliedSummary({
  doc,
  applied,
  total,
  single,
  editable,
  onRemove,
  onPatch,
}: {
  doc: ProjectDocument;
  applied: FinishAssignment[];
  total: number;
  single: FinishAssignment | null;
  editable: boolean;
  onRemove: () => void;
  onPatch: (label: string, patch: LookPatch, waste?: number) => string | null;
}) {
  const names = [
    ...new Set(applied.map((a) => doc.catalogSnapshot.finishes[a.finishId]?.name.ro ?? a.finishId)),
  ];
  const finish = single ? doc.catalogSnapshot.finishes[single.finishId] : undefined;
  const rules = finish ? finishParamRules(finish) : null;
  const look = single?.look ?? {};
  const effective = finish ? resolveLook(finish, look) : null;
  const set = (label: string, patch: FinishLook): string | null =>
    onPatch(label, patch as LookPatch);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2.5">
        {finish ? <Swatch finish={finish} px={38} /> : null}
        <div className="min-w-0 flex-1 text-xs">
          <p className="truncate font-semibold text-stone-900" data-testid="materials-current-name">
            {names.join(', ')}
          </p>
          <p className="text-[11px] text-stone-500">
            {total > 1 ? `${applied.length} din ${total} fețe` : 'Material aplicat'}
          </p>
        </div>
        <Button
          variant="danger"
          size="xs"
          disabled={!editable}
          onClick={onRemove}
          aria-label="Elimină materialul"
          title="Elimină materialul"
          data-testid="materials-remove"
        >
          <IconTrash size={12} />
        </Button>
      </div>

      {single && finish && rules && effective ? (
        <fieldset
          className="space-y-2 border-t border-stone-200/80 pt-2"
          data-testid="materials-params"
        >
          <legend className="text-[11px] font-semibold text-stone-600">Proprietăți aplicare</legend>
          {rules.color ? (
            <ColorField
              label="Culoare"
              testPrefix="material"
              value={effective.baseColorHex}
              disabled={!editable}
              onCommit={(hex) => set('Schimbă culoarea materialului', { colorHex: hex })}
            />
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            {rules.textureScale ? (
              <NumberField
                label="Scara texturii"
                hint="25–400"
                unit="%"
                value={Math.round((look.textureScale ?? 1) * 100)}
                disabled={!editable}
                testId="material-scale"
                min={25}
                step={5}
                onCommit={(v) => set('Scara texturii', { textureScale: v / 100 })}
              />
            ) : null}
            {rules.textureRotation ? (
              <NumberField
                label="Rotație"
                hint="0–359"
                unit="°"
                value={look.textureRotationDeg ?? 0}
                disabled={!editable}
                testId="material-rotation"
                min={0}
                step={15}
                onCommit={(v) => set('Rotația texturii', { textureRotationDeg: v })}
              />
            ) : null}
            {rules.roughness ? (
              <NumberField
                label="Rugozitate"
                hint="0–100"
                unit="%"
                value={Math.round((look.roughness ?? finish.appearance.roughness) * 100)}
                disabled={!editable}
                testId="material-roughness"
                min={0}
                step={5}
                onCommit={(v) => set('Rugozitatea materialului', { roughness: v / 100 })}
              />
            ) : null}
            {rules.waste ? (
              <NumberField
                label="Rebut"
                hint="0–100"
                unit="%"
                value={single.wastePct}
                disabled={!editable}
                testId="material-waste"
                min={0}
                step={1}
                onCommit={(v) => onPatch('Rebutul materialului', {}, v)}
              />
            ) : null}
          </div>
          {Object.keys(look).length > 0 ? (
            <Button
              size="xs"
              className="w-full"
              disabled={!editable}
              onClick={() =>
                onPatch('Valorile materialului', {
                  colorHex: null,
                  textureScale: null,
                  textureRotationDeg: null,
                  roughness: null,
                })
              }
              data-testid="material-reset"
            >
              Revino la valorile materialului
            </Button>
          ) : null}
        </fieldset>
      ) : null}
    </div>
  );
}
