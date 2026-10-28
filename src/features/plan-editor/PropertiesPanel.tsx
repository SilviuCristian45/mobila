'use client';

import { useState } from 'react';
import {
  rectInteriorSize,
  resizeRectInterior,
  roomsUsingWall,
  updateOpening,
  updateRoom,
  updateWall,
  withNodePositions,
  moveNode,
  type GeometryModel,
  type OpeningType,
  type ProjectDocument,
  type Result,
  type Room,
} from '@/domain';
import { formatAreaM2, formatLength } from '@/lib/format';
import { Button } from '@/ui/Button';
import { NumberField, SelectField, TextField } from '@/ui/fields';
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

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-stone-900">{children}</h2>;
}
function Row({ k, v, testId }: { k: string; v: string; testId?: string }) {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <dt className="text-stone-500">{k}</dt>
      <dd className="text-right text-stone-900" data-testid={testId}>
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
      <Heading>Nod</Heading>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="X"
          hint="(mm)"
          value={node.x}
          disabled={!editable}
          onCommit={set('x')}
          testId="node-x"
        />
        <NumberField
          label="Y"
          hint="(mm)"
          value={node.y}
          disabled={!editable}
          onCommit={set('y')}
          testId="node-y"
        />
      </div>
      <p className="text-xs text-stone-600">
        {walls.length === 0 ? 'Niciun perete nu pornește din acest nod.' : 'Pereți legați:'}
      </p>
      <ul className="flex flex-wrap gap-1">
        {walls.map((w) => (
          <li key={w.id}>
            <Button
              className="min-h-8 px-2 py-1 text-xs"
              onClick={() => select({ kind: 'wall', id: w.id })}
            >
              {w.id}
            </Button>
          </li>
        ))}
      </ul>
      <Button disabled={!editable} onClick={() => onWallFromNode(id)} data-testid="wall-from-node">
        Perete nou din acest nod
      </Button>
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
      <Heading>Perete</Heading>
      <dl className="space-y-1">
        <Row k="Lungime axă" v={formatLength(axis, unit)} testId="wall-axis" />
        {fp ? (
          <>
            <Row k="Față stângă" v={formatLength(fp.left.s1 - fp.left.s0, unit)} />
            <Row k="Față dreaptă" v={formatLength(fp.right.s1 - fp.right.s0, unit)} />
          </>
        ) : null}
        <Row k="Camere" v={rooms.length === 0 ? '—' : rooms.map((r) => r.name).join(', ')} />
        <Row k="Goluri" v={String(openings.length)} />
      </dl>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Grosime"
          hint="(mm, pară)"
          value={wall.thicknessMm}
          disabled={!editable}
          step={2}
          onCommit={(v) => run('Grosime perete', (d) => updateWall(d, id, { thicknessMm: v }))}
          testId="wall-thickness"
        />
        <NumberField
          label="Înălțime"
          hint="(mm)"
          value={wall.heightMm}
          disabled={!editable}
          onCommit={(v) => run('Înălțime perete', (d) => updateWall(d, id, { heightMm: v }))}
          testId="wall-height"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        <Button
          className="min-h-8 px-2 py-1 text-xs"
          onClick={() => select({ kind: 'node', id: wall.startNodeId })}
        >
          Nod de început
        </Button>
        <Button
          className="min-h-8 px-2 py-1 text-xs"
          onClick={() => select({ kind: 'node', id: wall.endNodeId })}
        >
          Nod de sfârșit
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!editable}
          onClick={() => onAddOpening(id, 'door')}
          data-testid="add-door"
        >
          + Ușă
        </Button>
        <Button
          disabled={!editable}
          onClick={() => onAddOpening(id, 'window')}
          data-testid="add-window"
        >
          + Fereastră
        </Button>
      </div>
      <Button
        variant="danger"
        disabled={!editable}
        onClick={onDelete}
        data-testid="delete-selected"
      >
        Șterge peretele
      </Button>
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
      <Heading>{o.type === 'door' ? 'Ușă' : 'Fereastră'}</Heading>
      <NumberField
        label="Poziția centrului"
        hint="(mm de la nodul de început)"
        value={o.offsetMm}
        disabled={!editable}
        onCommit={(v) => patch('Mută golul', { offsetMm: v })}
        testId="opening-offset"
      />
      <div className="flex gap-2">
        <Button
          disabled={!editable}
          aria-label={`Mută golul spre început cu ${grid} mm`}
          onClick={() => void patch('Mută golul', { offsetMm: o.offsetMm - grid })}
          data-testid="opening-nudge-back"
        >
          ◀ −{grid}
        </Button>
        <Button
          disabled={!editable}
          aria-label={`Mută golul spre sfârșit cu ${grid} mm`}
          onClick={() => void patch('Mută golul', { offsetMm: o.offsetMm + grid })}
          data-testid="opening-nudge-forward"
        >
          +{grid} ▶
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Lățime"
          hint="(mm)"
          value={o.widthMm}
          disabled={!editable}
          onCommit={(v) => patch('Lățime gol', { widthMm: v })}
          testId="opening-width"
        />
        <NumberField
          label="Înălțime"
          hint="(mm)"
          value={o.heightMm}
          disabled={!editable}
          onCommit={(v) => patch('Înălțime gol', { heightMm: v })}
          testId="opening-height"
        />
        <NumberField
          label="Prag"
          hint="(mm)"
          value={o.sillHeightMm}
          disabled={!editable}
          onCommit={(v) => patch('Prag gol', { sillHeightMm: v })}
          testId="opening-sill"
        />
      </div>
      {o.type === 'door' ? (
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
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => select({ kind: 'wall', id: o.wallId })}>Selectează peretele</Button>
        <Button
          variant="danger"
          disabled={!editable}
          onClick={onDelete}
          data-testid="delete-selected"
        >
          Șterge {o.type === 'door' ? 'ușa' : 'fereastra'}
        </Button>
      </div>
    </div>
  );
}

