import 'fake-indexeddb/auto';
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { importProject } from '@/domain';
import { removeObject, setLineOverride } from '@/domain/cascade';
import { computeBudget } from '@/domain/budget';
import type { ProjectDocument } from '@/domain/schema';
import { createProjectSession, type ProjectSession, type SessionState } from '@/state/session';
import { attachLifecycle } from '@/state/lifecycle';
import { selectBudget, selectGeometry, selectScene } from '@/state/selectors';
import {
  FakeClock,
  FakeLockProvider,
  openTab,
  quotaError,
  settle,
  uniqueDbName,
  type Tab,
} from '../helpers/env';
import { studioProject } from '../reference/projects';

const META = { exportedAt: '2026-10-27T12:00:00.000Z', appVersion: 'test' };
const open: Array<() => void> = [];
afterEach(() => {
  vi.restoreAllMocks();
  open.splice(0).forEach((f) => f());
});

interface Env {
  clock: FakeClock;
  locks: FakeLockProvider;
  tab: Tab;
  dbName: string;
  newTab: () => Tab;
}
function env(): Env {
  const clock = new FakeClock();
  const locks = new FakeLockProvider();
  const dbName = uniqueDbName();
  const newTab = () => {
    const t = openTab(dbName, { clock, locks });
    open.push(() => t.db.close());
    return t;
  };
  return { clock, locks, dbName, tab: newTab(), newTab };
}
/** Creează în stocare proiectul de referință și deschide o sesiune. */
async function openStudio(e: Env, t: Tab = e.tab): Promise<ProjectSession> {
  if (!(await t.repo.list()).some((p) => p.id === 'studio'))
    await t.repo.create(studioProject(), e.clock.nowIso());
  const r = await t.manager.open('studio');
  if (!r.ok) throw new Error(`open: ${JSON.stringify(r.error)}`);
  return r.value;
}
const moveSofa = (s: ProjectSession, x: number) =>
  s.commit('mută canapea', (d) => {
    d.objects.oSofa!.position.x = x;
  });
const stored = async (t: Tab) => {
  const r = await t.repo.load('studio');
  if (!r.ok) throw new Error('load');
  return r.value;
};
const statuses = (s: ProjectSession) => {
  const seen: string[] = [s.getState().status];
  s.subscribe((st) => {
    if (seen[seen.length - 1] !== st.status) seen.push(st.status);
  });
  return seen;
};

