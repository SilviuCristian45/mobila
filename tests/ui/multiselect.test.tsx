// @vitest-environment jsdom
// Etapa 6c: selecție multiplă de obiecte în planul 2D (Shift/Ctrl + clic), mutare/ștergere/duplicare în grup.
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { exportProject, type ProjectDocument, type SceneDescription } from '@/domain';
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
const only = (s: ProjectSession) => Object.values(docOf(s).objects);
const addFromCatalog = async (itemId: string) => {
  if (!screen.queryByTestId('catalog-panel')) fireEvent.click(screen.getByTestId('catalog-toggle'));
  fireEvent.click(await screen.findByTestId(`catalog-item-${itemId}`));
};

describe('planul 2D: selecție multiplă de obiecte', () => {
  const svg = () => screen.getByTestId('plan-svg');
  const client = (x: number, y: number) => {
    const zoom = Number(svg().getAttribute('data-zoom'));
    return {
      clientX: x * zoom + Number(svg().getAttribute('data-pan-x')),
      clientY: y * zoom + Number(svg().getAttribute('data-pan-y')),
    };
  };
  const ptr = (x: number, y: number, extra: Record<string, unknown> = {}) => ({
    ...client(x, y),
    button: 0,
    pointerId: 1,
    ...extra,
  });
  const key = (k: string, init: KeyboardEventInit = {}) =>
    act(() => {
      fireEvent.keyDown(window, { key: k, ...init });
    });
  const el = (id: string) => screen.getByTestId(`object-${id}`);
  const selectedIds = () =>
    Object.keys(
      Object.fromEntries(
        screen
          .getAllByTestId(/^object-/)
          .filter((n) => n.getAttribute('data-selected') === 'true')
          .map((n) => [n.getAttribute('data-testid')!.slice('object-'.length), 1]),
      ),
    ).sort();
  const click = (id: string, o: { x: number; y: number }, extra: Record<string, unknown> = {}) => {
    fireEvent.pointerDown(el(id), ptr(o.x, o.y, extra));
    fireEvent.pointerUp(svg(), ptr(o.x, o.y, extra));
  };

  async function withThree() {
    const e = uiEnv();
    const { session } = await openEditor(e);
    for (const item of ['bedroom.wardrobe', 'living.sofa-3', 'living.sofa-3'])
      await addFromCatalog(item);
    const objs = only(session);
    expect(objs).toHaveLength(3);
    fireEvent.pointerDown(svg(), ptr(-5000, -5000));
    fireEvent.pointerUp(svg(), ptr(-5000, -5000));
    return { session, objs, ids: objs.map((o) => o.id).sort() };
  }

  it('Shift + clic adaugă și scoate obiecte din selecție; clic simplu pe altul păstrează doar acela; clic pe fundal golește', async () => {
    const { objs, ids } = await withThree();
    const [a, b, c] = objs as [(typeof objs)[0], (typeof objs)[0], (typeof objs)[0]];
    click(a.id, a.position);
    expect(selectedIds()).toEqual([a.id]);
    expect(screen.queryByTestId('multi-selection')).toBeNull();
    click(b.id, b.position, { shiftKey: true });
    click(c.id, c.position, { ctrlKey: true });
    expect(selectedIds()).toEqual(ids);
    expect(screen.getByTestId('multi-selection').textContent).toContain('3 obiecte selectate');
    click(b.id, b.position, { shiftKey: true }); // scoate b
    expect(selectedIds()).toEqual([a.id, c.id].sort());
    click(b.id, b.position); // clic simplu: doar b
    expect(selectedIds()).toEqual([b.id]);
    click(a.id, a.position, { shiftKey: true });
    fireEvent.pointerDown(svg(), ptr(-5000, -5000));
    fireEvent.pointerUp(svg(), ptr(-5000, -5000));
    expect(selectedIds()).toEqual([]);
  });

  it('tragerea unui membru mută tot grupul cu aceeași deplasare: previzualizare fără scriere, UN commit, un pas de undo', async () => {
    const { session, objs } = await withThree();
    const [a, b, c] = objs as [(typeof objs)[0], (typeof objs)[0], (typeof objs)[0]];
    click(a.id, a.position);
    click(b.id, b.position, { shiftKey: true });
    const start = Object.fromEntries(objs.map((o) => [o.id, { ...o.position }]));
    const apply = vi.spyOn(session, 'apply');
    fireEvent.pointerDown(el(a.id), ptr(a.position.x, a.position.y));
    for (let i = 1; i <= 5; i++)
      fireEvent.pointerMove(svg(), ptr(a.position.x + i * 100, a.position.y + i * 60));
    expect(apply).not.toHaveBeenCalled();
    expect(docOf(session).objects[b.id]!.position).toEqual(start[b.id]);
    fireEvent.pointerUp(svg(), ptr(a.position.x + 500, a.position.y + 300));
    expect(apply).toHaveBeenCalledTimes(1);
    const d = docOf(session);
    const dx = d.objects[a.id]!.position.x - start[a.id]!.x;
    const dy = d.objects[a.id]!.position.y - start[a.id]!.y;
    expect(Math.abs(dx - 500)).toBeLessThanOrEqual(d.settings.gridMm);
    expect(d.objects[b.id]!.position).toEqual({ x: start[b.id]!.x + dx, y: start[b.id]!.y + dy });
    expect(d.objects[c.id]!.position).toEqual(start[c.id]); // neselectat: neatins
    expect(selectedIds()).toEqual([a.id, b.id].sort()); // grupul rămâne selectat
    expect(session.getState().undoLabel).toBe('Mută 2 obiecte');
    session.undo();
    for (const o of objs) expect(docOf(session).objects[o.id]!.position).toEqual(start[o.id]);
  });

  it('săgețile mută grupul; R nu rotește un grup; Ctrl+D duplică tot grupul și selectează copiile; Delete le șterge dintr-un pas', async () => {
    const { session, objs } = await withThree();
    const [a, b] = objs as [(typeof objs)[0], (typeof objs)[0]];
    click(a.id, a.position);
    click(b.id, b.position, { shiftKey: true });
    const grid = docOf(session).settings.gridMm;
    await key('ArrowRight');
    expect(docOf(session).objects[a.id]!.position.x).toBe(a.position.x + grid);
    expect(docOf(session).objects[b.id]!.position.x).toBe(b.position.x + grid);
    expect(session.getState().undoLabel).toBe('Mută 2 obiecte');
    await key('r');
    expect(docOf(session).objects[a.id]!.rotationDeg).toBe(a.rotationDeg);

    await key('d', { ctrlKey: true });
    expect(only(session)).toHaveLength(5);
    const copies = only(session).filter(
      (o) => o.id !== objs[0]!.id && !objs.some((x) => x.id === o.id),
    );
    expect(copies).toHaveLength(2);
    expect(selectedIds()).toEqual(copies.map((o) => o.id).sort());
    expect(session.getState().undoLabel).toBe('Duplică 2 obiecte');

    await key('Delete');
    expect(only(session)).toHaveLength(3);
    expect(selectedIds()).toEqual([]);
    expect(session.getState().undoLabel).toBe('Șterge 2 obiecte');
    session.undo(); // un singur pas readuce ambele copii
    expect(only(session)).toHaveLength(5);
  });

  it('Ctrl+A selectează toate obiectele; Escape golește selecția', async () => {
    const { ids } = await withThree();
    await key('a', { ctrlKey: true });
    expect(selectedIds()).toEqual(ids);
    await key('Escape');
    expect(selectedIds()).toEqual([]);
  });
});
