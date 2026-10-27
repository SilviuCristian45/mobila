import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportProject } from '@/domain';
import { WebLockProvider, createLockProvider, NoLockProvider } from '@/persistence/locks';
import { getStorageInfo, requestPersistentStorage } from '@/persistence/storage-info';
import {
  FakeClock,
  FakeLockProvider,
  openTab,
  quotaError,
  uniqueDbName,
  type Tab,
} from '../helpers/env';
import { studioProject } from '../reference/projects';

const open: Array<() => void> = [];
afterEach(() => {
  vi.restoreAllMocks();
  open.splice(0).forEach((f) => f());
});
function env() {
  const clock = new FakeClock();
  const locks = new FakeLockProvider();
  const dbName = uniqueDbName();
  const newTab = (): Tab => {
    const t = openTab(dbName, { clock, locks });
    open.push(() => t.db.close());
    return t;
  };
  return { clock, locks, dbName, newTab, tab: newTab() };
}
const ok = <T, E>(r: { ok: true; value: T } | { ok: false; error: E }): T => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.value;
};

describe('gestionarul de proiecte: creare și listare', () => {
  it('creează proiecte goale valide, le listează (cele mai recente primele) și le deschide', async () => {
    const e = env();
    const a = ok(await e.tab.manager.create('Apartament'));
    await e.clock.advance(1000);
    const b = ok(await e.tab.manager.create('  Casă  '));
    const list = ok(await e.tab.manager.list());
    expect(list.map((p) => p.name)).toEqual(['Casă', 'Apartament']);
    expect(list.every((p) => p.revision === 1 && p.counts.rooms === 0)).toBe(true);
    const s = ok(await e.tab.manager.open(a.id));
    expect(s.getState()).toMatchObject({ status: 'saved', revision: 1, readOnly: false });
    expect(Object.keys(s.getState().doc.levels)).toEqual(['L1']);
    void b;
  });
  it('nume invalide (gol, prea lung) sunt refuzate, nimic nu se scrie', async () => {
    const e = env();
    for (const bad of ['', '   ', 'x'.repeat(201)]) {
      const r = await e.tab.manager.create(bad);
      expect(r).toMatchObject({ ok: false, error: { kind: 'invalid-name' } });
    }
    expect(ok(await e.tab.manager.list())).toEqual([]);
  });
  it('listarea unei baze indisponibile întoarce eroare tipată, nu aruncă', async () => {
    const e = env();
    e.tab.db.close();
    const r = await e.tab.manager.list();
    expect(r).toMatchObject({ ok: false, error: { kind: 'unavailable' } });
  });
  it('crearea cu cota plină: eroare „quota”, nimic parțial', async () => {
    const e = env();
    vi.spyOn(e.tab.db.documents, 'put').mockRejectedValue(quotaError());
    const r = await e.tab.manager.create('Plin');
    expect(r).toMatchObject({ ok: false, error: { kind: 'storage', error: { kind: 'quota' } } });
    vi.restoreAllMocks();
    expect(ok(await e.tab.manager.list())).toEqual([]);
  });
  it('deschiderea unui proiect inexistent → not-found; același proiect deschis de două ori în tab → aceeași sesiune', async () => {
    const e = env();
    expect(await e.tab.manager.open('nu-exista')).toMatchObject({
      ok: false,
      error: { kind: 'not-found' },
    });
    const { id } = ok(await e.tab.manager.create('P'));
    const s1 = ok(await e.tab.manager.open(id));
    const s2 = ok(await e.tab.manager.open(id));
    expect(s2).toBe(s1);
    expect(e.tab.manager.openSessions().size).toBe(1);
  });
});