describe('autosave și indicatori de stare', () => {
  it('modificare → „dirty” → după debounce „saving” → „saved”; stocarea = memoria', async () => {
    const e = env();
    const s = await openStudio(e);
    const seen = statuses(s);
    expect(s.getState()).toMatchObject({ status: 'saved', hasUnsavedChanges: false, revision: 1 });
    expect(moveSofa(s, 1500)).toEqual({ ok: true, changed: true });
    expect(s.getState()).toMatchObject({ status: 'dirty', hasUnsavedChanges: true });
    await e.clock.advance(799);
    expect(s.getState().status).toBe('dirty'); // încă în fereastra de debounce
    await e.clock.advance(1);
    await s.flush();
    expect(seen).toEqual(['saved', 'dirty', 'saving', 'saved']);
    const st = s.getState();
    expect(st).toMatchObject({ status: 'saved', revision: 2, hasUnsavedChanges: false });
    expect(st.lastSavedAt).toBe(e.clock.nowIso());
    const r = await stored(e.tab);
    expect(r.revision).toBe(2);
    expect(r.doc.objects.oSofa!.position.x).toBe(1500);
    expect(r.doc).toEqual(st.doc); // inclusiv updatedAt (aliniat în memorie fără a intra în istoric)
  });
  it('proiect nou (revizia 0) se creează la primul autosave', async () => {
    const e = env();
    const s = createProjectSession({
      doc: studioProject(),
      revision: 0,
      repository: e.tab.repo,
      clock: e.clock,
    });
    expect(s.getState().status).toBe('dirty');
    await e.clock.advance(800);
    await s.flush();
    expect(s.getState()).toMatchObject({ status: 'saved', revision: 1 });
    expect((await e.tab.repo.list()).map((p) => p.id)).toEqual(['studio']);
  });
  it('rafală de 30 de modificări la 100 ms → cel mult 2 salvări; apoi starea finală este în stocare', async () => {
    const e = env();
    const s = await openStudio(e);
    const save = vi.spyOn(e.tab.repo, 'save');
    for (let i = 0; i < 30; i++) {
      moveSofa(s, 1000 + i);
      await e.clock.advance(100);
    }
    await e.clock.advance(800);
    await s.flush();
    expect(save.mock.calls.length).toBeLessThanOrEqual(2);
    expect((await stored(e.tab)).doc.objects.oSofa!.position.x).toBe(1029);
  });
  it('maxWait: editare continuă mai mult de 5 s tot produce salvări intermediare', async () => {
    const e = env();
    const s = await openStudio(e);
    const save = vi.spyOn(e.tab.repo, 'save');
    for (let i = 0; i < 80; i++) {
      moveSofa(s, 1000 + i);
      await e.clock.advance(100);
    }
    await s.flush();
    expect(save.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
  it('modificări în timpul unei salvări în curs nu se pierd (single-flight, ultimul câștigă)', async () => {
    const e = env();
    const s = await openStudio(e);
    moveSofa(s, 1500);
    const p = s.flush();
    moveSofa(s, 1800); // în timpul salvării
    await p;
    await s.flush();
    expect((await stored(e.tab)).doc.objects.oSofa!.position.x).toBe(1800);
    expect(s.getState().status).toBe('saved');
  });
  it('flush explicit salvează imediat, fără a aștepta debounce-ul', async () => {
    const e = env();
    const s = await openStudio(e);
    moveSofa(s, 1500);
    await s.flush();
    expect((await stored(e.tab)).doc.objects.oSofa!.position.x).toBe(1500);
    expect(e.clock.pendingTimers).toBe(0);
  });
  it('copie de siguranță automată doar după 10 min de editare', async () => {
    const e = env();
    const s = await openStudio(e);
    moveSofa(s, 1500);
    await s.flush();
    expect(await e.tab.repo.listSnapshots('studio')).toHaveLength(0);
    await e.clock.advance(10 * 60 * 1000);
    moveSofa(s, 1600);
    await s.flush();
    await settle();
    expect((await e.tab.repo.listSnapshots('studio')).map((x) => x.reason)).toEqual(['auto']);
  });
});

describe('undo / redo', () => {
  it('etichete, indicatori, un pas per operație; refacerea se golește după o modificare nouă', async () => {
    const e = env();
    const s = await openStudio(e);
    expect(s.getState()).toMatchObject({ canUndo: false, canRedo: false, historySize: 0 });
    s.commit('A', (d) => {
      d.objects.oSofa!.position.x = 1;
    });
    s.commit('B', (d) => {
      d.objects.oSofa!.position.x = 2;
    });
    expect(s.getState()).toMatchObject({ canUndo: true, undoLabel: 'B', historySize: 2 });
    expect(s.undo()).toBe(true);
    expect(s.getState()).toMatchObject({ canRedo: true, redoLabel: 'B', undoLabel: 'A' });
    expect(s.getState().doc.objects.oSofa!.position.x).toBe(1);
    s.commit('C', (d) => {
      d.objects.oSofa!.position.x = 3;
    });
    expect(s.getState().canRedo).toBe(false);
    expect(s.redo()).toBe(false);
    expect(s.undo() && s.undo()).toBe(true);
    expect(s.undo()).toBe(false);
    expect(s.getState().doc.objects.oSofa!.position.x).toBe(1200);
  });
  it('istoricul este limitat la 100 de pași', async () => {
    const e = env();
    const s = await openStudio(e);
    for (let i = 0; i < 130; i++) moveSofa(s, 2000 + i);
    expect(s.getState().historySize).toBe(100);
    let n = 0;
    while (s.undo()) n++;
    expect(n).toBe(100);
    expect(s.getState().doc.objects.oSofa!.position.x).toBe(2029); // starea de după pasul 30
  });
  it('undo și redo declanșează autosave; stocarea urmărește exact memoria', async () => {
    const e = env();
    const s = await openStudio(e);
    moveSofa(s, 1500);
    moveSofa(s, 1800);
    await s.flush();
    s.undo();
    await s.flush();
    expect((await stored(e.tab)).doc.objects.oSofa!.position.x).toBe(1500);
    s.undo();
    await s.flush();
    expect((await stored(e.tab)).doc.objects.oSofa!.position.x).toBe(1200);
    s.redo();
    await e.clock.advance(800);
    await s.flush();
    expect((await stored(e.tab)).doc.objects.oSofa!.position.x).toBe(1500);
  });
  it('salvarea (updatedAt) nu intră în istoric: după salvare, undo funcționează și păstrează updatedAt-ul salvat', async () => {
    const e = env();
    const s = await openStudio(e);
    moveSofa(s, 1500);
    await e.clock.advance(5000);
    await s.flush();
    const savedAt = s.getState().doc.updatedAt;
    expect(s.getState().historySize).toBe(1);
    s.undo();
    expect(s.getState().doc.updatedAt).toBe(savedAt);
    expect(s.getState().doc.objects.oSofa!.position.x).toBe(1200);
  });
  it('ȘTERGERE + curățarea suprascrierii = UN pas; undo restabilește obiectul ȘI prețul editat; bugetul revine identic', async () => {
    const e = env();
    const s = await openStudio(e);
    const before = computeBudget(s.getState().doc);
    expect(s.apply('șterge lustra', (d) => removeObject(d, 'oLamp')).ok).toBe(true);
    const mid = s.getState().doc;
    expect(mid.objects.oLamp).toBeUndefined();
    expect(mid.budget.overrides['object:oLamp']).toBeUndefined();
    expect(s.getState().historySize).toBe(1);
    s.undo();
    const back = s.getState().doc;
    expect(back.objects.oLamp).toBeDefined();
    expect(back.budget.overrides['object:oLamp']?.unitPriceMinor).toBe(25000);
    expect(computeBudget(back)).toEqual(before);
    await s.flush();
    expect((await stored(e.tab)).doc.budget.overrides['object:oLamp']?.unitPriceMinor).toBe(25000);
  });
  it('apply: patch-uri fine (câte o intrare), nu înlocuirea întregului document', async () => {
    const e = env();
    const s = await openStudio(e);
    const before = s.getState().doc;
    s.apply('preț canapea', (d) => setLineOverride(d, 'object:oSofa', { unitPriceMinor: 199900 }));
    const after = s.getState().doc;
    expect(after.nodes).toBe(before.nodes); // părți neschimbate: aceeași referință
    expect(after.walls).toBe(before.walls);
    expect(after.budget.overrides['object:oSofa']).toEqual({ unitPriceMinor: 199900 });
    expect(after.budget.overrides['object:oLamp']).toBe(before.budget.overrides['object:oLamp']);
  });
  it('apply cu o operație care eșuează → respins, fără efect', async () => {
    const e = env();
    const s = await openStudio(e);
    const r = s.apply('nimic', (d) => removeObject(d, 'nu-exista'));
    expect(r).toMatchObject({ ok: false, reason: 'recipe-error' });
    expect(s.getState().historySize).toBe(0);
    expect(s.getState().status).toBe('saved');
  });
  it('redenumirea este o modificare de document, cu undo', async () => {
    const e = env();
    const s = await openStudio(e);
    s.rename('Apartament');
    await s.flush();
    expect((await e.tab.repo.list())[0]!.name).toBe('Apartament');
    s.undo();
    await s.flush();
    expect((await e.tab.repo.list())[0]!.name).toBe('studio');
  });
  it('proprietate: orice secvență de modificări/undo/redo — undo complet = starea inițială, redo complet = starea finală, iar stocarea = memoria', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.oneof(
            fc.record({ t: fc.constant('move' as const), x: fc.integer({ min: 0, max: 5000 }) }),
            fc.constant({ t: 'undo' as const }),
            fc.constant({ t: 'redo' as const }),
          ),
          { maxLength: 25 },
        ),
        async (ops) => {
          const e = env();
          const s = await openStudio(e);
          const initial = s.getState().doc;
          for (const op of ops) {
            if (op.t === 'move') moveSofa(s, op.x);
            else if (op.t === 'undo') s.undo();
            else s.redo();
          }
          const finalX = s.getState().doc.objects.oSofa!.position.x;
          await s.flush();
          expect((await stored(e.tab)).doc.objects.oSofa!.position.x).toBe(finalX);
          // vârful istoricului liniar: refacem tot, apoi anulăm tot și refacem tot
          while (s.redo());
          const tip = s.getState().doc;
          while (s.undo());
          expect(s.getState().doc.objects).toEqual(initial.objects);
          while (s.redo());
          expect(s.getState().doc).toEqual(tip);
          e.tab.db.close();
        },
      ),
      { numRuns: 25 },
    );
  });
});

