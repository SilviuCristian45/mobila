// @vitest-environment jsdom
// F-12 (audit): accesibilitate de tastatură și de cititor de ecran în editorul 2D, plus verificări automate de bază.
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { exportProject, type SceneDescription } from '@/domain';
import { EditorClient } from '@/app/editor/EditorClient';
import { Dashboard } from '@/features/projects/Dashboard';
import { planKeyAllowed } from '@/features/plan-editor/keyboard';
import { a11yIssues } from '../helpers/a11y';
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

describe('accesibilitate (F-12): reguli de tastatură', () => {
  const btn = () => document.createElement('button');
  const div = () => document.createElement('div');
  it('scurtăturile cu o tastă și săgețile nu acționează în spatele unui control focalizat', () => {
    for (const k of ['w', 'V', 'r', '0', '+', '-', 'ArrowLeft', 'ArrowDown'])
      expect(planKeyAllowed(k, btn(), true), k).toBe(false);
    const tab = div();
    tab.setAttribute('role', 'tab');
    expect(planKeyAllowed('ArrowRight', tab, true)).toBe(false);
    const input = document.createElement('input');
    expect(planKeyAllowed('w', input, true)).toBe(false);
    // în interiorul unui buton (ex. un span din el) la fel
    const b = btn();
    const span = document.createElement('span');
    b.appendChild(span);
    expect(planKeyAllowed('ArrowUp', span, true)).toBe(false);
  });

  it('în timpul plasării, R rotește camera oricare ar fi focusul (dar nu cu scurtăturile oprite); restul tastelor rămân supuse regulilor', () => {
    expect(planKeyAllowed('r', btn(), true, { placing: true })).toBe(true);
    expect(planKeyAllowed('R', btn(), true, { placing: true })).toBe(true);
    expect(planKeyAllowed('r', btn(), false, { placing: true })).toBe(false);
    expect(planKeyAllowed('w', btn(), true, { placing: true })).toBe(false);
    expect(planKeyAllowed('r', btn(), true, { placing: false })).toBe(false);
  });

  it('pe plan (sau fără focus) acționează; cu scurtăturile oprite, tastele imprimabile nu, dar săgețile, Delete și Escape da', () => {
    const plan = div();
    for (const k of ['w', 'v', 'r', '0', '+', '-', 'ArrowLeft', 'Delete', 'Escape'])
      expect(planKeyAllowed(k, plan, true), k).toBe(true);
    expect(planKeyAllowed('w', null, true)).toBe(true);
    for (const k of ['w', 'W', 'v', 'r', 'R', '0', '+', '=', '-', '_'])
      expect(planKeyAllowed(k, plan, false), k).toBe(false);
    for (const k of ['ArrowLeft', 'ArrowUp', 'Delete', 'Backspace', 'Escape'])
      expect(planKeyAllowed(k, plan, false), k).toBe(true);
  });
});

describe('accesibilitate (F-12): ecranele principale nu au defecte de bază', () => {
  async function open(e: UiEnv, doc = studioProject()) {
    const r = await e.tab.manager.importFile(exportProject(doc, META));
    if (!r.ok) throw new Error('seed');
    query = `p=${r.value.id}`;
    renderWithRuntime(<EditorClient />, e.runtimeFor(e.tab));
    await screen.findByTestId('plan-editor');
  }

  it('editorul 2D (cameră selectată), catalogul și materialele deschise', async () => {
    const e = uiEnv();
    await open(e);
    const first = Object.keys(docRooms())[0]!;
    fireEvent.click(await screen.findByTestId(`room-list-item-${first}`));
    expect(a11yIssues(document.body, 'editor 2D')).toEqual([]);
    fireEvent.click(screen.getByTestId('catalog-toggle'));
    await screen.findByTestId('catalog-panel');
    expect(a11yIssues(document.body, 'editor + catalog')).toEqual([]);
    fireEvent.click(screen.getByTestId('materials-toggle'));
    await screen.findByTestId('materials-panel');
    expect(a11yIssues(document.body, 'editor + materiale')).toEqual([]);
  });

  it('bugetul și vizualizarea 3D', async () => {
    const e = uiEnv();
    await open(e);
    fireEvent.click(screen.getByTestId('mode-budget'));
    await screen.findByTestId('budget-panel');
    expect(a11yIssues(document.body, 'buget')).toEqual([]);
    fireEvent.click(screen.getByTestId('mode-3d'));
    await screen.findByTestId('viewer-3d');
    expect(a11yIssues(document.body, '3D')).toEqual([]);
  });

  const docRooms = () => studioProject().rooms;
});