describe('redenumire', () => {
  it('proiect închis: crește revizia; proiect deschis aici: trece prin sesiune (cu undo) și se salvează', async () => {
    const e = env();
    const { id } = ok(await e.tab.manager.create('A'));
    ok(await e.tab.manager.rename(id, 'B'));
    expect(ok(await e.tab.manager.list())[0]).toMatchObject({ name: 'B', revision: 2 });
    const s = ok(await e.tab.manager.open(id));
    ok(await e.tab.manager.rename(id, 'C'));
    expect(s.getState()).toMatchObject({ status: 'saved', revision: 3 });
    expect(s.getState().doc.name).toBe('C');
    expect(ok(await e.tab.manager.list())[0]!.name).toBe('C');
    s.undo();
    await s.flush();
    expect(ok(await e.tab.manager.list())[0]!.name).toBe('B');
  });
  it('redenumirea unui proiect închis, deschis în alt tab: tabul deschis primește conflict la următoarea salvare', async () => {
    const e = env();
    const { id } = ok(await e.tab.manager.create('A'));
    const tabB = e.newTab();
    const s = ok(await tabB.manager.open(id));
    ok(await e.tab.manager.rename(id, 'Redenumit din lista'));
    s.commit('x', (d) => {
      d.settings.gridMm = 50;
    });
    await s.flush();
    expect(s.getState().status).toBe('conflict');
    expect(ok(await e.tab.manager.list())[0]!.name).toBe('Redenumit din lista');
  });
  it('nume invalid, proiect inexistent', async () => {
    const e = env();
    const { id } = ok(await e.tab.manager.create('A'));
    expect(await e.tab.manager.rename(id, '')).toMatchObject({
      ok: false,
      error: { kind: 'invalid-name' },
    });
    expect(await e.tab.manager.rename('zzz', 'x')).toMatchObject({
      ok: false,
      error: { kind: 'not-found' },
    });
  });
  it('cota plină la redenumirea unui proiect deschis: eroare raportată, numele rămâne în memorie', async () => {
    const e = env();
    const { id } = ok(await e.tab.manager.create('A'));
    const s = ok(await e.tab.manager.open(id));
    vi.spyOn(e.tab.db.documents, 'put').mockRejectedValue(quotaError());
    const r = await e.tab.manager.rename(id, 'B');
    expect(r).toMatchObject({ ok: false, error: { kind: 'storage', error: { kind: 'quota' } } });
    expect(s.getState().doc.name).toBe('B');
    expect(s.getState().hasUnsavedChanges).toBe(true);
  });
});

describe('ștergere', () => {
  it('șterge proiectul deschis în acest tab (eliberează blocarea) și îl scoate din listă', async () => {
    const e = env();
    const { id } = ok(await e.tab.manager.create('A'));
    const s = ok(await e.tab.manager.open(id));
    expect(e.locks.isHeld(id)).toBe(true);
    ok(await e.tab.manager.remove(id));
    expect(s.getState().status).toBe('closed');
    expect(e.locks.isHeld(id)).toBe(false);
    expect(ok(await e.tab.manager.list())).toEqual([]);
    expect(e.tab.manager.openSessions().size).toBe(0);
  });
  it('refuză ștergerea unui proiect deschis în alt tab; după ce acolo se închide, reușește', async () => {
    const e = env();
    const { id } = ok(await e.tab.manager.create('A'));
    const tabB = e.newTab();
    const sB = ok(await tabB.manager.open(id));
    const r = await e.tab.manager.remove(id);
    expect(r).toMatchObject({ ok: false, error: { kind: 'open-elsewhere' } });
    expect(ok(await e.tab.manager.list())).toHaveLength(1);
    await sB.dispose();
    ok(await e.tab.manager.remove(id));
    expect(ok(await e.tab.manager.list())).toEqual([]);
  });
  it('ștergerea fără suport de blocare între taburi: celălalt tab află la următoarea salvare (conflict „deleted”)', async () => {
    const clock = new FakeClock();
    const dbName = uniqueDbName();
    const noLocks = new NoLockProvider();
    const a = openTab(dbName, { clock, locks: noLocks });
    const b = openTab(dbName, { clock, locks: noLocks });
    open.push(
      () => a.db.close(),
      () => b.db.close(),
    );
    const { id } = ok(await a.manager.create('A'));
    const sB = ok(await b.manager.open(id));
    ok(await a.manager.remove(id));
    sB.commit('x', (d) => {
      d.settings.gridMm = 50;
    });
    await sB.flush();
    expect(sB.getState()).toMatchObject({
      status: 'conflict',
      conflict: { kind: 'deleted' },
      hasUnsavedChanges: true,
    });
  });
});

