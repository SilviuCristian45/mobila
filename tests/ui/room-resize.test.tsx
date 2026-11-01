// @vitest-environment jsdom
// Etapa 7b: lista camerelor cu arii și redimensionarea camerelor din mânerele laturilor.
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import {
  addObject,
  addRectRoom,
  analyzeGeometry,
  createEmptyProject,
  pointInPolygon,
  exportProject,
  rectInteriorSize,
  type ProjectDocument,
  type SceneDescription,
} from '@/domain';
import { getBuiltinItem } from '@/catalog';
import { formatAreaM2 } from '@/lib/format';
import { EditorClient } from '@/app/editor/EditorClient';
import type { ProjectSession } from '@/state/session';
import { renderWithRuntime, uiEnv, type UiEnv } from '../helpers/ui';
import { studioProject } from '../reference/projects';

let query = '';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(query) }));

// jsdom nu are WebGL: canvas-ul 3D e înlocuit cu un stub care expune scena și selecția primite.
vi.mock('@/features/viewer-3d/ViewerCanvas', () => ({
  default: function CanvasStub({
    scene,
    selectedObjectId,
    onSelectObject,
    onStats,
  }: {
    scene: SceneDescription;
    selectedObjectId?: string | null;
    onSelectObject?: (id: string | null) => void;
    onStats?: (s: { walls: number; floors: number; objects: number }) => void;
  }) {
    useEffect(() => {
      onStats?.({
        walls: scene.prisms.length,
        floors: scene.floors.length,
        objects: scene.boxes.length,
      });
    }, [scene, onStats]);
    return (
      <div
        data-testid="canvas-stub"
        data-hash={scene.hash}
        data-boxes={scene.boxes.length}
        data-selected={selectedObjectId ?? ''}
      >
        {scene.boxes.map((b) => (
          <button key={b.id} data-testid={`pick-${b.id}`} onClick={() => onSelectObject?.(b.id)} />
        ))}
        <button data-testid="pick-none" onClick={() => onSelectObject?.(null)} />
      </div>
    );
  },
}));
vi.mock('@/features/viewer-3d/webgl', () => ({ webglAvailable: () => true }));

