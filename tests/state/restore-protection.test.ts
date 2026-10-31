// F-01 (docs/TECHNICAL_AUDIT.md): restaurarea nu are voie să distrugă un document pe care această versiune nu îl poate
// citi, și nu pierde datele brute ale unui document invalid.
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeClock, FakeLockProvider, openTab, quotaError, uniqueDbName } from '../helpers/env';

const open: Array<() => void> = [];
afterEach(() => {
  vi.restoreAllMocks();
  open.splice(0).forEach((f) => f());
});
function env() {
  const clock = new FakeClock();
  const locks = new FakeLockProvider();
  const tab = openTab(uniqueDbName(), { clock, locks });
  open.push(() => tab.db.close());
  return { clock, locks, tab };
}
type Env = ReturnType<typeof env>;
const ok = <T, E>(r: { ok: true; value: T } | { ok: false; error: E }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};

/** Un proiect valid + o copie manuală numită „Din copie”. */
async function withSnapshot(e: Env) {
  const { id } = ok(await e.tab.manager.create('Curent'));
  const loaded = await e.tab.repo.load(id);
  if (!loaded.ok) throw new Error('load');
  await e.tab.repo.addSnapshot(
    { ...loaded.value.doc, name: 'Din copie' },
    'manual',
    e.clock.nowIso(),
  );
  const [snap] = ok(await e.tab.manager.listSnapshots(id));
  return { id, snapId: snap!.id };
}
const state = async (e: Env, id: string) => ({
  document: await e.tab.db.documents.get(id),
  meta: await e.tab.db.projects.get(id),
  snapshots: await e.tab.db.snapshots.toArray(),
});
const rawDocument = async (e: Env, id: string) =>
  (await e.tab.db.documents.get(id))!.data as object;

describe('restoreSnapshot: documente pe care această versiune nu le poate citi', () => {
  it('document „mai nou” (schemaVersion > curentă, cu câmp necunoscut): refuzat; documents, meta și snapshots rămân identice', async () => {
    const e = env();
    const { id, snapId } = await withSnapshot(e);
    const newer = { ...(await rawDocument(e, id)), schemaVersion: 99, camp_nou: { date: 'UNICE' } };
    await e.tab.db.documents.update(id, { data: newer });
    expect(await e.tab.manager.inspect(id)).toMatchObject({
      ok: false,
      error: { kind: 'corrupt', stage: 'version' },
    });
    const before = await state(e, id);

    const r = await e.tab.manager.restoreSnapshot(id, snapId);

    expect(r).toMatchObject({ ok: false, error: { kind: 'incompatible' } });
    expect(!r.ok && 'message' in r.error && r.error.message).toMatch(/versiune mai nouă/);
    const after = await state(e, id);
    expect(after).toEqual(before); // nu s-a scris nimic
    expect(after.document!.data).toEqual(newer); // câmpul necunoscut e intact
    expect(after.snapshots.map((s) => s.reason)).toEqual(['manual']); // nicio copie nouă, originalul rămâne
    expect(e.locks.isHeld(id)).toBe(false);
  });

  it('versiune veche fără drum de migrare (stage „migrate”): refuzat, nimic modificat', async () => {
    const e = env();
    const { id, snapId } = await withSnapshot(e);
    await e.tab.db.documents.update(id, {
      data: { ...(await rawDocument(e, id)), schemaVersion: 0, camp_vechi: 1 },
    });
    expect(await e.tab.manager.inspect(id)).toMatchObject({
      error: { kind: 'corrupt', stage: 'migrate' },
    });
    const before = await state(e, id);
    expect(await e.tab.manager.restoreSnapshot(id, snapId)).toMatchObject({
      ok: false,
      error: { kind: 'incompatible' },
    });
    expect(await state(e, id)).toEqual(before);
  });

  it('copie ilizibilă (mai nouă / invalidă): refuzată explicit (nu „nu există”); proiectul și copia rămân neatinse', async () => {
    const e = env();
    const { id } = ok(await e.tab.manager.create('Curent'));
    const doc = await rawDocument(e, id);
    for (const [sid, data] of [
      ['s-nou', { ...doc, schemaVersion: 99 }],
      ['s-rau', { gunoi: true }],
    ] as const)
      await e.tab.db.snapshots.put({
        id: sid,
        projectId: id,
        createdAt: e.clock.nowIso(),
        reason: 'manual',
        schemaVersion: 1,
        data,
      });
    const before = await state(e, id);
    for (const sid of ['s-nou', 's-rau'])
      expect(await e.tab.manager.restoreSnapshot(id, sid)).toMatchObject({
        ok: false,
        error: { kind: 'incompatible' },
      });
    expect(await state(e, id)).toEqual(before);
  });
});