describe('modificări respinse (documente invalide)', () => {
  it('o modificare care produce document invalid este respinsă integral: stare, istoric și stocare neschimbate', async () => {
    const e = env();
    const s = await openStudio(e);
    const before = s.getState();
    const bad: Array<[string, (d: ProjectDocument) => void]> = [
      [
        'perete lipsă',
        (d) => {
          delete d.walls.w4;
        },
      ],
      [
        'nod inexistent',
        (d) => {
          d.walls.w1!.endNodeId = 'zzz';
        },
      ],
      [
        'grosime impară',
        (d) => {
          d.walls.w1!.thicknessMm = 75;
        },
      ],
      [
        'gol în afara peretelui',
        (d) => {
          d.openings.oDoor!.offsetMm = 50;
        },
      ],
      [
        'item lipsă',
        (d) => {
          d.objects.oSofa!.catalogItemId = 'nu.exista';
        },
      ],
      [
        'mm fracționari',
        (d) => {
          d.nodes.n1!.x = 0.5;
        },
      ],
      [
        'suprascriere orfană',
        (d) => {
          d.budget.overrides['object:fantoma'] = { excluded: true };
        },
      ],
    ];
    for (const [name, mutate] of bad) {
      const r = s.commit(name, (d) => mutate(d as ProjectDocument));
      expect(r.ok, name).toBe(false);
      expect(!r.ok && r.reason, name).toBe('invalid');
      expect(!r.ok && (r.errors?.length ?? 0) > 0, name).toBe(true);
    }
    expect(s.getState().doc).toBe(before.doc);
    expect(s.getState()).toMatchObject({
      status: 'saved',
      historySize: 0,
      hasUnsavedChanges: false,
    });
    await e.clock.advance(5000);
    expect((await stored(e.tab)).revision).toBe(1);
  });
  it('o rețetă care aruncă este raportată, nu propagată', async () => {
    const e = env();
    const s = await openStudio(e);
    const r = s.commit('x', () => {
      throw new Error('boom');
    });
    expect(r).toMatchObject({ ok: false, reason: 'recipe-error', message: 'boom' });
    expect(s.commit('nimic', () => {})).toEqual({ ok: true, changed: false });
    expect(s.getState().historySize).toBe(0);
  });
});

