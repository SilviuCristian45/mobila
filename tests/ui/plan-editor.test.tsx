// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportProject, type ProjectDocument } from '@/domain';
import { PlanEditor } from '@/features/plan-editor/PlanEditor';
import { EditorClient as EditorShell } from '@/app/editor/EditorClient';
import type { ProjectSession } from '@/state/session';
import { quotaError, settle } from '../helpers/env';
import { renderWithRuntime, uiEnv, type UiEnv } from '../helpers/ui';
import { studioProject } from '../reference/projects';

let query = '';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(query) }));

beforeEach(() => {
  query = '';
});

const META = { exportedAt: '2026-10-27T12:00:00.000Z', appVersion: 'test' };

async function openStudio(
  e: UiEnv,
  doc: ProjectDocument = studioProject(),
): Promise<{ id: string; session: ProjectSession }> {
  const r = await e.tab.manager.importFile(exportProject(doc, META));
  if (!r.ok) throw new Error('seed');
  const id = r.value.id;
  query = `p=${id}`;
  renderWithRuntime(<EditorShell />, e.runtimeFor(e.tab));
  await screen.findByTestId('plan-editor');
  const session = e.tab.manager.openSessions().get(id)!;
  return { id, session };
}

const svg = () => screen.getByTestId('plan-svg');
/** Coordonate client ale unui punct din lume (jsdom: svg-ul începe la 0,0). */
function client(x: number, y: number) {
  const el = svg();
  const zoom = Number(el.getAttribute('data-zoom'));
  return {
    clientX: x * zoom + Number(el.getAttribute('data-pan-x')),
    clientY: y * zoom + Number(el.getAttribute('data-pan-y')),
  };
}
const ptr = (x: number, y: number, extra: Record<string, unknown> = {}) => ({
  ...client(x, y),
  button: 0,
  pointerId: 1,
  ...extra,
});

/** Trage un element: apăsare, mișcări intermediare, eventual eliberare. */
function dragTo(el: Element, from: [number, number], via: Array<[number, number]>, release = true) {
  fireEvent.pointerDown(el, ptr(...from));
  for (const [x, y] of via) fireEvent.pointerMove(svg(), ptr(x, y));
  if (release) {
    const last = via[via.length - 1]!;
    fireEvent.pointerUp(svg(), ptr(last[0], last[1]));
  }
}

const docOf = (s: ProjectSession) => s.getState().doc;
const click = (id: string) => {
  const el = screen.getByTestId(id);
  // camera: gestul se prinde pe poligonul ei, nu pe grupul care o conține
  fireEvent.pointerDown(id.startsWith('room-') ? el.querySelector('polygon')! : el, ptr(0, 0));
};
const keyDown = (key: string, init: KeyboardEventInit = {}) =>
  act(() => {
    fireEvent.keyDown(window, { key, ...init });
  });

describe('Plan 2D — randare și dimensiuni', () => {
  it('desenează camerele, pereții, golurile și nodurile proiectului, cu suprafețe și cote', async () => {
    const e = uiEnv();
    await openStudio(e);
    expect(svg().getAttribute('data-valid')).toBe('true');
    for (const id of [
      'room-rA',
      'room-rB',
      'wall-w1',
      'wall-w7',
      'opening-oDoor',
      'opening-oWin',
      'node-n1',
      'node-n6',
    ])
      expect(screen.getByTestId(id)).toBeTruthy();
    expect(screen.getByTestId('opening-oDoor').getAttribute('data-type')).toBe('door');
    expect(screen.getByTestId('opening-oWin').getAttribute('data-type')).toBe('window');
    // aria-urile din referință: 3900×2900 = 11,31 m² și 2900×2900 = 8,41 m²
    expect(screen.getByTestId('room-area-rA').textContent).toBe('11,31 m²');
    expect(screen.getByTestId('room-area-rB').textContent).toBe('8,41 m²');
    expect(screen.getByTestId('room-name-rA').textContent).toBe('Living');
    // laturile interioare ale lui rA (unitatea de afișare e cm): 390 și 290
    expect(screen.getByTestId('dim-rA-w1').textContent).toBe('390 cm');
    expect(screen.getByTestId('dim-rA-w2').textContent).toBe('290 cm');
  });

  it('proiect gol: mesaj de ajutor și panoul de adăugare', async () => {
    const e = uiEnv();
    const r = await e.tab.manager.create('Gol');
    if (!r.ok) throw new Error('create');
    query = `p=${r.value.id}`;
    renderWithRuntime(<EditorShell />, e.runtimeFor(e.tab));
    expect(await screen.findByTestId('plan-empty')).toBeTruthy();
    expect(screen.getByTestId('panel-add')).toBeTruthy();
  });

  it('cotele urmează unitatea de afișare a proiectului', async () => {
    const e = uiEnv();
    const doc = studioProject();
    doc.settings.displayUnit = 'm';
    await openStudio(e, doc);
    expect(screen.getByTestId('dim-rA-w1').textContent).toBe('3,9 m');
  });

  it('zoom (butoane și taste) și potrivire', async () => {
    const e = uiEnv();
    await openStudio(e);
    const z0 = Number(svg().getAttribute('data-zoom'));
    await userEvent.click(screen.getByTestId('zoom-in'));
    const z1 = Number(svg().getAttribute('data-zoom'));
    expect(z1).toBeCloseTo(z0 * 1.25, 6);
    await keyDown('-');
    await keyDown('-');
    expect(Number(svg().getAttribute('data-zoom'))).toBeLessThan(z0);
    await userEvent.click(screen.getByTestId('zoom-fit'));
    expect(Number(svg().getAttribute('data-zoom'))).toBeCloseTo(z0, 6);
  });
});

