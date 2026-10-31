// Backup brut (docs/REMEDIATION_BATCH_1.md): datele din IndexedDB, exact așa cum sunt stocate, fără a modifica nimic.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeClock, FakeLockProvider, openTab, uniqueDbName } from '../helpers/env';
import { studioProject } from '../reference/projects';

const open: Array<() => void> = [];
afterEach(() => {
  vi.restoreAllMocks();
  open.splice(0).forEach((f) => f());
});
function env(extra?: Parameters<typeof openTab>[2]) {
  const clock = new FakeClock();
  const locks = new FakeLockProvider();
  const tab = openTab(uniqueDbName(), { clock, locks }, extra);
  open.push(() => tab.db.close());
  return { clock, locks, tab };
}
type Env = ReturnType<typeof env>;
const ok = <T, E>(r: { ok: true; value: T } | { ok: false; error: E }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};
const state = async (e: Env, id: string) => ({
  documents: await e.tab.db.documents.toArray(),
  projects: await e.tab.db.projects.toArray(),
  snapshots: await e.tab.db.snapshots.toArray(),
  document: await e.tab.db.documents.get(id),
});

describe('manager.exportRaw', () => {
  it('document „mai nou”, cu câmpuri necunoscute (și imbricate): textul reproduce exact datele stocate', async () => {
    const e = env();
    const { id } = ok(await e.tab.manager.create('Din viitor'));
    const row = await e.tab.db.documents.get(id);
    const newer = {
      ...(row!.data as object),
      schemaVersion: 99,
      camp_nou: { adanc: [1, 2, { x: 'ț' }], gol: null },
      alt_camp: 'ș',
    };
    await e.tab.db.documents.update(id, { data: newer });
    expect(await e.tab.manager.inspect(id)).toMatchObject({
      error: { kind: 'corrupt', stage: 'version' },
    });

    const out = ok(await e.tab.manager.exportRaw(id));

    expect(JSON.parse(out.text)).toEqual(newer); // aceeași structură, cu tot cu câmpurile necunoscute
    expect(out.text).toBe(JSON.stringify(newer, null, 2));
    expect(out.revision).toBe(row!.revision);
  });

  it('document invalid (nu se poate deschide): se exportă brutul, inclusiv ce nu respectă schema', async () => {
    const e = env();
    const { id } = ok(await e.tab.manager.create('Stricat'));
    const garbage = { gunoi: true, lista: [1, 'doi'], schemaVersion: 'x' };
    await e.tab.db.documents.update(id, { data: garbage });
    const out = ok(await e.tab.manager.exportRaw(id));
    expect(JSON.parse(out.text)).toEqual(garbage);
  });

  it('nu modifică nimic: documents, projects, snapshots și revizia sunt identice înainte și după', async () => {
    const e = env();
    const { id } = ok(await e.tab.manager.create('Nemodificat'));
    const loaded = await e.tab.repo.load(id);
    if (!loaded.ok) throw new Error('load');
    await e.tab.repo.addSnapshot(loaded.value.doc, 'manual', e.clock.nowIso());
    const row = await e.tab.db.documents.get(id);
    await e.tab.db.documents.update(id, { data: { ...(row!.data as object), schemaVersion: 99 } });
    const before = await state(e, id);

    ok(await e.tab.manager.exportRaw(id));
    ok(await e.tab.manager.exportRaw(id));

    expect(await state(e, id)).toEqual(before);
    expect(e.locks.isHeld(id)).toBe(false);
  });

  it('un document migrabil NU declanșează migrarea și nici copia „pre-migration” (citire pur brută)', async () => {
    const migrations = {
      0: (raw: Record<string, unknown>) => {
        const s = { ...(raw.settings as Record<string, unknown>) };
        s.defaultVatBp = Math.round(Number(s.vat) * 100);
        delete s.vat;
        return { ...raw, settings: s };
      },
    };
    const e = env({ parseOptions: { migrations } });
    const v0 = JSON.parse(JSON.stringify(studioProject()));
    v0.schemaVersion = 0;
    v0.settings.vat = 21;
    delete v0.settings.defaultVatBp;
    await e.tab.db.documents.put({ projectId: 'studio', revision: 4, data: v0 });
    const before = await state(e, 'studio');

    const out = ok(await e.tab.manager.exportRaw('studio'));

    expect(JSON.parse(out.text)).toEqual(v0); // nemigrat: tot `schemaVersion: 0` și `vat`
    expect(await state(e, 'studio')).toEqual(before);
    expect(before.snapshots).toHaveLength(0);
  });

  it('merge și cât proiectul e deschis în alt tab (doar citire, fără blocare)', async () => {
    const e = env();
    const { id } = ok(await e.tab.manager.create('Deschis'));
    ok(await e.tab.manager.open(id));
    const out = ok(await e.tab.manager.exportRaw(id));
    expect(JSON.parse(out.text)).toMatchObject({ id, name: 'Deschis' });
    expect(e.locks.isHeld(id)).toBe(true); // blocarea sesiunii rămâne a sesiunii
    await e.tab.manager.closeAll();
  });

  it('proiect inexistent → not-found; bază indisponibilă → eroare de stocare tipată, fără excepții', async () => {
    const e = env();
    expect(await e.tab.manager.exportRaw('nu-exista')).toMatchObject({
      ok: false,
      error: { kind: 'not-found' },
    });
    e.tab.db.close();
    expect(await e.tab.manager.exportRaw('orice')).toMatchObject({
      ok: false,
      error: { kind: 'storage' },
    });
  });
});

describe('repo.loadRaw', () => {
  it('întoarce rândul brut și revizia; null dacă nu există', async () => {
    const e = env();
    const { id } = ok(await e.tab.manager.create('A'));
    const row = await e.tab.db.documents.get(id);
    expect(await e.tab.repo.loadRaw(id)).toEqual({ data: row!.data, revision: row!.revision });
    expect(await e.tab.repo.loadRaw('zzz')).toBeNull();
  });
});