describe('erori de stocare și cotă depășită — fără pierdere silențioasă', () => {
  it('cotă depășită: „error”, modificările rămân în memorie, backup exportabil; după eliberarea spațiului, reîncercarea salvează', async () => {
    const e = env();
    const s = await openStudio(e);
    const put = vi.spyOn(e.tab.db.documents, 'put').mockRejectedValue(quotaError());
    moveSofa(s, 1500);
    await s.flush();
    const st = s.getState();
    expect(st.status).toBe('error');
    expect(st.error).toMatchObject({ kind: 'quota', attempts: 1 });
    expect(st.error!.message).toMatch(/plin/);
    expect(st).toMatchObject({ hasUnsavedChanges: true, revision: 1 });
    expect(st.doc.objects.oSofa!.position.x).toBe(1500); // în memorie
    // copia de siguranță funcționează fără stocare și se poate reimporta
    const backup = s.exportBackup(META);
    const re = importProject(backup);
    expect(re.ok && re.doc.objects.oSofa!.position.x).toBe(1500);
    // utilizatorul continuă să lucreze; undo funcționează
    moveSofa(s, 1700);
    expect(s.undo()).toBe(true);
    // „spațiu eliberat”
    put.mockRestore();
    await s.retrySave();
    expect(s.getState()).toMatchObject({
      status: 'saved',
      error: null,
      hasUnsavedChanges: false,
      revision: 2,
    });
    expect((await stored(e.tab)).doc.objects.oSofa!.position.x).toBe(1500);
  });
  it('reîncercări automate cu întârzieri crescătoare (2 s, 5 s, 15 s…) și contor de încercări; „since” rămâne al primei erori', async () => {
    const e = env();
    const s = await openStudio(e);
    vi.spyOn(e.tab.db.documents, 'put').mockRejectedValue(quotaError());
    const save = vi.spyOn(e.tab.repo, 'save');
    moveSofa(s, 1500);
    await s.flush();
    const since = s.getState().error!.since;
    expect(save).toHaveBeenCalledTimes(1);
    await e.clock.advance(1999);
    expect(save).toHaveBeenCalledTimes(1);
    await e.clock.advance(1); // timerul rulează salvarea; nu apelăm flush() (ar fi o încercare în plus)
    await settle();
    expect(save).toHaveBeenCalledTimes(2);
    expect(s.getState().error).toMatchObject({ attempts: 2, since });
    await e.clock.advance(5000);
    await settle();
    expect(save).toHaveBeenCalledTimes(3);
    await e.clock.advance(15000);
    await settle();
    expect(save).toHaveBeenCalledTimes(4);
    expect(s.getState().hasUnsavedChanges).toBe(true);
    expect(s.getState().doc.objects.oSofa!.position.x).toBe(1500);
  });
  it('reîncercarea automată reușește de la sine când stocarea revine', async () => {
    const e = env();
    const s = await openStudio(e);
    const put = vi.spyOn(e.tab.db.documents, 'put').mockRejectedValueOnce(quotaError());
    moveSofa(s, 1500);
    await s.flush();
    expect(s.getState().status).toBe('error');
    await e.clock.advance(2000);
    await s.flush();
    expect(put).toHaveBeenCalledTimes(2);
    expect(s.getState()).toMatchObject({ status: 'saved', error: null });
  });
  it('bază indisponibilă („unavailable”) și erori necunoscute sunt clasificate distinct', async () => {
    const e = env();
    const s = await openStudio(e);
    e.tab.db.close();
    moveSofa(s, 1500);
    await s.flush();
    expect(s.getState().error?.kind).toBe('unavailable');
    expect(s.getState().hasUnsavedChanges).toBe(true);
    const e2 = env();
    const s2 = await openStudio(e2);
    vi.spyOn(e2.tab.db.documents, 'put').mockRejectedValue(new Error('ceva neprevăzut'));
    moveSofa(s2, 1500);
    await s2.flush();
    expect(s2.getState().error).toMatchObject({ kind: 'storage', message: 'ceva neprevăzut' });
  });
  it('o salvare eșuată nu atinge copia de pe disc (revizia și documentul rămân cele vechi)', async () => {
    const e = env();
    const s = await openStudio(e);
    vi.spyOn(e.tab.db.documents, 'put').mockRejectedValue(quotaError());
    moveSofa(s, 1500);
    await s.flush();
    vi.restoreAllMocks();
    const r = await stored(e.tab);
    expect([r.revision, r.doc.objects.oSofa!.position.x]).toEqual([1, 1200]);
  });
  it('dispose cu eroare de stocare: saved=false, blocarea se eliberează, modificările nu se pretind salvate', async () => {
    const e = env();
    const s = await openStudio(e);
    vi.spyOn(e.tab.db.documents, 'put').mockRejectedValue(quotaError());
    moveSofa(s, 1500);
    expect(await s.dispose()).toEqual({ saved: false });
    expect(e.locks.isHeld('studio')).toBe(false);
    expect(s.getState().status).toBe('closed');
  });
});