describe('Plan 2D — selecție și proprietăți', () => {
  it('selectează pereți, camere, goluri și noduri; fundalul deselectează', async () => {
    const e = uiEnv();
    await openStudio(e);
    click('wall-w1');
    expect(screen.getByTestId('panel-wall')).toBeTruthy();
    expect(screen.getByTestId('wall-w1').getAttribute('data-selected')).toBe('true');
    expect(screen.getByTestId('dim-selected-wall').textContent).toBe('400 cm · 10 cm');
    expect(screen.getByTestId('wall-axis').textContent).toBe('400 cm');
    click('room-rB');
    expect(screen.getByTestId('panel-room')).toBeTruthy();
    expect((screen.getByTestId('room-name') as HTMLInputElement).value).toBe('Dormitor');
    expect(screen.getByTestId('room-area').textContent).toBe('8,41 m²');
    click('opening-oDoor');
    expect(screen.getByTestId('panel-opening')).toBeTruthy();
    expect((screen.getByTestId('opening-width') as HTMLInputElement).value).toBe('900');
    click('node-n5');
    expect((screen.getByTestId('node-x') as HTMLInputElement).value).toBe('7000');
    fireEvent.pointerDown(svg(), ptr(-3000, -3000));
    expect(screen.getByTestId('panel-add')).toBeTruthy();
  });

  it('lista de elemente permite selecția fără mouse pe plan', async () => {
    const e = uiEnv();
    await openStudio(e);
    const list = screen.getByTestId('element-list');
    await userEvent.click(within(list).getByText(/Elemente din plan/));
    await userEvent.click(within(list).getByRole('button', { name: /Cameră „Dormitor”/ }));
    expect(screen.getByTestId('panel-room')).toBeTruthy();
  });

  it('editare de proprietăți: grosime perete → un singur pas de istoric; valoare impară respinsă cu mesaj', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    click('wall-w1');
    const field = screen.getByTestId('wall-thickness');
    await userEvent.clear(field);
    await userEvent.type(field, '151{Enter}');
    expect(screen.getByText('Grosimea trebuie să fie un număr par pozitiv de mm.')).toBeTruthy();
    expect(session.getState().historySize).toBe(0);
    expect((field as HTMLInputElement).value).toBe('100'); // revenit la valoarea din document
    await userEvent.clear(field);
    await userEvent.type(field, '200{Enter}');
    expect(docOf(session).walls.w1!.thicknessMm).toBe(200);
    expect(session.getState().historySize).toBe(1);
    expect(screen.getByTestId('wall-axis').textContent).toBe('400 cm');
  });

  it('o editare care ar invalida documentul este anulată, cu explicație; documentul rămâne neschimbat', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    const before = docOf(session);
    click('wall-w2'); // are ușa de 2100 mm
    const h = screen.getByTestId('wall-height');
    await userEvent.clear(h);
    await userEvent.type(h, '1800{Enter}');
    expect(await screen.findByText(/Un gol ar depăși înălțimea peretelui/)).toBeTruthy();
    expect(docOf(session)).toBe(before);
    expect(session.getState().historySize).toBe(0);
  });

  it('camera: nume, tip și dimensiuni interioare', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    click('room-rB');
    const name = screen.getByTestId('room-name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Birou{Enter}');
    expect(docOf(session).rooms.rB!.name).toBe('Birou');
    await userEvent.selectOptions(screen.getByTestId('room-type'), 'office');
    expect(docOf(session).rooms.rB!.type).toBe('office');
    const w = screen.getByTestId('room-width');
    await userEvent.clear(w);
    await userEvent.type(w, '3100{Enter}');
    expect(screen.getByTestId('room-area').textContent).toBe('8,99 m²'); // 3100 × 2900
    expect(session.getState().historySize).toBe(3);
    await userEvent.clear(name);
    await userEvent.type(name, '   {Enter}');
    expect(screen.getByText('Numele camerei nu poate fi gol.')).toBeTruthy();
  });
});

