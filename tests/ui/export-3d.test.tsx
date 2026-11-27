// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectScene } from '@/state/selectors';
import * as download from '@/lib/download';
import { exportPiece3D, exportProject3D, type Export3DStage } from '@/features/viewer-3d/export3d';
import { Viewer3D } from '@/features/viewer-3d/Viewer3D';
import { IsolatedObjectViewer } from '@/features/viewer-3d/IsolatedObjectViewer';
import { a11yIssues } from '../helpers/a11y';
import { mk } from '../reference/builders';
import { studioProject } from '../reference/projects';

vi.mock('@/features/viewer-3d/ViewerCanvas', () => ({
  default: function CanvasStub() {
    return <div data-testid="canvas-stub" />;
  },
}));
vi.mock('@/features/viewer-3d/IsolatedObjectCanvas', () => ({
  default: function IsolatedStub() {
    return <div data-testid="isolated-canvas-stub" />;
  },
}));
const webgl = vi.hoisted(() => ({ ok: true }));
vi.mock('@/features/viewer-3d/webgl', () => ({ webglAvailable: () => webgl.ok }));

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  webgl.ok = true;
  vi.restoreAllMocks();
});

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    return new Uint8Array(await blob.arrayBuffer());
  }
  return await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsArrayBuffer(blob);
  });
}

async function blobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return await blob.text();
  const bytes = await blobBytes(blob);
  return new TextDecoder().decode(bytes);
}

describe('export3d engine (GLB / OBJ / STL)', () => {
  it('exportă proiectul complet ca GLB valid (header glTF v2) cu etape de progres', async () => {
    const doc = studioProject();
    const scene = selectScene(doc);
    const stages: Export3DStage[] = [];
    const out = await exportProject3D(
      doc,
      scene,
      { format: 'glb', includeStructure: true, includeObjects: true, cutaway: false },
      (s) => stages.push(s),
    );
    expect(out.mime).toBe('model/gltf-binary');
    expect(out.sizeBytes).toBeGreaterThan(200);
    expect(stages.length).toBeGreaterThanOrEqual(2);
    expect(stages.at(-1)!.progress).toBeGreaterThanOrEqual(90);

    const bytes = await blobBytes(out.blob);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // Magic "glTF" (0x46546C67 little-endian) + versiunea 2
    expect(view.getUint32(0, true)).toBe(0x46546c67);
    expect(view.getUint32(4, true)).toBe(2);
  });

  it('exportă proiectul ca OBJ cu antet metric și filtrare pe straturi', async () => {
    const doc = studioProject();
    const scene = selectScene(doc);

    const full = await exportProject3D(doc, scene, {
      format: 'obj',
      includeStructure: true,
      includeObjects: true,
      cutaway: false,
    });
    const fullText = await blobText(full.blob);
    expect(fullText).toContain('# Exportat din RoomCraft Design Studio');
    expect(fullText).toContain('o Podea_');
    expect(fullText).toContain('o Perete_');
    expect(fullText).toContain('\nv ');
    expect(fullText).toContain('\nf ');

    const onlyObjects = await exportProject3D(doc, scene, {
      format: 'obj',
      includeStructure: false,
      includeObjects: true,
      cutaway: false,
    });
    const objOnlyText = await blobText(onlyObjects.blob);
    expect(objOnlyText).not.toContain('o Podea_');
    expect(objOnlyText).not.toContain('o Perete_');
    expect(objOnlyText).toContain('\nv ');

    const onlyStructure = await exportProject3D(doc, scene, {
      format: 'obj',
      includeStructure: true,
      includeObjects: false,
      cutaway: true,
    });
    const structText = await blobText(onlyStructure.blob);
    expect(structText).toContain('o Podea_');
    expect(structText).toContain('o Perete_');
    expect(structText.length).toBeLessThan(fullText.length);
  });

  it('exportă proiectul ca STL binar valid (84 + 50 × nr. triunghiuri)', async () => {
    const doc = studioProject();
    const scene = selectScene(doc);
    const out = await exportProject3D(doc, scene, {
      format: 'stl',
      includeStructure: true,
      includeObjects: true,
      cutaway: false,
    });
    expect(out.mime).toBe('model/stl');
    const bytes = await blobBytes(out.blob);
    expect(bytes.byteLength).toBeGreaterThan(84);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const triangles = view.getUint32(80, true);
    expect(triangles).toBeGreaterThan(20);
    expect(bytes.byteLength).toBe(84 + triangles * 50);
  });

  it('exportă o piesă de mobilă la comandă și respectă opțiunea fără uși (hideFronts)', async () => {
    const base = {
      name: 'Dulap dormitor',
      recipe: { id: 'custom-wardrobe', version: 1 },
      sizeMm: { widthMm: 1800, depthMm: 600, heightMm: 2200 },
      params: { doors: 3, shelves: 4, drawers: 2, hasRail: true, bodyThicknessMm: 18 },
      colorHex: '#d4c8b8',
      slotLooks: {},
    };
    const withDoors = await exportPiece3D({ ...base, hideFronts: false }, 'stl');
    const withoutDoors = await exportPiece3D({ ...base, hideFronts: true }, 'stl');
    expect(withDoors.sizeBytes).toBeGreaterThan(withoutDoors.sizeBytes);

    const glb = await exportPiece3D({ ...base, hideFronts: false }, 'glb');
    const bytes = await blobBytes(glb.blob);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(0, true)).toBe(0x46546c67);
  });
});

