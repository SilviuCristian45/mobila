// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { exportProject, type ProjectDocument, type SceneDescription } from '@/domain';
import { BUILTIN_ITEMS } from '@/catalog';
import { EditorClient } from '@/app/editor/EditorClient';
import { CatalogBrowser } from '@/features/catalog/CatalogBrowser';
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
const type = (testId: string, value: string) => {
  const el = screen.getByTestId(testId);
  fireEvent.change(el, { target: { value } });
  fireEvent.blur(el);
};
const addFromCatalog = async (itemId: string) => {
  if (!screen.queryByTestId('catalog-panel')) fireEvent.click(screen.getByTestId('catalog-toggle'));
  fireEvent.click(await screen.findByTestId(`catalog-item-${itemId}`));
};

describe('CatalogBrowser (componentă)', () => {
  const noop = () => {};
  it('afișează toate obiectele cu miniatură, pe categorii; contor și dimensiuni în unitatea proiectului', () => {
    render(<CatalogBrowser unit="cm" editable onAdd={noop} onClose={noop} />);
    expect(screen.getByTestId('catalog-count').textContent).toContain(
      `${BUILTIN_ITEMS.length} obiecte`,
    );
    const list = screen.getByTestId('catalog-list');
    expect(within(list).getAllByTestId('item-preview')).toHaveLength(BUILTIN_ITEMS.length);
    for (const p of within(list).getAllByTestId('item-preview'))
      expect(Number(p.getAttribute('data-polygons'))).toBeGreaterThanOrEqual(6);
    expect(screen.getByTestId('catalog-item-living.sofa-3').textContent).toContain(
      '210 × 95 × 85 cm',
    );
    for (const c of [
      'living',
      'dormitor',
      'bucatarie',
      'baie',
      'electrocasnice',
      'iluminat-decor',
      'diverse',
    ])
      expect(screen.getByTestId(`catalog-category-${c}`)).toBeTruthy();
  });

  it('căutare după denumire (fără diacritice), filtrare pe categorie și stare goală cu mesaj în română', () => {
    render(<CatalogBrowser unit="cm" editable onAdd={noop} onClose={noop} />);
    fireEvent.change(screen.getByTestId('catalog-search'), { target: { value: 'masuta' } });
    expect(screen.getByTestId('catalog-item-living.coffee-table')).toBeTruthy();
    expect(screen.queryByTestId('catalog-item-living.sofa-3')).toBeNull();
    fireEvent.change(screen.getByTestId('catalog-search'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('catalog-category-baie'));
    expect(screen.getByTestId('catalog-count').textContent).toContain('5 obiecte');
    expect(screen.getByTestId('catalog-category-baie').getAttribute('aria-pressed')).toBe('true');
    fireEvent.change(screen.getByTestId('catalog-search'), { target: { value: 'canapea' } });
    expect(screen.getByTestId('catalog-empty').textContent).toMatch(/Nu s-a găsit niciun obiect/);
    fireEvent.click(screen.getByTestId('catalog-category-all'));
    expect(screen.getAllByTestId(/^catalog-item-living\.sofa/)).toHaveLength(3);
  });

  it('doar-citire: elementele sunt dezactivate și un mesaj explică de ce; clic ⇒ onAdd apelat cu itemul', () => {
    const onAdd = vi.fn();
    const { rerender } = render(<CatalogBrowser unit="cm" editable onAdd={onAdd} onClose={noop} />);
    fireEvent.click(screen.getByTestId('catalog-item-bath.toilet'));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'bath.toilet' }));
    rerender(<CatalogBrowser unit="cm" editable={false} onAdd={onAdd} onClose={noop} />);
    expect((screen.getByTestId('catalog-item-bath.toilet') as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText(/doar pentru citire/)).toBeTruthy();
  });
});