describe('Plan 2D — mutarea nodurilor', () => {
  it('tragerea unui nod nu scrie în document la fiecare mișcare; un singur commit la final', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    const apply = vi.spyOn(session, 'apply');
    const commit = vi.spyOn(session, 'commit');
    const node = screen.getByTestId('node-n5');
    const before = docOf(session);
    dragTo(
      node,
      [7000, 0],
      [
        [7100, 0],
        [7300, 0],
        [7500, 0],
      ],
      false,
    );
    // în timpul gestului: previzualizare, dar documentul și istoricul sunt neatinse
    expect(Number(screen.getByTestId('node-n5').getAttribute('cx'))).toBe(7500);
    expect(screen.getByTestId('dim-drag-w5').textContent).toBe('350 cm');
    expect(docOf(session)).toBe(before);
    expect(apply).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(session.getState().historySize).toBe(0);
    fireEvent.pointerUp(svg(), ptr(7500, 0));
    expect(apply).toHaveBeenCalledTimes(1);
    expect(docOf(session).nodes.n5).toMatchObject({ x: 7500, y: 0 });
    expect(session.getState().historySize).toBe(1);
    expect(session.getState().undoLabel).toBe('Mută nodul');
    // n6 a rămas pe loc: camera devine trapez (latura de sus 3400, cea de jos 2900 → 3150 × 2900)
    expect(screen.getByTestId('room-area-rB').textContent).toBe('9,13 m²');
  });

  it('undo/redo pentru mutare', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    dragTo(screen.getByTestId('node-n5'), [7000, 0], [[7500, 0]]);
    expect(docOf(session).nodes.n5!.x).toBe(7500);
    act(() => void session.undo());
    expect(docOf(session).nodes.n5!.x).toBe(7000);
    expect(screen.getByTestId('room-area-rB').textContent).toBe('8,41 m²');
    act(() => void session.redo());
    expect(docOf(session).nodes.n5!.x).toBe(7500);
  });

  it('o poziție invalidă este semnalată în timpul tragerii și mutarea se anulează la eliberare', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    const before = docOf(session);
    const node = screen.getByTestId('node-n5');
    dragTo(
      node,
      [7000, 0],
      [
        [5000, 0],
        [3000, 0],
      ],
      false,
    ); // peste peretele w2 (x = 4000)
    expect(screen.getByTestId('drag-invalid')).toBeTruthy();
    expect(svg().getAttribute('data-valid')).toBe('false');
    fireEvent.pointerUp(svg(), ptr(3000, 0));
    const notice = await screen.findByTestId('plan-notice');
    expect(notice.textContent).toMatch(/Modificare respinsă/);
    expect(notice.textContent).toMatch(/a revenit la poziția anterioară/);
    expect(docOf(session)).toBe(before);
    expect(session.getState().historySize).toBe(0);
    expect(screen.queryByTestId('drag-invalid')).toBeNull();
    expect(Number(screen.getByTestId('node-n5').getAttribute('cx'))).toBe(7000);
  });

  it('Escape în timpul tragerii o anulează fără nicio scriere', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    const apply = vi.spyOn(session, 'apply');
    dragTo(screen.getByTestId('node-n5'), [7000, 0], [[7500, 0]], false);
    await keyDown('Escape');
    fireEvent.pointerUp(svg(), ptr(7500, 0));
    expect(apply).not.toHaveBeenCalled();
    expect(docOf(session).nodes.n5!.x).toBe(7000);
  });

  it('un clic simplu pe nod doar selectează (fără commit)', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    const apply = vi.spyOn(session, 'apply');
    fireEvent.pointerDown(screen.getByTestId('node-n5'), ptr(7000, 0));
    fireEvent.pointerUp(svg(), ptr(7000, 0));
    expect(apply).not.toHaveBeenCalled();
    expect(screen.getByTestId('panel-node')).toBeTruthy();
  });

  it('coordonatele din panou mută nodul; valorile nevalide sunt respinse', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    click('node-n5');
    const x = screen.getByTestId('node-x');
    await userEvent.clear(x);
    await userEvent.type(x, '7200{Enter}');
    expect(docOf(session).nodes.n5!.x).toBe(7200);
    await userEvent.clear(x);
    await userEvent.type(x, '3000{Enter}');
    expect(await screen.findByText(/Modificare respinsă/)).toBeTruthy();
    expect(docOf(session).nodes.n5!.x).toBe(7200);
    expect(session.getState().historySize).toBe(1);
  });
});