describe('Export3DMenu UI în Viewer3D și IsolatedObjectViewer', () => {
  it('deschide meniul, respectă a11y, blochează când nu e selectat niciun strat și descarcă GLB', async () => {
    const dlSpy = vi.spyOn(download, 'downloadBlob').mockImplementation(() => {});
    render(<Viewer3D doc={studioProject()} />);
    await screen.findByTestId('canvas-stub');

    fireEvent.click(screen.getByTestId('export3d-trigger'));
    expect(screen.getByTestId('export3d-menu')).toBeTruthy();
    expect(a11yIssues(document.body, 'export3d-menu')).toEqual([]);

    // Debifăm ambele straturi -> formatele se dezactivează
    fireEvent.click(screen.getByTestId('export3d-include-structure'));
    fireEvent.click(screen.getByTestId('export3d-include-objects'));
    expect((screen.getByTestId('export3d-format-glb') as HTMLButtonElement).disabled).toBe(true);

    // Rebifăm structura și lansăm exportul GLB
    fireEvent.click(screen.getByTestId('export3d-include-structure'));
    expect((screen.getByTestId('export3d-format-glb') as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByTestId('export3d-format-glb'));

    await waitFor(() => expect(dlSpy).toHaveBeenCalledTimes(1));
    const [filename, blob] = dlSpy.mock.calls[0]!;
    expect(filename).toMatch(/-3d\.glb$/);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('model/gltf-binary');
    await waitFor(() => expect(screen.queryByTestId('export3d-loading')).toBeNull());
  });

  it('permite exportul chiar fără WebGL, dar îl dezactivează pe proiect gol', () => {
    webgl.ok = false;
    const { rerender } = render(<Viewer3D doc={studioProject()} />);
    expect((screen.getByTestId('export3d-trigger') as HTMLButtonElement).disabled).toBe(false);

    rerender(<Viewer3D doc={mk([], [], {})} />);
    expect((screen.getByTestId('export3d-trigger') as HTMLButtonElement).disabled).toBe(true);
  });

  it('exportă piesa din Mobilă la comandă (IsolatedObjectViewer) fără opțiuni de pereți', async () => {
    const dlSpy = vi.spyOn(download, 'downloadBlob').mockImplementation(() => {});
    render(
      <IsolatedObjectViewer
        pieceName="Dulap hol"
        recipe={{ id: 'custom-wardrobe', version: 1 }}
        sizeMm={{ widthMm: 1600, depthMm: 600, heightMm: 2200 }}
        params={{ doors: 2, shelves: 4, drawers: 2, hasRail: true }}
        colorHex="#d4c8b8"
        slotLooks={{}}
        hideFronts={false}
        viewPreset="perspective"
        viewNonce={0}
        showDimensions
      />,
    );
    await screen.findByTestId('isolated-canvas-stub');

    fireEvent.click(screen.getByTestId('export3d-trigger'));
    expect(screen.getByTestId('export3d-menu')).toBeTruthy();
    expect(screen.queryByTestId('export3d-include-structure')).toBeNull();
    expect(a11yIssues(document.body, 'isolated-export3d-menu')).toEqual([]);

    fireEvent.click(screen.getByTestId('export3d-format-stl'));
    await waitFor(() => expect(dlSpy).toHaveBeenCalledTimes(1));
    const [filename, blob] = dlSpy.mock.calls[0]!;
    expect(filename).toBe('dulap-hol-3d.stl');
    expect(blob.type).toBe('model/stl');
  });
});
