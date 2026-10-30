// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import {
  addObject,
  applyFinish,
  assignmentsOn,
  exportProject,
  roomWallTargets,
  type FinishTarget,
  type ProjectDocument,
  type SceneDescription,
} from '@/domain';
import { getBuiltinItem } from '@/catalog';
import { getBuiltinMaterial } from '@/materials';
import { EditorClient } from '@/app/editor/EditorClient';
import type { ProjectSession } from '@/state/session';
import { renderWithRuntime, uiEnv, type UiEnv } from '../helpers/ui';
import { studioProject } from '../reference/projects';

let query = '';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(query) }));

// jsdom nu are WebGL: canvas-ul 3D e un stub care expune scena și permite „clic” pe suprafețe.
vi.mock('@/features/viewer-3d/ViewerCanvas', () => ({
  default: function CanvasStub({
    scene,
    selectedSurface,
    onSelectSurface,
    onStats,
  }: {
    scene: SceneDescription;
    selectedSurface?: FinishTarget | null;
    onSelectSurface?: (s: FinishTarget | null) => void;
    onStats?: (s: { walls: number; floors: number; objects: number }) => void;
  }) {
    useEffect(() => {
      onStats?.({
        walls: scene.prisms.length,
        floors: scene.floors.length,
        objects: scene.boxes.length,
      });
    }, [scene, onStats]);
    const firstWall = scene.prisms[0]?.wallId ?? '';
    return (
      <div
        data-testid="canvas-stub"
        data-hash={scene.hash}
        data-looks={Object.keys(scene.looks).length}
        data-surface={selectedSurface ? JSON.stringify(selectedSurface) : ''}
      >
        <button
          data-testid="pick-floor-rB"
          onClick={() => onSelectSurface?.({ kind: 'roomFloor', roomId: 'rB' })}
        />
        <button
          data-testid="pick-wall"
          onClick={() => onSelectSurface?.({ kind: 'wallSide', wallId: firstWall, side: 'left' })}
        />
        <button data-testid="pick-none" onClick={() => onSelectSurface?.(null)} />
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
const mat = (id: string) => getBuiltinMaterial(id)!;

function clean(): ProjectDocument {
  const d = studioProject();
  return {
    ...d,
    objects: {},
    finishAssignments: {},
    catalogSnapshot: { items: {}, finishes: {} },
    budget: { overrides: {}, manualLines: {} },
  };
}
async function openEditor(e: UiEnv, doc = clean()) {
  const r = await e.tab.manager.importFile(exportProject(doc, META));
  if (!r.ok) throw new Error('seed');
  query = `p=${r.value.id}`;
  renderWithRuntime(<EditorClient />, e.runtimeFor(e.tab));
  await screen.findByTestId('plan-editor');
  return {
    id: r.value.id,
    session: e.tab.manager.openSessions().get(r.value.id) as ProjectSession,
  };
}
const docOf = (s: ProjectSession) => s.getState().doc;
const assignments = (s: ProjectSession) => Object.values(docOf(s).finishAssignments);
const openMaterials = () => {
  if (!screen.queryByTestId('materials-panel'))
    fireEvent.click(screen.getByTestId('materials-toggle'));
};
const pickTarget = (label: RegExp | string) => {
  const sel = screen.getByTestId('materials-target') as HTMLSelectElement;
  const opt = [...sel.options].find((o) =>
    typeof label === 'string' ? o.text === label || o.value === label : label.test(o.text),
  );
  if (!opt) throw new Error(`țintă lipsă: ${label}`);
  fireEvent.change(sel, { target: { value: opt.value } });
};
/** Valoarea opțiunii pentru fața `i` a camerei `roomId` (opțiunile cu același text există în mai multe camere). */
const faceValue = (s: ProjectSession, roomId: string, i: number): string => {
  const t = roomWallTargets(docOf(s), roomId)[i]! as Extract<FinishTarget, { kind: 'wallSide' }>;
  return `face:${t.wallId}:${t.side}`;
};
const apply = (id: string) => fireEvent.click(screen.getByTestId(`material-${id}`));
const type = (testId: string, value: string) => {
  const el = screen.getByTestId(testId);
  fireEvent.change(el, { target: { value } });
  fireEvent.blur(el);
};
const materialIds = () =>
  screen
    .queryAllByTestId(/^material-mat\./)
    .map((e) => e.getAttribute('data-testid')!.replace('material-', ''));

describe('panoul „Materiale și finisaje”: țintă, listă, căutare', () => {
  it('se deschide la cerere; implicit ținta e podeaua primei camere și se afișează DOAR materiale compatibile (fără vopsea)', async () => {
    const e = uiEnv();
    await openEditor(e);
    expect(screen.queryByTestId('materials-panel')).toBeNull();
    openMaterials();
    expect(screen.getByTestId('materials-surface-hint').textContent).toMatch(/podea/);
    const ids = materialIds();
    expect(ids).toContain('mat.parquet.oak-light');
    expect(ids).toContain('mat.tile.marble');
    expect(ids).toContain('mat.concrete.polished');
    expect(ids.some((i) => i.startsWith('mat.paint.'))).toBe(false);
    expect(ids.some((i) => i.startsWith('mat.furn.'))).toBe(false);
    // miniatură pentru fiecare material afișat
    expect(screen.getAllByTestId('material-swatch')).toHaveLength(ids.length);
    for (const img of screen.getAllByTestId('material-swatch'))
      expect((img as HTMLImageElement).src).toMatch(/^data:image\/bmp;base64,/);
  });

  it('schimbarea țintei schimbă lista (pereți ⇒ vopsele, faianță; fără parchet); căutare, categorii și stare goală în română', async () => {
    const e = uiEnv();
    await openEditor(e);
    openMaterials();
    pickTarget('walls:rA');
    let ids = materialIds();
    expect(ids).toContain('mat.paint.sage');
    expect(ids).toContain('mat.wtile.metro');
    expect(ids).not.toContain('mat.parquet.oak-light');
    expect(screen.getByTestId('materials-surface-hint').textContent).toMatch(/perete/);

    fireEvent.change(screen.getByTestId('materials-search'), { target: { value: 'faianta' } });
    expect(materialIds()).toHaveLength(4);
    fireEvent.change(screen.getByTestId('materials-search'), { target: { value: '' } });
    fireEvent.click(screen.getByTestId('materials-category-pereti'));
    ids = materialIds();
    expect(ids.every((i) => !i.startsWith('mat.wtile'))).toBe(true);
    expect(screen.getByTestId('materials-category-pereti').getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.change(screen.getByTestId('materials-search'), { target: { value: 'parchet' } });
    expect(screen.getByTestId('materials-empty').textContent).toMatch(/Niciun material compatibil/);
  });

  it('fără camere și fără obiect: mesaj de ajutor, nu un panou gol', async () => {
    const e = uiEnv();
    const r = await e.tab.manager.create('Gol');
    if (!r.ok) throw new Error('create');
    query = `p=${r.value.id}`;
    renderWithRuntime(<EditorClient />, e.runtimeFor(e.tab));
    await screen.findByTestId('plan-editor');
    openMaterials();
    expect(screen.getByTestId('materials-no-target').textContent).toMatch(/Adaugă o cameră/);
  });
});

describe('aplicare, modificare, eliminare', () => {
  it('podea: aplică parchet ⇒ atribuire + snapshot + culoare în plan; estimarea de buget apare din domeniu; undo/redo', async () => {
    const e = uiEnv();
    const { session } = await openEditor(e);
    openMaterials();
    pickTarget('floor:rA');
    expect(screen.getByTestId('materials-budget').textContent).toMatch(/Niciun material aplicat/);
    apply('mat.parquet.oak-natural');
    const a = assignments(session);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({
      target: { kind: 'roomFloor' },
      finishId: 'mat.parquet.oak-natural',
    });
    expect(docOf(session).catalogSnapshot.finishes['mat.parquet.oak-natural']).toBeDefined();
    expect(session.getState().undoLabel).toBe('Aplică „Parchet stejar natur”');
    // reprezentare simplă în 2D
    const rA = screen.getByTestId('room-rA');
    expect(rA.getAttribute('data-floor')).toBe(
      mat('mat.parquet.oak-natural').appearance.baseColorHex,
    );
    expect(screen.getByTestId('materials-current-name').textContent).toBe('Parchet stejar natur');
    // buget: aria camerei rA (11,31 m²) + 10% rebut = 12,45 m²; preț demonstrativ 165 RON/m²
    const row = screen.getByTestId('materials-budget-mat.parquet.oak-natural');
    expect(row.textContent).toMatch(/12\.45 m2/);
    expect(screen.getByTestId('materials-budget-total').textContent).toMatch(/RON/);
    expect(screen.getByTestId('materials-budget').textContent).toMatch(/nu prețuri de piață/);
    expect(screen.getByTestId('materials-budget').textContent).toMatch(/manopera nu este inclusă/);

    act(() => {
      session.undo();
    });
    expect(assignments(session)).toHaveLength(0);
    await waitFor(() => expect(screen.getByTestId('room-rA').getAttribute('data-floor')).toBe(''));
    act(() => {
      session.redo();
    });
    await waitFor(() =>
      expect(screen.getByTestId('room-rA').getAttribute('data-floor')).not.toBe(''),
    );
  });

  it('pereți: același material pe toți (o singură aplicare), apoi un perete individual diferit; benzi colorate în plan', async () => {
    const e = uiEnv();
    const { session } = await openEditor(e);
    openMaterials();
    pickTarget('walls:rA');
    apply('mat.paint.sage');
    expect(assignments(session)).toHaveLength(4);
    expect(new Set(assignments(session).map((a) => a.finishId))).toEqual(
      new Set(['mat.paint.sage']),
    );
    expect(session.getState().undoLabel).toBe('Aplică „Verde salvie” pe pereți');
    expect(screen.getAllByTestId(/^finish-face-/)).toHaveLength(4);

    pickTarget(faceValue(session, 'rA', 1));
    apply('mat.wtile.metro');
    const byFinish = assignments(session)
      .map((a) => a.finishId)
      .sort();
    expect(byFinish).toEqual([
      'mat.paint.sage',
      'mat.paint.sage',
      'mat.paint.sage',
      'mat.wtile.metro',
    ]);
    // un singur undo anulează doar ultimul perete
    act(() => {
      session.undo();
    });
    expect(
      assignments(session)
        .map((a) => a.finishId)
        .sort(),
    ).toEqual(Array(4).fill('mat.paint.sage'));
    // o singură aplicare pe pereți = un singur pas de undo
    act(() => {
      session.undo();
    });
    expect(assignments(session)).toHaveLength(0);
  });

  it('parametri relevanți: parchetul arată scara/rotația/rebutul (nu culoarea); vopseaua culoarea/rugozitatea/rebutul (nu scara)', async () => {
    const e = uiEnv();
    const { session } = await openEditor(e);
    openMaterials();
    pickTarget('floor:rA');
    apply('mat.parquet.oak-light');
    expect(screen.queryByTestId('material-scale')).not.toBeNull();
    expect(screen.queryByTestId('material-rotation')).not.toBeNull();
    expect(screen.queryByTestId('material-waste')).not.toBeNull();
    expect(screen.queryByTestId('material-color')).toBeNull();
    expect(screen.queryByTestId('material-roughness')).toBeNull();

    type('material-scale', '200');
    type('material-rotation', '90');
    type('material-waste', '15');
    expect(assignments(session)[0]).toMatchObject({
      wastePct: 15,
      look: { textureScale: 2, textureRotationDeg: 90 },
    });
    // valori în afara intervalului: mesaj în română, documentul neschimbat
    const before = docOf(session);
    type('material-scale', '10');
    expect(screen.getByRole('alert').textContent).toMatch(/Scara texturii trebuie să fie între/);
    type('material-rotation', '400');
    type('material-waste', '150');
    expect(docOf(session)).toBe(before);
    fireEvent.click(screen.getByTestId('material-reset'));
    expect(assignments(session)[0]!.look).toBeUndefined();

    pickTarget('walls:rA');
    apply('mat.paint.blue');
    pickTarget(faceValue(session, 'rA', 0));
    expect(screen.queryByTestId('material-scale')).toBeNull();
    expect(screen.queryByTestId('material-rotation')).toBeNull();
    expect(screen.queryByTestId('material-color')).not.toBeNull();
    expect(screen.queryByTestId('material-roughness')).not.toBeNull();
    fireEvent.click(screen.getByTestId('material-swatch-8c6d4f'));
    const face = assignments(session).find((a) => a.look?.colorHex)!;
    expect(face.look!.colorHex).toBe('#8c6d4f');
    type('material-roughness', '30');
    expect(assignments(session).find((a) => a.id === face.id)!.look!.roughness).toBeCloseTo(0.3, 9);
    // culoarea modificată apare în plan
    expect(screen.getByTestId(`finish-face-${face.id}`).getAttribute('data-color')).toBe('#8c6d4f');
  });

  it('eliminare: șterge materialul de pe țintă, din snapshot și din estimare; schimbare de material = înlocuire', async () => {
    const e = uiEnv();
    const { session } = await openEditor(e);
    openMaterials();
    pickTarget('floor:rA');
    apply('mat.tile.white');
    apply('mat.tile.grey'); // înlocuiește
    expect(assignments(session)).toHaveLength(1);
    expect(assignments(session)[0]!.finishId).toBe('mat.tile.grey');
    expect(Object.keys(docOf(session).catalogSnapshot.finishes)).toEqual(['mat.tile.grey']);
    fireEvent.click(screen.getByTestId('materials-remove'));
    expect(assignments(session)).toHaveLength(0);
    expect(docOf(session).catalogSnapshot.finishes).toEqual({});
    expect(screen.getByTestId('materials-budget').textContent).toMatch(/Niciun material aplicat/);
    expect(screen.getByTestId('materials-current').textContent).toMatch(
      /Nu este aplicat niciun material/,
    );
  });

  it('REUTILIZARE: același material în două camere = o singură definiție; estimarea are O linie cu aria însumată', async () => {
    const e = uiEnv();
    const { session } = await openEditor(e);
    openMaterials();
    pickTarget('floor:rA');
    apply('mat.parquet.oak-light');
    pickTarget('floor:rB');
    apply('mat.parquet.oak-light');
    expect(Object.keys(docOf(session).catalogSnapshot.finishes)).toEqual(['mat.parquet.oak-light']);
    expect(assignments(session)).toHaveLength(2);
    expect(screen.getAllByTestId(/^materials-budget-mat\./)).toHaveLength(1);
    expect(screen.getByTestId('materials-budget-mat.parquet.oak-light').textContent).toMatch(
      /21\.7 m2/,
    ); // (11,31 + 8,41) × 1,10 = 21,692 → 21,7
  });

  it('eroare de domeniu afișată controlat (țintă dispărută între timp)', async () => {
    const e = uiEnv();
    const { session } = await openEditor(e);
    openMaterials();
    // ștergem camera din spate: ținta aleasă dispare, panoul nu cade
    act(() => {
      session.commit('șterge', (d) => {
        delete d.rooms.rB;
      });
    });
    expect(screen.getByTestId('materials-panel')).toBeTruthy();
    expect(screen.queryByText(/Camera 2/)).toBeNull();
  });
});

describe('mobilier: finisaje pe zone', () => {
  async function withObject(itemId = 'bedroom.wardrobe') {
    const e = uiEnv();
    const doc = clean();
    const r = addObject(
      doc,
      getBuiltinItem(itemId)!,
      { position: { x: 1500, y: 1500 } },
      () => 'ob1',
    );
    if (!r.ok) throw new Error(r.error);
    const { session } = await openEditor(e, r.value.doc);
    return { session, id: r.value.objectId };
  }
  const selectObject = (id: string) => {
    fireEvent.pointerDown(screen.getByTestId(`object-${id}`), {
      clientX: 0,
      clientY: 0,
      button: 0,
      pointerId: 1,
    });
    fireEvent.pointerUp(screen.getByTestId('plan-svg'), {
      clientX: 0,
      clientY: 0,
      button: 0,
      pointerId: 1,
    });
  };

  it('obiect selectat ⇒ țintele devin zonele lui (Corp, Fronturi…); se afișează doar materiale de mobilier; corp și fronturi diferite', async () => {
    const { session, id } = await withObject();
    openMaterials();
    selectObject(id);
    await waitFor(() => expect(screen.getByTestId('object-panel')).toBeTruthy());
    const sel = screen.getByTestId('materials-target') as HTMLSelectElement;
    expect([...sel.options].map((o) => o.text).slice(0, 2)).toEqual([
      'Corp',
      'Fronturi și accente',
    ]);
    expect(screen.getByTestId('materials-surface-hint').textContent).toMatch(/mobilier/);
    const ids = materialIds();
    expect(ids.length).toBe(7);
    expect(ids.every((i) => i.startsWith('mat.furn.'))).toBe(true);

    apply('mat.furn.mdf-white');
    pickTarget('Fronturi și accente');
    apply('mat.furn.wood-dark');
    const a = assignments(session);
    expect(a).toHaveLength(2);
    expect(a.map((x) => (x.target as { slot: string }).slot).sort()).toEqual(['body', 'front']);
    expect(a.every((x) => x.wastePct === 0)).toBe(true);
    // finisajele de mobilier nu au scară/rotație; au culoare și rugozitate; fără rebut
    expect(screen.queryByTestId('material-scale')).toBeNull();
    expect(screen.queryByTestId('material-waste')).toBeNull();
    expect(screen.queryByTestId('material-roughness')).not.toBeNull();
    // estimarea: suplimente pe zonă, descrise ca atare
    expect(screen.getByTestId('materials-budget').textContent).toMatch(
      /finisaj mobilier, supliment/,
    );
    // ștergerea obiectului curăță finisajele
    fireEvent.click(screen.getByTestId('object-delete'));
    expect(assignments(session)).toHaveLength(0);
    expect(docOf(session).catalogSnapshot.finishes).toEqual({});
  });

  it('un obiect fără zone finisabile sau cu material incompatibil nu primește nimic: materialele de pardoseală nu apar la obiecte', async () => {
    const { session, id } = await withObject('decor.picture');
    openMaterials();
    selectObject(id);
    await waitFor(() => expect(screen.getByTestId('object-panel')).toBeTruthy());
    expect(materialIds().every((i) => i.startsWith('mat.furn.'))).toBe(true);
    // domeniul refuză oricum o aplicare incompatibilă (verificare directă)
    const bad = applyFinish(
      docOf(session),
      mat('mat.parquet.dark'),
      { kind: 'objectSlot', objectId: id, slot: 'body' },
      () => 'z',
    );
    expect(bad.ok).toBe(false);
    expect(
      assignmentsOn(docOf(session), { kind: 'objectSlot', objectId: id, slot: 'body' }),
    ).toHaveLength(0);
  });
});

describe('2D ↔ 3D', () => {
  it('clic pe o suprafață în 3D o alege ca țintă și deschide panoul de materiale; aplicarea actualizează scena imediat', async () => {
    const e = uiEnv();
    const { session } = await openEditor(e);
    fireEvent.click(screen.getByTestId('mode-3d'));
    const stub = await screen.findByTestId('canvas-stub');
    expect(screen.queryByTestId('materials-panel')).toBeNull();
    const hash0 = stub.getAttribute('data-hash');
    fireEvent.click(screen.getByTestId('pick-floor-rB'));
    expect(screen.getByTestId('materials-panel')).toBeTruthy();
    expect((screen.getByTestId('materials-target') as HTMLSelectElement).value).toBe('floor:rB');
    expect(screen.getByTestId('canvas-stub').getAttribute('data-surface')).toContain(
      '"roomId":"rB"',
    );
    apply('mat.tile.marble');
    await waitFor(() =>
      expect(screen.getByTestId('canvas-stub').getAttribute('data-hash')).not.toBe(hash0),
    );
    expect(screen.getByTestId('canvas-stub').getAttribute('data-looks')).toBe('1');
    // modificarea unui parametru schimbă iar scena (alt aspect, alt hash)
    const hash1 = screen.getByTestId('canvas-stub').getAttribute('data-hash');
    type('material-scale', '200');
    await waitFor(() =>
      expect(screen.getByTestId('canvas-stub').getAttribute('data-hash')).not.toBe(hash1),
    );
    // față de perete
    fireEvent.click(screen.getByTestId('pick-wall'));
    expect((screen.getByTestId('materials-target') as HTMLSelectElement).value).toMatch(/^face:/);
    expect(screen.getByTestId('materials-surface-hint').textContent).toMatch(/perete/);
    apply('mat.paint.terracotta');
    await waitFor(() =>
      expect(screen.getByTestId('canvas-stub').getAttribute('data-looks')).toBe('2'),
    );
    // undo din sesiune
    act(() => {
      session.undo();
    });
    await waitFor(() =>
      expect(screen.getByTestId('canvas-stub').getAttribute('data-looks')).toBe('1'),
    );
    // revenire în 2D: finisajul de pe podea se vede în plan
    fireEvent.click(screen.getByTestId('mode-2d'));
    await screen.findByTestId('plan-editor');
    expect(screen.getByTestId('room-rB').getAttribute('data-floor')).toBe(
      mat('mat.tile.marble').appearance.baseColorHex,
    );
  });

  it('selecția din plan (cameră) sugerează ținta; panourile catalog/materiale se exclud reciproc', async () => {
    const e = uiEnv();
    await openEditor(e);
    const poly = screen.getByTestId('room-rB').querySelector('polygon')!;
    fireEvent.pointerDown(poly, { clientX: 0, clientY: 0, button: 0, pointerId: 1 });
    fireEvent.pointerUp(screen.getByTestId('plan-svg'), {
      clientX: 0,
      clientY: 0,
      button: 0,
      pointerId: 1,
    });
    openMaterials();
    expect((screen.getByTestId('materials-target') as HTMLSelectElement).value).toBe('floor:rB');
    fireEvent.click(screen.getByTestId('catalog-toggle'));
    expect(screen.queryByTestId('materials-panel')).toBeNull();
    expect(screen.getByTestId('catalog-panel')).toBeTruthy();
    fireEvent.click(screen.getByTestId('materials-toggle'));
    expect(screen.queryByTestId('catalog-panel')).toBeNull();
  });
});

describe('doar-citire și documente invalide', () => {
  it('doar-citire: lista și câmpurile sunt dezactivate, cu explicație; nu se aplică nimic', async () => {
    const e = uiEnv();
    const base = clean();
    const seeded = applyFinish(
      base,
      mat('mat.parquet.dark'),
      { kind: 'roomFloor', roomId: 'rA' },
      () => 'a1',
    );
    if (!seeded.ok) throw new Error(seeded.error);
    const r = await e.tab.manager.importFile(exportProject(seeded.value.doc, META));
    if (!r.ok) throw new Error('seed');
    const holder = await e.newTab().manager.open(r.value.id);
    expect(holder.ok).toBe(true);
    query = `p=${r.value.id}`;
    renderWithRuntime(<EditorClient />, e.runtimeFor(e.tab));
    await screen.findByTestId('plan-editor');
    const session = e.tab.manager.openSessions().get(r.value.id)!;
    const apply2 = vi.spyOn(session, 'apply');
    openMaterials();
    pickTarget('floor:rA');
    expect(screen.getByTestId('materials-panel').textContent).toMatch(/doar pentru citire/);
    expect((screen.getByTestId('material-mat.tile.white') as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByTestId('materials-remove') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('material-scale') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('material-mat.tile.white'));
    expect(apply2).not.toHaveBeenCalled();
  });

  it('estimarea de buget nu cade când documentul are o eroare de calcul: mesaj explicit în panou', async () => {
    const e = uiEnv();
    const { session } = await openEditor(e);
    openMaterials();
    apply('mat.parquet.dark');
    // stricăm geometria direct în memorie (perete cu nod lipsă): comiterea e refuzată, panoul rămâne funcțional
    const r = session.commit('stricat', (d) => {
      d.walls.w1!.endNodeId = 'nu-exista';
    });
    expect(r.ok).toBe(false);
    expect(
      within(screen.getByTestId('materials-panel')).getByTestId('materials-budget'),
    ).toBeTruthy();
  });
});
