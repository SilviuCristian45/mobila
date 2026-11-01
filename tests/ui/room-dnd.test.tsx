// @vitest-environment jsdom
// Etapa 7a: camere noi prin drag & drop din paletă (cu lipire și validare) și mutarea unei camere întregi.
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

  it('lipire: o cameră trasă lângă una existentă se alipește de fața ei exterioară (fără goluri și fără suprapunere)', async () => {
    const { session, before } = await open();
    fireEvent.pointerDown(screen.getByTestId('room-preset-kitchen'), CHIP);
    moveOnPlan(FAR.x, FAR.y);
    up(FAR.x, FAR.y);
    const first = newest(session, before);
    const d1 = docOf(session);
    const t = d1.settings.defaultWallThicknessMm;
    const outerRight = Math.max(...first.nodeLoop.map((n) => d1.nodes[n]!.x)) + t / 2;
    // a doua: stânga ei exterioară cade la ~60 mm de dreapta exterioară a primei
    fireEvent.pointerDown(screen.getByTestId('room-preset-bathroom'), CHIP);
    const cx = outerRight + 60 + 1000 + t; // centrul camerei de 2000 mm lățime
    const cy = d1.nodes[first.nodeLoop[0]!]!.y + 1500;
    moveOnPlan(cx, cy);
    up(cx, cy);
    expect(roomCount(session)).toBe(before.length + 2);
    const second = newest(session, [...before, first.id]);
    const d2 = docOf(session);
    const minX = Math.min(...second.nodeLoop.map((n) => d2.nodes[n]!.x)) - t / 2;
    expect(minX).toBe(outerRight); // alipită exact
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
});
