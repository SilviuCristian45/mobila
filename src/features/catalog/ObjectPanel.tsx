'use client';

import {
  resolveLook,
  updateObject,
  type ObjectPatch,
  type PlacedObject,
  type ProjectDocument,
  type Result,
} from '@/domain';
import { optionLabel, paramLabel } from '@/catalog';
import { Button } from '@/ui/Button';
import { ColorField } from '@/ui/ColorField';
import { NumberField, SelectField, TextField } from '@/ui/fields';
import type { SlotLooks } from '@/catalog';
import { ItemPreview } from './ItemPreview';

export type RunEdit = (
  label: string,
  operation: (doc: ProjectDocument) => Result<ProjectDocument>,
) => string | null;

const MOUNTING_LABEL = {
  floor: 'Pe podea',
  wall: 'Montat pe perete / suspendat',
  ceiling: 'Montat pe tavan',
} as const;

function CheckField({
  label,
  checked,
  disabled,
  onChange,
  testId,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
  testId: string;
}) {
  return (
    <label className="flex min-h-10 items-center gap-2 text-sm text-stone-800">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-teal-700"
        data-testid={testId}
      />
      {label}
    </label>
  );
}

/**
 * Proprietățile obiectului selectat: denumire, poziție, rotație, dimensiuni (în limitele itemului), culoare și parametrii
 * specifici. Fiecare modificare trece prin `run` (sesiune: validare, undo/redo, autosave); câmpurile arată mesajul de eroare.
 */