function RoomPanel({ doc, geometry, id, editable, run, onDelete }: Props & { id: string }) {
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
      <Heading>Cameră</Heading>
      <TextField
        label="Nume"
        value={room.name}
        disabled={!editable}
        onCommit={(v) => run('Nume cameră', (d) => updateRoom(d, id, { name: v }))}
        testId="room-name"
      />
      <SelectField
        label="Tip"
        value={room.type}
        options={ROOM_TYPES}
        disabled={!editable}
        onChange={(type) => run('Tip cameră', (d) => updateRoom(d, id, { type }))}
        testId="room-type"
      />
      <NumberField
        label="Înălțime tavan"
        hint="(mm)"
        value={room.ceilingHeightMm ?? Object.values(doc.levels)[0]?.ceilingHeightMm ?? 0}
        disabled={!editable}
        onCommit={(v) => run('Înălțime tavan', (d) => updateRoom(d, id, { ceilingHeightMm: v }))}
        testId="room-ceiling"
      />
      <dl className="space-y-1">
        <Row
          k="Suprafață utilă"
          v={interior ? formatAreaM2(interior.areaMm2) : '—'}
          testId="room-area"
        />
        <Row k="Pereți în contur" v={String(room.nodeLoop.length)} />
      </dl>
      {size.ok ? (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Lățime interioară"
            hint="(mm)"
            value={size.value.widthMm}
            disabled={!editable}
            onCommit={resize('e')}
            testId="room-width"
          />
          <NumberField
            label="Adâncime interioară"
            hint="(mm)"
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
      <Button
        variant="danger"
        disabled={!editable}
        onClick={onDelete}
        data-testid="delete-selected"
      >
        Șterge camera
      </Button>
    </div>
  );
}

/** Formulare de adăugare care nu cer mouse: cameră dreptunghiulară și perete din coordonate. */
function AddPanel({
  doc,
  editable,
  onAddRoom,
  onAddWall,
}: {
  doc: ProjectDocument;
  editable: boolean;
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
    <label key={`${form}-${key}`} className="block text-xs font-medium text-stone-700">
      {label}
      <input
        type="number"
        inputMode="numeric"
        value={value}
        disabled={!editable}
        onChange={(e) => set(e.target.value)}
        data-testid={`${form}-form-${key}`}
        className="mt-1 min-h-10 w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-900 disabled:bg-stone-100"
      />
    </label>
  );
  void doc;
  return (
    <div className="space-y-5" data-testid="panel-add">
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
        <Heading>Cameră dreptunghiulară</Heading>
        <p className="text-xs text-stone-600">
          Dimensiunile sunt interioare (față la față), în mm.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {field('room', 'width', 'Lățime', room.widthMm, (v) => setRoom({ ...room, widthMm: v }))}
          {field('room', 'depth', 'Adâncime', room.depthMm, (v) =>
            setRoom({ ...room, depthMm: v }),
          )}
          {field('room', 'x', 'Colț stânga-sus X', room.x, (v) => setRoom({ ...room, x: v }))}
          {field('room', 'y', 'Colț stânga-sus Y', room.y, (v) => setRoom({ ...room, y: v }))}
        </div>
        {error?.form === 'room' ? (
          <p role="alert" className="text-xs text-red-700" data-testid="room-form-error">
            {error.text}
          </p>
        ) : null}
        <Button type="submit" variant="primary" disabled={!editable} data-testid="room-form-submit">
          Adaugă camera
        </Button>
      </form>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = { x1: n(wall.x1), y1: n(wall.y1), x2: n(wall.x2), y2: n(wall.y2) };
          if (Object.values(v).some(Number.isNaN)) return bad('wall');
          const err = onAddWall(v);
          setError(err ? { form: 'wall', text: err } : null);
        }}
      >
        <Heading>Perete din coordonate</Heading>
        <p className="text-xs text-stone-600">Punctele de pe axa peretelui, în mm.</p>
        <div className="grid grid-cols-2 gap-2">
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
        <Button type="submit" variant="primary" disabled={!editable} data-testid="wall-form-submit">
          Adaugă peretele
        </Button>
      </form>
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
        onAddRoom={props.onAddRoom}
        onAddWall={props.onAddWall}
      />
    );
  return (
    <div data-testid="properties" className="space-y-4">
      {body}
    </div>
  );
}
