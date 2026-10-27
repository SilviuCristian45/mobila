import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RevisionConflictError, StorageError } from '@/persistence/errors';
import { SNAPSHOTS_KEPT } from '@/persistence/repository';
import { studioProject } from '../reference/projects';
import { FakeClock, FakeLockProvider, openTab, quotaError, uniqueDbName } from '../helpers/env';

const NOW = '2026-10-27T10:00:00.000Z';
const LATER = '2026-10-27T11:00:00.000Z';
const dbs: Array<{ close(): void }> = [];
const tab = (extra?: Parameters<typeof openTab>[2]) => {
  const t = openTab(
    uniqueDbName(),
    { clock: new FakeClock(), locks: new FakeLockProvider() },
    extra,
  );
  dbs.push(t.db);
  return t;
};
afterEach(() => {
  vi.restoreAllMocks();
  dbs.splice(0).forEach((d) => d.close());
});

describe('crearea, listarea și încărcarea proiectelor', () => {
  it('create → list → load: revizia 1, meta consistentă cu documentul', async () => {
    const { repo } = tab();
    const doc = studioProject();
    expect(await repo.create(doc, NOW)).toBe(1);
    const list = await repo.list();
    expect(list).toEqual([
      {
        id: 'studio',
        name: 'studio',
        createdAt: doc.createdAt,
        updatedAt: NOW,
        schemaVersion: 1,
        revision: 1,
        counts: { rooms: 2, objects: 2 },
      },
    ]);
    const loaded = await repo.load('studio');
    expect(loaded.ok && loaded.value.revision).toBe(1);
    expect(loaded.ok && loaded.value.doc).toEqual({ ...doc, updatedAt: NOW });
  });
  it('lista este ordonată după ultima modificare (cele mai recente primele)', async () => {
    const { repo } = tab();
    const a = { ...studioProject(), id: 'a', name: 'A' };
    const b = { ...studioProject(), id: 'b', name: 'B' };
    await repo.create(a, '2026-10-27T10:00:00.000Z');
    await repo.create(b, '2026-10-27T10:05:00.000Z');
    expect((await repo.list()).map((p) => p.id)).toEqual(['b', 'a']);
    await repo.save(a, 1, '2026-10-27T10:10:00.000Z');
    expect((await repo.list()).map((p) => p.id)).toEqual(['a', 'b']);
  });
  it('ID existent → RevisionConflictError(exists); nimic nu se modifică', async () => {
    const { repo } = tab();
    await repo.create(studioProject(), NOW);
    await expect(repo.create(studioProject(), LATER)).rejects.toMatchObject({
      name: 'RevisionConflictError',
      kind: 'exists',
    });
    expect((await repo.list())[0]!.updatedAt).toBe(NOW);
  });
  it('proiect inexistent → not-found', async () => {
    const { repo } = tab();
    expect(await repo.load('nu-exista')).toEqual({ ok: false, failure: { kind: 'not-found' } });
  });
});

describe('salvare cu concurență optimistă', () => {
  it('revizia crește la fiecare salvare; documentul și meta se scriu împreună', async () => {
    const { repo } = tab();
    const doc = studioProject();
    await repo.create(doc, NOW);
    const renamed = { ...doc, name: 'Nou' };
    expect(await repo.save(renamed, 1, LATER)).toBe(2);
    const [meta] = await repo.list();
    expect(meta).toMatchObject({ name: 'Nou', revision: 2, updatedAt: LATER });
    const loaded = await repo.load('studio');
    expect(loaded.ok && loaded.value.revision).toBe(2);
    expect(loaded.ok && loaded.value.doc.name).toBe('Nou');
  });
  it('revizie veche → conflict „changed”; proiect șters → conflict „deleted”', async () => {
    const { repo } = tab();
    const doc = studioProject();
    await repo.create(doc, NOW);
    await repo.save(doc, 1, NOW);
    await expect(repo.save(doc, 1, LATER)).rejects.toMatchObject({
      kind: 'changed',
      expected: 1,
      actual: 2,
    });
    await repo.remove('studio');
    await expect(repo.save(doc, 2, LATER)).rejects.toMatchObject({ kind: 'deleted' });
    expect(await repo.list()).toEqual([]);
  });
  it('două conexiuni (taburi): al doilea scriitor cu revizie veche este refuzat și nu suprascrie', async () => {
    const name = uniqueDbName();
    const shared = { clock: new FakeClock(), locks: new FakeLockProvider() };
    const a = openTab(name, shared);
    const b = openTab(name, shared);
    dbs.push(a.db, b.db);
    const doc = studioProject();
    await a.repo.create(doc, NOW);
    await a.repo.save({ ...doc, name: 'din A' }, 1, LATER);
    await expect(b.repo.save({ ...doc, name: 'din B' }, 1, LATER)).rejects.toBeInstanceOf(
      RevisionConflictError,
    );
    const loaded = await b.repo.load('studio');
    expect(loaded.ok && loaded.value.doc.name).toBe('din A');
  });
});

