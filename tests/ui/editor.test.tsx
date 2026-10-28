// @vitest-environment jsdom
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importProject } from '@/domain';
import { EditorShell } from '@/features/editor-shell/EditorShell';
import { RuntimeUnavailableError } from '@/lib/project-runtime/browser-runtime';
import { exportProject } from '@/domain';
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

beforeEach(() => {
  query = '';
  downloads.length = 0;
});

const META = { exportedAt: '2026-10-27T12:00:00.000Z', appVersion: 'test' };
async function seedStudio(e: UiEnv): Promise<string> {
  const r = await e.tab.manager.importFile(exportProject(studioProject(), META));
  if (!r.ok) throw new Error('seed');
  return r.value.id;
}
const status = () => screen.getByTestId('save-status').getAttribute('data-status');
/** Lasă autosave-ul (ceas manual) să ruleze. */
const autosave = async (e: UiEnv) => {
  await act(async () => {
    await e.clock.advance(800);
    await settle();
  });
};
async function rename(name: string) {
  await userEvent.click(screen.getByTestId('rename'));
  const dialog = screen.getByRole('dialog', { name: 'Redenumește proiectul' });
  const input = within(dialog).getByLabelText('Numele proiectului');
  await userEvent.clear(input);
  await userEvent.type(input, name);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Redenumește' }));
}

describe('Editor — rută și stări de deschidere', () => {
  it('fără ?p= → mesaj clar cu link înapoi', async () => {
    const e = uiEnv();
    renderWithRuntime(<EditorShell />, e.runtimeFor(e.tab));
    const box = await screen.findByTestId('editor-missing-id');
    expect(
      within(box)
        .getByRole('link', { name: /Înapoi la proiecte/ })
        .getAttribute('href'),
    ).toBe('/');
  });

  it('arată „se inițializează” și apoi „se deschide proiectul”', async () => {
    const e = uiEnv();
    const id = await seedStudio(e);
    query = `p=${id}`;
    renderWithRuntime(<EditorShell />, e.runtimeFor(e.tab));
    expect(screen.getByText('Se inițializează stocarea locală…')).toBeTruthy();
    expect(await screen.findByTestId('editor')).toBeTruthy();
  });

  it('proiect inexistent → „Proiectul nu există” + link înapoi', async () => {
    const e = uiEnv();
    query = 'p=nu-exista';
    renderWithRuntime(<EditorShell />, e.runtimeFor(e.tab));
    const box = await screen.findByTestId('editor-open-error');
    expect(within(box).getByText('Proiectul nu există')).toBeTruthy();
    expect(within(box).getByRole('link', { name: /Înapoi la proiecte/ })).toBeTruthy();
  });

  it('document invalid → „Proiectul este invalid” cu trimitere la restaurare; nimic nu se șterge', async () => {
    const e = uiEnv();
    const id = await seedStudio(e);
    await e.tab.db.documents.update(id, { data: { gunoi: true } });
    query = `p=${id}`;
    renderWithRuntime(<EditorShell />, e.runtimeFor(e.tab));
    const box = await screen.findByTestId('editor-open-error');
    expect(within(box).getByText('Proiectul este invalid')).toBeTruthy();
    expect(within(box).getByText(/restaura o copie de siguranță/)).toBeTruthy();
    expect(await e.tab.db.documents.count()).toBe(1);
    expect(e.locks.isHeld(id)).toBe(false);
  });

  it('stocare indisponibilă → mesaj în editor', async () => {
    const e = uiEnv();
    query = 'p=x';
    renderWithRuntime(<EditorShell />, async () => {
      throw new RuntimeUnavailableError({
        kind: 'unavailable',
        message: 'Browserul nu oferă IndexedDB.',
      });
    });
    expect(await screen.findByTestId('editor-storage-unavailable')).toBeTruthy();
    void e;
  });

  it('versiune mai nouă a proiectului → mesaj dedicat', async () => {
    const e = uiEnv();
    const id = await seedStudio(e);
    const row = await e.tab.db.documents.get(id);
    await e.tab.db.documents.update(id, { data: { ...(row!.data as object), schemaVersion: 2 } });
    query = `p=${id}`;
    renderWithRuntime(<EditorShell />, e.runtimeFor(e.tab));
    expect(await screen.findByText('Proiect creat cu o versiune mai nouă')).toBeTruthy();
  });
});

