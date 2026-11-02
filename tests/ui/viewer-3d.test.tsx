// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportProject, type ProjectDocument, type SceneDescription } from '@/domain';
import { EditorClient } from '@/app/editor/EditorClient';
import { Viewer3D } from '@/features/viewer-3d/Viewer3D';
import { mk } from '../reference/builders';
import { renderWithRuntime, uiEnv } from '../helpers/ui';
import { studioProject } from '../reference/projects';

let query = '';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(query) }));

// jsdom nu are WebGL: canvas-ul real e înlocuit cu un stub care expune ce primește.
const canvas = vi.hoisted(() => ({
  scenes: [] as Array<{ hash: string; nonce: number }>,
  boom: false,
  /** Ultimele proprietăți primite de canvas (vedere, tăiere, centrare, apeluri de context). */
  last: null as null | Record<string, unknown>,
}));
vi.mock('@/features/viewer-3d/ViewerCanvas', () => ({
  default: function CanvasStub(props: {
    scene: SceneDescription;
    resetNonce: number;
    onStats?: (s: { walls: number; floors: number }) => void;
  }) {
    const { scene, resetNonce, onStats } = props;
    canvas.last = props as unknown as Record<string, unknown>;
    useEffect(() => {
      canvas.scenes.push({ hash: scene.hash, nonce: resetNonce });
      onStats?.({ walls: scene.prisms.length, floors: scene.floors.length });
    }, [scene, resetNonce, onStats]);
    if (canvas.boom) throw new Error('Context WebGL pierdut');
    return <div data-testid="canvas-stub" data-hash={scene.hash} data-nonce={resetNonce} />;
  },
}));
const webgl = vi.hoisted(() => ({ ok: true }));
vi.mock('@/features/viewer-3d/webgl', () => ({ webglAvailable: () => webgl.ok }));

