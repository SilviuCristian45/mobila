'use client';

import { useState } from 'react';
import {
  moveNode,
  rectInteriorSize,
  resizeRectInterior,
  roomsUsingWall,
  rotateRoom,
  updateOpening,
  updatePlanSettings,
  updateRoom,
  updateWall,
  withNodePositions,
  type GeometryModel,
  type OpeningType,
  type ProjectDocument,
  type Result,
  type Room,
} from '@/domain';
import { formatAreaM2, formatLength } from '@/lib/format';
import { Button } from '@/ui/Button';
import { InspectorSection, NumberField, SelectField, TextField } from '@/ui/fields';
import { IconRotateCcw, IconRotateCw, IconTrash } from '@/ui/icons';
import type { Selection } from './types';

export type RunEdit = (
  label: string,
  operation: (doc: ProjectDocument) => Result<ProjectDocument>,
) => string | null;

export const ROOM_TYPES: ReadonlyArray<{ value: Room['type']; label: string }> = [
  { value: 'living', label: 'Living' },
  { value: 'bedroom', label: 'Dormitor' },
  { value: 'kitchen', label: 'Bucătărie' },
  { value: 'bathroom', label: 'Baie' },
  { value: 'hall', label: 'Hol' },
  { value: 'office', label: 'Birou' },
  { value: 'storage', label: 'Debara' },
  { value: 'other', label: 'Altă încăpere' },
];

const UNIT_OPTIONS: ReadonlyArray<{ value: 'mm' | 'cm' | 'm'; label: string }> = [
  { value: 'mm', label: 'Milimetri (mm)' },
  { value: 'cm', label: 'Centimetri (cm)' },
  { value: 'm', label: 'Metri (m)' },
];

interface Props {
  doc: ProjectDocument;
  geometry: GeometryModel;
  selection: Selection;
  editable: boolean;
  run: RunEdit;
  select: (s: Selection) => void;
  onAddOpening: (wallId: string, type: OpeningType) => void;
  onDelete: () => void;
  onWallFromNode: (nodeId: string) => void;
}

function PanelHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 pb-1">
      <h2 className="text-[13px] font-semibold tracking-tight text-stone-900">{title}</h2>
      {subtitle ? (
        <span className="text-[11px] tabular-nums text-stone-500">{subtitle}</span>
      ) : null}
    </div>
  );
}

function StatRow({ k, v, testId }: { k: string; v: string; testId?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <dt className="text-stone-500">{k}</dt>
      <dd className="text-right font-medium tabular-nums text-stone-900" data-testid={testId}>
        {v}
      </dd>
    </div>
  );
}