describe('import', () => {
  const META = { exportedAt: '2026-10-27T12:00:00.000Z', appVersion: 'test' };
  it('proiect nou din fișier; la ID existent devine copie cu ID-uri noi; geometria și bugetul se păstrează', async () => {
    const e = env();
    const text = exportProject(studioProject(), META);
    const first = ok(await e.tab.manager.importFile(text));
    expect(first).toMatchObject({ id: 'studio', remapped: false });
    const second = ok(await e.tab.manager.importFile(text));
    expect(second.remapped).toBe(true);
    expect(second.id).not.toBe('studio');
    const list = ok(await e.tab.manager.list());
    expect(list).toHaveLength(2);
    const s = ok(await e.tab.manager.open(second.id));
    expect(Object.keys(s.getState().doc.walls).some((k) => k in studioProject().walls)).toBe(false);
  });
  it('fișiere invalide: respinse la etapa corectă, nimic nu se scrie', async () => {
    const e = env();
    expect(await e.tab.manager.importFile('{')).toMatchObject({
      ok: false,
      error: { stage: 'parse' },
    });
    expect(await e.tab.manager.importFile(JSON.stringify({ format: 'x' }))).toMatchObject({
      ok: false,
      error: { stage: 'envelope' },
    });
    const future = JSON.parse(exportProject(studioProject(), META));
    future.formatVersion = 9;
    expect(await e.tab.manager.importFile(JSON.stringify(future))).toMatchObject({
      ok: false,
      error: { stage: 'version' },
    });
    const broken = JSON.parse(exportProject(studioProject(), META));
    delete broken.project.walls.w4;
    expect(await e.tab.manager.importFile(JSON.stringify(broken))).toMatchObject({
      ok: false,
      error: { stage: 'integrity' },
    });
    expect(ok(await e.tab.manager.list())).toEqual([]);
  });
  it('cota plină la import: eroare „storage”, nimic parțial', async () => {
    const e = env();
    vi.spyOn(e.tab.db.documents, 'put').mockRejectedValue(quotaError());
    const r = await e.tab.manager.importFile(exportProject(studioProject(), META));
    expect(r).toMatchObject({ ok: false, error: { stage: 'storage' } });
    vi.restoreAllMocks();
    expect(ok(await e.tab.manager.list())).toEqual([]);
  });
  it('un import compatibil cu formatul înghețat v1 (fișierul din tests/fixtures) se încarcă ca proiect', async () => {
    const e = env();
    const { readFileSync } = await import('node:fs');
    const r = ok(
      await e.tab.manager.importFile(
        readFileSync('tests/fixtures/v1/studio.roomcraft.json', 'utf8'),
      ),
    );
    expect(r.id).toBe('studio');
  });
});