describe('Plan 2D — adăugare și ștergere de pereți și camere', () => {
  it('unealta „Perete nou”: două clicuri creează un perete (un pas de istoric), firul continuă, Esc îl oprește', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    const walls0 = Object.keys(docOf(session).walls).length;
    await userEvent.click(screen.getByTestId('tool-wall'));
    fireEvent.pointerDown(svg(), ptr(0, 5000));
    expect(screen.getByTestId('wall-preview')).toBeTruthy();
    fireEvent.pointerMove(svg(), ptr(3000, 5000));
    expect(screen.getByTestId('dim-preview').textContent).toBe('300 cm');
    fireEvent.pointerDown(svg(), ptr(3000, 5000));
    expect(Object.keys(docOf(session).walls)).toHaveLength(walls0 + 1);
    expect(session.getState().historySize).toBe(1);
    // al doilea perete pornește din capătul primului
    fireEvent.pointerDown(svg(), ptr(3000, 6500));
    expect(Object.keys(docOf(session).walls)).toHaveLength(walls0 + 2);
    expect(session.getState().historySize).toBe(2);
    expect(Object.keys(docOf(session).nodes)).toHaveLength(6 + 3);
    await keyDown('Escape'); // oprește firul
    expect(screen.queryByTestId('wall-preview')).toBeNull();
    act(() => void session.undo());
    act(() => void session.undo());
    expect(Object.keys(docOf(session).walls)).toHaveLength(walls0);
    expect(Object.keys(docOf(session).nodes)).toHaveLength(6);
  });

  it('capătul se leagă de un nod existent aflat aproape de cursor', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    await userEvent.click(screen.getByTestId('tool-wall'));
    fireEvent.pointerDown(svg(), ptr(7000, 3000)); // lângă n6: se alege nodul existent
    fireEvent.pointerDown(svg(), ptr(7000, 5000));
    const d = docOf(session);
    const wall = Object.values(d.walls).find((w) => w.startNodeId === 'n6' || w.endNodeId === 'n6');
    expect(
      Object.values(d.walls).filter((w) => w.startNodeId === 'n6' || w.endNodeId === 'n6'),
    ).toHaveLength(3);
    expect(wall).toBeTruthy();
    expect(Object.keys(d.nodes)).toHaveLength(7);
  });

  it('un perete care ar tăia alt perete este respins, cu explicație; firul rămâne', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    await userEvent.click(screen.getByTestId('tool-wall'));
    fireEvent.pointerDown(svg(), ptr(2000, -1000));
    fireEvent.pointerDown(svg(), ptr(2000, 4000)); // taie w1 și w3
    expect(screen.getByTestId('plan-notice').textContent).toMatch(/s-ar încrucișa/);
    expect(session.getState().historySize).toBe(0);
    expect(screen.getByTestId('wall-preview')).toBeTruthy();
  });

  it('formularele adaugă cameră dreptunghiulară și perete fără mouse; validează câmpurile', async () => {
    const e = uiEnv();
    const r = await e.tab.manager.create('Gol');
    if (!r.ok) throw new Error('create');
    query = `p=${r.value.id}`;
    renderWithRuntime(<EditorShell />, e.runtimeFor(e.tab));
    await screen.findByTestId('panel-add');
    const session = e.tab.manager.openSessions().get(r.value.id)!;
    const f = (id: string, v: string) => {
      const input = screen.getByTestId(id);
      return userEvent.clear(input).then(() => (v === '' ? undefined : userEvent.type(input, v)));
    };
    await f('room-form-width', '');
    await userEvent.click(screen.getByTestId('room-form-submit'));
    expect(screen.getByTestId('room-form-error').textContent).toMatch(/Completează/);
    await f('room-form-width', '0');
    await userEvent.click(screen.getByTestId('room-form-submit'));
    expect(screen.getByTestId('room-form-error').textContent).toMatch(/pozitive/);
    await f('room-form-width', '4000');
    await userEvent.click(screen.getByTestId('room-form-submit'));
    expect(Object.keys(docOf(session).rooms)).toHaveLength(1);
    expect(screen.getByTestId('panel-room')).toBeTruthy();
    expect(screen.getByTestId('room-area').textContent).toBe('12 m²'); // 4000 × 3000
    // peretele din coordonate
    fireEvent.pointerDown(svg(), ptr(-9000, -9000));
    await f('wall-form-x1', '6000');
    await f('wall-form-y1', '0');
    await f('wall-form-x2', '9000');
    await f('wall-form-y2', '0');
    await userEvent.click(screen.getByTestId('wall-form-submit'));
    expect(Object.keys(docOf(session).walls)).toHaveLength(5);
    expect(screen.getByTestId('panel-wall')).toBeTruthy();
  });

  it('ștergerea unui perete liber (cu golurile lui) este directă și se poate anula', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    await userEvent.click(screen.getByTestId('tool-wall'));
    fireEvent.pointerDown(svg(), ptr(8000, 0));
    fireEvent.pointerDown(svg(), ptr(11000, 0));
    await keyDown('Escape');
    await userEvent.click(screen.getByTestId('tool-select'));
    const added = Object.keys(docOf(session).walls).find((id) => !id.startsWith('w'))!;
    await userEvent.click(screen.getByTestId('add-window'));
    expect(Object.keys(docOf(session).openings)).toHaveLength(3);
    const steps = session.getState().historySize;
    click(`wall-${added}`); // adăugarea a selectat golul nou; revenim la perete
    await userEvent.click(screen.getByRole('button', { name: 'Șterge peretele' }));
    expect(docOf(session).walls[added]).toBeUndefined();
    expect(Object.keys(docOf(session).openings)).toHaveLength(2);
    expect(session.getState().historySize).toBe(steps + 1);
    act(() => void session.undo());
    expect(docOf(session).walls[added]).toBeDefined();
    expect(Object.keys(docOf(session).openings)).toHaveLength(3);
  });

  it('ștergerea unui perete de cameră cere confirmare și arată ce dispare; anulabilă cu undo', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    click('wall-w6');
    await keyDown('Delete');
    const dialog = await screen.findByRole('dialog', { name: 'Ștergi peretele și camerele lui?' });
    expect(dialog.textContent).toMatch(/Dormitor/);
    // anulare: nimic nu se schimbă
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anulează' }));
    expect(docOf(session).walls.w6).toBeDefined();
    await keyDown('Delete');
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Șterge' }),
    );
    expect(docOf(session).walls.w6).toBeUndefined();
    expect(docOf(session).rooms.rB).toBeUndefined();
    expect(docOf(session).rooms.rA).toBeDefined();
    expect(session.getState().historySize).toBe(1);
    expect(screen.queryByTestId('room-rB')).toBeNull();
    act(() => void session.undo());
    expect(docOf(session).rooms.rB).toBeDefined();
    expect(docOf(session).walls.w6).toBeDefined();
  });

  it('ștergere blocată de legături pe care nu le putem repara (linii de buget): mesaj în dialog, nimic șters', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    click('wall-w1'); // face parte din rA, legată de o linie manuală de buget
    await keyDown('Delete');
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Șterge' }));
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    expect(within(dialog).getByRole('alert').textContent).toMatch(/linii manuale/);
    expect(docOf(session).walls.w1).toBeDefined();
    expect(session.getState().historySize).toBe(0);
  });

  it('ștergerea camerei lasă pereții', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    click('room-rB');
    await userEvent.click(screen.getByRole('button', { name: 'Șterge camera' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Șterge camera' }),
    );
    expect(docOf(session).rooms.rB).toBeUndefined();
    expect(Object.keys(docOf(session).walls)).toHaveLength(7);
  });
});

