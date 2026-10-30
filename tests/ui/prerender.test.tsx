// Mediu NODE (fără DOM): dovedește că prerandarea statică nu atinge API-uri de browser.
import { renderToString } from 'react-dom/server';
import { Suspense } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { studioProject } from '../reference/projects';
import { Dashboard } from '@/features/projects/Dashboard';
import { EditorShell } from '@/features/editor-shell/EditorShell';
import { CatalogBrowser } from '@/features/catalog/CatalogBrowser';
import { Viewer3D } from '@/features/viewer-3d/Viewer3D';
import { ProjectProvider } from '@/lib/project-runtime/ProjectProvider';

const canvasLoaded = vi.hoisted(() => ({ n: 0 }));
vi.mock('@/features/viewer-3d/ViewerCanvas', () => {
  canvasLoaded.n++;
  return { default: () => null };
});
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

  it('vizualizarea 3D se prerandează fără window/WebGL și fără a încărca canvas-ul Three/R3F', () => {
    const html = renderToString(<Viewer3D doc={studioProject()} />);
    expect(html).toContain('Se pregătește vizualizarea 3D');
    expect(html).not.toContain('<canvas');
    expect(canvasLoaded.n).toBe(0); // chunk-ul canvas-ului nu se evaluează în prerandare
  });

  it('transformarea scenei în geometrii Three se importă și rulează în Node, fără DOM', async () => {
    const { buildSceneObjects } = await import('@/features/viewer-3d/sceneObjects');
    const { buildScene } = await import('@/domain/scene');
    const o = buildSceneObjects(buildScene(studioProject()));
    expect(o.walls.length).toBe(12);
    o.dispose();
  });

  it('catalogul de obiecte (41 de miniaturi SVG) se prerandează fără DOM, WebGL sau Three', () => {
    const html = renderToString(
      <CatalogBrowser unit="cm" editable onAdd={() => {}} onClose={() => {}} />,
    );
    expect(html).toContain('Catalog de obiecte');
    expect(html).toContain('Canapea 3 locuri');
    expect(html.match(/data-testid="item-preview"/g)?.length).toBeGreaterThanOrEqual(40);
    expect(canvasLoaded.n).toBe(0);
  });

  it('modulele catalogului (rețete, tesselare, previzualizare) se importă și rulează în Node', async () => {
    const cat = await import('@/catalog');
    const item = cat.getBuiltinItem('bedroom.bed-double')!;
    const { parts } = cat.buildParts(item.recipe, [1.6, 0.9, 2], {});
    expect(cat.buildMesh(parts, '#cccccc').triangles).toBeGreaterThan(0);
    expect(cat.buildPreview(parts, '#cccccc').polygons.length).toBeGreaterThan(0);
  });

  it('materialele (texturi procedurale, miniaturi BMP, UV) se importă și rulează în Node, fără DOM sau WebGL', async () => {
    const m = await import('@/materials');
    const { resolveLook } = await import('@/domain');
    const wood = resolveLook(m.getBuiltinMaterial('mat.parquet.oak-light')!);
    expect(m.textureHash(m.generateTexture(wood.texture!, wood.baseColorHex))).toMatch(
      /^[0-9a-f]{8}$/,
    );
    expect(m.swatchDataUrl(wood).startsWith('data:image/bmp;base64,')).toBe(true);
    expect(typeof document).toBe('undefined');
  });
});
