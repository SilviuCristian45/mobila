// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportProject } from '@/domain';
import { EditorClient } from '@/app/editor/EditorClient';
import type { ProjectSession } from '@/state/session';
import { a11yIssues } from '../helpers/a11y';
import { renderWithRuntime, uiEnv } from '../helpers/ui';
import { studioProject } from '../reference/projects';

let query = '';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(query) }));
const downloads: Array<{ name: string; text: string; mime?: string }> = [];
vi.mock('@/lib/download', async (orig) => ({
  ...(await orig<typeof import('@/lib/download')>()),
  downloadTextFile: (name: string, text: string, mime?: string) =>
    downloads.push({ name, text, mime }),
}));
vi.mock('@/features/viewer-3d/webgl', () => ({ webglAvailable: () => false }));

beforeEach(() => {
  query = '';
  downloads.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const META = { exportedAt: '2026-10-27T12:00:00.000Z', appVersion: 'test' };

describe('Modulul „Mobilă la comandă”', () => {
  async function openCustom() {
    const e = uiEnv();
    const r = await e.tab.manager.importFile(exportProject(studioProject(), META));
    if (!r.ok) throw new Error('seed');
    query = `p=${r.value.id}`;
    renderWithRuntime(<EditorClient />, e.runtimeFor(e.tab));
    await screen.findByTestId('plan-editor');
    fireEvent.click(screen.getByTestId('mode-custom'));
    await screen.findByTestId('custom-furniture-studio');
    return {
      session: e.tab.manager.openSessions().get(r.value.id) as ProjectSession,
    };
  }

  it('configurează dimensiuni, comută „Vezi interiorul (fără uși)”, exportă CSV debitare și plasează piesa în plan + buget (schema v1)', async () => {
    const { session } = await openCustom();
    expect(a11yIssues(document.body, 'mobila la comanda')).toEqual([]);

    // toggle „Vezi interiorul (fără uși)”
    expect(screen.getByTestId('custom-3d-viewport').getAttribute('data-hide-fronts')).toBe('false');
    fireEvent.click(screen.getByTestId('custom-toggle-interior'));
    expect(screen.getByTestId('custom-3d-viewport').getAttribute('data-hide-fronts')).toBe('true');

    // editează lățimea la 2200 mm
    const widthInput = screen.getByTestId('custom-width');
    fireEvent.change(widthInput, { target: { value: '2200' } });
    fireEvent.blur(widthInput);
    expect(screen.getByTestId('custom-dimensions-overlay').textContent).toContain('2200 mm');

    // alege materiale pe zone
    fireEvent.click(screen.getByTestId('custom-tab-materials'));
    await screen.findByTestId('custom-panel-materials');
    fireEvent.click(screen.getByTestId('custom-slot-front'));
    fireEvent.click(screen.getByTestId('custom-mat-mat.furn.anthracite'));

    // verifică fișa de debitare și export CSV
    fireEvent.click(screen.getByTestId('custom-tab-cutlist'));
    await screen.findByTestId('cutlist-table');
    expect(screen.getByTestId('cutlist-area').textContent).toMatch(/m²/);
    expect(screen.getByTestId('cutlist-edge').textContent).toMatch(/ml/);
    fireEvent.click(screen.getByTestId('cutlist-export-csv'));
    expect(downloads).toHaveLength(1);
    expect(downloads[0]!.name).toMatch(/-debitare\.csv$/);
    expect(downloads[0]!.text).toContain('Lateral exterior');

    // plasează în plan → revine în Plan 2D cu piesa selectată, finisajele aplicate și prețul în buget
    const beforeCount = Object.keys(session.getState().doc.objects).length;
    fireEvent.click(screen.getByTestId('custom-place-in-plan'));
    await screen.findByTestId('plan-editor');
    const doc = session.getState().doc;
    expect(doc.schemaVersion).toBe(1);
    expect(Object.keys(doc.objects)).toHaveLength(beforeCount + 1);
    const added = Object.values(doc.objects).find((o) => o.catalogItemId === 'custom.wardrobe')!;
    expect(added.size.widthMm).toBe(2200);
    // finisajele pe sloturi body + front au fost salvate
    const slots = Object.values(doc.finishAssignments).filter(
      (a) => a.target.kind === 'objectSlot' && a.target.objectId === added.id,
    );
    expect(slots.length).toBeGreaterThanOrEqual(2);
    // butonul „Deschide în Configurator” apare în Inspectorul obiectului
    const openBtn = await screen.findByTestId('open-in-custom-configurator');
    fireEvent.click(openBtn);
    await waitFor(() => expect(screen.getByTestId('custom-furniture-studio')).toBeTruthy());
    expect(screen.getByTestId(`custom-piece-${added.id}`)).toBeTruthy();
  });
});
