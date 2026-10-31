// @vitest-environment jsdom
// F-05: un panou lateral care aruncă nu dărâmă planul și nu atinge documentul; „Încearcă din nou” îl readuce.
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportProject } from '@/domain';
import { EditorClient } from '@/app/editor/EditorClient';
import { studioProject } from '../reference/projects';
import { renderWithRuntime, uiEnv } from '../helpers/ui';

let query = '';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(query) }));
const panel = vi.hoisted(() => ({ boom: true }));
vi.mock('@/features/catalog/CatalogPanel', () => ({
  CatalogPanel: function CatalogPanelStub() {
    if (panel.boom) throw new Error('SECRET-PANEL-DETAIL');
    return <div data-testid="catalog-panel-ok" />;
  },
}));

beforeEach(() => {
  query = '';
  panel.boom = true;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('panou lateral izolat', () => {
  it('panoul aruncă: planul 2D și antetul rămân; mesaj local fără detalii; retry readuce panoul; stocarea nu se schimbă', async () => {
    const e = uiEnv();
    const r = await e.tab.manager.importFile(
      exportProject(studioProject(), {
        exportedAt: '2026-10-27T12:00:00.000Z',
        appVersion: 'test',
      }),
    );
    if (!r.ok) throw new Error('seed');
    query = `p=${r.value.id}`;
    const before = {
      d: await e.tab.db.documents.toArray(),
      p: await e.tab.db.projects.toArray(),
      s: await e.tab.db.snapshots.toArray(),
    };
    renderWithRuntime(<EditorClient />, e.runtimeFor(e.tab));

    const box = await screen.findByTestId('side-panel-error');
    expect(box.textContent).toMatch(/Panoul lateral a întâmpinat o eroare/);
    expect(box.textContent).toMatch(/Planul și proiectul nu sunt afectate/);
    expect(document.body.textContent).not.toContain('SECRET-PANEL-DETAIL');
    expect(screen.getByTestId('plan-svg')).toBeTruthy(); // planul a rămas
    expect(screen.getByTestId('project-title').textContent).toBe('studio');
    expect(screen.queryByTestId('workspace-error')).toBeNull(); // eroarea nu a urcat la zona de lucru

    panel.boom = false;
    await userEvent.click(within(box).getByRole('button', { name: 'Încearcă din nou' }));
    expect(await screen.findByTestId('catalog-panel-ok')).toBeTruthy();
    expect(screen.queryByTestId('side-panel-error')).toBeNull();
    expect({
      d: await e.tab.db.documents.toArray(),
      p: await e.tab.db.projects.toArray(),
      s: await e.tab.db.snapshots.toArray(),
    }).toEqual(before);
  });
});
