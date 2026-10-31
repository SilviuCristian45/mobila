// @vitest-environment jsdom
// F-05 (docs/TECHNICAL_AUDIT.md): erorile de randare sunt izolate pe zone, în română, fără mesaje tehnice, iar
// documentul, sesiunea și copiile de siguranță rămân neatinse. Boundary-urile sunt testate efectiv (o componentă chiar
// aruncă), nu doar mesajele.
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportProject, importProject } from '@/domain';
import GlobalError from '@/app/global-error';
import RouteError from '@/app/error';
import { EditorShell } from '@/features/editor-shell/EditorShell';
import { Dashboard } from '@/features/projects/Dashboard';
import type { ProjectSession } from '@/state/session';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { studioProject } from '../reference/projects';
import { quotaError, settle } from '../helpers/env';
import { renderWithRuntime, uiEnv, type UiEnv } from '../helpers/ui';

let query = '';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(query) }));
const downloads: Array<{ name: string; text: string }> = [];
vi.mock('@/lib/download', async (orig) => ({
  ...(await orig<typeof import('@/lib/download')>()),
  downloadTextFile: (name: string, text: string) => downloads.push({ name, text }),
}));
// un card al dashboard-ului cu data „otrăvită” aruncă la randare; restul trec prin implementarea reală
const SENTINEL = '1999-01-01T00:00:00.000Z';
const cardBoom = vi.hoisted(() => ({ on: true }));
vi.mock('@/lib/format', async (orig) => {
  const real = await orig<typeof import('@/lib/format')>();
  return {
    ...real,
    formatDateTime: (iso: string) => {
      if (cardBoom.on && iso === SENTINEL) throw new Error('SECRET-CARD-DETAIL');
      return real.formatDateTime(iso);
    },
  };
});

const SECRET = 'SECRET-INTERNAL-DETAIL: Cannot read properties of undefined';
let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  query = '';
  downloads.length = 0;
  cardBoom.on = true;
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

const META = { exportedAt: '2026-10-27T12:00:00.000Z', appVersion: 'test' };
async function seedStudio(e: UiEnv): Promise<string> {
  const r = await e.tab.manager.importFile(exportProject(studioProject(), META));
  if (!r.ok) throw new Error('seed');
  return r.value.id;
}
const autosave = async (e: UiEnv) => {
  await act(async () => {
    await e.clock.advance(800);
    await settle();
  });
};
const status = () => screen.getByTestId('save-status').getAttribute('data-status');
async function rename(name: string) {
  await userEvent.click(screen.getByTestId('rename'));
  const dialog = screen.getByRole('dialog', { name: 'Redenumește proiectul' });
  const input = within(dialog).getByLabelText('Numele proiectului');
  await userEvent.clear(input);
  await userEvent.type(input, name);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Redenumește' }));
}
/** Tot ce e persistat pentru un proiect, ca să dovedim că o eroare de randare nu l-a atins. */
const persisted = async (e: UiEnv) => ({
  documents: await e.tab.db.documents.toArray(),
  projects: await e.tab.db.projects.toArray(),
  snapshots: await e.tab.db.snapshots.toArray(),
});