describe('redenumire și ștergere', () => {
  it('redenumirea este o modificare de document: crește revizia și actualizează documentul și meta', async () => {
    const { repo } = tab();
    await repo.create(studioProject(), NOW);
    expect(await repo.rename('studio', 'Apartament', LATER)).toBe(2);
    const loaded = await repo.load('studio');
    expect(loaded.ok && loaded.value.doc.name).toBe('Apartament');
    expect((await repo.list())[0]).toMatchObject({ name: 'Apartament', revision: 2 });
  });
  it('redenumirea unui proiect inexistent → conflict „deleted”', async () => {
    const { repo } = tab();
    await expect(repo.rename('zzz', 'x', NOW)).rejects.toMatchObject({ kind: 'deleted' });
  });
  it('ștergerea elimină documentul, meta și copiile de siguranță; este idempotentă', async () => {
    const { repo, db } = tab();
    const doc = studioProject();
    await repo.create(doc, NOW);
    await repo.addSnapshot(doc, 'manual', NOW);
    await repo.remove('studio');
    await repo.remove('studio');
    expect([
      await db.documents.count(),
      await db.projects.count(),
      await db.snapshots.count(),
    ]).toEqual([0, 0, 0]);
  });
});

describe('documente invalide în stocare: raportate controlat, nu șterse, nu blochează restul', () => {
  const putRaw = async (t: ReturnType<typeof tab>, id: string, data: unknown, revision = 3) => {
    await t.db.documents.put({ projectId: id, revision, data });
    await t.db.projects.put({
      id,
      name: id,
      createdAt: NOW,
      updatedAt: NOW,
      schemaVersion: 1,
      revision,
      counts: { rooms: 0, objects: 0 },
    });
  };
  it('schemă încălcată, referință ruptă, id diferit de cheie, cheie periculoasă, versiune mai nouă, nu e obiect', async () => {
    const t = tab();
    const good = JSON.parse(JSON.stringify(studioProject()));
    const cases: Array<[string, unknown, string]> = [
      ['nu-e-obiect', 'text', 'schema'],
      ['camp-lipsa', { ...good, id: 'camp-lipsa', settings: undefined }, 'schema'],
      [
        'mm-fractionar',
        {
          ...good,
          id: 'mm-fractionar',
          nodes: { ...good.nodes, n1: { ...good.nodes.n1, x: 0.5 } },
        },
        'schema',
      ],
      [
        'perete-lipsa',
        {
          ...good,
          id: 'perete-lipsa',
          walls: Object.fromEntries(Object.entries(good.walls).filter(([k]) => k !== 'w4')),
        },
        'integrity',
      ],
      ['alt-id', { ...good, id: 'altceva' }, 'integrity'],
      ['versiune-noua', { ...good, id: 'versiune-noua', schemaVersion: 2 }, 'version'],
      ['migrare-lipsa', { ...good, id: 'migrare-lipsa', schemaVersion: 0 }, 'migrate'],
    ];
    for (const [id, data] of cases) await putRaw(t, id, data);
    await putRaw(t, 'proto', JSON.parse('{"schemaVersion":1,"id":"proto","__proto__":{"x":1}}'));
    await t.repo.create(good, NOW);
    for (const [id, , stage] of cases) {
      const r = await t.repo.load(id);
      expect(r.ok, id).toBe(false);
      expect(!r.ok && r.failure.kind === 'corrupt' && r.failure.stage, id).toBe(stage);
      expect(!r.ok && r.failure.kind === 'corrupt' && r.failure.revision, id).toBe(3);
    }
    const proto = await t.repo.load('proto');
    expect(!proto.ok && proto.failure.kind === 'corrupt' && proto.failure.stage).toBe('schema');
    // nimic nu a fost șters, iar proiectul valid se încarcă în continuare
    expect(await t.db.documents.count()).toBe(cases.length + 2);
    expect((await t.repo.load('studio')).ok).toBe(true);
    expect((await t.repo.list()).length).toBe(cases.length + 2);
  });
});