beforeEach(() => {
  canvas.scenes.length = 0;
  canvas.boom = false;
  canvas.last = null;
  webgl.ok = true;
  query = '';
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const moved = (doc: ProjectDocument): ProjectDocument => {
  const d = JSON.parse(JSON.stringify(doc)) as ProjectDocument;
  d.nodes.n6!.x = 7100;
  return d;
};

describe('Viewer3D', () => {
  it('desenează scena proiectului (12 prisme pentru studio) și o actualizează la schimbarea documentului', async () => {
    const doc = studioProject();
    const { rerender } = render(<Viewer3D doc={doc} />);
    const stub = await screen.findByTestId('canvas-stub');
    const first = stub.getAttribute('data-hash');
    await waitFor(() =>
      expect(screen.getByTestId('viewer3d-box').getAttribute('data-walls')).toBe('12'),
    );

    rerender(<Viewer3D doc={moved(doc)} />);
    await waitFor(() =>
      expect(screen.getByTestId('canvas-stub').getAttribute('data-hash')).not.toBe(first),
    );
    // același document (aceeași identitate) → aceeași scenă memoizată, fără recalculare
    const n = canvas.scenes.length;
    rerender(<Viewer3D doc={doc} />);
    await waitFor(() =>
      expect(screen.getByTestId('canvas-stub').getAttribute('data-hash')).toBe(first),
    );
    expect(canvas.scenes.length).toBeGreaterThan(n);
  });

  it('„Resetează vederea” transmite un nou semnal de încadrare', async () => {
    render(<Viewer3D doc={studioProject()} />);
    await screen.findByTestId('canvas-stub');
    expect(screen.getByTestId('canvas-stub').getAttribute('data-nonce')).toBe('0');
    fireEvent.click(screen.getByTestId('viewer3d-reset'));
    await waitFor(() =>
      expect(screen.getByTestId('canvas-stub').getAttribute('data-nonce')).toBe('1'),
    );
  });

  it('document invalid geometric → mesaj cu motivele, fără canvas', () => {
    const bad = mk(
      [
        ['a', 0, 0],
        ['b', 4000, 0],
        ['c', 4000, 3000],
        ['d', 0, 3000],
      ],
      [
        ['w1', 'a', 'b'],
        ['w2', 'b', 'c'],
        ['w3', 'c', 'd'],
        ['w4', 'd', 'a'],
        ['x', 'a', 'a'],
      ],
      { r: ['a', 'b', 'c', 'd'] },
    );
    render(<Viewer3D doc={bad} />);
    expect(screen.getByTestId('viewer3d-error')).toBeTruthy();
    expect(screen.getByTestId('viewer3d-issues').children.length).toBeGreaterThan(0);
    expect(screen.queryByTestId('canvas-stub')).toBeNull();
    expect((screen.getByTestId('viewer3d-reset') as HTMLButtonElement).disabled).toBe(true);
  });

  it('proiect gol → explicație, nu un canvas gol fără mesaj', async () => {
    render(<Viewer3D doc={mk([], [], {})} />);
    expect((await screen.findByTestId('viewer3d-empty')).textContent).toContain(
      'nu are încă pereți',
    );
    expect((screen.getByTestId('viewer3d-reset') as HTMLButtonElement).disabled).toBe(true);
  });

  it('fără WebGL → avertisment controlat; canvas-ul nu se încarcă', () => {
    webgl.ok = false;
    render(<Viewer3D doc={studioProject()} />);
    expect(screen.getByTestId('viewer3d-nowebgl')).toBeTruthy();
    expect(screen.queryByTestId('canvas-stub')).toBeNull();
  });

  it('eroare de randare în canvas → mesaj și „Încearcă din nou”; aplicația rămâne în picioare', async () => {
    canvas.boom = true;
    render(<Viewer3D doc={studioProject()} />);
    const err = await screen.findByTestId('viewer3d-render-error');
    // mesajul excepției (tehnic) nu ajunge în interfață; utilizatorul primește o explicație în română
    expect(err.textContent).not.toContain('Context WebGL pierdut');
    expect(err.textContent).toMatch(/Imaginea 3D nu a putut fi afișată/);
    expect(err.textContent).toMatch(/Planul 2D și proiectul nu sunt afectate/);
    canvas.boom = false;
    fireEvent.click(screen.getByRole('button', { name: 'Încearcă din nou' }));
    expect(await screen.findByTestId('canvas-stub')).toBeTruthy();
  });
});

describe('navigare 2D ↔ 3D în editor (același proiect activ)', () => {
  it('comută între plan și 3D; documentul și modificările din 2D se văd în 3D', async () => {
    const e = uiEnv();
    const r = await e.tab.manager.importFile(
      exportProject(studioProject(), {
        exportedAt: '2026-10-27T12:00:00.000Z',
        appVersion: 'test',
      }),
    );
    if (!r.ok) throw new Error('seed');
    query = `p=${r.value.id}`;
    renderWithRuntime(<EditorClient />, e.runtimeFor(e.tab));
    await screen.findByTestId('plan-editor');
    expect(screen.getByTestId('mode-2d').getAttribute('aria-selected')).toBe('true');

    fireEvent.click(screen.getByTestId('mode-3d'));
    expect(await screen.findByTestId('canvas-stub')).toBeTruthy();
    expect(screen.queryByTestId('plan-editor')).toBeNull();
    expect(screen.getByTestId('project-title')).toBeTruthy();
    const hash3d = screen.getByTestId('canvas-stub').getAttribute('data-hash');

    // modificare prin sesiune (ca și autosave-ul) cât timp 3D e deschis → scena se actualizează
    const session = e.tab.manager.openSessions().get(r.value.id)!;
    await act(async () => {
      session.commit('Mută nod', (d) => {
        d.nodes.n6!.x = 7100;
      });
    });
    await waitFor(() =>
      expect(screen.getByTestId('canvas-stub').getAttribute('data-hash')).not.toBe(hash3d),
    );

    fireEvent.click(screen.getByTestId('mode-2d'));
    expect(await screen.findByTestId('plan-editor')).toBeTruthy();
    expect(screen.queryByTestId('canvas-stub')).toBeNull();
  });

  describe('Viewer3D: vederi, tăiere, centrare, context pierdut', () => {
    const last = () =>
      canvas.last as unknown as {
        preset: string;
        resetNonce: number;
        cutaway: boolean;
        focusNonce: number;
        onContextLost: () => void;
        onContextRestored: () => void;
      };

    it('„De sus” și „Resetează vederea” schimbă vederea și trimit câte un semnal nou de încadrare', async () => {
      render(<Viewer3D doc={studioProject()} />);
      await screen.findByTestId('canvas-stub');
      expect(last().preset).toBe('perspective');
      const n0 = last().resetNonce;
      fireEvent.click(screen.getByTestId('viewer3d-top'));
      await waitFor(() => expect(last().preset).toBe('top'));
      expect(last().resetNonce).toBe(n0 + 1);
      fireEvent.click(screen.getByTestId('viewer3d-reset'));
      await waitFor(() => expect(last().preset).toBe('perspective'));
      expect(last().resetNonce).toBe(n0 + 2);
    });

    it('„Pereți tăiați” e un comutator (aria-pressed) transmis scenei', async () => {
      render(<Viewer3D doc={studioProject()} />);
      await screen.findByTestId('canvas-stub');
      const btn = screen.getByTestId('viewer3d-cutaway');
      expect(btn.getAttribute('aria-pressed')).toBe('false');
      expect(last().cutaway).toBe(false);
      fireEvent.click(btn);
      await waitFor(() => expect(last().cutaway).toBe(true));
      expect(btn.getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(btn);
      await waitFor(() => expect(last().cutaway).toBe(false));
    });

    it('„Centrează pe selecție” e activ doar cu un obiect selectat și trimite un semnal nou la fiecare apăsare', async () => {
      const { rerender } = render(<Viewer3D doc={studioProject()} />);
      await screen.findByTestId('canvas-stub');
      const btn = screen.getByTestId('viewer3d-focus') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      rerender(<Viewer3D doc={studioProject()} selectedObjectId="oSofa" />);
      await waitFor(() =>
        expect((screen.getByTestId('viewer3d-focus') as HTMLButtonElement).disabled).toBe(false),
      );
      const f0 = last().focusNonce;
      fireEvent.click(screen.getByTestId('viewer3d-focus'));
      await waitFor(() => expect(last().focusNonce).toBe(f0 + 1));
      fireEvent.click(screen.getByTestId('viewer3d-focus'));
      await waitFor(() => expect(last().focusNonce).toBe(f0 + 2));
    });

    it('contextul WebGL pierdut: apare un mesaj cu „Reîncarcă 3D”; refacerea îl ascunde; reîncărcarea montează din nou canvas-ul', async () => {
      render(<Viewer3D doc={studioProject()} />);
      await screen.findByTestId('canvas-stub');
      expect(screen.queryByTestId('viewer3d-context-lost')).toBeNull();
      act(() => last().onContextLost());
      expect(screen.getByTestId('viewer3d-context-lost').textContent).toMatch(/memoria video/);
      // refăcut de browser: mesajul dispare
      act(() => last().onContextRestored());
      expect(screen.queryByTestId('viewer3d-context-lost')).toBeNull();
      // pierdut din nou: „Reîncarcă 3D” scoate mesajul și remontează canvas-ul (scenă nouă)
      act(() => last().onContextLost());
      const before = canvas.scenes.length;
      fireEvent.click(screen.getByTestId('viewer3d-context-reload'));
      await waitFor(() => expect(screen.queryByTestId('viewer3d-context-lost')).toBeNull());
      await waitFor(() => expect(canvas.scenes.length).toBeGreaterThan(before));
    });
  });
});