describe('adăugare din catalog în editor', () => {
  it('deschide catalogul, caută, adaugă în cameră: obiect valid, selectat, vizibil în plan; catalogSnapshot completat', async () => {
    const e = uiEnv();
    const { session } = await openEditor(e);
    expect(screen.queryByTestId('catalog-panel')).toBeNull(); // nu ocupă spațiu până nu e cerut
    fireEvent.click(screen.getByTestId('catalog-toggle'));
    fireEvent.change(screen.getByTestId('catalog-search'), { target: { value: 'dulap' } });
    expect(screen.getAllByTestId(/^catalog-item-/)).toHaveLength(2);
    fireEvent.click(screen.getByTestId('catalog-item-bedroom.wardrobe'));

    const [o] = only(session);
    expect(o).toMatchObject({ catalogItemId: 'bedroom.wardrobe', rotationDeg: 0, elevationMm: 0 });
    expect(docOf(session).catalogSnapshot.items['bedroom.wardrobe']).toBeDefined();
    // în interiorul camerei (rA: 3900 × 2900, colțul în jurul lui 0..)
    expect(screen.getByTestId(`object-${o!.id}`).getAttribute('data-selected')).toBe('true');
    expect(screen.getByTestId('object-panel').getAttribute('data-object-id')).toBe(o!.id);
    expect(session.getState().undoLabel).toBe('Adaugă „Dulap 2 uși”');
  });

  it('un obiect montat pe perete se așază lipit de un perete, cu elevația din catalog', async () => {
    const e = uiEnv();
    const { session } = await openEditor(e);
    await addFromCatalog('decor.mirror');
    const [m] = only(session);
    expect(m!.elevationMm).toBe(1000);
    expect(m!.wallId).toBeDefined();
    expect(screen.getByTestId('object-elevation')).toBeTruthy();
  });
});

describe('panou de proprietăți', () => {
  it('modifică denumirea, poziția, rotația, dimensiunile, culoarea și parametrii; fiecare = un pas de undo; scena 3D urmează', async () => {
    const e = uiEnv();
    const { session } = await openEditor(e);
    await addFromCatalog('bedroom.wardrobe');
    const id = only(session)[0]!.id;
    const get = () => docOf(session).objects[id]!;

    type('object-name', 'Dulap dormitor');
    expect(get().name).toBe('Dulap dormitor');
    expect(screen.getByTestId('object-title').textContent).toBe('Dulap dormitor');
    type('object-x', '2400');
    type('object-y', '1300');
    expect(get().position).toEqual({ x: 2400, y: 1300 });
    type('object-rotation', '-90');
    expect(get().rotationDeg).toBe(270);
    fireEvent.click(screen.getByTestId('object-rotate-90'));
    expect(get().rotationDeg).toBe(0);
    type('object-width', '1400');
    type('object-depth', '500');
    type('object-height', '2300');
    expect(get().size).toEqual({ widthMm: 1400, depthMm: 500, heightMm: 2300 });
    fireEvent.click(screen.getByTestId('object-swatch-8c6d4f'));
    expect(get().colorHex).toBe('#8c6d4f');
    type('param-fronts', '3');
    fireEvent.change(screen.getByTestId('param-frontType'), { target: { value: 'drawers' } });
    fireEvent.click(screen.getByTestId('param-handles'));
    expect(get().params).toMatchObject({ fronts: 3, frontType: 'drawers', handles: false });

    // culoarea cu selectorul nativ (eveniment „change”) și revenirea la culoarea itemului
    fireEvent.change(screen.getByTestId('object-color'), { target: { value: '#123456' } });
    expect(get().colorHex).toBe('#123456');
    fireEvent.click(screen.getByTestId('object-color-reset'));
    expect(get().colorHex).toBeUndefined();

    // fiecare modificare a fost un pas separat: undo le anulează pe rând
    session.undo();
    expect(get().colorHex).toBe('#123456');
    session.undo();
    session.undo();
    expect(get().params.handles).toBe(true);
    // scena 3D se actualizează
    fireEvent.click(screen.getByTestId('mode-3d'));
    const hash = (await screen.findByTestId('canvas-stub')).getAttribute('data-hash');
    session.undo();
    await waitFor(() =>
      expect(screen.getByTestId('canvas-stub').getAttribute('data-hash')).not.toBe(hash),
    );
  });

  it('valori în afara limitelor: mesaj în română la câmp, documentul rămâne neschimbat', async () => {
    const e = uiEnv();
    const { session } = await openEditor(e);
    await addFromCatalog('bedroom.wardrobe');
    const before = docOf(session);
    type('object-width', '10');
    expect(screen.getByRole('alert').textContent).toMatch(
      /Lățimea trebuie să fie între 600 și 2000 mm/,
    );
    type('object-height', '-5');
    expect(docOf(session)).toBe(before);
    type('param-fronts', '99');
    expect(docOf(session)).toBe(before);
    type('object-x', '12.5');
    expect(docOf(session)).toBe(before);
    expect(session.getState().canUndo).toBe(true); // doar adăugarea
    session.undo();
    expect(only(session)).toHaveLength(0);
  });

  it('duplicare și ștergere din panou; undo/redo pentru ambele', async () => {
    const e = uiEnv();
    const { session } = await openEditor(e);
    await addFromCatalog('living.armchair');
    const first = only(session)[0]!;
    fireEvent.click(screen.getByTestId('object-duplicate'));
    expect(only(session)).toHaveLength(2);
    const copy = only(session).find((o) => o.id !== first.id)!;
    expect(copy.position).toEqual({ x: first.position.x + 300, y: first.position.y + 300 });
    expect(screen.getByTestId('object-panel').getAttribute('data-object-id')).toBe(copy.id); // copia e selectată
    fireEvent.click(screen.getByTestId('object-delete'));
    expect(only(session)).toHaveLength(1);
    expect(screen.queryByTestId('object-panel')).toBeNull();
    session.undo();
    expect(only(session)).toHaveLength(2);
    session.undo();
    expect(only(session)).toHaveLength(1);
    session.redo();
    session.redo();
    expect(only(session)).toHaveLength(1);
  });
});