describe('restoreSnapshot: documente invalide (nu de altă versiune) și cazurile normale', () => {
  it('invalid: datele brute, cu câmpuri necunoscute, se arhivează ca „pre-overwrite” și apoi copia se restaurează', async () => {
    const e = env();
    const { id, snapId } = await withSnapshot(e);
    const damaged = { ...(await rawDocument(e, id)), camp_necunoscut: 'PĂSTREAZĂ-MĂ' }; // schemă strictă ⇒ „schema”
    await e.tab.db.documents.update(id, { data: damaged });
    expect(await e.tab.manager.inspect(id)).toMatchObject({
      error: { kind: 'corrupt', stage: 'schema' },
    });

    ok(await e.tab.manager.restoreSnapshot(id, snapId));

    const after = await state(e, id);
    const archived = after.snapshots.filter((s) => s.reason === 'pre-overwrite');
    expect(archived).toHaveLength(1);
    expect(archived[0]!.data).toEqual(damaged); // identic cu rândul brut, inclusiv câmpul necunoscut
    expect(archived[0]!.schemaVersion).toBe(1);
    expect(after.snapshots.some((s) => s.id === snapId)).toBe(true); // copia originală e păstrată
    expect(after.document).toMatchObject({ revision: 2, data: { name: 'Din copie' } });
    expect(after.meta).toMatchObject({ revision: 2, name: 'Din copie' });
    expect(ok(await e.tab.manager.inspect(id))).toBeDefined();
  });

  it('document invalid fără schemaVersion: brutul se arhivează cu schemaVersion 0, nu se pierde', async () => {
    const e = env();
    const { id, snapId } = await withSnapshot(e);
    await e.tab.db.documents.update(id, { data: { gunoi: 'x' } });
    ok(await e.tab.manager.restoreSnapshot(id, snapId));
    const archived = (await e.tab.db.snapshots.toArray()).filter(
      (s) => s.reason === 'pre-overwrite',
    );
    expect(archived).toHaveLength(1);
    expect(archived[0]).toMatchObject({ data: { gunoi: 'x' }, schemaVersion: 0 });
  });

  it('arhivarea e atomică cu suprascrierea: dacă arhivarea eșuează, documentul rămâne neschimbat', async () => {
    const e = env();
    const { id, snapId } = await withSnapshot(e);
    await e.tab.db.documents.update(id, { data: { gunoi: 1 } });
    const before = await state(e, id);
    vi.spyOn(e.tab.db.snapshots, 'put').mockRejectedValueOnce(quotaError());
    const r = await e.tab.manager.restoreSnapshot(id, snapId);
    expect(r).toMatchObject({ ok: false, error: { kind: 'storage' } });
    vi.restoreAllMocks();
    expect(await state(e, id)).toEqual(before);
  });

  it('conflict de revizie la restaurarea unui document invalid: nu se scrie nimic', async () => {
    const e = env();
    const { id, snapId } = await withSnapshot(e);
    await e.tab.db.documents.update(id, { data: { gunoi: 1 } });
    const before = await state(e, id);
    const real = e.tab.repo.load.bind(e.tab.repo);
    vi.spyOn(e.tab.repo, 'load').mockImplementationOnce(async (pid) => {
      const r = await real(pid);
      await e.tab.db.documents.update(id, { revision: 9 }); // altcineva scrie între citire și suprascriere
      return r;
    });
    const r = await e.tab.manager.restoreSnapshot(id, snapId);
    expect(r).toMatchObject({ ok: false, error: { kind: 'conflict' } });
    const after = await state(e, id);
    expect(after.document).toMatchObject({ revision: 9, data: { gunoi: 1 } });
    expect(after.snapshots).toEqual(before.snapshots);
  });

  it('document valid (caz normal): arhivat ca „pre-overwrite”, copia restaurată, revizia crește', async () => {
    const e = env();
    const { id, snapId } = await withSnapshot(e);
    const current = await rawDocument(e, id);
    ok(await e.tab.manager.restoreSnapshot(id, snapId));
    const after = await state(e, id);
    expect(after.document).toMatchObject({ revision: 2, data: { name: 'Din copie' } });
    const archived = after.snapshots.filter((s) => s.reason === 'pre-overwrite');
    expect(archived).toHaveLength(1);
    expect(archived[0]!.data).toMatchObject({ name: (current as { name: string }).name });
  });

  it('proiect inexistent (șters): copia se restaurează ca proiect nou', async () => {
    const e = env();
    const { id, snapId } = await withSnapshot(e);
    await e.tab.db.documents.delete(id);
    await e.tab.db.projects.delete(id);
    ok(await e.tab.manager.restoreSnapshot(id, snapId));
    expect(await e.tab.db.documents.get(id)).toMatchObject({
      revision: 1,
      data: { name: 'Din copie' },
    });
  });
});