function NodePanel({ doc, id, editable, run, select, onWallFromNode }: Props & { id: string }) {
  const node = doc.nodes[id];
  if (!node) return null;
  const walls = Object.values(doc.walls).filter((w) => w.startNodeId === id || w.endNodeId === id);
  const set = (axis: 'x' | 'y') => (v: number) =>
    run('Mută nodul', (d) => {
      const n = d.nodes[id]!;
      return moveNode(d, id, { x: axis === 'x' ? v : n.x, y: axis === 'y' ? v : n.y });
    });
  return (
    <div className="space-y-3" data-testid="panel-node">
      <PanelHeader title="Nod" subtitle={id} />
      <InspectorSection title="Coordonate">
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="X"
            unit="mm"
            value={node.x}
            disabled={!editable}
            onCommit={set('x')}
            testId="node-x"
          />
          <NumberField
            label="Y"
            unit="mm"
            value={node.y}
            disabled={!editable}
            onCommit={set('y')}
            testId="node-y"
          />
        </div>
      </InspectorSection>
      <InspectorSection title="Pereți legați" badge={String(walls.length)}>
        {walls.length === 0 ? (
          <p className="text-xs text-stone-500">Niciun perete nu pornește din acest nod.</p>
        ) : (
          <ul className="flex flex-wrap gap-1">
            {walls.map((w) => (
              <li key={w.id}>
                <Button size="xs" onClick={() => select({ kind: 'wall', id: w.id })}>
                  {w.id}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button
          size="sm"
          className="w-full"
          disabled={!editable}
          onClick={() => onWallFromNode(id)}
          data-testid="wall-from-node"
        >
          Perete nou din acest nod
        </Button>
      </InspectorSection>
    </div>
  );
}

function WallPanel({
  doc,
  geometry,
  id,
  editable,
  run,
  select,
  onAddOpening,
  onDelete,
}: Props & { id: string }) {
  const wall = doc.walls[id];
  const fp = geometry.footprints.get(id);
  const unit = doc.settings.displayUnit;
  if (!wall) return null;
  const a = doc.nodes[wall.startNodeId];
  const b = doc.nodes[wall.endNodeId];
  const axis = a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
  const rooms = roomsUsingWall(doc, id);
  const openings = Object.values(doc.openings).filter((o) => o.wallId === id);
  return (
    <div className="space-y-3" data-testid="panel-wall">
      <PanelHeader title="Perete" subtitle={formatLength(axis, unit)} />
      <dl className="space-y-1 rounded-lg bg-surface-subtle p-2.5">
        <StatRow k="Lungime axă" v={formatLength(axis, unit)} testId="wall-axis" />
        {fp ? (
          <>
            <StatRow k="Față stângă" v={formatLength(fp.left.s1 - fp.left.s0, unit)} />
            <StatRow k="Față dreaptă" v={formatLength(fp.right.s1 - fp.right.s0, unit)} />
          </>
        ) : null}
        <StatRow k="Camere" v={rooms.length === 0 ? '—' : rooms.map((r) => r.name).join(', ')} />
        <StatRow k="Goluri" v={String(openings.length)} />
      </dl>

      <InspectorSection title="Dimensiuni">
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Grosime"
            hint="pară"
            unit="mm"
            value={wall.thicknessMm}
            disabled={!editable}
            step={2}
            onCommit={(v) => run('Grosime perete', (d) => updateWall(d, id, { thicknessMm: v }))}
            testId="wall-thickness"
          />
          <NumberField
            label="Înălțime"
            unit="mm"
            value={wall.heightMm}
            disabled={!editable}
            onCommit={(v) => run('Înălțime perete', (d) => updateWall(d, id, { heightMm: v }))}
            testId="wall-height"
          />
        </div>
      </InspectorSection>

      <InspectorSection title="Goluri & capete">
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            size="sm"
            disabled={!editable}
            onClick={() => onAddOpening(id, 'door')}
            data-testid="add-door"
          >
            + Ușă
          </Button>
          <Button
            size="sm"
            disabled={!editable}
            onClick={() => onAddOpening(id, 'window')}
            data-testid="add-window"
          >
            + Fereastră
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <Button size="xs" onClick={() => select({ kind: 'node', id: wall.startNodeId })}>
            Nod de început
          </Button>
          <Button size="xs" onClick={() => select({ kind: 'node', id: wall.endNodeId })}>
            Nod de sfârșit
          </Button>
        </div>
      </InspectorSection>

      <div className="border-t border-stone-200/80 pt-2.5">
        <Button
          variant="danger"
          size="sm"
          className="w-full"
          disabled={!editable}
          onClick={onDelete}
          data-testid="delete-selected"
        >
          <IconTrash size={14} />
          Șterge peretele
        </Button>
      </div>
    </div>
  );
}

function OpeningPanel({ doc, id, editable, run, select, onDelete }: Props & { id: string }) {
  const o = doc.openings[id];
  if (!o) return null;
  const grid = doc.settings.gridMm;
  const patch = (label: string, p: Parameters<typeof updateOpening>[2]) =>
    run(label, (d) => updateOpening(d, id, p));
  return (
    <div className="space-y-3" data-testid="panel-opening">
      <PanelHeader
        title={o.type === 'door' ? 'Ușă' : 'Fereastră'}
        subtitle={`${o.widthMm} × ${o.heightMm} mm`}
      />

      <InspectorSection title="Poziție pe perete">
        <NumberField
          label="Poziția centrului"
          hint="de la nodul start"
          unit="mm"
          value={o.offsetMm}
          disabled={!editable}
          onCommit={(v) => patch('Mută golul', { offsetMm: v })}
          testId="opening-offset"
        />
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            size="xs"
            disabled={!editable}
            aria-label={`Mută golul spre început cu ${grid} mm`}
            onClick={() => void patch('Mută golul', { offsetMm: o.offsetMm - grid })}
            data-testid="opening-nudge-back"
          >
            ◀ −{grid}
          </Button>
          <Button
            size="xs"
            disabled={!editable}
            aria-label={`Mută golul spre sfârșit cu ${grid} mm`}
            onClick={() => void patch('Mută golul', { offsetMm: o.offsetMm + grid })}
            data-testid="opening-nudge-forward"
          >
            +{grid} ▶
          </Button>
        </div>
      </InspectorSection>

      <InspectorSection title="Dimensiuni">
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Lățime"
            unit="mm"
            value={o.widthMm}
            disabled={!editable}
            onCommit={(v) => patch('Lățime gol', { widthMm: v })}
            testId="opening-width"
          />
          <NumberField
            label="Înălțime"
            unit="mm"
            value={o.heightMm}
            disabled={!editable}
            onCommit={(v) => patch('Înălțime gol', { heightMm: v })}
            testId="opening-height"
          />
          <NumberField
            label="Prag"
            unit="mm"
            value={o.sillHeightMm}
            disabled={!editable}
            onCommit={(v) => patch('Prag gol', { sillHeightMm: v })}
            testId="opening-sill"
          />
        </div>
      </InspectorSection>

      {o.type === 'door' ? (
        <InspectorSection title="Deschidere">
          <div className="grid grid-cols-2 gap-2">
            <SelectField
              label="Balama"
              value={o.swing?.hinge ?? 'start'}
              disabled={!editable}
              options={[
                { value: 'start', label: 'La început' },
                { value: 'end', label: 'La sfârșit' },
              ]}
              onChange={(hinge) =>
                patch('Sens ușă', { swing: { hinge, side: o.swing?.side ?? 'left' } })
              }
              testId="opening-hinge"
            />
            <SelectField
              label="Se deschide spre"
              value={o.swing?.side ?? 'left'}
              disabled={!editable}
              options={[
                { value: 'left', label: 'Stânga' },
                { value: 'right', label: 'Dreapta' },
              ]}
              onChange={(side) =>
                patch('Sens ușă', { swing: { hinge: o.swing?.hinge ?? 'start', side } })
              }
              testId="opening-side"
            />
          </div>
        </InspectorSection>
      ) : null}

      <div className="space-y-1.5 border-t border-stone-200/80 pt-2.5">
        <Button size="sm" className="w-full" onClick={() => select({ kind: 'wall', id: o.wallId })}>
          Selectează peretele
        </Button>
        <Button
          variant="danger"
          size="sm"
          className="w-full"
          disabled={!editable}
          onClick={onDelete}
          data-testid="delete-selected"
        >
          <IconTrash size={14} />
          Șterge {o.type === 'door' ? 'ușa' : 'fereastra'}
        </Button>
      </div>
    </div>
  );
}

function RoomPanel({ doc, geometry, id, editable, run, onDelete }: Props & { id: string }) {
  const [rotateError, setRotateError] = useState<string | null>(null);
  const rotate = (turns: number) =>
    setRotateError(run('Rotește camera', (d) => rotateRoom(d, id, turns)));
  const room = doc.rooms[id];
  const interior = geometry.rooms.get(id);
  const unit = doc.settings.displayUnit;
  if (!room) return null;
  const size = rectInteriorSize(doc, id);
  const resize = (side: 'e' | 's') => (v: number) =>
    run('Dimensiune cameră', (d) => {
      const r = resizeRectInterior(d, id, side, v);
      return r.ok ? { ok: true, value: withNodePositions(d, r.value) } : r;
    });
  return (
    <div className="space-y-3" data-testid="panel-room">
      <PanelHeader title="Cameră" subtitle={interior ? formatAreaM2(interior.areaMm2) : '—'} />

      <dl className="space-y-1 rounded-lg bg-surface-subtle p-2.5">
        <StatRow
          k="Suprafață utilă"
          v={interior ? formatAreaM2(interior.areaMm2) : '—'}
          testId="room-area"
        />
        <StatRow k="Pereți în contur" v={String(room.nodeLoop.length)} />
      </dl>

      <InspectorSection title="Identitate">
        <TextField
          label="Nume"
          value={room.name}
          disabled={!editable}
          onCommit={(v) => run('Nume cameră', (d) => updateRoom(d, id, { name: v }))}
          testId="room-name"
        />
        <div className="grid grid-cols-2 gap-2">
          <SelectField
            label="Tip"
            value={room.type}
            options={ROOM_TYPES}
            disabled={!editable}
            onChange={(type) => run('Tip cameră', (d) => updateRoom(d, id, { type }))}
            testId="room-type"
          />
          <NumberField
            label="Tavan"
            unit="mm"
            value={room.ceilingHeightMm ?? Object.values(doc.levels)[0]?.ceilingHeightMm ?? 0}
            disabled={!editable}
            onCommit={(v) =>
              run('Înălțime tavan', (d) => updateRoom(d, id, { ceilingHeightMm: v }))
            }
            testId="room-ceiling"
          />
        </div>
      </InspectorSection>

      <InspectorSection title="Dimensiuni & orientare">
        {size.ok ? (
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Lățime interioară"
              unit="mm"
              value={size.value.widthMm}
              disabled={!editable}
              onCommit={resize('e')}
              testId="room-width"
            />
            <NumberField
              label="Adâncime interioară"
              unit="mm"
              value={size.value.depthMm}
              disabled={!editable}
              onCommit={resize('s')}
              testId="room-depth"
            />
          </div>
        ) : (
          <p className="text-xs text-stone-600" data-testid="room-not-rect">
            Dimensiunile numerice se pot edita doar la camerele dreptunghiulare. Aici muți nodurile
            pereților ({formatLength(interior?.edges[0]?.lengthMm ?? 0, unit)} prima latură).
          </p>
        )}
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            size="sm"
            disabled={!editable}
            onClick={() => rotate(-1)}
            title="Rotește camera cu 90° în sens trigonometric (Shift + R)"
            data-testid="room-rotate-ccw"
          >
            <IconRotateCcw size={13} />
            −90°
          </Button>
          <Button
            size="sm"
            disabled={!editable}
            onClick={() => rotate(1)}
            title="Rotește camera cu 90° în sensul acelor de ceasornic (R)"
            data-testid="room-rotate-cw"
          >
            <IconRotateCw size={13} />
            +90°
          </Button>
        </div>
        {rotateError ? (
          <p role="alert" className="text-xs text-red-700" data-testid="room-rotate-error">
            {rotateError}
          </p>
        ) : null}
      </InspectorSection>

      <div className="border-t border-stone-200/80 pt-2.5">
        <Button
          variant="danger"
          size="sm"
          className="w-full"
          disabled={!editable}
          onClick={onDelete}
          data-testid="delete-selected"
        >
          <IconTrash size={14} />
          Șterge camera
        </Button>
      </div>
    </div>
  );
}

/**
 * Empty State contextual (nimic selectat):
 * - Setări rapide ale proiectului (unitate, grilă, înălțime implicită pereți).
 * - Acordeon pentru adăugare precisă din coordonate (100% accesibil fără mouse).
 */
function AddPanel({
  doc,
  editable,
  run,
  onAddRoom,
  onAddWall,
}: {
  doc: ProjectDocument;
  editable: boolean;
  run: RunEdit;
  onAddRoom: (v: { widthMm: number; depthMm: number; x: number; y: number }) => string | null;
  onAddWall: (v: { x1: number; y1: number; x2: number; y2: number }) => string | null;
}) {
  const [room, setRoom] = useState({ widthMm: '4000', depthMm: '3000', x: '0', y: '0' });
  const [wall, setWall] = useState({ x1: '0', y1: '0', x2: '3000', y2: '0' });
  const [error, setError] = useState<{ form: 'room' | 'wall'; text: string } | null>(null);
  const n = (s: string) => (s.trim() === '' ? Number.NaN : Number(s));
  const bad = (form: 'room' | 'wall') =>
    setError({ form, text: 'Completează toate câmpurile cu numere.' });

  const field = (
    form: 'room' | 'wall',
    key: string,
    label: string,
    value: string,
    set: (v: string) => void,
  ) => (
    <label
      key={`${form}-${key}`}
      className="block space-y-1 text-[11px] font-medium text-stone-600"
    >
      <span>{label}</span>
      <div className="relative">
        <input
          type="number"
          inputMode="numeric"
          value={value}
          disabled={!editable}
          onChange={(e) => set(e.target.value)}
          data-testid={`${form}-form-${key}`}
          className="min-h-8 w-full rounded-lg border border-stone-200 bg-surface-subtle px-2.5 py-1 pr-8 text-[13px] tabular-nums text-stone-900 focus-visible:border-teal-600 focus-visible:bg-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-700 disabled:bg-stone-100"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px] font-medium text-stone-400"
        >
          mm
        </span>
      </div>
    </label>
  );

  return (
    <div className="space-y-3" data-testid="panel-add">
      <div className="rounded-xl border border-stone-200/80 bg-surface-subtle p-2.5 text-xs text-stone-600">
        Selectează o cameră, un perete, un gol sau un obiect de pe plan pentru a-i edita
        proprietățile.
      </div>

      <InspectorSection title="Setări rapide plan" defaultOpen>
        <SelectField
          label="Unitate de afișare"
          value={doc.settings.displayUnit}
          options={UNIT_OPTIONS}
          disabled={!editable}
          testId="settings-display-unit"
          onChange={(displayUnit) =>
            run('Unitate de afișare', (d) => updatePlanSettings(d, { displayUnit }))
          }
        />
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Pas grilă"
            unit="mm"
            value={doc.settings.gridMm}
            disabled={!editable}
            min={10}
            step={10}
            testId="settings-grid-mm"
            onCommit={(gridMm) => run('Pas grilă', (d) => updatePlanSettings(d, { gridMm }))}
          />
          <NumberField
            label="Înălțime pereți"
            unit="mm"
            value={doc.settings.defaultWallHeightMm}
            disabled={!editable}
            min={1500}
            step={50}
            testId="settings-wall-height"
            onCommit={(defaultWallHeightMm) =>
              run('Înălțime implicită pereți', (d) =>
                updatePlanSettings(d, { defaultWallHeightMm }),
              )
            }
          />
        </div>
      </InspectorSection>

      <InspectorSection title="Adăugare precisă din coordonate" defaultOpen>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = {
              widthMm: n(room.widthMm),
              depthMm: n(room.depthMm),
              x: n(room.x),
              y: n(room.y),
            };
            if (Object.values(v).some(Number.isNaN)) return bad('room');
            const err = onAddRoom(v);
            setError(err ? { form: 'room', text: err } : null);
          }}
        >
          <p className="text-[11px] font-medium text-stone-700">Cameră dreptunghiulară</p>
          <div className="grid grid-cols-2 gap-1.5">
            {field('room', 'width', 'Lățime', room.widthMm, (v) =>
              setRoom({ ...room, widthMm: v }),
            )}
            {field('room', 'depth', 'Adâncime', room.depthMm, (v) =>
              setRoom({ ...room, depthMm: v }),
            )}
            {field('room', 'x', 'Colț X', room.x, (v) => setRoom({ ...room, x: v }))}
            {field('room', 'y', 'Colț Y', room.y, (v) => setRoom({ ...room, y: v }))}
          </div>
          {error?.form === 'room' ? (
            <p role="alert" className="text-xs text-red-700" data-testid="room-form-error">
              {error.text}
            </p>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            size="sm"
            className="w-full"
            disabled={!editable}
            data-testid="room-form-submit"
          >
            Adaugă camera
          </Button>
        </form>

        <form
          className="space-y-2 border-t border-stone-200/70 pt-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            const v = { x1: n(wall.x1), y1: n(wall.y1), x2: n(wall.x2), y2: n(wall.y2) };
            if (Object.values(v).some(Number.isNaN)) return bad('wall');
            const err = onAddWall(v);
            setError(err ? { form: 'wall', text: err } : null);
          }}
        >
          <p className="text-[11px] font-medium text-stone-700">Perete din coordonate</p>
          <div className="grid grid-cols-2 gap-1.5">
            {field('wall', 'x1', 'Început X', wall.x1, (v) => setWall({ ...wall, x1: v }))}
            {field('wall', 'y1', 'Început Y', wall.y1, (v) => setWall({ ...wall, y1: v }))}
            {field('wall', 'x2', 'Sfârșit X', wall.x2, (v) => setWall({ ...wall, x2: v }))}
            {field('wall', 'y2', 'Sfârșit Y', wall.y2, (v) => setWall({ ...wall, y2: v }))}
          </div>
          {error?.form === 'wall' ? (
            <p role="alert" className="text-xs text-red-700" data-testid="wall-form-error">
              {error.text}
            </p>
          ) : null}
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            className="w-full"
            disabled={!editable}
            data-testid="wall-form-submit"
          >
            Adaugă peretele
          </Button>
        </form>
      </InspectorSection>
    </div>
  );
}

export function PropertiesPanel(
  props: Props & {
    onAddRoom: (v: { widthMm: number; depthMm: number; x: number; y: number }) => string | null;
    onAddWall: (v: { x1: number; y1: number; x2: number; y2: number }) => string | null;
  },
) {
  const { selection, doc } = props;
  let body: React.ReactNode;
  if (selection?.kind === 'node') body = <NodePanel {...props} id={selection.id} />;
  else if (selection?.kind === 'wall') body = <WallPanel {...props} id={selection.id} />;
  else if (selection?.kind === 'opening') body = <OpeningPanel {...props} id={selection.id} />;
  else if (selection?.kind === 'room') body = <RoomPanel {...props} id={selection.id} />;
  else
    body = (
      <AddPanel
        doc={doc}
        editable={props.editable}
        run={props.run}
        onAddRoom={props.onAddRoom}
        onAddWall={props.onAddWall}
      />
    );
  return (
    <div data-testid="properties" className="space-y-3">
      {body}
    </div>
  );
}