describe('Web Locks și informații despre stocare', () => {
  /** Implementare minimală a semanticii Web Locks (ifAvailable / steal / eliberare la finalul callback-ului). */
  function fakeLockManager() {
    const held = new Map<string, { reject: (e: Error) => void; done: () => void }>();
    return {
      held,
      request: (
        name: string,
        options: { ifAvailable?: boolean; steal?: boolean },
        cb: (lock: unknown) => Promise<unknown>,
      ) =>
        new Promise((resolve, reject) => {
          const current = held.get(name);
          if (current && options.ifAvailable) {
            void cb(null).then(resolve, reject);
            return;
          }
          if (current && options.steal)
            current.reject(Object.assign(new Error('stolen'), { name: 'AbortError' }));
          const entry = { reject, done: () => {} };
          held.set(name, entry);
          void cb({ name }).then(
            (v) => {
              if (held.get(name) === entry) held.delete(name);
              resolve(v);
            },
            (err) => {
              if (held.get(name) === entry) held.delete(name);
              reject(err);
            },
          );
        }),
    };
  }
  it('tryAcquire: primul reușește, al doilea primește null; după release se poate relua', async () => {
    const p = new WebLockProvider(fakeLockManager());
    const a = await p.tryAcquire('x');
    expect(a).not.toBeNull();
    expect(await p.tryAcquire('x')).toBeNull();
    await a!.release();
    expect(await p.tryAcquire('x')).not.toBeNull();
  });
  it('steal: deținătorul anterior este notificat (onLost), noul deținător primește blocarea', async () => {
    const p = new WebLockProvider(fakeLockManager());
    const a = (await p.tryAcquire('x'))!;
    const lost = vi.fn();
    a.onLost(lost);
    const b = await p.steal('x');
    await new Promise((r) => setTimeout(r, 0));
    expect(lost).toHaveBeenCalledTimes(1);
    expect(await p.tryAcquire('x')).toBeNull();
    await b.release();
    expect(await p.tryAcquire('x')).not.toBeNull();
  });
  it('un release propriu nu declanșează onLost', async () => {
    const p = new WebLockProvider(fakeLockManager());
    const a = (await p.tryAcquire('x'))!;
    const lost = vi.fn();
    a.onLost(lost);
    await a.release();
    await new Promise((r) => setTimeout(r, 0));
    expect(lost).not.toHaveBeenCalled();
  });
  it('fără navigator.locks se folosește NoLockProvider (nu blochează)', async () => {
    expect(createLockProvider(undefined)).toBeInstanceOf(NoLockProvider);
    expect(createLockProvider({})).toBeInstanceOf(NoLockProvider);
    expect(createLockProvider({ locks: fakeLockManager() })).toBeInstanceOf(WebLockProvider);
  });
  it('cererea de persistență și estimarea spațiului nu aruncă niciodată', async () => {
    expect(await requestPersistentStorage(undefined)).toBe(false);
    expect(
      await requestPersistentStorage({ persist: async () => true, persisted: async () => false }),
    ).toBe(true);
    expect(
      await requestPersistentStorage({
        persist: async () => {
          throw new Error('x');
        },
      }),
    ).toBe(false);
    expect(
      await getStorageInfo({
        persisted: async () => true,
        estimate: async () => ({ usage: 10, quota: 100 }),
      }),
    ).toEqual({ persisted: true, usageBytes: 10, quotaBytes: 100 });
    expect(
      await getStorageInfo({
        estimate: async () => {
          throw new Error('x');
        },
      }),
    ).toEqual({ persisted: null, usageBytes: null, quotaBytes: null });
    // regresie (Firefox): persist()/estimate() pot rămâne în așteptare nedefinit → rezultatul e limitat în timp
    const never = new Promise<never>(() => {});
    expect(await requestPersistentStorage({ persist: () => never }, 20)).toBe(false);
    expect(await getStorageInfo({ persisted: () => never, estimate: () => never }, 20)).toEqual({
      persisted: null,
      usageBytes: null,
      quotaBytes: null,
    });
    expect(await getStorageInfo(undefined)).toEqual({
      persisted: null,
      usageBytes: null,
      quotaBytes: null,
    });
  });
});