describe('conflicte între taburi (revizie)', () => {
  /** Două taburi pe același proiect FĂRĂ excludere prin blocări: testează doar concurența optimistă (a doua linie de apărare). */
  async function twoTabs() {
    const e = env();
    const noop = { release: async () => {}, onLost: () => {} };
    const permissive = { tryAcquire: async () => noop, steal: async () => noop };
    const a = await openStudio(e);
    const tabB = openTab(e.dbName, { clock: e.clock, locks: permissive });
    open.push(() => tabB.db.close());
    const r = await tabB.manager.open('studio');
    if (!r.ok) throw new Error('open B');
    return { e, a, b: r.value };
  }
  it('al doilea scriitor primește „conflict”, păstrează modificările locale și nu suprascrie', async () => {
    const e = env();
    const a = await openStudio(e);
    const tabB = openTab(e.dbName, { clock: e.clock, locks: new FakeLockProvider() });
    open.push(() => tabB.db.close());
    const b = await tabB.manager.open('studio');
    if (!b.ok) throw new Error('b');
    moveSofa(a, 1500);
    await a.flush();
    b.value.commit('din B', (d) => {
      d.objects.oSofa!.position.x = 999;
    });
    await b.value.flush();
    const st = b.value.getState();
    expect(st.status).toBe('conflict');
    expect(st.conflict).toMatchObject({ kind: 'changed' });
    expect(st).toMatchObject({ hasUnsavedChanges: true });
    expect(st.doc.objects.oSofa!.position.x).toBe(999);
    expect((await stored(e.tab)).doc.objects.oSofa!.position.x).toBe(1500);
    // nicio altă încercare automată peste versiunea lui A
    await e.clock.advance(120000);
    expect((await stored(e.tab)).doc.objects.oSofa!.position.x).toBe(1500);
  });
  it('rezolvare „reîncarcă”: se aruncă modificările locale, se încarcă versiunea din stocare, istoricul se golește', async () => {
    const { e, a, b } = await twoTabs();
    moveSofa(a, 1500);
    await a.flush();
    moveSofa(b, 999);
    await b.flush();
    expect(b.getState().status).toBe('conflict');
    expect(await b.reloadFromStorage()).toEqual({ ok: true });
    expect(b.getState()).toMatchObject({
      status: 'saved',
      conflict: null,
      historySize: 0,
      canUndo: false,
      revision: 2,
    });
    expect(b.getState().doc.objects.oSofa!.position.x).toBe(1500);
    expect((await stored(e.tab)).revision).toBe(2);
  });
  it('rezolvare „suprascrie”: modificările locale se salvează, iar versiunea suprascrisă se arhivează', async () => {
    const { e, a, b } = await twoTabs();
    moveSofa(a, 1500);
    await a.flush();
    moveSofa(b, 999);
    await b.flush();
    expect(await b.overwriteStored()).toEqual({ ok: true });
    expect(b.getState()).toMatchObject({ status: 'saved', conflict: null, revision: 3 });
    expect((await stored(e.tab)).doc.objects.oSofa!.position.x).toBe(999);
    const snaps = await e.tab.repo.listSnapshots('studio');
    expect(snaps.map((s) => s.reason)).toEqual(['pre-overwrite']);
    const archived = await e.tab.repo.loadSnapshot(snaps[0]!.id);
    expect(archived.ok && archived.value.doc.objects.oSofa!.position.x).toBe(1500); // versiunea lui A rămâne recuperabilă
  });
  it('rezolvare „salvează ca proiect nou”: copia are modificările locale, originalul rămâne intact', async () => {
    const { e, a, b } = await twoTabs();
    moveSofa(a, 1500);
    await a.flush();
    moveSofa(b, 999);
    await b.flush();
    expect(await b.saveAsCopy('copie', 'Copie')).toEqual({ ok: true });
    const copy = await e.tab.repo.load('copie');
    expect(copy.ok && [copy.value.doc.name, copy.value.doc.objects.oSofa!.position.x]).toEqual([
      'Copie',
      999,
    ]);
    expect((await stored(e.tab)).doc.objects.oSofa!.position.x).toBe(1500);
    expect(await b.saveAsCopy('copie', 'Din nou')).toMatchObject({ ok: false, reason: 'storage' }); // ID existent
  });
  it('proiect șters din alt loc: conflict „deleted”; „suprascrie” îl recreează; „reîncarcă” raportează lipsa', async () => {
    const { e, a, b } = await twoTabs();
    await e.tab.repo.remove('studio');
    moveSofa(b, 999);
    await b.flush();
    expect(b.getState().conflict).toMatchObject({ kind: 'deleted' });
    expect(await b.reloadFromStorage()).toMatchObject({ ok: false, reason: 'deleted' });
    expect(await b.overwriteStored()).toEqual({ ok: true });
    expect(b.getState()).toMatchObject({ status: 'saved', revision: 1 });
    expect((await stored(e.tab)).doc.objects.oSofa!.position.x).toBe(999);
    void a;
  });
  it('rezolvările fără conflict sunt refuzate', async () => {
    const e = env();
    const s = await openStudio(e);
    expect(await s.reloadFromStorage()).toMatchObject({ ok: false, reason: 'no-conflict' });
    expect(await s.overwriteStored()).toMatchObject({ ok: false, reason: 'no-conflict' });
  });
});