describe('Editor — sesiunea React peste ProjectSession', () => {
  it('deschide proiectul din URL: nume, mod, conținut, stare „Salvat”', async () => {
    const e = uiEnv();
    const id = await seedStudio(e);
    query = `p=${id}`;
    renderWithRuntime(<EditorShell />, e.runtimeFor(e.tab));
    await screen.findByTestId('editor');
    expect(screen.getByTestId('project-title').textContent).toBe('studio');
    expect(status()).toBe('saved');
    expect(screen.getByTestId('count-rooms').textContent).toBe('2');
    expect(screen.getByTestId('count-walls').textContent).toBe('7');
    expect(screen.getByTestId('count-objects').textContent).toBe('2');
    expect(screen.getByTestId('mode').textContent).toBe('editare');
    expect(screen.getByTestId('workspace-summary')).toBeTruthy();
    expect((screen.getByTestId('undo') as HTMLButtonElement).disabled).toBe(true);
    expect(document.title).toBe('studio — RoomCraft');
  });

  it('modificare → „Modificări nesalvate” → „Salvat” (autosave), cu revizia actualizată în stocare', async () => {
    const e = uiEnv();
    const id = await seedStudio(e);
    query = `p=${id}`;
    renderWithRuntime(<EditorShell />, e.runtimeFor(e.tab));
    await screen.findByTestId('editor');
    await rename('Apartament nou');
    expect(screen.getByTestId('project-title').textContent).toBe('Apartament nou');
    expect(status()).toBe('dirty');
    await autosave(e);
    await waitFor(() => expect(status()).toBe('saved'));
    expect(screen.getByTestId('revision').textContent).toBe('2');
    const list = await e.tab.manager.list();
    expect(list.ok && list.value[0]!.name).toBe('Apartament nou');
  });

  it('undo / redo din butoane și de la tastatură; etichetele și starea butoanelor urmează sesiunea', async () => {
    const e = uiEnv();
    const id = await seedStudio(e);
    query = `p=${id}`;
    renderWithRuntime(<EditorShell />, e.runtimeFor(e.tab));
    await screen.findByTestId('editor');
    await rename('B');
    const undo = screen.getByTestId('undo') as HTMLButtonElement;
    const redo = screen.getByTestId('redo') as HTMLButtonElement;
    expect(undo.disabled).toBe(false);
    expect(undo.getAttribute('aria-label')).toBe('Anulează: Redenumire');
    expect(redo.disabled).toBe(true);
    await userEvent.click(undo);
    expect(screen.getByTestId('project-title').textContent).toBe('studio');
    expect(redo.disabled).toBe(false);
    expect(redo.getAttribute('aria-label')).toBe('Refă: Redenumire');
    await userEvent.click(redo);
    expect(screen.getByTestId('project-title').textContent).toBe('B');
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(screen.getByTestId('project-title').textContent).toBe('studio');
    await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(screen.getByTestId('project-title').textContent).toBe('B');
    expect(screen.getByTestId('history-size').textContent).toBe('1');
  });

  it('scurtăturile nu se declanșează cât timp se scrie într-un câmp', async () => {
    const e = uiEnv();
    const id = await seedStudio(e);
    query = `p=${id}`;
    renderWithRuntime(<EditorShell />, e.runtimeFor(e.tab));
    await screen.findByTestId('editor');
    await rename('B');
    await userEvent.click(screen.getByTestId('rename'));
    const input = screen.getByLabelText('Numele proiectului');
    input.focus();
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(screen.getByTestId('project-title').textContent).toBe('B'); // undo-ul sesiunii nu a rulat
  });

  it('reîncărcarea paginii (demontare + montare nouă) restaurează ultima stare salvată', async () => {
    const e = uiEnv();
    const id = await seedStudio(e);
    query = `p=${id}`;
    const first = renderWithRuntime(<EditorShell />, e.runtimeFor(e.tab));
    await screen.findByTestId('editor');
    await rename('Persistat');
    await autosave(e);
    await waitFor(() => expect(status()).toBe('saved'));
    first.unmount();
    // sesiunea se închide (cu mică întârziere, ca să supraviețuiască montării duble din StrictMode) și eliberează blocarea
    await waitFor(() => expect(e.locks.isHeld(id)).toBe(false));
    renderWithRuntime(<EditorShell />, e.runtimeFor(e.newTab()));
    await screen.findByTestId('editor');
    expect(screen.getByTestId('project-title').textContent).toBe('Persistat');
    expect(screen.getByTestId('history-size').textContent).toBe('0'); // istoricul nu se persistă
    expect(screen.getByTestId('mode').textContent).toBe('editare');
  });

  it('React.StrictMode (montare dublă): proiectul rămâne editabil, nu devine doar-citire', async () => {
    const e = uiEnv();
    const id = await seedStudio(e);
    query = `p=${id}`;
    renderWithRuntime(
      <StrictMode>
        <EditorShell />
      </StrictMode>,
      e.runtimeFor(e.tab),
    );
    await screen.findByTestId('editor');
    await act(async () => {
      await settle();
    });
    expect(screen.getByTestId('mode').textContent).toBe('editare');
    expect(screen.queryByTestId('banner-readonly')).toBeNull();
    expect(e.locks.isHeld(id)).toBe(true);
  });
});