describe('deschidere concurentă, redeschidere imediată, inspecție și restaurare', () => {
  it('două deschideri simultane ale aceluiași proiect (ex. React StrictMode) primesc ACEEAȘI sesiune, editabilă', async () => {
    const e = env();
    const { id } = ok(await e.tab.manager.create('A'));
    const [r1, r2] = await Promise.all([e.tab.manager.open(id), e.tab.manager.open(id)]);
    expect(ok(r1)).toBe(ok(r2));
    expect(ok(r1).getState().readOnly).toBe(false);
    expect(e.tab.manager.openSessions().size).toBe(1);
  });

  it('redeschiderea imediat după dispose (fără a aștepta) așteaptă eliberarea blocării și rămâne editabilă', async () => {
    const e = env();
    const { id } = ok(await e.tab.manager.create('A'));
    const first = ok(await e.tab.manager.open(id));
    const closing = first.dispose();
    const second = ok(await e.tab.manager.open(id));
    await closing;
    expect(second).not.toBe(first);
    expect(second.getState()).toMatchObject({ readOnly: false, status: 'saved' });
    expect(e.locks.isHeld(id)).toBe(true);
  });

  it('inspect: valid → ok; document corupt → corrupt (fără a-l șterge sau bloca); inexistent → not-found', async () => {
    const e = env();
    const { id } = ok(await e.tab.manager.create('A'));
    expect(await e.tab.manager.inspect(id)).toMatchObject({ ok: true });
    await e.tab.db.documents.update(id, { data: { gunoi: 1 } });
    expect(await e.tab.manager.inspect(id)).toMatchObject({
      ok: false,
      error: { kind: 'corrupt', stage: 'schema' },
    });
    expect(e.locks.isHeld(id)).toBe(false);
    expect(await e.tab.db.documents.count()).toBe(1);
    expect(await e.tab.manager.inspect('zzz')).toMatchObject({
      ok: false,
      error: { kind: 'not-found' },
    });
  });

  it('restoreSnapshot: înlocuiește un document corupt cu o copie; proiectul se deschide apoi normal', async () => {
    const e = env();
    const { id } = ok(await e.tab.manager.create('Original'));
    const loaded = await e.tab.repo.load(id);
    if (!loaded.ok) throw new Error('load');
    await e.tab.repo.addSnapshot(
      { ...loaded.value.doc, name: 'Din copie' },
      'manual',
      e.clock.nowIso(),
    );
    await e.tab.db.documents.update(id, { data: { gunoi: 1 } });
    const [snap] = ok(await e.tab.manager.listSnapshots(id));
    ok(await e.tab.manager.restoreSnapshot(id, snap!.id));
    const s = ok(await e.tab.manager.open(id));
    expect(s.getState().doc.name).toBe('Din copie');
    expect(s.getState().revision).toBe(2);
    expect(e.locks.isHeld(id)).toBe(true); // blocarea de la restaurare s-a eliberat, apoi a luat-o sesiunea
  });

  it('restoreSnapshot pe un document valid îl arhivează întâi ca „pre-overwrite”', async () => {
    const e = env();
    const { id } = ok(await e.tab.manager.create('Curent'));
    const loaded = await e.tab.repo.load(id);
    if (!loaded.ok) throw new Error('load');
    await e.tab.repo.addSnapshot(
      { ...loaded.value.doc, name: 'Vechi' },
      'manual',
      e.clock.nowIso(),
    );
    const [snap] = ok(await e.tab.manager.listSnapshots(id));
    ok(await e.tab.manager.restoreSnapshot(id, snap!.id));
    const reasons = ok(await e.tab.manager.listSnapshots(id))
      .map((s) => s.reason)
      .sort();
    expect(reasons).toEqual(['manual', 'pre-overwrite']);
  });

  it('restoreSnapshot refuză proiectul deschis aici sau în alt tab, și o copie inexistentă', async () => {
    const e = env();
    const { id } = ok(await e.tab.manager.create('A'));
    const loaded = await e.tab.repo.load(id);
    if (!loaded.ok) throw new Error('load');
    await e.tab.repo.addSnapshot(loaded.value.doc, 'manual', e.clock.nowIso());
    const [snap] = ok(await e.tab.manager.listSnapshots(id));
    ok(await e.tab.manager.open(id));
    expect(await e.tab.manager.restoreSnapshot(id, snap!.id)).toMatchObject({
      ok: false,
      error: { kind: 'open-elsewhere' },
    });
    await e.tab.manager.closeAll();
    const other = e.newTab();
    ok(await other.manager.open(id));
    expect(await e.tab.manager.restoreSnapshot(id, snap!.id)).toMatchObject({
      ok: false,
      error: { kind: 'open-elsewhere' },
    });
    await other.manager.closeAll();
    expect(await e.tab.manager.restoreSnapshot(id, 'nu-exista')).toMatchObject({
      ok: false,
      error: { kind: 'not-found' },
    });
    expect(e.locks.isHeld(id)).toBe(false);
  });
});
