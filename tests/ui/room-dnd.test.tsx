// @vitest-environment jsdom
// Etapa 7a: camere noi prin drag & drop din paletă (cu lipire și validare) și mutarea unei camere întregi.
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import {
  analyzeGeometry,
  exportProject,
  rectInteriorSize,
  roomEdges,
  roomsUsingWall,
  type ProjectDocument,
  type SceneDescription,
} from '@/domain';
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
describe('planul 2D: camere noi din paletă și mutarea camerelor', () => {
  const svg = () => screen.getByTestId('plan-svg');
  const FAR = { x: 14000, y: 2000 }; // în afara camerei din proiectul de referință
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
  const CHIP = { clientX: 5, clientY: 5, button: 0, pointerId: 1 };
  const key = (k: string, init: KeyboardEventInit = {}) =>
    act(() => {
      fireEvent.keyDown(window, { key: k, ...init });
    });
  const roomCount = (s: ProjectSession) => Object.keys(docOf(s).rooms).length;
  const newest = (s: ProjectSession, before: string[]) =>
    Object.values(docOf(s).rooms).find((r) => !before.includes(r.id))!;

  async function open() {
    const e = uiEnv();
    const { session } = await openEditor(e, studioProject());
    // jsdom nu are layout: planul primește o suprafață, ca „pointerul e pe plan” să aibă sens
    svg().getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 4000, bottom: 4000, width: 4000, height: 4000 }) as DOMRect;
    return { session, before: Object.keys(docOf(session).rooms) };
  }
  const moveOnPlan = (x: number, y: number) =>
    act(() => {
      fireEvent.pointerMove(window, ptr(x, y));
    });
  const up = (x: number, y: number) =>
    act(() => {
      fireEvent.pointerUp(window, ptr(x, y));
    });
  /** Clic simplu pe paletă (fără mișcare): camera rămâne armată. */
  const arm = (testId: string) => {
    fireEvent.pointerDown(screen.getByTestId(testId), CHIP);
    act(() => {
      fireEvent.pointerUp(window, CHIP);
    });
  };

  it('trage „Baie” din paletă pe plan: fantoma urmărește cursorul (verde), la eliberare se creează camera cu tipul, numele și dimensiunile interioare; UN pas de undo', async () => {
    const { session, before } = await open();
    fireEvent.pointerDown(screen.getByTestId('room-preset-bathroom'), CHIP);
    expect(screen.queryByTestId('room-ghost')).toBeNull(); // încă nu e pe plan
    moveOnPlan(FAR.x, FAR.y);
    expect(screen.getByTestId('room-ghost').getAttribute('data-valid')).toBe('true');
    expect(screen.getByTestId('room-ghost-label').textContent).toContain('Baie');
    expect(roomCount(session)).toBe(before.length); // nimic scris în timpul tragerii
    up(FAR.x, FAR.y);
    expect(roomCount(session)).toBe(before.length + 1);
    const room = newest(session, before);
    expect(room.type).toBe('bathroom');
    expect(room.name).toBe('Baie');
    expect(screen.getByTestId(`room-area-${room.id}`).textContent).toContain('5 m²'); // 2000 × 2500 interior
    expect(session.getState().undoLabel).toBe('Adaugă cameră');
    expect(screen.getByTestId(`room-${room.id}`).getAttribute('data-selected')).toBe('true');
    expect(screen.queryByTestId('room-ghost')).toBeNull();
    session.undo();
    expect(roomCount(session)).toBe(before.length);
  });

  it('eliberarea în afara planului anulează; peste camera existentă fantoma e roșie și nu se creează nimic', async () => {
    const { session, before } = await open();
    fireEvent.pointerDown(screen.getByTestId('room-preset-living'), CHIP);
    moveOnPlan(FAR.x, FAR.y);
    act(() => {
      fireEvent.pointerUp(window, { clientX: 99999, clientY: 99999, button: 0, pointerId: 1 });
    });
    expect(roomCount(session)).toBe(before.length);
    expect(screen.queryByTestId('room-ghost')).toBeNull();

    // peste camera din proiect: nu încape
    const existing = docOf(session).rooms[before[0]!]!;
    const node = docOf(session).nodes[existing.nodeLoop[0]!]!;
    fireEvent.pointerDown(screen.getByTestId('room-preset-living'), CHIP);
    moveOnPlan(node.x + 1500, node.y + 1500);
    expect(screen.getByTestId('room-ghost').getAttribute('data-valid')).toBe('false');
    up(node.x + 1500, node.y + 1500);
    expect(roomCount(session)).toBe(before.length);
    expect(screen.getByTestId('plan-notice').textContent).toContain('nu încape');
  });

  it('clic pe paletă armează camera: fantoma urmărește cursorul, un clic pe plan o plasează; Esc anulează; a doua cameră de același tip primește număr', async () => {
    const { session, before } = await open();
    const chip = screen.getByTestId('room-preset-bedroom');
    arm('room-preset-bedroom');
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    moveOnPlan(FAR.x, FAR.y);
    expect(screen.getByTestId('room-ghost')).toBeTruthy();
    await key('Escape');
    expect(screen.queryByTestId('room-ghost')).toBeNull();
    expect(chip.getAttribute('aria-pressed')).toBe('false');

    arm('room-preset-bedroom');
    moveOnPlan(FAR.x, FAR.y);
    fireEvent.pointerDown(svg(), ptr(FAR.x, FAR.y));
    expect(roomCount(session)).toBe(before.length + 1);
    expect(newest(session, before).name).toBe('Dormitor 2'); // proiectul are deja un dormitor

    const mid = Object.keys(docOf(session).rooms);
    arm('room-preset-bedroom');
    moveOnPlan(FAR.x, FAR.y + 9000);
    fireEvent.pointerDown(svg(), ptr(FAR.x, FAR.y + 9000));
    expect(newest(session, mid).name).toBe('Dormitor 3');
  });

  it('lipire: o cameră trasă lângă una existentă împarte peretele cu ea (nodurile și peretele comun se refolosesc), fără suprapunere', async () => {
    const { session, before } = await open();
    fireEvent.pointerDown(screen.getByTestId('room-preset-kitchen'), CHIP);
    moveOnPlan(FAR.x, FAR.y);
    up(FAR.x, FAR.y);
    const first = newest(session, before);
    const d1 = docOf(session);
    const t = d1.settings.defaultWallThicknessMm;
    const axisRight = Math.max(...first.nodeLoop.map((n) => d1.nodes[n]!.x));
    // a doua (Baie, 2000 mm lățime): axa ei vestică cade la ~60 mm de axa estică a primei
    fireEvent.pointerDown(screen.getByTestId('room-preset-bathroom'), CHIP);
    const cx = axisRight + 60 + t / 2 + 1000;
    const cy = d1.nodes[first.nodeLoop[0]!]!.y + 1500;
    moveOnPlan(cx, cy);
    expect(screen.getByTestId('room-ghost').getAttribute('data-valid')).toBe('true');
    up(cx, cy);
    expect(roomCount(session)).toBe(before.length + 2);
    const second = newest(session, [...before, first.id]);
    const d2 = docOf(session);
    const minX = Math.min(...second.nodeLoop.map((n) => d2.nodes[n]!.x));
    expect(minX).toBe(axisRight); // aceeași axă = același perete
    const shared = second.nodeLoop.filter((n) => d2.rooms[first.id]!.nodeLoop.includes(n));
    expect(shared.length).toBeGreaterThanOrEqual(1); // noduri comune
    // există un perete folosit de ambele camere
    expect(Object.values(d2.walls).some((w) => roomsUsingWall(d2, w.id).length === 2)).toBe(true);
  });

  it('Enter pe paletă (fără mouse) plasează camera într-un loc liber: centrul e ocupat, deci se alipește în dreapta construcției, validă', async () => {
    const { session, before } = await open();
    fireEvent.keyDown(screen.getByTestId('room-preset-hall'), { key: 'Enter' });
    expect(roomCount(session)).toBe(before.length + 1);
    const room = newest(session, before);
    const d = docOf(session);
    const t = d.settings.defaultWallThicknessMm;
    const oldMaxX = Math.max(
      ...Object.values(d.rooms)
        .filter((r) => r.id !== room.id)
        .flatMap((r) => r.nodeLoop.map((n) => d.nodes[n]!.x)),
    );
    const minX = Math.min(...room.nodeLoop.map((n) => d.nodes[n]!.x));
    expect(minX).toBeGreaterThan(oldMaxX);
    expect(minX - t / 2).toBeLessThanOrEqual(oldMaxX + t * 3);
  });

  it('mutarea unei camere: prima apăsare doar o selectează (tragerea deplasează planul); a doua tragere o mută întreagă, un singur commit, undo o readuce', async () => {
    const { session, before } = await open();
    fireEvent.pointerDown(screen.getByTestId('room-preset-office'), CHIP);
    moveOnPlan(FAR.x, FAR.y);
    up(FAR.x, FAR.y);
    const room = newest(session, before);
    // deselectează, apoi o selectează cu un clic (tragerea unei camere neselectate = pan)
    fireEvent.pointerDown(svg(), ptr(-5000, -5000));
    fireEvent.pointerUp(svg(), ptr(-5000, -5000));
    const poly = () => screen.getByTestId(`room-${room.id}`).querySelector('polygon')!;
    const c = { x: FAR.x + 1500, y: FAR.y + 1250 };
    fireEvent.pointerDown(poly(), ptr(c.x, c.y));
    fireEvent.pointerUp(svg(), ptr(c.x, c.y));
    const start = docOf(session).nodes[room.nodeLoop[0]!]!;
    const apply = vi.spyOn(session, 'apply');
    fireEvent.pointerDown(poly(), ptr(c.x, c.y));
    for (let i = 1; i <= 5; i++) fireEvent.pointerMove(svg(), ptr(c.x + i * 200, c.y + i * 100));
    expect(apply).not.toHaveBeenCalled();
    expect(docOf(session).nodes[room.nodeLoop[0]!]).toEqual(start); // documentul neatins în timpul gestului
    fireEvent.pointerUp(svg(), ptr(c.x + 1000, c.y + 500));
    expect(apply).toHaveBeenCalledTimes(1);
    const moved = docOf(session).nodes[room.nodeLoop[0]!]!;
    const grid = docOf(session).settings.gridMm;
    expect(moved.x - start.x).toBeGreaterThan(800);
    expect((moved.x - start.x) % grid).toBe(0);
    expect(session.getState().undoLabel).toBe('Mută camera');
    session.undo();
    expect(docOf(session).nodes[room.nodeLoop[0]!]).toEqual(start);
  });

  it('rotirea unei camere: R și butoanele din panou rotesc cu 90° (un pas de undo); R în timpul plasării inversează fantoma', async () => {
    const { session, before } = await open();
    // camera nouă, singură (departe de cea din proiect)
    fireEvent.pointerDown(screen.getByTestId('room-preset-office'), CHIP);
    moveOnPlan(FAR.x, FAR.y);
    up(FAR.x, FAR.y);
    const room = newest(session, before);
    const dims = () => {
      const r = rectInteriorSize(docOf(session), room.id);
      if (!r.ok) throw new Error(r.error);
      return r.value;
    };
    expect(dims()).toEqual({ widthMm: 3000, depthMm: 2500 });
    await key('r');
    expect(dims()).toEqual({ widthMm: 2500, depthMm: 3000 });
    expect(session.getState().undoLabel).toBe('Rotește camera');
    await key('R', { shiftKey: true });
    expect(dims()).toEqual({ widthMm: 3000, depthMm: 2500 });
    fireEvent.click(screen.getByTestId('room-rotate-cw'));
    expect(dims()).toEqual({ widthMm: 2500, depthMm: 3000 });
    fireEvent.click(screen.getByTestId('room-rotate-ccw'));
    expect(dims()).toEqual({ widthMm: 3000, depthMm: 2500 });
    session.undo();
    expect(dims()).toEqual({ widthMm: 2500, depthMm: 3000 });

    // în timpul plasării
    fireEvent.pointerDown(screen.getByTestId('room-preset-hall'), CHIP);
    moveOnPlan(FAR.x, FAR.y + 9000);
    expect(screen.getByTestId('room-ghost-label').textContent).toContain('300 cm × 150 cm');
    await key('r');
    expect(screen.getByTestId('room-ghost-label').textContent).toContain('150 cm × 300 cm');
    up(FAR.x, FAR.y + 9000);
    const hall = newest(session, [...before, room.id]);
    const h = rectInteriorSize(docOf(session), hall.id);
    expect(h.ok && h.value).toEqual({ widthMm: 1500, depthMm: 3000 }); // creată rotită
  });

  it('o cameră cu perete comun nu se rotește (mesaj), iar documentul rămâne neschimbat', async () => {
    const { session, before } = await open();
    fireEvent.pointerDown(screen.getByTestId('room-preset-kitchen'), CHIP);
    moveOnPlan(FAR.x, FAR.y);
    up(FAR.x, FAR.y);
    const first = newest(session, before);
    const d1 = docOf(session);
    const axisRight = Math.max(...first.nodeLoop.map((n) => d1.nodes[n]!.x));
    const cx = axisRight + 60 + 50 + 1000;
    const cy = d1.nodes[first.nodeLoop[0]!]!.y + 1500;
    fireEvent.pointerDown(screen.getByTestId('room-preset-bathroom'), CHIP);
    moveOnPlan(cx, cy);
    up(cx, cy);
    fireEvent.click(screen.getByTestId(`room-list-item-${first.id}`));
    const snapshot = JSON.stringify(docOf(session).nodes);
    fireEvent.click(screen.getByTestId('room-rotate-cw'));
    expect(JSON.stringify(docOf(session).nodes)).toBe(snapshot);
    expect(screen.getByTestId('room-rotate-error').textContent).toMatch(/comune|împarte/);
  });

  it('cameră în L din paletă: fantoma poligonală (verde) urmărește cursorul, la eliberare se creează un L cu 6 colțuri și aria casetei fără colțul tăiat; un pas de undo', async () => {
    const { session, before } = await open();
    fireEvent.pointerDown(screen.getByTestId('room-preset-living-l'), CHIP);
    moveOnPlan(FAR.x, FAR.y);
    const ghost = screen.getByTestId('room-ghost');
    expect(ghost.getAttribute('data-valid')).toBe('true');
    expect(screen.getByTestId('room-ghost-label').textContent).toContain('Living în L');
    expect(screen.getByTestId('room-ghost-label').textContent).toContain('600 cm × 500 cm');
    // fantoma e un poligon cu 6 colțuri (nu un dreptunghi)
    const interior = ghost.querySelectorAll('polygon')[1]!;
    expect(interior.getAttribute('points')!.trim().split(/\s+/)).toHaveLength(6);
    up(FAR.x, FAR.y);
    const room = newest(session, before);
    expect(room.nodeLoop).toHaveLength(6);
    expect(room.type).toBe('living');
    expect(room.name).toBe('Living în L 2'); // proiectul de referință are deja un living
    expect(analyzeGeometry(docOf(session)).rooms.get(room.id)!.areaMm2).toBe(
      6000 * 5000 - 2500 * 2000,
    );
    expect(session.getState().undoLabel).toBe('Adaugă cameră');
    act(() => {
      session.undo();
    });
    expect(roomCount(session)).toBe(before.length);
  });

  it('R în timpul plasării rotește L-ul în 4 orientări (dimensiunile casetei se inversează la fiecare pas, forma se schimbă)', async () => {
    await open();
    fireEvent.pointerDown(screen.getByTestId('room-preset-living-l'), CHIP);
    moveOnPlan(FAR.x, FAR.y);
    const shape = () =>
      screen.getByTestId('room-ghost').querySelectorAll('polygon')[1]!.getAttribute('points')!;
    const label = () => screen.getByTestId('room-ghost-label').textContent!;
    const seen = new Set<string>([shape()]);
    expect(label()).toContain('600 cm × 500 cm');
    await key('r');
    expect(label()).toContain('500 cm × 600 cm');
    seen.add(shape());
    await key('r');
    expect(label()).toContain('600 cm × 500 cm');
    seen.add(shape());
    await key('r');
    expect(label()).toContain('500 cm × 600 cm');
    seen.add(shape());
    expect(seen.size).toBe(4); // patru orientări distincte
    await key('r');
    expect(shape()).toBe([...seen][0]); // al cincilea clic readuce prima orientare
  });

  it('mânerele unei camere în L: câte unul pe fiecare latură; tragerea unuia schimbă aria (previzualizare fără scriere, un singur commit, undo)', async () => {
    const { session, before } = await open();
    fireEvent.pointerDown(screen.getByTestId('room-preset-living-l'), CHIP);
    moveOnPlan(FAR.x, FAR.y);
    up(FAR.x, FAR.y);
    const room = newest(session, before);
    const areaOf = () => analyzeGeometry(docOf(session)).rooms.get(room.id)!.areaMm2;
    const handles = () =>
      Array.from(document.querySelectorAll(`[data-testid^="room-edge-handle-${room.id}-"]`));
    expect(handles()).toHaveLength(6);
    expect(screen.queryByTestId(`room-handle-${room.id}-e`)).toBeNull(); // nu mânerele dreptunghiului

    const edges = roomEdges(docOf(session), room.id);
    if (!edges.ok) throw new Error(edges.error);
    const west = edges.value.find((e) => e.normal.x === -1)!;
    const start = areaOf();
    const apply = vi.spyOn(session, 'apply');
    const el = screen.getByTestId(`room-edge-handle-${room.id}-${west.index}`);
    const x = Number(el.getAttribute('x')) + Number(el.getAttribute('width')) / 2;
    const y = Number(el.getAttribute('y')) + Number(el.getAttribute('height')) / 2;
    fireEvent.pointerDown(el, ptr(x, y));
    for (let k = 1; k <= 4; k++) fireEvent.pointerMove(svg(), ptr(x - 250 * k, y)); // spre vest = spre exterior
    expect(apply).not.toHaveBeenCalled(); // doar previzualizare
    expect(areaOf()).toBe(start);
    fireEvent.pointerUp(svg(), ptr(x - 1000, y));
    expect(apply).toHaveBeenCalledTimes(1);
    expect(areaOf()).toBeGreaterThan(start + 800 * 5000 - 1); // ~ +1000 mm × 5000 mm (cu snap la grilă)
    expect(session.getState().undoLabel).toBe('Mută latura camerei');
    act(() => {
      session.undo();
    });
    expect(areaOf()).toBe(start);
  });

  it('un L se poate așeza lângă o cameră existentă împărțind peretele; a doua pe același loc e refuzată (fantomă roșie)', async () => {
    const { session, before } = await open();
    fireEvent.pointerDown(screen.getByTestId('room-preset-other-l'), CHIP);
    moveOnPlan(FAR.x, FAR.y);
    up(FAR.x, FAR.y);
    const first = newest(session, before);
    expect(first.nodeLoop).toHaveLength(6);
    fireEvent.pointerDown(screen.getByTestId('room-preset-other-l'), CHIP);
    moveOnPlan(FAR.x, FAR.y); // exact peste primul
    expect(screen.getByTestId('room-ghost').getAttribute('data-valid')).toBe('false');
    up(FAR.x, FAR.y);
    expect(roomCount(session)).toBe(before.length + 1);
  });
});