describe('Plan 2D — regresii găsite în browser real', () => {
  /** Evenimente native, fără act() între ele: ca într-un browser, unde React poate să nu fi re-randat între ultimul pointermove și pointerup. */
  const nativePtr = (type: string, el: Element, x: number, y: number) =>
    el.dispatchEvent(
      new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, ...client(x, y) }),
    );

  it('eliberarea imediat după ultima mișcare (fără re-randare între ele) comite exact o dată, la poziția finală', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    const apply = vi.spyOn(session, 'apply');
    const node = screen.getByTestId('node-n5');
    nativePtr('pointerdown', node, 7000, 0);
    nativePtr('pointermove', svg(), 7200, 0);
    nativePtr('pointermove', svg(), 7500, 0);
    nativePtr('pointerup', svg(), 7500, 0);
    await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    expect(docOf(session).nodes.n5!.x).toBe(7500);
    expect(session.getState().historySize).toBe(1);
  });

  it('același lucru pentru un gol tras pe perete', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    const apply = vi.spyOn(session, 'apply');
    nativePtr('pointerdown', screen.getByTestId('opening-oWin'), 2000, 0);
    nativePtr('pointermove', svg(), 2300, 0);
    nativePtr('pointermove', svg(), 2500, 0);
    nativePtr('pointerup', svg(), 2500, 0);
    await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    expect(docOf(session).openings.oWin!.offsetMm).toBe(2500);
  });

  it('mânerul de selecție al unui gol nu primește evenimente de pointer (nu acoperă golul)', async () => {
    const e = uiEnv();
    await openStudio(e);
    click('opening-oDoor');
    const group = screen.getByTestId('opening-oDoor');
    expect(group.getAttribute('data-selected')).toBe('true');
    const handle = group.querySelector('circle')!;
    expect(handle.getAttribute('pointer-events')).toBe('none');
    // golul propriu-zis rămâne ținta: apăsarea pe poligonul lui selectează golul
    click('opening-oWin');
    expect(screen.getByTestId('opening-oWin').getAttribute('data-selected')).toBe('true');
    fireEvent.pointerDown(group.querySelector('polygon')!, ptr(0, 0));
    expect(group.getAttribute('data-selected')).toBe('true');
  });
});

