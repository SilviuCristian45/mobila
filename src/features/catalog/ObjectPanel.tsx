'use client';

import {
  resolveLook,
  updateObject,
  type ObjectPatch,
  type PlacedObject,
  type ProjectDocument,
  type Result,
} from '@/domain';
import { optionLabel, paramLabel, type SlotLooks } from '@/catalog';
import { Button } from '@/ui/Button';
import { ColorField } from '@/ui/ColorField';
import { InspectorSection, NumberField, SelectField, TextField } from '@/ui/fields';
import { IconCopy, IconCustomFurniture, IconMaterials, IconTrash } from '@/ui/icons';
import { ItemPreview } from './ItemPreview';

export type RunEdit = (
  label: string,
  operation: (doc: ProjectDocument) => Result<ProjectDocument>,
) => string | null;

const MOUNTING_LABEL = {
  floor: 'Pe podea',
  wall: 'Montat pe perete',
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
    <label className="flex min-h-8 cursor-pointer items-center gap-2 text-xs text-stone-800">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-teal-700"
        data-testid={testId}
      />
      {label}
    </label>
  );
}

/**
 * Proprietățile obiectului selectat, organizate în secțiuni colapsabile curate pentru Inspectorul din dreapta.
 */
export function ObjectPanel({
  doc,
  object,
  editable,
  run,
  onDuplicate,
  onDelete,
  onOpenMaterials,
  onOpenCustomConfigurator,
}: {
  doc: ProjectDocument;
  object: PlacedObject;
  editable: boolean;
  run: RunEdit;
  onDuplicate: () => void;
  onDelete: () => void;
  onOpenMaterials?: () => void;
  onOpenCustomConfigurator?: (objectId: string) => void;
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
        <h2 className="text-[13px] font-semibold text-stone-900">Obiect</h2>
        <p className="text-xs text-red-800" role="alert">
          Itemul de catalog „{object.catalogItemId}” lipsește din proiect. Obiectul se poate șterge.
        </p>
        <Button
          variant="danger"
          size="sm"
          disabled={off}
          onClick={onDelete}
          data-testid="object-delete"
        >
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
  const range = (r: { min: number; max: number }) => `${r.min}–${r.max}`;
  const catalogName = item.name.ro;
  const isCustomFurniture = item.category === 'mobila-comanda';

  return (
    <section
      aria-label="Proprietățile obiectului"
      className="space-y-3"
      data-testid="object-panel"
      data-object-id={object.id}
    >
      {/* Card antet obiect */}
      <div className="flex items-center gap-2.5 rounded-xl border border-stone-200/80 bg-surface-subtle p-2">
        <ItemPreview
          item={item}
          size={object.size}
          params={object.params}
          colorHex={object.colorHex}
          slots={slotLooks}
          px={52}
        />
        <div className="min-w-0 flex-1">
          <h2
            className="truncate text-[13px] font-semibold text-stone-900"
            data-testid="object-title"
          >
            {object.name ?? catalogName}
          </h2>
          <p className="truncate text-[11px] text-stone-500">
            {catalogName} · {MOUNTING_LABEL[item.mounting]}
          </p>
        </div>
      </div>

      {/* Acțiuni rapide */}
      <div className="grid grid-cols-2 gap-1.5">
        <Button
          size="sm"
          disabled={off}
          onClick={onDuplicate}
          title="Duplică (Ctrl+D)"
          data-testid="object-duplicate"
        >
          <IconCopy size={13} />
          Duplică
        </Button>
        <Button
          variant="danger"
          size="sm"
          disabled={off}
          onClick={onDelete}
          title="Șterge (Delete)"
          data-testid="object-delete"
        >
          <IconTrash size={13} />
          Șterge
        </Button>
      </div>

      {isCustomFurniture && onOpenCustomConfigurator ? (
        <Button
          variant="secondary"
          size="sm"
          className="w-full border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100"
          onClick={() => onOpenCustomConfigurator(object.id)}
          data-testid="open-in-custom-configurator"
        >
          <IconCustomFurniture size={14} />
          Deschide în Configurator
        </Button>
      ) : null}

      <TextField
        label="Denumire"
        value={object.name ?? catalogName}
        disabled={off}
        testId="object-name"
        onCommit={(v) =>
          apply('Redenumește obiectul', { name: v === catalogName || v === '' ? null : v })
        }
      />

      <InspectorSection title="Dimensiuni (L × A × H)" defaultOpen>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Lățime"
            hint={range(L.widthMm)}
            unit="mm"
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
            unit="mm"
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
            unit="mm"
            value={object.size.heightMm}
            disabled={off}
            testId="object-height"
            min={L.heightMm.min}
            step={10}
            onCommit={(v) => apply('Modifică dimensiunile', { size: { heightMm: v } })}
          />
          {item.mounting !== 'floor' ? (
            <NumberField
              label="Elevație"
              hint="de la podea"
              unit="mm"
              value={object.elevationMm}
              disabled={off}
              testId="object-elevation"
              min={0}
              step={10}
              onCommit={(v) => apply('Modifică elevația', { elevationMm: v })}
            />
          ) : null}
        </div>
      </InspectorSection>

      <InspectorSection title="Poziție & rotație" defaultOpen>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Poziție X"
            unit="mm"
            value={object.position.x}
            disabled={off}
            testId="object-x"
            step={10}
            onCommit={(x) => apply('Mută obiectul', { position: { x, y: object.position.y } })}
          />
          <NumberField
            label="Poziție Y"
            unit="mm"
            value={object.position.y}
            disabled={off}
            testId="object-y"
            step={10}
            onCommit={(y) => apply('Mută obiectul', { position: { x: object.position.x, y } })}
          />
        </div>
        <NumberField
          label="Rotație"
          unit="°"
          value={object.rotationDeg}
          disabled={off}
          testId="object-rotation"
          step={15}
          onCommit={(deg) => apply('Rotește obiectul', { rotationDeg: deg })}
        />
        <div className="grid grid-cols-4 gap-1">
          {[-90, -15, 15, 90].map((delta) => (
            <Button
              key={delta}
              size="xs"
              disabled={off}
              onClick={() => apply('Rotește obiectul', { rotationDeg: object.rotationDeg + delta })}
              data-testid={`object-rotate-${delta}`}
              aria-label={`Rotește cu ${delta} grade`}
            >
              {delta > 0 ? `+${delta}°` : `${delta}°`}
            </Button>
          ))}
        </div>
      </InspectorSection>

      {Object.keys(item.paramSpecs).length > 0 ? (
        <InspectorSection title="Configurare rețetă" defaultOpen testId="object-params">
          {Object.entries(item.paramSpecs).map(([key, spec]) => {
            const current = object.params[key] ?? spec.default;
            const set = (value: number | string | boolean) =>
              apply(`Modifică „${paramLabel(key)}”`, { params: { [key]: value } });
            if (spec.type === 'number')
              return (
                <NumberField
                  key={key}
                  label={paramLabel(key)}
                  hint={`${spec.min}–${spec.max}`}
                  unit={spec.unit === 'mm' ? 'mm' : spec.unit === 'deg' ? '°' : undefined}
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
        </InspectorSection>
      ) : null}

      <InspectorSection title="Culoare & finisaje" defaultOpen>
        <ColorField
          value={object.colorHex ?? item.defaultColorHex ?? '#bbbbbb'}
          disabled={off}
          onCommit={(hex) => apply('Schimbă culoarea', { colorHex: hex })}
        />
        <div className="flex flex-wrap gap-1.5">
          {object.colorHex ? (
            <Button
              size="xs"
              disabled={off}
              onClick={() => apply('Culoare implicită', { colorHex: null })}
              data-testid="object-color-reset"
            >
              Culoarea implicită
            </Button>
          ) : null}
          {onOpenMaterials ? (
            <Button size="xs" onClick={onOpenMaterials}>
              <IconMaterials size={13} />
              Finisaje pe zone
            </Button>
          ) : null}
        </div>
      </InspectorSection>
    </section>
  );
}