describe('blocare între taburi (un singur editor pe proiect)', () => {
  it('al doilea tab deschide proiectul DOAR-CITIRE: modificările sunt respinse, nu se salvează nimic', async () => {
    const e = env();
    await openStudio(e);
    const tabB = e.newTab();
    const r = await tabB.manager.open('studio');
    if (!r.ok) throw new Error('b');
    const b = r.value;
    expect(b.getState()).toMatchObject({
      readOnly: true,
      lockLost: false,
      status: 'readonly',
      canUndo: false,
    });
    expect(moveSofa(b, 1)).toMatchObject({ ok: false, reason: 'readonly' });
    expect(b.undo()).toBe(false);
    await e.clock.advance(5000);
    expect((await stored(e.tab)).revision).toBe(1);
  });
  it('„preia controlul”: primul tab își salvează modificările, devine doar-citire (lockLost), al doilea editează', async () => {
    const e = env();
    const a = await openStudio(e);
    moveSofa(a, 1500); // nesalvat încă
    const tabB = e.newTab();
    const r = await tabB.manager.open('studio', { takeOver: true });
    if (!r.ok) throw new Error('b');
    await settle();
    await a.flush();
    expect(a.getState()).toMatchObject({ readOnly: true, lockLost: true, status: 'readonly' });
    expect(moveSofa(a, 2000)).toMatchObject({ ok: false, reason: 'readonly' });
    expect(r.value.getState().readOnly).toBe(false);
    // B a încărcat fie înainte, fie după ultima salvare a lui A; în ambele cazuri nimic nu se pierde:
    expect((await stored(e.tab)).doc.objects.oSofa!.position.x).toBe(1500);
  });
  it('închiderea sesiunii eliberează blocarea (alt tab poate edita)', async () => {
    const e = env();
    const a = await openStudio(e);
    const tabB = e.newTab();
    expect(e.locks.isHeld('studio')).toBe(true);
    await a.dispose();
    expect(e.locks.isHeld('studio')).toBe(false);
    const r = await tabB.manager.open('studio');
    expect(r.ok && r.value.getState().readOnly).toBe(false);
  });
  it('dacă încărcarea eșuează, blocarea nu rămâne luată', async () => {
    const e = env();
    const r = await e.tab.manager.open('nu-exista');
    expect(r).toMatchObject({ ok: false, error: { kind: 'not-found' } });
    expect(e.locks.isHeld('nu-exista')).toBe(false);
  });
});