describe('Plan 2D — uși și ferestre', () => {
  it('adaugă o ușă pe perete, o selectează, apoi o repoziționează din butoane și din câmp', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    click('wall-w3');
    await userEvent.click(screen.getByTestId('add-door'));
    const created = Object.values(docOf(session).openings).find((o) => o.wallId === 'w3')!;
    expect(created.type).toBe('door');
    expect(created.offsetMm).toBe(2000);
    expect(screen.getByTestId('panel-opening')).toBeTruthy();
    expect(screen.getByTestId(`opening-${created.id}`).getAttribute('data-selected')).toBe('true');
    await userEvent.click(screen.getByTestId('opening-nudge-forward'));
    expect(docOf(session).openings[created.id]!.offsetMm).toBe(2100);
    const off = screen.getByTestId('opening-offset');
    await userEvent.clear(off);
    await userEvent.type(off, '1500{Enter}');
    expect(docOf(session).openings[created.id]!.offsetMm).toBe(1500);
    // în afara peretelui: respins
    await userEvent.clear(off);
    await userEvent.type(off, '10{Enter}');
    expect(await screen.findByText(/Un gol ar ieși din porțiunea dreaptă/)).toBeTruthy();
    expect(docOf(session).openings[created.id]!.offsetMm).toBe(1500);
    expect(session.getState().historySize).toBe(3);
  });

  it('tragerea unui gol pe perete: previzualizare fără scriere, un singur commit la final', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    const apply = vi.spyOn(session, 'apply');
    const win = screen.getByTestId('opening-oWin'); // pe w1 (de la (0,0) la (4000,0)), centrat la 2000
    dragTo(
      win,
      [2000, 0],
      [
        [2300, 0],
        [2500, 0],
      ],
      false,
    );
    expect(apply).not.toHaveBeenCalled();
    expect(docOf(session).openings.oWin!.offsetMm).toBe(2000);
    fireEvent.pointerUp(svg(), ptr(2500, 0));
    expect(apply).toHaveBeenCalledTimes(1);
    expect(docOf(session).openings.oWin!.offsetMm).toBe(2500);
    act(() => void session.undo());
    expect(docOf(session).openings.oWin!.offsetMm).toBe(2000);
  });

  it('tragerea nu scoate golul din limitele peretelui (se oprește la marginea admisă)', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    dragTo(screen.getByTestId('opening-oWin'), [2000, 0], [[9000, 0]]);
    const off = docOf(session).openings.oWin!.offsetMm;
    expect(off).toBeGreaterThan(2000);
    expect(off).toBeLessThan(4000 - 600);
    expect(screen.queryByTestId('plan-notice')).toBeNull();
  });

  it('suprapunerea cu alt gol este respinsă la final și golul revine', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    click('wall-w1');
    await userEvent.click(screen.getByTestId('add-door'));
    const door = Object.values(docOf(session).openings).find(
      (o) => o.wallId === 'w1' && o.type === 'door',
    )!;
    const before = docOf(session);
    // golul nou nu se poate suprapune cu fereastra de la 2000: îl tragem peste ea
    dragTo(screen.getByTestId(`opening-${door.id}`), [door.offsetMm, 0], [[2050, 0]]);
    expect(await screen.findByTestId('plan-notice')).toBeTruthy();
    expect(screen.getByTestId('plan-notice').textContent).toMatch(
      /a revenit la poziția anterioară/,
    );
    expect(docOf(session)).toBe(before);
  });

  it('ștergerea cu Delete și cu butonul; undo restaurează', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    click('opening-oDoor');
    await keyDown('Delete');
    expect(docOf(session).openings.oDoor).toBeUndefined();
    expect(screen.queryByTestId('opening-oDoor')).toBeNull();
    act(() => void session.undo());
    expect(docOf(session).openings.oDoor).toBeDefined();
    click('opening-oWin');
    await userEvent.click(screen.getByRole('button', { name: 'Șterge fereastra' }));
    expect(docOf(session).openings.oWin).toBeUndefined();
  });

  it('proprietățile ușii: sensul de deschidere; fereastra nu are sens', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    click('opening-oDoor');
    await userEvent.selectOptions(screen.getByTestId('opening-hinge'), 'end');
    await userEvent.selectOptions(screen.getByTestId('opening-side'), 'right');
    expect(docOf(session).openings.oDoor!.swing).toEqual({ hinge: 'end', side: 'right' });
    click('opening-oWin');
    expect(screen.queryByTestId('opening-hinge')).toBeNull();
    const sill = screen.getByTestId('opening-sill');
    await userEvent.clear(sill);
    await userEvent.type(sill, '1000{Enter}');
    expect(docOf(session).openings.oWin!.sillHeightMm).toBe(1000);
  });
});