describe('planul 2D: selecție, mutare, rotire, duplicare, ștergere', () => {
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

  async function withObject(itemId = 'bedroom.wardrobe') {
    const e = uiEnv();
    const { session } = await openEditor(e);
    await addFromCatalog(itemId);
    const o = only(session)[0]!;
    // deselectează (clic pe fundal), ca testul să selecteze prin plan
    fireEvent.pointerDown(svg(), ptr(-5000, -5000));
    fireEvent.pointerUp(svg(), ptr(-5000, -5000));
    return { e, session, o };
  }

  it('clic pe obiect îl selectează (și deschide panoul); clic pe fundal îl deselectează', async () => {
    const { o } = await withObject();
    expect(screen.queryByTestId('object-panel')).toBeNull();
    fireEvent.pointerDown(screen.getByTestId(`object-${o.id}`), ptr(o.position.x, o.position.y));
    fireEvent.pointerUp(svg(), ptr(o.position.x, o.position.y));
    expect(screen.getByTestId(`object-${o.id}`).getAttribute('data-selected')).toBe('true');
    expect(screen.getByTestId('object-panel')).toBeTruthy();
    fireEvent.pointerDown(svg(), ptr(-5000, -5000));
    fireEvent.pointerUp(svg(), ptr(-5000, -5000));
    expect(screen.queryByTestId('object-panel')).toBeNull();
  });

  it('tragere: previzualizare fără scriere în document, UN singur commit la final, cu snap la grilă; undo îl anulează', async () => {
    const { session, o } = await withObject();
    const from = o.position;
    const apply = vi.spyOn(session, 'apply');
    fireEvent.pointerDown(screen.getByTestId(`object-${o.id}`), ptr(from.x, from.y));
    for (let i = 1; i <= 6; i++)
      fireEvent.pointerMove(svg(), ptr(from.x + i * 83, from.y + i * 41));
    expect(apply).not.toHaveBeenCalled();
    expect(docOf(session).objects[o.id]!.position).toEqual(from); // documentul neatins în timpul gestului
    fireEvent.pointerUp(svg(), ptr(from.x + 6 * 83, from.y + 6 * 41));
    expect(apply).toHaveBeenCalledTimes(1);
    const grid = docOf(session).settings.gridMm;
    const moved = docOf(session).objects[o.id]!.position;
    expect(moved.x % grid).toBe(0);
    expect(moved.y % grid).toBe(0);
    expect(Math.abs(moved.x - (from.x + 498))).toBeLessThanOrEqual(grid);
    expect(session.getState().undoLabel).toBe('Mută obiectul');
    session.undo();
    expect(docOf(session).objects[o.id]!.position).toEqual(from);
  });

  it('taste: R rotește cu 90°, Shift+R în sens opus; săgețile mută cu pasul grilei; Ctrl+D duplică; Delete șterge', async () => {
    const { session, o } = await withObject();
    fireEvent.pointerDown(screen.getByTestId(`object-${o.id}`), ptr(o.position.x, o.position.y));
    fireEvent.pointerUp(svg(), ptr(o.position.x, o.position.y));
    const get = () => docOf(session).objects[o.id]!;
    await key('r');
    expect(get().rotationDeg).toBe(90);
    await key('R', { shiftKey: true });
    await key('R', { shiftKey: true });
    expect(get().rotationDeg).toBe(270);
    const grid = docOf(session).settings.gridMm;
    await key('ArrowRight');
    expect(get().position.x).toBe(o.position.x + grid);
    await key('ArrowUp', { shiftKey: true });
    expect(get().position.y).toBe(o.position.y - 10 * grid);
    await key('d', { ctrlKey: true });
    expect(only(session)).toHaveLength(2);
    await key('Delete');
    expect(only(session)).toHaveLength(1);
    expect(only(session)[0]!.id).toBe(o.id);
  });

  it('rotația apare în plan (transformare SVG), iar obiectul suspendat are contur punctat', async () => {
    const { session, o } = await withObject('decor.mirror');
    const el = () => screen.getByTestId(`object-${o.id}`);
    expect(el().querySelector('rect')!.getAttribute('stroke-dasharray')).toBeTruthy();
    session.apply('rot', (d) => ({
      ok: true,
      value: { ...d, objects: { ...d.objects, [o.id]: { ...d.objects[o.id]!, rotationDeg: 180 } } },
    }));
    await waitFor(() => expect(el().getAttribute('transform')).toMatch(/rotate\(180\)/));
  });

  it('doar-citire: obiectele se pot selecta, dar nu se mută, rotesc sau șterg', async () => {
    const e = uiEnv();
    const r = await e.tab.manager.importFile(exportProject(emptyStudio(), META));
    if (!r.ok) throw new Error('seed');
    // un obiect existent în proiect (adăugat înainte de a-l bloca în alt tab)
    const opened = await e.tab.manager.open(r.value.id);
    if (!opened.ok) throw new Error('open');
    const { addObject } = await import('@/domain');
    const { getBuiltinItem } = await import('@/catalog');
    let oid = '';
    opened.value.apply('adaugă', (d) => {
      const x = addObject(
        d,
        getBuiltinItem('living.armchair')!,
        { position: { x: 1500, y: 1500 } },
        () => 'ro1',
      );
      if (!x.ok) return x;
      oid = x.value.objectId;
      return { ok: true, value: x.value.doc };
    });
    await opened.value.flush();
    await opened.value.dispose();
    const holder = await e.newTab().manager.open(r.value.id);
    expect(holder.ok).toBe(true);
    query = `p=${r.value.id}`;
    renderWithRuntime(<EditorClient />, e.runtimeFor(e.tab));
    await screen.findByTestId('plan-editor');
    const session = e.tab.manager.openSessions().get(r.value.id)!;
    const apply = vi.spyOn(session, 'apply');
    fireEvent.pointerDown(screen.getByTestId(`object-${oid}`), ptr(1500, 1500));
    for (let i = 1; i <= 5; i++) fireEvent.pointerMove(svg(), ptr(1500 + i * 100, 1500));
    fireEvent.pointerUp(svg(), ptr(2000, 1500));
    await key('r');
    await key('Delete');
    expect(apply).not.toHaveBeenCalled();
    expect(docOf(session).objects[oid]!.position).toEqual({ x: 1500, y: 1500 });
    expect((screen.getByTestId('object-delete') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('object-x') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('catalog-toggle'));
    expect((screen.getByTestId('catalog-item-bath.toilet') as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});

describe('2D ↔ 3D cu obiecte', () => {
  it('selecția e comună: obiectul selectat în 2D rămâne selectat în 3D (panou și contur); alegerea în 3D se reflectă înapoi în 2D', async () => {
    const e = uiEnv();
    const { session } = await openEditor(e);
    await addFromCatalog('bedroom.wardrobe');
    const id = only(session)[0]!.id;

    fireEvent.click(screen.getByTestId('mode-3d'));
    const stub = await screen.findByTestId('canvas-stub');
    expect(stub.getAttribute('data-boxes')).toBe('1');
    expect(stub.getAttribute('data-selected')).toBe(id);
    expect(screen.getByTestId('object-panel')).toBeTruthy(); // proprietățile și în 3D
    expect(screen.getByTestId('catalog-panel')).toBeTruthy();

    fireEvent.click(screen.getByTestId('pick-none'));
    expect(screen.queryByTestId('object-panel')).toBeNull();
    fireEvent.click(screen.getByTestId(`pick-${id}`));
    expect(screen.getByTestId('object-panel').getAttribute('data-object-id')).toBe(id);

    // adăugarea din catalog în timp ce 3D e deschis actualizează scena
    await addFromCatalog('living.sofa-3');
    await waitFor(() =>
      expect(screen.getByTestId('canvas-stub').getAttribute('data-boxes')).toBe('2'),
    );

    fireEvent.click(screen.getByTestId('mode-2d'));
    await screen.findByTestId('plan-editor');
    expect(screen.getByTestId('object-panel')).toBeTruthy();
    expect(Object.keys(docOf(session).objects)).toHaveLength(2);
  });

  it('obiect șters în timp ce e selectat (undo al adăugării) ⇒ selecția dispare fără erori', async () => {
    const e = uiEnv();
    const { session } = await openEditor(e);
    await addFromCatalog('kitchen.chair');
    expect(screen.getByTestId('object-panel')).toBeTruthy();
    act(() => {
      session.undo();
    });
    await waitFor(() => expect(screen.queryByTestId('object-panel')).toBeNull());
    expect(only(session)).toHaveLength(0);
  });
});