describe('restaurarea după reîncărcare', () => {
  it('închide, redeschide: același document, revizia salvată, istoric gol', async () => {
    const e = env();
    const s = await openStudio(e);
    moveSofa(s, 1500);
    s.apply('preț', (d) => setLineOverride(d, 'object:oSofa', { unitPriceMinor: 199900 }));
    expect(await s.dispose()).toEqual({ saved: true });
    const tabB = e.newTab();
    const r = await tabB.manager.open('studio');
    if (!r.ok) throw new Error('reopen');
    const st = r.value.getState();
    expect(st).toMatchObject({
      status: 'saved',
      revision: 2,
      historySize: 0,
      canUndo: false,
      canRedo: false,
    });
    expect(st.doc.objects.oSofa!.position.x).toBe(1500);
    expect(st.doc.budget.overrides['object:oSofa']).toEqual({ unitPriceMinor: 199900 });
    expect(computeBudget(st.doc).lines.find((l) => l.key === 'object:oSofa')!.priceSource).toBe(
      'user',
    );
  });
  it('„crash” în fereastra de debounce: se pierd doar ultimele <800 ms; ce a fost salvat se restaurează', async () => {
    const e = env();
    const s = await openStudio(e);
    moveSofa(s, 1500);
    await e.clock.advance(800);
    await s.flush();
    moveSofa(s, 1800); // nesalvat
    // simulăm închiderea forțată: nu apelăm dispose/flush
    // alt proces/tab fără notificare de pierdere a blocării (ca după un crash real)
    const tabB = openTab(e.dbName, { clock: e.clock, locks: new FakeLockProvider() });
    open.push(() => tabB.db.close());
    const r = await tabB.manager.open('studio');
    if (!r.ok) throw new Error('reopen');
    expect(r.value.getState().doc.objects.oSofa!.position.x).toBe(1500);
  });
  it('document corupt în stocare: deschiderea eșuează controlat, iar copia de siguranță poate fi încărcată', async () => {
    const e = env();
    const s = await openStudio(e);
    moveSofa(s, 1500);
    await s.flush();
    await e.tab.repo.addSnapshot(s.getState().doc, 'manual', e.clock.nowIso());
    await s.dispose();
    await e.tab.db.documents.update('studio', { data: { gunoi: 1 } });
    const r = await e.tab.manager.open('studio');
    expect(r).toMatchObject({ ok: false, error: { kind: 'corrupt', stage: 'schema' } });
    expect(e.locks.isHeld('studio')).toBe(false);
    const snaps = await e.tab.repo.listSnapshots('studio');
    const recovered = await e.tab.repo.loadSnapshot(snaps[0]!.id);
    expect(recovered.ok && recovered.value.doc.objects.oSofa!.position.x).toBe(1500);
    expect((await e.tab.manager.list()).ok).toBe(true);
  });
});

describe('ciclul de viață al paginii', () => {
  const fakeTargets = () => {
    const w = new Map<string, Array<(e: unknown) => void>>();
    const d = new Map<string, Array<() => void>>();
    return {
      win: {
        addEventListener: (t: string, l: (e: unknown) => void) =>
          w.set(t, [...(w.get(t) ?? []), l]),
        removeEventListener: (t: string, l: (e: unknown) => void) =>
          w.set(
            t,
            (w.get(t) ?? []).filter((x) => x !== l),
          ),
      },
      doc: {
        visibilityState: 'visible',
        addEventListener: (t: string, l: () => void) => d.set(t, [...(d.get(t) ?? []), l]),
        removeEventListener: (t: string, l: () => void) =>
          d.set(
            t,
            (d.get(t) ?? []).filter((x) => x !== l),
          ),
      },
      fireWin: (t: string, ev: unknown = {}) => (w.get(t) ?? []).forEach((l) => l(ev)),
      fireDoc: (t: string) => (d.get(t) ?? []).forEach((l) => l()),
      count: () => [...w.values(), ...d.values()].reduce((n, a) => n + a.length, 0),
    };
  };
  it('ascunderea paginii și pagehide salvează imediat, fără a aștepta debounce-ul', async () => {
    const e = env();
    const s = await openStudio(e);
    const t = fakeTargets();
    const off = attachLifecycle(s, t.win, t.doc);
    moveSofa(s, 1500);
    t.doc.visibilityState = 'hidden';
    t.fireDoc('visibilitychange');
    await s.flush();
    expect((await stored(e.tab)).doc.objects.oSofa!.position.x).toBe(1500);
    moveSofa(s, 1600);
    t.fireWin('pagehide');
    await s.flush();
    expect((await stored(e.tab)).doc.objects.oSofa!.position.x).toBe(1600);
    off();
    expect(t.count()).toBe(0);
  });
  it('beforeunload cere confirmare doar dacă rămân modificări nesalvate', async () => {
    const e = env();
    const s = await openStudio(e);
    const t = fakeTargets();
    attachLifecycle(s, t.win, t.doc);
    const clean = { preventDefault: vi.fn() };
    t.fireWin('beforeunload', clean);
    await s.flush();
    expect(clean.preventDefault).not.toHaveBeenCalled();
    vi.spyOn(e.tab.db.documents, 'put').mockRejectedValue(quotaError());
    moveSofa(s, 1500);
    await s.flush();
    const dirty = { preventDefault: vi.fn() };
    t.fireWin('beforeunload', dirty);
    expect(dirty.preventDefault).toHaveBeenCalled();
  });
});