describe('copii de siguranță (snapshots)', () => {
  it(`se păstrează ultimele ${SNAPSHOTS_KEPT}, cele mai noi primele; se pot încărca și valida`, async () => {
    const { repo } = tab();
    const doc = studioProject();
    await repo.create(doc, NOW);
    for (let i = 0; i < 8; i++)
      await repo.addSnapshot({ ...doc, name: `v${i}` }, 'auto', `2026-10-27T10:0${i}:00.000Z`);
    const list = await repo.listSnapshots('studio');
    expect(list).toHaveLength(SNAPSHOTS_KEPT);
    expect(list[0]!.createdAt).toBe('2026-10-27T10:07:00.000Z');
    const newest = await repo.loadSnapshot(list[0]!.id);
    expect(newest.ok && newest.value.doc.name).toBe('v7');
  });
  it('un snapshot corupt este raportat, nu aruncă', async () => {
    const { repo, db } = tab();
    await db.snapshots.put({
      id: 's1',
      projectId: 'studio',
      createdAt: NOW,
      reason: 'manual',
      schemaVersion: 1,
      data: { gunoi: true },
    });
    const r = await repo.loadSnapshot('s1');
    expect(!r.ok && r.failure.kind).toBe('corrupt');
  });
});

describe('migrarea la încărcare (registru injectat; formatul real v1 nu are încă migrări)', () => {
  it('v0 → v1: documentul se întoarce migrat, iar originalul brut se arhivează ca „pre-migration”', async () => {
    const migrations = {
      0: (raw: Record<string, unknown>) => {
        const s = { ...(raw.settings as Record<string, unknown>) };
        s.defaultVatBp = Math.round(Number(s.vat) * 100);
        delete s.vat;
        return { ...raw, settings: s };
      },
    };
    const t = tab({ parseOptions: { migrations } });
    const v0 = JSON.parse(JSON.stringify(studioProject()));
    v0.schemaVersion = 0;
    v0.settings.vat = 21;
    delete v0.settings.defaultVatBp;
    await t.db.documents.put({ projectId: 'studio', revision: 4, data: v0 });
    const r = await t.repo.load('studio');
    expect(r.ok && r.value.migratedFrom).toBe(0);
    expect(r.ok && r.value.doc.settings.defaultVatBp).toBe(2100);
    expect(r.ok && r.value.revision).toBe(4);
    const snaps = await t.repo.listSnapshots('studio');
    expect(snaps.map((s) => s.reason)).toEqual(['pre-migration']);
    expect(snaps[0]!.schemaVersion).toBe(0);
    // încărcarea unui snapshot nu creează alt snapshot
    await t.repo.loadSnapshot(snaps[0]!.id);
    expect(await t.repo.listSnapshots('studio')).toHaveLength(1);
  });
});

describe('erori de stocare: clasificate, atomice, fără stare parțială', () => {
  it('cotă depășită la salvare → StorageError(quota); tranzacția se anulează (nici documentul, nici meta nu se schimbă)', async () => {
    const { repo, db } = tab();
    const doc = studioProject();
    await repo.create(doc, NOW);
    vi.spyOn(db.documents, 'put').mockRejectedValueOnce(quotaError());
    const err = await repo.save({ ...doc, name: 'Nou' }, 1, LATER).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StorageError);
    expect((err as StorageError).failure.kind).toBe('quota');
    const loaded = await repo.load('studio');
    expect(loaded.ok && [loaded.value.revision, loaded.value.doc.name]).toEqual([1, 'studio']);
    expect((await repo.list())[0]).toMatchObject({ revision: 1, name: 'studio' });
  });
  it('eșec la a doua scriere din tranzacție (meta) → nici documentul nu rămâne scris (atomicitate)', async () => {
    const { repo, db } = tab();
    const doc = studioProject();
    await repo.create(doc, NOW);
    vi.spyOn(db.projects, 'put').mockRejectedValueOnce(new Error('boom'));
    await expect(repo.save({ ...doc, name: 'Nou' }, 1, LATER)).rejects.toBeInstanceOf(StorageError);
    const loaded = await repo.load('studio');
    expect(loaded.ok && [loaded.value.revision, loaded.value.doc.name]).toEqual([1, 'studio']);
  });
  it('baza închisă / indisponibilă → kind „unavailable”', async () => {
    const { repo, db } = tab();
    await repo.create(studioProject(), NOW);
    db.close();
    const err = await repo.list().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(StorageError);
    expect((err as StorageError).failure.kind).toBe('unavailable');
    const r = await repo.load('studio');
    expect(!r.ok && r.failure.kind === 'storage' && r.failure.error.kind).toBe('unavailable');
  });
});