describe('ErrorBoundary (componenta comună)', () => {
  const flag = { boom: true };
  function Boom() {
    if (flag.boom) throw new Error(SECRET);
    return <p data-testid="child-ok">copil ok</p>;
  }
  beforeEach(() => {
    flag.boom = true;
  });

  it('o componentă care aruncă la randare: apare fallback-ul, restul paginii rămâne; mesajul excepției nu apare în interfață', () => {
    render(
      <div>
        <p data-testid="alaturi">în afara boundary-ului</p>
        <ErrorBoundary label="test" fallback={() => <p data-testid="fb">Ceva nu a mers</p>}>
          <Boom />
        </ErrorBoundary>
      </div>,
    );
    expect(screen.getByTestId('fb')).toBeTruthy();
    expect(screen.getByTestId('alaturi')).toBeTruthy();
    expect(document.body.textContent).not.toContain('SECRET-INTERNAL-DETAIL');
    expect(
      consoleError.mock.calls.some((c: unknown[]) => String(c[0]).includes('eroare în „test”')),
    ).toBe(true); // detaliile merg doar în consolă
  });

  it('„Încearcă din nou”: redă din nou copiii și apelează onReset o singură dată', async () => {
    const onReset = vi.fn();
    render(
      <ErrorBoundary
        label="test"
        onReset={onReset}
        fallback={({ reset }) => <button onClick={reset}>Reîncearcă</button>}
      >
        <Boom />
      </ErrorBoundary>,
    );
    flag.boom = true;
    await userEvent.click(screen.getByRole('button', { name: 'Reîncearcă' })); // încă aruncă ⇒ rămâne fallback
    expect(screen.getByRole('button', { name: 'Reîncearcă' })).toBeTruthy();
    expect(onReset).toHaveBeenCalledTimes(1);
    flag.boom = false;
    await userEvent.click(screen.getByRole('button', { name: 'Reîncearcă' }));
    expect(screen.getByTestId('child-ok')).toBeTruthy();
    expect(onReset).toHaveBeenCalledTimes(2);
  });

  it('resetKey: schimbarea cheii șterge singură eroarea afișată', () => {
    const ui = (k: number) => (
      <ErrorBoundary label="test" resetKey={k} fallback={() => <p data-testid="fb">eșec</p>}>
        <Boom />
      </ErrorBoundary>
    );
    const { rerender } = render(ui(1));
    expect(screen.getByTestId('fb')).toBeTruthy();
    flag.boom = false;
    rerender(ui(1)); // aceeași cheie: rămâne fallback
    expect(screen.getByTestId('fb')).toBeTruthy();
    rerender(ui(2));
    expect(screen.getByTestId('child-ok')).toBeTruthy();
  });
});

describe('error.tsx și global-error.tsx', () => {
  it('error.tsx: mesaj în română, fără detaliile excepției; „Încearcă din nou” apelează reset; link către dashboard', async () => {
    const reset = vi.fn();
    const error = Object.assign(new Error(SECRET), {
      stack: 'Error: SECRET\n    at secret.ts:1:1',
    });
    render(<RouteError error={error} reset={reset} />);
    const box = screen.getByTestId('route-error');
    expect(box.textContent).toMatch(/A apărut o eroare neașteptată/);
    expect(box.textContent).toMatch(/Proiectele tale rămân salvate/);
    expect(document.body.textContent).not.toMatch(/SECRET|secret\.ts/);
    await userEvent.click(screen.getByTestId('route-error-retry'));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('route-error-home').getAttribute('href')).toBe('/');
  });

  it('error.tsx: linkul către dashboard respectă basePath', () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/rc-test');
    render(<RouteError error={new Error('x')} reset={() => {}} />);
    expect(screen.getByTestId('route-error-home').getAttribute('href')).toBe('/rc-test/');
  });

  it('global-error.tsx: definește <html lang="ro">, mesaj și acțiuni, fără detaliile excepției', () => {
    const html = renderToString(<GlobalError error={new Error(SECRET)} reset={() => {}} />);
    expect(html).toContain('<html lang="ro"');
    expect(html).toContain('Aplicația a întâmpinat o eroare gravă');
    expect(html).toContain('Încearcă din nou');
    expect(html).toContain('href="/"');
    expect(html).not.toContain('SECRET');
  });
});

