// Mediu NODE (fără DOM): dovedește că prerandarea statică nu atinge API-uri de browser.
import { renderToString } from 'react-dom/server';
import { Suspense } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Dashboard } from '@/features/projects/Dashboard';
import { EditorShell } from '@/features/editor-shell/EditorShell';
import { ProjectProvider } from '@/lib/project-runtime/ProjectProvider';

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('p=abc') }));

describe('prerandare statică (fără window / navigator / IndexedDB / Web Locks)', () => {
  it('mediul de test nu are DOM', () => {
    expect(typeof window).toBe('undefined');
    expect(typeof document).toBe('undefined');
    expect(typeof navigator === 'undefined' || !('locks' in navigator)).toBe(true);
  });

  it('Dashboard sub ProjectProvider se randează pe server ca „se inițializează”, fără a apela fabrica de runtime', () => {
    const createRuntime = vi.fn();
    const html = renderToString(
      <ProjectProvider createRuntime={createRuntime}>
        <Dashboard />
      </ProjectProvider>,
    );
    expect(html).toContain('Se inițializează stocarea locală');
    expect(html).toContain('RoomCraft');
    expect(html).not.toContain('Proiectele mele'); // lista vine doar pe client
    expect(createRuntime).not.toHaveBeenCalled();
  });

  it('ruta editorului se randează pe server fără a deschide proiectul', () => {
    const createRuntime = vi.fn();
    const html = renderToString(
      <ProjectProvider createRuntime={createRuntime}>
        <Suspense fallback={<p>fallback</p>}>
          <EditorShell />
        </Suspense>
      </ProjectProvider>,
    );
    expect(html).toContain('Se inițializează stocarea locală');
    expect(createRuntime).not.toHaveBeenCalled();
  });

  it('modulele adaptorului pentru browser se pot importa fără efecte secundare', async () => {
    const mod = await import('@/lib/project-runtime/browser-runtime');
    expect(typeof mod.createBrowserRuntime).toBe('function');
    // fără IndexedDB în acest mediu: eșuează controlat, nu aruncă la import
    await expect(mod.createBrowserRuntime()).rejects.toMatchObject({
      name: 'RuntimeUnavailableError',
    });
  });
});