describe('accesibilitate (F-12): comportamentul editorului 2D', () => {
  async function open(e: UiEnv) {
    const r = await e.tab.manager.importFile(exportProject(studioProject(), META));
    if (!r.ok) throw new Error('seed');
    query = `p=${r.value.id}`;
    renderWithRuntime(<EditorClient />, e.runtimeFor(e.tab));
    await screen.findByTestId('plan-editor');
    return e.tab.manager.openSessions().get(r.value.id) as ProjectSession;
  }
  const key = (k: string, init: KeyboardEventInit = {}, target: Element | Window = window) =>
    act(() => {
      fireEvent.keyDown(target, { key: k, bubbles: true, ...init });
    });

  it('zona planului se poate focaliza și e descrisă de textul-ajutor; comutatorul de scurtături e vizibil', async () => {
    const e = uiEnv();
    await open(e);
    const box = screen.getByTestId('plan-box');
    expect(box.getAttribute('tabindex')).toBe('0');
    expect(box.getAttribute('aria-label')).toBe('Zona planului');
    const describedBy = box.getAttribute('aria-describedby')!;
    expect(document.getElementById(describedBy)).toBe(screen.getByTestId('plan-hint'));
    expect((screen.getByTestId('shortcuts-toggle') as HTMLInputElement).checked).toBe(true);
  });

  it('„Scurtături de tastă” oprit: W nu mai activează unealta perete, iar alegerea se păstrează în browser', async () => {
    const e = uiEnv();
    await open(e);
    const tool = () => screen.getByTestId('tool-wall').getAttribute('aria-pressed');
    await key('w');
    expect(tool()).toBe('true');
    await key('v');
    expect(tool()).toBe('false');
    fireEvent.click(screen.getByTestId('shortcuts-toggle'));
    expect(localStorage.getItem('rc:shortcuts')).toBe('off');
    await key('w');
    expect(tool()).toBe('false'); // scurtătura e oprită
    fireEvent.click(screen.getByTestId('tool-wall')); // dar unealta rămâne accesibilă din buton
    expect(tool()).toBe('true');
    fireEvent.click(screen.getByTestId('shortcuts-toggle'));
    expect(localStorage.getItem('rc:shortcuts')).toBe('on');
  });

  it('săgețile nu deplasează planul când focusul e pe un buton (pe un tab ele schimbă modul, vezi testul tab-urilor)', async () => {
    const e = uiEnv();
    await open(e);
    const pan = () => screen.getByTestId('plan-svg').getAttribute('data-pan-x');
    const before = pan();
    await key('ArrowRight', {}, screen.getByTestId('tool-wall')); // focus pe un buton
    expect(pan()).toBe(before);
    await key('ArrowRight', {}, screen.getByTestId('plan-box')); // pe plan: se deplasează
    expect(pan()).not.toBe(before);
  });

  it('regiunea aria-live anunță selecția (cameră cu arie, obiect, nimic) la fiecare schimbare', async () => {
    const e = uiEnv();
    await open(e);
    const live = () => screen.getByTestId('selection-announcer');
    expect(live().getAttribute('aria-live')).toBe('polite');
    expect(live().textContent).toBe('Nimic selectat.');
    const roomId = Object.keys(studioProject().rooms)[0]!;
    fireEvent.click(screen.getByTestId(`room-list-item-${roomId}`));
    expect(live().textContent).toMatch(/^Cameră selectată: .+, .+ m²\.$/);
    fireEvent.pointerDown(screen.getByTestId('object-oSofa'), {
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
    expect(live().textContent).toMatch(/^Obiect selectat: /);
    await key('a', { ctrlKey: true });
    expect(live().textContent).toBe('2 obiecte selectate.');
    await key('Escape');
    expect(live().textContent).toBe('Nimic selectat.');
  });

  it('tab-urile de mod: roving tabindex și navigare cu săgeți, Home, End (model ARIA)', async () => {
    const e = uiEnv();
    await open(e);
    const tabs = () => screen.getAllByRole('tab');
    expect(tabs().map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    const list = screen.getByRole('tablist');
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    await screen.findByTestId('viewer-3d');
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(tabs().map((t) => t.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
    expect(document.activeElement).toBe(tabs()[1]);
    fireEvent.keyDown(list, { key: 'End' });
    await screen.findByTestId('budget-panel');
    expect(document.activeElement).toBe(tabs()[2]);
    fireEvent.keyDown(list, { key: 'ArrowRight' }); // din ultimul, revine la primul
    await screen.findByTestId('plan-editor');
    expect(tabs()[0]!.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    await screen.findByTestId('budget-panel');
    fireEvent.keyDown(list, { key: 'Home' });
    await screen.findByTestId('plan-editor');
  });

  it('în timpul plasării unei camere există și un buton „Rotește camera”, pentru cine nu folosește tasta R', async () => {
    const e = uiEnv();
    await open(e);
    expect(screen.queryByTestId('placing-rotate')).toBeNull();
    fireEvent.pointerDown(screen.getByTestId('room-preset-living-l'), {
      clientX: 5,
      clientY: 5,
      button: 0,
      pointerId: 1,
    });
    act(() => {
      fireEvent.pointerUp(window, { clientX: 5, clientY: 5, button: 0, pointerId: 1 });
    });
    const rotate = screen.getByTestId('placing-rotate');
    fireEvent.click(rotate);
    fireEvent.click(rotate);
    expect(screen.getByTestId('room-preset-living-l').getAttribute('aria-pressed')).toBe('true');
    await key('Escape');
    expect(screen.queryByTestId('placing-rotate')).toBeNull();
  });
});

describe('accesibilitate (F-12): verificatorul însuși și tabloul de proiecte', () => {
  it('verificatorul prinde defectele cunoscute (control fără nume, câmp fără etichetă, id duplicat, tablist fără selecție, referință ARIA moartă)', () => {
    const host = document.createElement('div');
    host.innerHTML = `
      <button data-testid="gol"></button>
      <input data-testid="fara-eticheta" type="text" />
      <label>Cu etichetă <input type="text" /></label>
      <div id="x"></div><div id="x"></div>
      <div role="tablist"><button role="tab" aria-selected="false">A</button><button role="tab" aria-selected="false">B</button></div>
      <div aria-describedby="nu-exista"></div>
      <svg role="img"></svg>
      <img src="a.png" />
      <button tabindex="3">Ok</button>`;
    document.body.appendChild(host);
    const found = a11yIssues(host, 'test').join(' | ');
    host.remove();
    expect(found).toMatch(/control fără nume accesibil: button\[gol\]/);
    expect(found).toMatch(/câmp fără etichetă: input\[fara-eticheta\]/);
    expect(found).not.toMatch(/Cu etichetă/);
    expect(found).toMatch(/id duplicat „x”/);
    expect(found).toMatch(/tablist cu 0 tab-uri selectate/);
    expect(found).toMatch(/aria-describedby="nu-exista"/);
    expect(found).toMatch(/svg role=img fără nume/);
    expect(found).toMatch(/imagine fără alt/);
    expect(found).toMatch(/tabindex pozitiv/);
  });

  it('tabloul de proiecte (listă, proiect nou, redenumire, ștergere, mesaje de import) nu are defecte de bază', async () => {
    const e = uiEnv();
    for (const n of ['Casa mea', 'Birou']) await e.tab.manager.create(n);
    renderWithRuntime(<Dashboard />, e.runtimeFor(e.tab));
    await screen.findAllByTestId('project-card');
    expect(a11yIssues(document.body, 'tablou')).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: '+ Proiect nou' }));
    await screen.findByRole('dialog', { name: 'Proiect nou' });
    expect(a11yIssues(document.body, 'dialog proiect nou')).toEqual([]);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    // un import respins afișează mesaje: și ele trebuie să fie accesibile
    const bad = new File(['nu e json'], 'rau.json', { type: 'application/json' });
    fireEvent.change(screen.getByTestId('import-input'), { target: { files: [bad] } });
    await screen.findByTestId('import-notice-error');
    expect(a11yIssues(document.body, 'tablou + mesaje de import')).toEqual([]);
  });
});