describe('Plan 2D — tastatură', () => {
  it('Delete/Backspace, săgețile și literele NU acționează când scrii într-un câmp de formular', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    click('node-n5');
    const x = screen.getByTestId('node-x');
    await userEvent.click(x);
    await userEvent.keyboard('{ArrowLeft}{Backspace}{Delete}');
    await userEvent.keyboard('w');
    expect(docOf(session).nodes.n5!.x).toBe(7000);
    expect(session.getState().historySize).toBe(0);
    expect(screen.getByTestId('tool-select').getAttribute('aria-pressed')).toBe('true');
    click('wall-w1');
    const t = screen.getByTestId('wall-thickness');
    await userEvent.click(t);
    await userEvent.keyboard('{Delete}');
    expect(docOf(session).walls.w1).toBeDefined();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('săgețile mută nodul selectat cu o celulă de grilă (Shift = 10×); fiecare apăsare = un pas de istoric', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    click('node-n5');
    await keyDown('ArrowRight');
    expect(docOf(session).nodes.n5!.x).toBe(7100);
    await keyDown('ArrowDown', { shiftKey: true });
    expect(docOf(session).nodes.n5!.y).toBe(1000);
    expect(session.getState().historySize).toBe(2);
    await keyDown('ArrowRight', { shiftKey: true });
    await keyDown('ArrowRight', { shiftKey: true }); // 9100
    await keyDown('ArrowLeft', { shiftKey: true, key: 'ArrowLeft' });
    expect(docOf(session).nodes.n5!.x).toBe(9100 - 1000);
  });

  it('o mutare invalidă din tastatură este respinsă cu mesaj', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    click('node-n5');
    for (let i = 0; i < 4; i++) await keyDown('ArrowLeft', { shiftKey: true }); // 3000 < 4000 (w2)
    expect(session.getState().historySize).toBe(2);
    expect(docOf(session).nodes.n5!.x).toBe(5000);
    expect(screen.getByTestId('plan-notice').textContent).toMatch(/respinsă/);
  });

  it('Escape deselectează; V/W schimbă unealta; Ctrl+săgeată nu e interceptat', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    click('wall-w1');
    await keyDown('Escape');
    expect(screen.getByTestId('panel-add')).toBeTruthy();
    await keyDown('w');
    expect(screen.getByTestId('tool-wall').getAttribute('aria-pressed')).toBe('true');
    await keyDown('Escape');
    expect(screen.getByTestId('tool-select').getAttribute('aria-pressed')).toBe('true');
    click('node-n5');
    await keyDown('ArrowRight', { ctrlKey: true });
    expect(docOf(session).nodes.n5!.x).toBe(7000);
  });

  it('săgețile fără selecție deplasează planul', async () => {
    const e = uiEnv();
    await openStudio(e);
    const x0 = Number(svg().getAttribute('data-pan-x'));
    await keyDown('ArrowLeft'); // vederea se deplasează spre stânga: conținutul se mută spre dreapta
    expect(Number(svg().getAttribute('data-pan-x'))).toBeGreaterThan(x0);
    await keyDown('ArrowRight');
    await keyDown('ArrowRight');
    expect(Number(svg().getAttribute('data-pan-x'))).toBeLessThan(x0);
  });
});