export function ObjectPanel({
  doc,
  object,
  editable,
  run,
  onDuplicate,
  onDelete,
}: {
  doc: ProjectDocument;
  object: PlacedObject;
  editable: boolean;
  run: RunEdit;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const item = doc.catalogSnapshot.items[object.catalogItemId];
  const apply = (label: string, patch: ObjectPatch): string | null =>
    run(label, (d) => updateObject(d, object.id, patch));
  const off = !editable;

  if (!item)
    return (
      <section
        aria-label="Proprietățile obiectului"
        data-testid="object-panel"
        className="space-y-2"
      >
        <h2 className="text-sm font-semibold text-stone-900">Obiect</h2>
        <p className="text-sm text-red-800" role="alert">
          Itemul de catalog „{object.catalogItemId}” lipsește din proiect. Obiectul se poate șterge.
        </p>
        <Button variant="danger" disabled={off} onClick={onDelete} data-testid="object-delete">
          Șterge
        </Button>
      </section>
    );

  // finisajele aplicate pe zone apar și în previzualizare
  const slotLooks: SlotLooks = {};
  for (const a of Object.values(doc.finishAssignments)) {
    if (a.target.kind !== 'objectSlot' || a.target.objectId !== object.id) continue;
    const fin = doc.catalogSnapshot.finishes[a.finishId];
    if (!fin) continue;
    const l = resolveLook(fin, a.look);
    slotLooks[a.target.slot] = {
      hex: l.baseColorHex,
      roughness: l.roughness,
      metalness: l.metalness,
    };
  }
  const L = item.sizeLimits;
  const range = (r: { min: number; max: number }) => `(${r.min}–${r.max} mm)`;
  const catalogName = item.name.ro;

  return (
    <section
      aria-label="Proprietățile obiectului"
      className="space-y-3"
      data-testid="object-panel"
      data-object-id={object.id}
    >
      <div className="flex items-center gap-3">
        <ItemPreview
          item={item}
          size={object.size}
          params={object.params}
          colorHex={object.colorHex}
          slots={slotLooks}
          px={64}
        />
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-stone-900" data-testid="object-title">
            {object.name ?? catalogName}
          </h2>
          <p className="text-xs text-stone-600">
            {catalogName} · {MOUNTING_LABEL[item.mounting]}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={off}
          onClick={onDuplicate}
          title="Duplică (Ctrl+D)"
          data-testid="object-duplicate"
        >
          Duplică
        </Button>
        <Button
          variant="danger"
          disabled={off}
          onClick={onDelete}
          title="Șterge (Delete)"
          data-testid="object-delete"
        >
          Șterge
        </Button>
      </div>

      <TextField
        label="Denumire"
        value={object.name ?? catalogName}
        disabled={off}
        testId="object-name"
        onCommit={(v) =>
          apply('Redenumește obiectul', { name: v === catalogName || v === '' ? null : v })
        }
      />

      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Poziție X"
          hint="mm"
          value={object.position.x}
          disabled={off}
          testId="object-x"
          step={10}
          onCommit={(x) => apply('Mută obiectul', { position: { x, y: object.position.y } })}
        />
        <NumberField
          label="Poziție Y"
          hint="mm"
          value={object.position.y}
          disabled={off}
          testId="object-y"
          step={10}
          onCommit={(y) => apply('Mută obiectul', { position: { x: object.position.x, y } })}
        />
      </div>

      <div className="space-y-1">
        <NumberField
          label="Rotație"
          hint="grade"
          value={object.rotationDeg}
          disabled={off}
          testId="object-rotation"
          step={15}
          onCommit={(deg) => apply('Rotește obiectul', { rotationDeg: deg })}
        />
        <div className="flex flex-wrap gap-1.5">
          {[-90, -15, 15, 90].map((delta) => (
            <Button
              key={delta}
              disabled={off}
              onClick={() => apply('Rotește obiectul', { rotationDeg: object.rotationDeg + delta })}
              data-testid={`object-rotate-${delta}`}
              aria-label={`Rotește cu ${delta} grade`}
            >
              {delta > 0 ? `+${delta}°` : `${delta}°`}
            </Button>
          ))}
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-stone-700">Dimensiuni</legend>
        <NumberField
          label="Lățime"
          hint={range(L.widthMm)}
          value={object.size.widthMm}
          disabled={off}
          testId="object-width"
          min={L.widthMm.min}
          step={10}
          onCommit={(v) => apply('Modifică dimensiunile', { size: { widthMm: v } })}
        />
        <NumberField
          label="Adâncime"
          hint={range(L.depthMm)}
          value={object.size.depthMm}
          disabled={off}
          testId="object-depth"
          min={L.depthMm.min}
          step={10}
          onCommit={(v) => apply('Modifică dimensiunile', { size: { depthMm: v } })}
        />
        <NumberField
          label="Înălțime"
          hint={range(L.heightMm)}
          value={object.size.heightMm}
          disabled={off}
          testId="object-height"
          min={L.heightMm.min}
          step={10}
          onCommit={(v) => apply('Modifică dimensiunile', { size: { heightMm: v } })}
        />
        {item.mounting !== 'floor' ? (
          <NumberField
            label="Elevație (de la podea)"
            hint="mm"
            value={object.elevationMm}
            disabled={off}
            testId="object-elevation"
            min={0}
            step={10}
            onCommit={(v) => apply('Modifică elevația', { elevationMm: v })}
          />
        ) : null}
      </fieldset>

      <ColorField
        value={object.colorHex ?? item.defaultColorHex ?? '#bbbbbb'}
        disabled={off}
        onCommit={(hex) => apply('Schimbă culoarea', { colorHex: hex })}
      />
      {object.colorHex ? (
        <Button
          disabled={off}
          onClick={() => apply('Culoare implicită', { colorHex: null })}
          data-testid="object-color-reset"
        >
          Culoarea implicită a itemului
        </Button>
      ) : null}

      {Object.keys(item.paramSpecs).length > 0 ? (
        <fieldset className="space-y-2" data-testid="object-params">
          <legend className="text-xs font-semibold text-stone-700">Configurare</legend>
          {Object.entries(item.paramSpecs).map(([key, spec]) => {
            const current = object.params[key] ?? spec.default;
            const set = (value: number | string | boolean) =>
              apply(`Modifică „${paramLabel(key)}”`, { params: { [key]: value } });
            if (spec.type === 'number')
              return (
                <NumberField
                  key={key}
                  label={paramLabel(key)}
                  hint={`(${spec.min}–${spec.max})`}
                  value={Number(current)}
                  disabled={off}
                  testId={`param-${key}`}
                  min={spec.min}
                  step={spec.step}
                  onCommit={(v) => set(v)}
                />
              );
            if (spec.type === 'enum')
              return (
                <SelectField
                  key={key}
                  label={paramLabel(key)}
                  value={String(current)}
                  options={spec.options.map((o) => ({ value: o, label: optionLabel(o) }))}
                  disabled={off || spec.options.length < 2}
                  testId={`param-${key}`}
                  onChange={(v) => set(v)}
                />
              );
            return (
              <CheckField
                key={key}
                label={paramLabel(key)}
                checked={Boolean(current)}
                disabled={off}
                testId={`param-${key}`}
                onChange={(v) => {
                  set(v);
                }}
              />
            );
          })}
        </fieldset>
      ) : null}
    </section>
  );
}