beforeEach(() => {
  query = '';
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const META = { exportedAt: '2026-10-27T12:00:00.000Z', appVersion: 'test' };

function emptyStudio(): ProjectDocument {
  const d = studioProject();
  return {
    ...d,
    objects: {},
    catalogSnapshot: { ...d.catalogSnapshot, items: {} },
    budget: { overrides: {}, manualLines: {} },
  };
}

async function openEditor(e: UiEnv, doc = emptyStudio(), tab = e.tab) {
  const r = await e.tab.manager.importFile(exportProject(doc, META));
  if (!r.ok) throw new Error('seed');
  query = `p=${r.value.id}`;
  renderWithRuntime(<EditorClient />, e.runtimeFor(tab));
  await screen.findByTestId('plan-editor');
  return {
    id: r.value.id,
    session: e.tab.manager.openSessions().get(r.value.id) as ProjectSession,
  };
}

const docOf = (s: ProjectSession) => s.getState().doc;
describe('planul 2D: lista camerelor și redimensionarea din mânere', () => {
  const svg = () => screen.getByTestId('plan-svg');
  const client = (x: number, y: number) => {
    const zoom = Number(svg().getAttribute('data-zoom'));
    return {
      clientX: x * zoom + Number(svg().getAttribute('data-pan-x')),
      clientY: y * zoom + Number(svg().getAttribute('data-pan-y')),
    };
  };
  const ptr = (x: number, y: number) => ({ ...client(x, y), button: 0, pointerId: 1 });
  const roomId = (s: ProjectSession) => Object.keys(docOf(s).rooms)[0]!;
  const sizeOf = (s: ProjectSession) => {
    const r = rectInteriorSize(docOf(s), roomId(s));
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };
  const handle = (s: ProjectSession, side: string) =>
    screen.getByTestId(`room-handle-${roomId(s)}-${side}`);
  /** Trage mânerul unei laturi cu (dx, dy) mm (poziția de pornire = mijlocul mânerului din document). */
  function dragHandle(s: ProjectSession, side: string, dx: number, dy: number) {
    const el = handle(s, side);
    const x = Number(el.getAttribute('x')) + Number(el.getAttribute('width')) / 2;
    const y = Number(el.getAttribute('y')) + Number(el.getAttribute('height')) / 2;
    fireEvent.pointerDown(el, ptr(x, y));
    for (let i = 1; i <= 4; i++)
      fireEvent.pointerMove(svg(), ptr(x + (dx * i) / 4, y + (dy * i) / 4));
    fireEvent.pointerUp(svg(), ptr(x + dx, y + dy));
  }
  async function open() {
    const e = uiEnv();
    const { session } = await openEditor(e, studioProject());
    return session;
  }

  it('lista afișează fiecare cameră cu tipul și suprafața din geometrie, plus totalul; clic pe element selectează camera', async () => {
    const session = await open();
    const d = docOf(session);
    const id = roomId(session);
    const geo = analyzeGeometry(d).rooms.get(id)!;
    expect(screen.getByTestId('room-list').textContent).toContain(d.rooms[id]!.name);
    expect(screen.getByTestId(`room-list-area-${id}`).textContent).toBe(formatAreaM2(geo.areaMm2));
    const sum = Object.keys(d.rooms).reduce(
      (t, r) => t + (analyzeGeometry(d).rooms.get(r)?.areaMm2 ?? 0),
      0,
    );
    expect(screen.getByTestId('room-list-total').textContent).toContain(formatAreaM2(sum));
    expect(screen.getByTestId(`room-${id}`).getAttribute('data-selected')).toBe('false');
    fireEvent.click(screen.getByTestId(`room-list-item-${id}`));
    expect(screen.getByTestId(`room-${id}`).getAttribute('data-selected')).toBe('true');
    expect(screen.getByTestId(`room-list-item-${id}`).getAttribute('aria-current')).toBe('true');
    expect(screen.getByTestId('panel-room')).toBeTruthy();
  });

  it('mânerele apar doar la camera selectată (patru laturi)', async () => {
    const session = await open();
    expect(screen.queryByTestId(`room-handle-${roomId(session)}-e`)).toBeNull();
    fireEvent.click(screen.getByTestId(`room-list-item-${roomId(session)}`));
    for (const side of ['n', 'e', 's', 'w']) expect(handle(session, side)).toBeTruthy();
  });

  it('latura de est: lățimea crește cu deplasarea (snap la grilă), UN commit, latura opusă rămâne pe loc; undo readuce', async () => {
    const session = await open();
    fireEvent.click(screen.getByTestId(`room-list-item-${roomId(session)}`));
    const before = sizeOf(session);
    const west = docOf(session).nodes[docOf(session).rooms[roomId(session)]!.nodeLoop[0]!]!;
    const apply = vi.spyOn(session, 'apply');
    const grid = docOf(session).settings.gridMm;
    const el = handle(session, 'e');
    const x = Number(el.getAttribute('x')) + Number(el.getAttribute('width')) / 2;
    const y = Number(el.getAttribute('y')) + Number(el.getAttribute('height')) / 2;
    fireEvent.pointerDown(el, ptr(x, y));
    fireEvent.pointerMove(svg(), ptr(x + 500, y));
    expect(apply).not.toHaveBeenCalled(); // doar previzualizare
    expect(sizeOf(session)).toEqual(before);
    fireEvent.pointerMove(svg(), ptr(x + 1000, y));
    fireEvent.pointerUp(svg(), ptr(x + 1000, y));
    expect(apply).toHaveBeenCalledTimes(1);
    const after = sizeOf(session);
    expect(after.depthMm).toBe(before.depthMm);
    expect(after.widthMm - before.widthMm).toBeGreaterThanOrEqual(1000 - grid);
    expect(after.widthMm - before.widthMm).toBeLessThanOrEqual(1000 + grid);
    expect(after.widthMm % grid).toBe(before.widthMm % grid);
    expect(docOf(session).nodes[docOf(session).rooms[roomId(session)]!.nodeLoop[0]!]).toEqual(west);
    expect(session.getState().undoLabel).toBe('Redimensionează camera');
    session.undo();
    expect(sizeOf(session)).toEqual(before);
  });

  it('latura de vest și cea de nord: dimensiunea crește când tragi spre exterior, iar latura opusă rămâne fixă', async () => {
    const session = await open();
    fireEvent.click(screen.getByTestId(`room-list-item-${roomId(session)}`));
    const d0 = docOf(session);
    const nodes = d0.rooms[roomId(session)]!.nodeLoop.map((n) => d0.nodes[n]!);
    const maxX = Math.max(...nodes.map((n) => n.x));
    const maxY = Math.max(...nodes.map((n) => n.y));
    const before = sizeOf(session);
    dragHandle(session, 'w', -800, 0);
    expect(sizeOf(session).widthMm).toBeGreaterThan(before.widthMm + 600);
    const d1 = docOf(session);
    const n1 = d1.rooms[roomId(session)]!.nodeLoop.map((n) => d1.nodes[n]!);
    expect(Math.max(...n1.map((n) => n.x))).toBe(maxX); // est nemișcat
    dragHandle(session, 'n', 0, -500);
    expect(sizeOf(session).depthMm).toBeGreaterThan(before.depthMm + 300);
    const d2 = docOf(session);
    expect(Math.max(...d2.rooms[roomId(session)]!.nodeLoop.map((n) => d2.nodes[n]!.y))).toBe(maxY); // sud nemișcat
  });

  it('prea mic: tragerea sub dimensiunea minimă nu schimbă camera și explică de ce', async () => {
    const session = await open();
    fireEvent.click(screen.getByTestId(`room-list-item-${roomId(session)}`));
    const before = sizeOf(session);
    dragHandle(session, 'e', -(before.widthMm + 500), 0);
    expect(sizeOf(session)).toEqual(before);
    expect(screen.getByTestId('plan-notice').textContent).toContain('mai mică');
  });

  it('micșorarea camerei din mâner nu lasă mobilierul în afara ei: obiectul revine în interior, în același pas de undo', async () => {
    // proiect curat: o cameră 4000 × 3000 (fără goluri) și o canapea lângă latura de est
    let doc = createEmptyProject('p1', 'Mobilat', '2026-11-01T00:00:00.000Z');
    let n = 0;
    const gen = () => `m${++n}`;
    const room = addRectRoom(doc, { widthMm: 4000, depthMm: 3000, anchor: { x: 0, y: 0 } }, gen);
    if (!room.ok) throw new Error(room.error);
    const added = addObject(
      room.value.doc,
      getBuiltinItem('living.sofa-3')!,
      { position: { x: 3300, y: 1500 } },
      gen,
    );
    if (!added.ok) throw new Error(added.error);
    doc = added.value.doc;
    const e = uiEnv();
    const { session } = await openEditor(e, doc);
    const sofaId = added.value.objectId;
    const roomId = room.value.roomId;
    const polyOf = () => analyzeGeometry(docOf(session)).rooms.get(roomId)!.polygon;
    expect(pointInPolygon(docOf(session).objects[sofaId]!.position, polyOf())).toBe(true);
    fireEvent.click(screen.getByTestId(`room-list-item-${roomId}`));
    const xMax = Math.max(...polyOf().map((p) => p.x));
    const newEast = 2500; // sub poziția canapelei (x = 3300)
    const apply = vi.spyOn(session, 'apply');
    const el = screen.getByTestId(`room-handle-${roomId}-e`);
    const x = Number(el.getAttribute('x')) + Number(el.getAttribute('width')) / 2;
    const y = Number(el.getAttribute('y')) + Number(el.getAttribute('height')) / 2;
    fireEvent.pointerDown(el, ptr(x, y));
    fireEvent.pointerMove(svg(), ptr(x + (newEast - xMax) / 2, y));
    fireEvent.pointerMove(svg(), ptr(x + (newEast - xMax), y));
    fireEvent.pointerUp(svg(), ptr(x + (newEast - xMax), y));
    expect(apply).toHaveBeenCalledTimes(1);
    const poly1 = polyOf();
    expect(Math.max(...poly1.map((p) => p.x))).toBeLessThan(3300); // camera s-a micșorat sub canapea
    const sofa = docOf(session).objects[sofaId]!;
    expect(pointInPolygon(sofa.position, poly1)).toBe(true); // dar canapeaua a rămas în cameră
    expect(sofa.position.x).toBeLessThan(3300);
    act(() => {
      session.undo();
    });
    expect(docOf(session).objects[sofaId]!.position).toEqual({ x: 3300, y: 1500 });
    expect(Math.max(...polyOf().map((p) => p.x))).toBe(xMax);
  });
});