describe('Plan 2D — doar-citire, conflict, salvare', () => {
  it('doar-citire: banda de stare, comenzi dezactivate, nicio modificare posibilă', async () => {
    const e = uiEnv();
    const r = await e.tab.manager.importFile(exportProject(studioProject(), META));
    if (!r.ok) throw new Error('seed');
    const holder = await e.newTab().manager.open(r.value.id);
    expect(holder.ok).toBe(true);
    query = `p=${r.value.id}`;
    renderWithRuntime(<EditorShell />, e.runtimeFor(e.tab));
    await screen.findByTestId('plan-editor');
    const session = e.tab.manager.openSessions().get(r.value.id)!;
    expect(screen.getByTestId('plan-status').textContent).toMatch(/Doar citire/);
    expect((screen.getByTestId('tool-wall') as HTMLButtonElement).disabled).toBe(true);
    // selecția funcționează, editarea nu
    click('wall-w1');
    expect((screen.getByTestId('wall-thickness') as HTMLInputElement).disabled).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Șterge peretele' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    const apply = vi.spyOn(session, 'apply');
    dragTo(screen.getByTestId('node-n5'), [7000, 0], [[7500, 0]]);
    await keyDown('ArrowRight');
    await keyDown('Delete');
    expect(apply).not.toHaveBeenCalled();
    expect(docOf(session).nodes.n5!.x).toBe(7000);
    expect(screen.getByTestId('plan-editor').getAttribute('data-editable')).toBe('false');
  });

  it('conflict: editarea se oprește, cu mesaj vizibil în editor', async () => {
    const e = uiEnv();
    const { id, session } = await openStudio(e);
    const other = e.newTab();
    await other.repo.rename(id, 'Din alt loc', e.clock.nowIso());
    dragTo(screen.getByTestId('node-n5'), [7000, 0], [[7500, 0]]);
    await act(async () => {
      await e.clock.advance(800);
      await settle();
    });
    await waitFor(() => expect(session.getState().status).toBe('conflict'));
    expect(screen.getByTestId('plan-status').textContent).toMatch(/Conflict de versiuni/);
    expect(screen.getByTestId('plan-editor').getAttribute('data-editable')).toBe('false');
    expect((screen.getByTestId('tool-wall') as HTMLButtonElement).disabled).toBe(true);
    const before = docOf(session);
    await keyDown('ArrowRight');
    expect(docOf(session)).toBe(before);
    // modificarea făcută înainte rămâne vizibilă în plan
    expect(Number(screen.getByTestId('node-n5').getAttribute('cx'))).toBe(7500);
  });

  it('eroare de salvare: banda o spune, editarea rămâne posibilă, modificările rămân în memorie', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    vi.spyOn(e.tab.db.documents, 'put').mockRejectedValue(quotaError());
    dragTo(screen.getByTestId('node-n5'), [7000, 0], [[7500, 0]]);
    await act(async () => {
      await e.clock.advance(800);
      await settle();
    });
    await waitFor(() => expect(session.getState().status).toBe('error'));
    expect(screen.getByTestId('plan-status').textContent).toMatch(/Salvarea a eșuat/);
    expect(screen.getByTestId('plan-editor').getAttribute('data-editable')).toBe('true');
    await keyDown('ArrowRight');
    expect(docOf(session).nodes.n5!.x).toBe(7600);
  });

  it('salvare în curs: banda „Se salvează…”', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    // poarta se pune ÎNAINTEA tranzacției IndexedDB (o tranzacție ținută deschisă s-ar încheia singură)
    const save = e.tab.repo.save.bind(e.tab.repo);
    vi.spyOn(e.tab.repo, 'save').mockImplementation(async (...a: Parameters<typeof save>) => {
      await gate;
      return save(...a);
    });
    dragTo(screen.getByTestId('node-n5'), [7000, 0], [[7500, 0]]);
    await act(async () => {
      await e.clock.advance(800);
    });
    await waitFor(() => expect(session.getState().status).toBe('saving'));
    expect(screen.getByTestId('plan-status').textContent).toMatch(/Se salvează/);
    await act(async () => {
      release();
      await settle();
    });
    await waitFor(() => expect(session.getState().status).toBe('saved'));
    expect(screen.queryByTestId('plan-status')).toBeNull();
  });
});

describe('Plan 2D — document invalid', () => {
  it('un plan cu probleme geometrice este semnalat, cu axele în roșu', async () => {
    const e = uiEnv();
    const { session } = await openStudio(e);
    const real = session.getState();
    const bad = structuredClone(real.doc);
    bad.nodes.n5 = { ...bad.nodes.n5!, x: 3000 };
    render(<PlanEditor session={session} state={{ ...real, doc: bad }} />);
    const boxes = await screen.findAllByTestId('plan-invalid');
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes[0]!.textContent).toMatch(/Planul conține probleme geometrice/);
    const svgs = screen.getAllByTestId('plan-svg');
    expect(svgs[svgs.length - 1]!.getAttribute('data-valid')).toBe('false');
  });
});