describe('editor: zona de lucru izolată (sesiunea rămâne activă)', () => {
  const ws = { boom: true };
  let session: ProjectSession | null = null;
  function Workspace() {
    if (ws.boom) throw new Error(SECRET);
    return <div data-testid="workspace-ok">spațiu de lucru</div>;
  }
  beforeEach(() => {
    ws.boom = true;
    session = null;
  });
  async function openEditor(e: UiEnv) {
    const id = await seedStudio(e);
    query = `p=${id}`;
    renderWithRuntime(
      <EditorShell
        workspace={(s) => {
          session = s;
          return <Workspace />;
        }}
      />,
      e.runtimeFor(e.tab),
    );
    await screen.findByTestId('editor');
    return id;
  }

  it('eroare în zona de lucru: antetul, linkul către dashboard și undo rămân; fallback explicit, fără mesajul excepției', async () => {
    const e = uiEnv();
    await openEditor(e);
    const box = await screen.findByTestId('workspace-error');
    expect(box.textContent).toMatch(/Zona de lucru a întâmpinat o eroare/);
    expect(box.textContent).toMatch(/Proiectul este în siguranță/);
    expect(document.body.textContent).not.toContain('SECRET-INTERNAL-DETAIL');
    expect(screen.getByTestId('project-title').textContent).toBe('studio'); // antetul a rămas
    expect(screen.getByTestId('back-to-dashboard').getAttribute('href')).toBe('/');
    expect(screen.getByTestId('undo')).toBeTruthy();
    expect(
      within(box)
        .getByRole('link', { name: /Înapoi la proiecte/ })
        .getAttribute('href'),
    ).toBe('/');
    expect(screen.getByTestId('workspace-summary')).toBeTruthy();
  });

  it('după eroare sesiunea e vie: o modificare se salvează o singură dată, iar undo o poate anula', async () => {
    const e = uiEnv();
    const id = await openEditor(e);
    await screen.findByTestId('workspace-error');
    const rev0 = (await e.tab.db.documents.get(id))!.revision;

    await rename('Redenumit după eroare');
    await autosave(e);
    await waitFor(() => expect(status()).toBe('saved'));
    const row = await e.tab.db.documents.get(id);
    expect(row!.revision).toBe(rev0 + 1);
    expect((row!.data as { name: string }).name).toBe('Redenumit după eroare');

    expect(session).not.toBeNull();
    await userEvent.click(screen.getByTestId('undo'));
    expect(screen.getByTestId('project-title').textContent).toBe('studio');
  });

  it('„Încearcă din nou”: reafișează zona de lucru și nu creează operații (stocarea rămâne identică); dacă eroarea persistă, rămâne fallback-ul', async () => {
    const e = uiEnv();
    await openEditor(e);
    await screen.findByTestId('workspace-error');
    const before = await persisted(e);
    const rev = screen.getByTestId('revision').textContent;
    const history = screen.getByTestId('history-size').textContent;

    await userEvent.click(screen.getByTestId('workspace-error-retry')); // încă aruncă
    expect(await screen.findByTestId('workspace-error')).toBeTruthy();
    expect(await persisted(e)).toEqual(before);

    ws.boom = false;
    await userEvent.click(screen.getByTestId('workspace-error-retry'));
    expect(await screen.findByTestId('workspace-ok')).toBeTruthy();
    expect(screen.queryByTestId('workspace-error')).toBeNull();
    await autosave(e);
    expect(await persisted(e)).toEqual(before); // nicio scriere de la erori sau reîncercări
    expect(screen.getByTestId('revision').textContent).toBe(rev);
    expect(screen.getByTestId('history-size').textContent).toBe(history);
    expect(status()).toBe('saved');
  });

  it('„Exportă copie” din fallback descarcă un fișier valid cu documentul din memorie, fără să modifice stocarea', async () => {
    const e = uiEnv();
    await openEditor(e);
    const box = await screen.findByTestId('workspace-error');
    const before = await persisted(e);
    await userEvent.click(within(box).getByRole('button', { name: 'Exportă copie' }));
    expect(downloads).toHaveLength(1);
    const re = importProject(downloads[0]!.text);
    expect(re.ok && re.doc.name).toBe('studio');
    expect(await persisted(e)).toEqual(before);
  });
});