describe('rezultate derivate: memoizate, în afara documentului, istoricului și stocării', () => {
  it('aceleași rezultate pentru același document; recalculate după o modificare; erorile se memorează', async () => {
    const e = env();
    const s = await openStudio(e);
    const doc = s.getState().doc;
    expect(selectBudget(doc)).toBe(selectBudget(doc));
    expect(selectScene(doc)).toBe(selectScene(doc));
    expect(selectGeometry(doc)).toBe(selectGeometry(doc));
    moveSofa(s, 1500);
    const doc2 = s.getState().doc;
    expect(selectBudget(doc2)).not.toBe(selectBudget(doc));
    expect(selectScene(doc2).hash).not.toBe(selectScene(doc).hash);
    const broken = {
      ...doc,
      openings: {
        x: {
          id: 'x',
          wallId: 'w1',
          type: 'window',
          offsetMm: 5,
          widthMm: 900,
          heightMm: 900,
          sillHeightMm: 0,
        },
      },
    } as ProjectDocument;
    expect(() => selectBudget(broken)).toThrow(/Geometrie invalidă/);
    expect(() => selectBudget(broken)).toThrow(/Geometrie invalidă/);
  });
  it('stocarea conține doar câmpurile modelului (nicio geometrie, buget calculat sau scenă)', async () => {
    const e = env();
    const s = await openStudio(e);
    selectBudget(s.getState().doc);
    selectScene(s.getState().doc);
    moveSofa(s, 1500);
    await s.flush();
    const row = await e.tab.db.documents.get('studio');
    const keys = Object.keys(row!.data as object).sort();
    expect(keys).toEqual([
      'budget',
      'catalogSnapshot',
      'createdAt',
      'finishAssignments',
      'id',
      'levels',
      'name',
      'nodes',
      'objects',
      'openings',
      'rooms',
      'schemaVersion',
      'settings',
      'updatedAt',
      'walls',
    ]);
    expect(Object.keys((row!.data as { budget: object }).budget).sort()).toEqual([
      'manualLines',
      'overrides',
    ]);
    expect(JSON.stringify(row!.data)).not.toMatch(/"trace"|"grossMinor"|"prisms"|"footprints"/);
    const st: SessionState = s.getState();
    expect(Object.keys(st)).not.toContain('budget');
  });
});

describe('închidere idempotentă', () => {
  it('dispose apelat de mai multe ori închide o singură dată și întoarce același rezultat', async () => {
    const e = env();
    const s = await openStudio(e);
    moveSofa(s, 1500);
    const onState = vi.fn();
    s.subscribe(onState);
    const [a, b] = await Promise.all([s.dispose(), s.dispose()]);
    expect(a).toEqual({ saved: true });
    expect(b).toEqual({ saved: true });
    expect(s.getState().status).toBe('closed');
    expect(await s.dispose()).toEqual({ saved: true });
    expect(moveSofa(s, 1)).toMatchObject({ ok: false, reason: 'closed' });
    expect((await stored(e.tab)).doc.objects.oSofa!.position.x).toBe(1500);
  });
  it('în timpul închiderii (salvarea finală) sesiunea nu mai acceptă modificări și se raportează „closed”', async () => {
    const e = env();
    const s = await openStudio(e);
    moveSofa(s, 1500);
    const closing = s.dispose();
    expect(s.getState().status).toBe('closed');
    expect(moveSofa(s, 2000)).toMatchObject({ ok: false, reason: 'closed' });
    expect(s.undo()).toBe(false);
    await closing;
    expect((await stored(e.tab)).doc.objects.oSofa!.position.x).toBe(1500);
  });
});
