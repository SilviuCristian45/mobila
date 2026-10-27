// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { exportProject } from '@/domain';
import { Dashboard } from '@/features/projects/Dashboard';
import { RuntimeUnavailableError } from '@/lib/project-runtime/browser-runtime';
import type { ProjectManager } from '@/state/manager';
import { studioProject } from '../reference/projects';
import { renderWithRuntime, uiEnv, type UiEnv } from '../helpers/ui';

const META = { exportedAt: '2026-10-27T12:00:00.000Z', appVersion: 'test' };

async function seed(e: UiEnv, names: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const n of names) {
    const r = await e.tab.manager.create(n);
    if (!r.ok) throw new Error('seed');
    ids.push(r.value.id);
    await e.clock.advance(1000); // ordine stabilă după „ultima modificare”
  }
  return ids;
}
const cards = () => screen.queryAllByTestId('project-card');
const cardNamed = (name: string) => {
  const c = cards().find((x) => within(x).queryByTestId('project-name')?.textContent === name);
  if (!c) throw new Error(`card lipsă: ${name}`);
  return c;
};

describe('Dashboard — stări de încărcare și goală', () => {
  it('arată „se inițializează”, apoi lista goală cu apel la acțiune', async () => {
    const e = uiEnv();
    renderWithRuntime(<Dashboard />, e.runtimeFor(e.tab));
    expect(screen.getByText('Se inițializează stocarea locală…')).toBeTruthy();
    expect(await screen.findByTestId('empty-state')).toBeTruthy();
    expect(screen.getByText('Încă nu ai niciun proiect')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Creează primul proiect' })).toBeTruthy();
    expect(cards()).toHaveLength(0);
  });

  it('arată „se încarcă proiectele” cât timp lista nu a sosit', async () => {
    const e = uiEnv();
    let release!: (v: Awaited<ReturnType<ProjectManager['list']>>) => void;
    const pending = new Promise<Awaited<ReturnType<ProjectManager['list']>>>((r) => (release = r));
    const manager = { ...e.tab.manager, list: () => pending } as ProjectManager;
    renderWithRuntime(<Dashboard />, e.runtimeFor(e.tab, manager));
    expect(await screen.findByText('Se încarcă proiectele…')).toBeTruthy();
    release({ ok: true, value: [] });
    expect(await screen.findByTestId('empty-state')).toBeTruthy();
  });

  it('stocare indisponibilă la inițializare → mesaj clar, fără listă', async () => {
    const e = uiEnv();
    renderWithRuntime(<Dashboard />, async () => {
      throw new RuntimeUnavailableError({
        kind: 'unavailable',
        message: 'Browserul nu oferă IndexedDB.',
      });
    });
    const box = await screen.findByTestId('storage-unavailable');
    expect(within(box).getByText('Stocarea locală nu este disponibilă')).toBeTruthy();
    expect(within(box).getByText(/mod privat/)).toBeTruthy();
    expect(screen.queryByTestId('empty-state')).toBeNull();
    void e;
  });

  it('eroare la încărcarea listei → mesaj + „Reîncearcă”, care funcționează', async () => {
    const e = uiEnv();
    await seed(e, ['Casa']);
    const real = e.tab.manager.list;
    const list = vi
      .fn<ProjectManager['list']>()
      .mockResolvedValueOnce({ ok: false, error: { kind: 'unavailable', message: 'x' } })
      .mockImplementation(real);
    const manager = { ...e.tab.manager, list } as ProjectManager;
    renderWithRuntime(<Dashboard />, e.runtimeFor(e.tab, manager));
    const err = await screen.findByTestId('list-error');
    expect(within(err).getByText('Stocarea locală nu este disponibilă')).toBeTruthy();
    await userEvent.click(within(err).getByRole('button', { name: 'Reîncearcă' }));
    await waitFor(() => expect(cards()).toHaveLength(1));
    expect(screen.queryByTestId('list-error')).toBeNull();
  });

  it('cota plină la citire: mesaj specific', async () => {
    const e = uiEnv();
    const manager = {
      ...e.tab.manager,
      list: async () => ({ ok: false as const, error: { kind: 'quota' as const, message: 'q' } }),
    } as ProjectManager;
    renderWithRuntime(<Dashboard />, e.runtimeFor(e.tab, manager));
    expect(await screen.findByText('Spațiul de stocare este plin')).toBeTruthy();
  });
});

describe('Dashboard — listare și deschidere', () => {
  it('listează proiectele (cele mai recente primele) cu informațiile disponibile', async () => {
    const e = uiEnv();
    const text = exportProject(studioProject(), META);
    await e.tab.manager.importFile(text);
    await e.clock.advance(60_000);
    await seed(e, ['Vila']);
    renderWithRuntime(<Dashboard />, e.runtimeFor(e.tab));
    await waitFor(() => expect(cards()).toHaveLength(2));
    expect(cards().map((c) => within(c).getByTestId('project-name').textContent)).toEqual([
      'Vila',
      'studio',
    ]);
    const studio = cardNamed('studio');
    expect(within(studio).getByText(/2 camere · 2 obiecte/)).toBeTruthy();
    expect(within(studio).getByText(/Modificat:/)).toBeTruthy();
    expect(within(studio).getByText(/revizia 1 · format v1/)).toBeTruthy();
    expect(within(cardNamed('Vila')).getByText(/0 camere · 0 obiecte/)).toBeTruthy();
  });

  it('„Deschide” este un link către ruta editorului (navigare completă, compatibilă cu hostingul static)', async () => {
    const e = uiEnv();
    const [id] = await seed(e, ['Casa']);
    renderWithRuntime(<Dashboard />, e.runtimeFor(e.tab));
    await waitFor(() => expect(cards()).toHaveLength(1));
    const link = within(cards()[0]!).getByRole('link', { name: /Deschide/ });
    expect(link.getAttribute('href')).toBe(`/editor/?p=${id}`);
  });

  it('respectă basePath în linkuri', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/rc-test');
    const e = uiEnv();
    const [id] = await seed(e, ['Casa']);
    renderWithRuntime(<Dashboard />, e.runtimeFor(e.tab));
    await waitFor(() => expect(cards()).toHaveLength(1));
    expect(
      within(cards()[0]!)
        .getByRole('link', { name: /Deschide/ })
        .getAttribute('href'),
    ).toBe(`/rc-test/editor/?p=${id}`);
  });
});