describe('editor: erori de stocare nu compromit documentul', () => {
  it('eșec la autosave cu zona de lucru intactă: documentul rămâne în memorie, stocarea nemodificată, reîncercarea salvează exact o dată', async () => {
    const e = uiEnv();
    const id = await seedStudio(e);
    query = `p=${id}`;
    renderWithRuntime(
      <EditorShell workspace={() => <div data-testid="workspace-ok" />} />,
      e.runtimeFor(e.tab),
    );
    await screen.findByTestId('editor');
    const before = await persisted(e);
    const rev0 = before.documents[0]!.revision;

    vi.spyOn(e.tab.db.documents, 'put').mockRejectedValue(quotaError());
    await rename('Doar în memorie');
    await autosave(e);
    await waitFor(() => expect(status()).toBe('error'));
    expect(screen.getByTestId('banner-error')).toBeTruthy();
    expect(screen.getByTestId('workspace-ok')).toBeTruthy(); // interfața nu s-a prăbușit
    expect(screen.getByTestId('project-title').textContent).toBe('Doar în memorie');
    expect(await persisted(e)).toEqual(before); // nimic parțial scris, nicio copie nouă

    vi.restoreAllMocks();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await userEvent.click(screen.getByRole('button', { name: 'Reîncearcă salvarea' }));
    await waitFor(() => expect(status()).toBe('saved'));
    const after = await persisted(e);
    expect(after.documents[0]!.revision).toBe(rev0 + 1); // o singură scriere, fără operații duplicate
    expect((after.documents[0]!.data as { name: string }).name).toBe('Doar în memorie');
    expect(after.snapshots).toEqual(before.snapshots);
  });

  it('eroare de încărcare din IndexedDB la deschidere: mesaj explicit și link înapoi; datele rămân neatinse și se deschid după ce stocarea revine', async () => {
    const e = uiEnv();
    const id = await seedStudio(e);
    const before = await persisted(e);
    query = `p=${id}`;
    const spy = vi
      .spyOn(e.tab.db.documents, 'get')
      .mockRejectedValue(new Error('SECRET-IDB-DETAIL transaction aborted'));
    renderWithRuntime(<EditorShell />, e.runtimeFor(e.tab));
    const box = await screen.findByTestId('editor-open-error');
    expect(box.textContent).toMatch(/Eroare de stocare|Stocarea/);
    expect(
      within(box)
        .getByRole('link', { name: /Înapoi la proiecte/ })
        .getAttribute('href'),
    ).toBe('/');
    expect(screen.queryByTestId('editor')).toBeNull();
    expect(e.locks.isHeld(id)).toBe(false); // nicio blocare rămasă
    spy.mockRestore();
    expect(await persisted(e)).toEqual(before);
  });
});

describe('dashboard: un card care eșuează nu scoate din funcțiune lista', () => {
  async function twoProjects(e: UiEnv) {
    const a = await e.tab.manager.create('Stricat');
    await e.clock.advance(1000);
    const b = await e.tab.manager.create('Bun');
    if (!a.ok || !b.ok) throw new Error('seed');
    await e.tab.db.projects.update(a.value.id, { updatedAt: SENTINEL });
    return { a: a.value.id, b: b.value.id };
  }

  it('cardul care aruncă arată un mesaj local, celelalte rămân utilizabile; reîncercarea îl readuce; datele nu se modifică', async () => {
    const e = uiEnv();
    await twoProjects(e);
    const before = await persisted(e);
    renderWithRuntime(<Dashboard />, e.runtimeFor(e.tab));
    const bad = await screen.findByTestId('project-card-error');
    expect(bad.textContent).toMatch(/Acest proiect nu a putut fi afișat/);
    expect(document.body.textContent).not.toContain('SECRET-CARD-DETAIL');
    const cards = await screen.findAllByTestId('project-card');
    expect(cards).toHaveLength(1);
    expect(within(cards[0]!).getByTestId('project-name').textContent).toBe('Bun');
    expect(screen.getByRole('button', { name: '+ Proiect nou' })).toBeTruthy(); // restul paginii funcționează

    cardBoom.on = false;
    await userEvent.click(within(bad).getByRole('button', { name: 'Încearcă din nou' }));
    await waitFor(() => expect(screen.queryByTestId('project-card-error')).toBeNull());
    expect(screen.getAllByTestId('project-card')).toHaveLength(2);
    expect(await persisted(e)).toEqual(before);
  });
});