describe('Editor — doar-citire, preluarea controlului și conflicte', () => {
  it('proiect deschis în alt tab → doar-citire cu bannerul „Preia controlul”; după preluare devine editabil', async () => {
    const e = uiEnv();
    const id = await seedStudio(e);
    const holder = await e.newTab().manager.open(id);
    expect(holder.ok).toBe(true);
    query = `p=${id}`;
    renderWithRuntime(<EditorShell />, e.runtimeFor(e.tab));
    await screen.findByTestId('editor');
    const banner = screen.getByTestId('banner-readonly');
    expect(within(banner).getByText('Proiectul este deschis în alt tab')).toBeTruthy();
    expect(status()).toBe('readonly');
    expect(screen.getByTestId('mode').textContent).toBe('doar citire');
    expect((screen.getByTestId('rename') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('undo') as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(within(banner).getByRole('button', { name: 'Preia controlul' }));
    await waitFor(() => expect(screen.getByTestId('mode').textContent).toBe('editare'));
    expect(screen.queryByTestId('banner-readonly')).toBeNull();
    // fostul deținător a pierdut controlul
    if (holder.ok) await waitFor(() => expect(holder.value.getState().lockLost).toBe(true));
  });

  it('când alt tab preia controlul, editorul arată bannerul „controlul a fost preluat” și trece în doar-citire', async () => {
    const e = uiEnv();
    const id = await seedStudio(e);
    query = `p=${id}`;
    renderWithRuntime(<EditorShell />, e.runtimeFor(e.tab));
    await screen.findByTestId('editor');
    await e.newTab().manager.open(id, { takeOver: true });
    expect(await screen.findByTestId('banner-lock-lost')).toBeTruthy();
    await waitFor(() => expect(status()).toBe('readonly'));
  });

  async function conflictScenario(e: UiEnv) {
    const id = await seedStudio(e);
    query = `p=${id}`;
    const other = e.newTab();
    renderWithRuntime(<EditorShell />, e.runtimeFor(e.tab));
    await screen.findByTestId('editor');
    // alt scriitor (fără blocare: simulează concurența) salvează o revizie nouă
    await other.repo.rename(id, 'Din alt loc', e.clock.nowIso());
    await rename('Din tabul meu');
    await autosave(e);
    await waitFor(() => expect(status()).toBe('conflict'));
    return { id, other };
  }

  it('conflict de revizie: bannerul oferă cele trei variante; modificările locale rămân vizibile', async () => {
    const e = uiEnv();
    await conflictScenario(e);
    const banner = screen.getByTestId('banner-conflict');
    expect(within(banner).getByText('Proiectul a fost modificat în altă parte')).toBeTruthy();
    for (const label of [
      'Folosește versiunea salvată',
      'Păstrează modificările mele',
      'Salvează ca proiect nou',
      'Exportă copie',
    ]) {
      expect(within(banner).getByRole('button', { name: label })).toBeTruthy();
    }
    expect(screen.getByTestId('project-title').textContent).toBe('Din tabul meu');
  });

  it('„Folosește versiunea salvată” (cu confirmare) aruncă modificările locale', async () => {
    const e = uiEnv();
    await conflictScenario(e);
    await userEvent.click(
      within(screen.getByTestId('banner-conflict')).getByRole('button', {
        name: 'Folosește versiunea salvată',
      }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Renunț la modificările mele',
      }),
    );
    await waitFor(() => expect(status()).toBe('saved'));
    expect(screen.getByTestId('project-title').textContent).toBe('Din alt loc');
    expect(screen.queryByTestId('banner-conflict')).toBeNull();
  });

  it('„Păstrează modificările mele” înlocuiește versiunea salvată și o arhivează', async () => {
    const e = uiEnv();
    const { id } = await conflictScenario(e);
    await userEvent.click(
      within(screen.getByTestId('banner-conflict')).getByRole('button', {
        name: 'Păstrează modificările mele',
      }),
    );
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Înlocuiește' }),
    );
    await waitFor(() => expect(status()).toBe('saved'));
    const saved = await e.tab.repo.load(id);
    expect(saved.ok && saved.value.doc.name).toBe('Din tabul meu');
    expect((await e.tab.repo.listSnapshots(id)).map((s) => s.reason)).toEqual(['pre-overwrite']);
  });

  it('„Salvează ca proiect nou” creează o copie și oferă linkul către ea', async () => {
    const e = uiEnv();
    const { id } = await conflictScenario(e);
    await userEvent.click(
      within(screen.getByTestId('banner-conflict')).getByRole('button', {
        name: 'Salvează ca proiect nou',
      }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Salvează ca proiect nou' });
    expect((within(dialog).getByLabelText('Numele copiei') as HTMLInputElement).value).toBe(
      'Din tabul meu (copie)',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Creează copia' }));
    const outcome = await screen.findByTestId('banner-outcome');
    const href = within(outcome)
      .getByRole('link', { name: 'Deschide copia' })
      .getAttribute('href')!;
    expect(href).toMatch(/^\/editor\/\?p=/);
    const copyId = decodeURIComponent(href.split('p=')[1]!);
    const copy = await e.tab.repo.load(copyId);
    expect(copy.ok && copy.value.doc.name).toBe('Din tabul meu (copie)');
    const original = await e.tab.repo.load(id);
    expect(original.ok && original.value.doc.name).toBe('Din alt loc');
  });
});

describe('Editor — erori de stocare și copie de siguranță', () => {
  it('cotă plină: bannerul explică, modificările rămân, „Exportă copie” descarcă un fișier valid, „Reîncearcă” salvează', async () => {
    const e = uiEnv();
    const id = await seedStudio(e);
    query = `p=${id}`;
    renderWithRuntime(<EditorShell />, e.runtimeFor(e.tab));
    await screen.findByTestId('editor');
    vi.spyOn(e.tab.db.documents, 'put').mockRejectedValue(quotaError());
    await rename('Mai mult text');
    await autosave(e);
    await waitFor(() => expect(status()).toBe('error'));
    const banner = screen.getByTestId('banner-error');
    expect(within(banner).getByText('Spațiul de stocare este plin')).toBeTruthy();
    expect(within(banner).getByText(/Încercări: 1/)).toBeTruthy();
    expect(screen.getByTestId('project-title').textContent).toBe('Mai mult text'); // nimic nu s-a pierdut

    await userEvent.click(
      within(banner).getByRole('button', { name: 'Exportă copie de siguranță' }),
    );
    expect(downloads).toHaveLength(1);
    expect(downloads[0]!.name).toBe('mai-mult-text.roomcraft.json');
    const re = importProject(downloads[0]!.text);
    expect(re.ok && re.doc.name).toBe('Mai mult text');

    vi.restoreAllMocks();
    await userEvent.click(within(banner).getByRole('button', { name: 'Reîncearcă salvarea' }));
    await waitFor(() => expect(status()).toBe('saved'));
    expect(screen.queryByTestId('banner-error')).toBeNull();
    const list = await e.tab.manager.list();
    expect(list.ok && list.value[0]!.name).toBe('Mai mult text');
  });

  it('butonul „Exportă copie” din bară funcționează oricând', async () => {
    const e = uiEnv();
    const id = await seedStudio(e);
    query = `p=${id}`;
    renderWithRuntime(<EditorShell />, e.runtimeFor(e.tab));
    await screen.findByTestId('editor');
    await userEvent.click(screen.getByTestId('export-backup'));
    expect(downloads).toHaveLength(1);
    expect(downloads[0]!.name).toBe('studio.roomcraft.json');
    expect(JSON.parse(downloads[0]!.text).format).toBe('roomcraft');
  });
});