describe('Dashboard — creare', () => {
  it('creează un proiect, cere stocare persistentă și navighează la editor', async () => {
    const e = uiEnv();
    renderWithRuntime(<Dashboard />, e.runtimeFor(e.tab));
    await screen.findByTestId('empty-state');
    await userEvent.click(screen.getByRole('button', { name: '+ Proiect nou' }));
    const dialog = screen.getByRole('dialog', { name: 'Proiect nou' });
    const input = within(dialog).getByLabelText('Numele proiectului') as HTMLInputElement;
    expect(input.value).toBe('Proiect nou');
    expect(document.activeElement).toBe(input); // focus în câmp
    await userEvent.clear(input);
    await userEvent.type(input, 'Apartament 3 camere');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Creează' }));
    await waitFor(() => expect(e.navigate).toHaveBeenCalledTimes(1));
    const list = await e.tab.manager.list();
    expect(list.ok && list.value.map((p) => p.name)).toEqual(['Apartament 3 camere']);
    expect(e.navigate).toHaveBeenCalledWith(`/editor/?p=${list.ok ? list.value[0]!.id : ''}`);
    expect(e.requestPersistence).toHaveBeenCalledTimes(1);
  });

  it('nume gol sau prea lung → eroare în dialog, nimic creat', async () => {
    const e = uiEnv();
    renderWithRuntime(<Dashboard />, e.runtimeFor(e.tab));
    await screen.findByTestId('empty-state');
    await userEvent.click(screen.getByRole('button', { name: '+ Proiect nou' }));
    const dialog = screen.getByRole('dialog');
    const input = within(dialog).getByLabelText('Numele proiectului');
    await userEvent.clear(input);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Creează' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Numele nu poate fi gol.');
    await userEvent.type(input, 'x'.repeat(201));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Creează' }));
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/cel mult 200/);
    expect(e.navigate).not.toHaveBeenCalled();
    const list = await e.tab.manager.list();
    expect(list.ok && list.value).toEqual([]);
  });

  it('eroare de stocare la creare → mesaj în dialog, dialogul rămâne deschis, fără navigare', async () => {
    const e = uiEnv();
    const manager = {
      ...e.tab.manager,
      create: async () => ({
        ok: false as const,
        error: { kind: 'storage' as const, error: { kind: 'quota' as const, message: 'q' } },
      }),
    } as ProjectManager;
    renderWithRuntime(<Dashboard />, e.runtimeFor(e.tab, manager));
    await screen.findByTestId('empty-state');
    await userEvent.click(screen.getByRole('button', { name: '+ Proiect nou' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Creează' }));
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(
      /Spațiul de stocare|Browserul nu mai are loc/,
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(e.navigate).not.toHaveBeenCalled();
  });

  it('dialogul se închide cu Escape și readuce focusul', async () => {
    const e = uiEnv();
    renderWithRuntime(<Dashboard />, e.runtimeFor(e.tab));
    await screen.findByTestId('empty-state');
    const opener = screen.getByRole('button', { name: '+ Proiect nou' });
    opener.focus();
    await userEvent.click(opener);
    expect(screen.getByRole('dialog')).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

describe('Dashboard — redenumire și ștergere', () => {
  it('redenumește: lista se actualizează, apare confirmarea', async () => {
    const e = uiEnv();
    await seed(e, ['Vechi']);
    renderWithRuntime(<Dashboard />, e.runtimeFor(e.tab));
    await waitFor(() => expect(cards()).toHaveLength(1));
    await userEvent.click(within(cards()[0]!).getByRole('button', { name: /Redenumește/ }));
    const dialog = screen.getByRole('dialog', { name: 'Redenumește proiectul' });
    const input = within(dialog).getByLabelText('Numele proiectului') as HTMLInputElement;
    expect(input.value).toBe('Vechi');
    await userEvent.clear(input);
    await userEvent.type(input, 'Nou');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Redenumește' }));
    await waitFor(() =>
      expect(within(cards()[0]!).getByTestId('project-name').textContent).toBe('Nou'),
    );
    expect(screen.getByTestId('notice').textContent).toContain('redenumit în „Nou”');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('redenumirea unui proiect șters între timp → mesaj, nu eroare necontrolată', async () => {
    const e = uiEnv();
    const [id] = await seed(e, ['A']);
    renderWithRuntime(<Dashboard />, e.runtimeFor(e.tab));
    await waitFor(() => expect(cards()).toHaveLength(1));
    await e.newTab().repo.remove(id!);
    await userEvent.click(within(cards()[0]!).getByRole('button', { name: /Redenumește/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Redenumește' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe('Proiectul nu mai există.');
  });

  it('ștergerea cere confirmare: „Anulează” păstrează proiectul, „Șterge definitiv” îl elimină', async () => {
    const e = uiEnv();
    await seed(e, ['De șters', 'De păstrat']);
    renderWithRuntime(<Dashboard />, e.runtimeFor(e.tab));
    await waitFor(() => expect(cards()).toHaveLength(2));
    await userEvent.click(within(cardNamed('De șters')).getByRole('button', { name: /Șterge/ }));
    let dialog = screen.getByRole('dialog', { name: 'Ștergi proiectul?' });
    expect(within(dialog).getByText(/„De șters” va fi șters definitiv/)).toBeTruthy();
    expect(within(dialog).getByText(/nu poate fi anulată/)).toBeTruthy();
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Anulează' })); // acțiunea sigură are focus
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anulează' }));
    expect(cards()).toHaveLength(2);

    await userEvent.click(within(cardNamed('De șters')).getByRole('button', { name: /Șterge/ }));
    dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Șterge definitiv' }));
    await waitFor(() => expect(cards()).toHaveLength(1));
    expect(within(cards()[0]!).getByTestId('project-name').textContent).toBe('De păstrat');
    expect(screen.getByTestId('notice').textContent).toContain('„De șters” a fost șters');
    const list = await e.tab.manager.list();
    expect(list.ok && list.value.map((p) => p.name)).toEqual(['De păstrat']);
  });

  it('ștergerea unui proiect deschis în alt tab este refuzată cu explicație; proiectul rămâne', async () => {
    const e = uiEnv();
    const [id] = await seed(e, ['Deschis altundeva']);
    const other = e.newTab();
    const opened = await other.manager.open(id!);
    expect(opened.ok).toBe(true);
    renderWithRuntime(<Dashboard />, e.runtimeFor(e.tab));
    await waitFor(() => expect(cards()).toHaveLength(1));
    await userEvent.click(within(cards()[0]!).getByRole('button', { name: /Șterge/ }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Șterge definitiv' }));
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/deschis în alt tab/);
    expect(cards()).toHaveLength(1);
  });
});

describe('Dashboard — proiecte invalide', () => {
  async function corrupt(e: UiEnv, id: string) {
    await e.tab.db.documents.update(id, { data: { gunoi: true } });
  }

  it('un document invalid apare marcat, cu explicație, fără „Deschide”; celelalte rămân utilizabile', async () => {
    const e = uiEnv();
    const [bad] = await seed(e, ['Stricat', 'Bun']);
    await corrupt(e, bad!);
    renderWithRuntime(<Dashboard />, e.runtimeFor(e.tab));
    await waitFor(() => expect(cards()).toHaveLength(2));
    const badCard = cardNamed('Stricat');
    await waitFor(() => expect(within(badCard).getByTestId('project-invalid')).toBeTruthy());
    expect(within(badCard).getByText('Invalid')).toBeTruthy();
    expect(within(badCard).getByText('Proiectul este invalid')).toBeTruthy();
    expect(within(badCard).queryByRole('link', { name: /Deschide/ })).toBeNull();
    expect(within(badCard).getByRole('button', { name: /Restaurează o copie/ })).toBeTruthy();
    const good = cardNamed('Bun');
    await waitFor(() => expect(within(good).queryByText('Se verifică…')).toBeNull());
    expect(within(good).getByRole('link', { name: /Deschide/ })).toBeTruthy();
  });

  it('restaurare dintr-o copie de siguranță: proiectul redevine valid', async () => {
    const e = uiEnv();
    const [id] = await seed(e, ['Recuperabil']);
    const loaded = await e.tab.repo.load(id!);
    if (!loaded.ok) throw new Error('load');
    await e.tab.repo.addSnapshot(
      { ...loaded.value.doc, name: 'Din copie' },
      'manual',
      e.clock.nowIso(),
    );
    await corrupt(e, id!);
    renderWithRuntime(<Dashboard />, e.runtimeFor(e.tab));
    await waitFor(() => expect(within(cards()[0]!).getByTestId('project-invalid')).toBeTruthy());
    await userEvent.click(within(cards()[0]!).getByRole('button', { name: /Restaurează o copie/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Restaurează o copie de siguranță' });
    const list = await within(dialog).findByRole('list', { name: 'Copii de siguranță' });
    expect(within(list).getByText(/manuală/)).toBeTruthy();
    await userEvent.click(within(list).getByRole('button', { name: 'Restaurează' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() =>
      expect(within(cards()[0]!).getByTestId('project-name').textContent).toBe('Din copie'),
    );
    await waitFor(() => expect(within(cards()[0]!).queryByTestId('project-invalid')).toBeNull());
    expect(within(cards()[0]!).getByRole('link', { name: /Deschide/ })).toBeTruthy();
  });

  it('fără copii de siguranță: explicație clară; proiectul poate fi șters', async () => {
    const e = uiEnv();
    const [id] = await seed(e, ['Fără copii']);
    await corrupt(e, id!);
    renderWithRuntime(<Dashboard />, e.runtimeFor(e.tab));
    await waitFor(() => expect(within(cards()[0]!).getByTestId('project-invalid')).toBeTruthy());
    await userEvent.click(within(cards()[0]!).getByRole('button', { name: /Restaurează o copie/ }));
    expect(await screen.findByTestId('no-snapshots')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Închide' }));
    await userEvent.click(within(cards()[0]!).getByRole('button', { name: /Șterge/ }));
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Șterge definitiv' }),
    );
    await waitFor(() => expect(screen.getByTestId('empty-state')).toBeTruthy());
  });
});
