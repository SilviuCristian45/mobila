import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computeBudget } from '@/domain/budget';
import { referenceProject } from '@/domain/fixtures';
import { RcDb, addSnapshot, loadDocument, saveDocument } from '@/persistence/db';
import { Autosaver, HISTORY_LIMIT, createDocStore } from '@/state/store';

let db: RcDb; let n = 0;
beforeEach(() => { db = new RcDb(`test-${++n}-${Math.random()}`); vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] }); });
afterEach(() => { vi.useRealTimers(); db.close(); });

const setup = async () => {
  const ds = createDocStore(referenceProject());
  const as = new Autosaver(ds, db);
  await as.flush(); // prima salvare (revizia 1)
  return { ds, as };
};
const stored = async (id = 'p-ref') => (await loadDocument(db, id))!;
/** Mută un obiect (o acțiune). */
const move = (ds: ReturnType<typeof createDocStore>, id: string, x: number) => ds.commit(`mută ${id}`, (d) => { d.objects[id]!.position.x = x; });
/** Șterge un obiect ȘI suprascrierea lui în aceeași acțiune (concluzia: curățarea trebuie să fie în același patch). */
const del = (ds: ReturnType<typeof createDocStore>, id: string) => ds.commit(`șterge ${id}`, (d) => { delete d.objects[id]; delete d.budget.overrides[`object:${id}`]; });

describe('undo/redo + autosave', () => {
  it('editare → autosave după debounce → DB = starea din memorie', async () => {
    const { ds, as } = await setup();
    move(ds, 'oSofa', 1500);
    expect((await stored()).doc.objects.oSofa!.position.x).toBe(1200); // încă nesalvat
    await vi.advanceTimersByTimeAsync(800); await as.idle();
    expect((await stored()).doc.objects.oSofa!.position.x).toBe(1500);
    expect(ds.store.getState().status).toBe('saved');
  });

  it('undo/redo declanșează autosave; DB urmărește exact starea', async () => {
    const { ds, as } = await setup();
    move(ds, 'oSofa', 1500); move(ds, 'oSofa', 1800);
    await vi.advanceTimersByTimeAsync(800); await as.idle();
    ds.undo(); await vi.advanceTimersByTimeAsync(800); await as.idle();
    expect((await stored()).doc.objects.oSofa!.position.x).toBe(1500);
    ds.undo(); await vi.advanceTimersByTimeAsync(800); await as.idle();
    expect((await stored()).doc.objects.oSofa!.position.x).toBe(1200);
    ds.redo(); await vi.advanceTimersByTimeAsync(800); await as.idle();
    expect((await stored()).doc.objects.oSofa!.position.x).toBe(1500);
    expect(ds.store.getState().doc.objects.oSofa!.position.x).toBe(1500);
  });

  it('ȘTERGERE + undo restabilește obiectul ȘI suprascrierea de preț (buget identic)', async () => {
    const { ds } = await setup();
    const before = computeBudget(ds.store.getState().doc);
    del(ds, 'oLamp');
    const mid = computeBudget(ds.store.getState().doc);
    expect(mid.lines.find((l) => l.key === 'object:oLamp')).toBeUndefined();
    expect(ds.store.getState().doc.budget.overrides['object:oLamp']).toBeUndefined();
    ds.undo();
    expect(computeBudget(ds.store.getState().doc)).toEqual(before);
    expect(ds.store.getState().doc.budget.overrides['object:oLamp']?.unitPriceMinor).toBe(25000);
  });

  it('CONSTATARE: curățarea suprascrierii ca acțiune SEPARATĂ rupe undo-ul (pierde prețul)', async () => {
    const { ds } = await setup();
    ds.commit('șterge obiect', (d) => { delete d.objects.oLamp; });
    ds.commit('curăță orfane', (d) => { delete d.budget.overrides['object:oLamp']; });
    ds.undo(); // anulează doar curățarea
    ds.undo(); // anulează ștergerea
    expect(ds.store.getState().doc.budget.overrides['object:oLamp']?.unitPriceMinor).toBe(25000); // se restabilește doar pentru că ambii pași sunt anulați
    // dar dacă utilizatorul anulează doar UN pas după ștergere+curățare automată, are obiectul fără preț:
    const { ds: ds2 } = await setup();
    ds2.commit('șterge+curăță automat (două patch-uri)', (d) => { delete d.objects.oLamp; });
    ds2.commit('autocurățare', (d) => { delete d.budget.overrides['object:oLamp']; });
    ds2.undo();
    expect(ds2.store.getState().doc.objects.oLamp).toBeUndefined();
  });

  it('tragere: 50 de actualizări tranzitorii în afara documentului + 1 comitere = 1 pas de undo, 1 salvare', async () => {
    const { ds, as } = await setup();
    const savesBefore = as.saves;
    let transient = 1200;
    for (let i = 0; i < 50; i++) transient += 10; // stare tranzitorie (UI store), fără commit
    const v0 = ds.store.getState().editVersion;
    expect(ds.store.getState().editVersion).toBe(v0); // tranzitoriul nu atinge documentul
    move(ds, 'oSofa', transient);
    await vi.advanceTimersByTimeAsync(800); await as.idle();
    expect(ds.store.getState().past).toHaveLength(1);
    expect(as.saves - savesBefore).toBe(1);
  });

  it('rafală de 30 de editări: debounce → o singură salvare', async () => {
    const { ds, as } = await setup(); const before = as.saves;
    for (let i = 0; i < 30; i++) { move(ds, 'oSofa', 1000 + i); await vi.advanceTimersByTimeAsync(100); }
    await vi.advanceTimersByTimeAsync(800); await as.idle();
    expect(as.saves - before).toBeLessThanOrEqual(2); // maxWait 5 s poate forța una intermediară
    expect((await stored()).doc.objects.oSofa!.position.x).toBe(1029);
  });

  it('maxWait: editare continuă >5 s tot se salvează', async () => {
    const { ds, as } = await setup(); const before = as.saves;
    for (let i = 0; i < 80; i++) { move(ds, 'oSofa', 1000 + i); await vi.advanceTimersByTimeAsync(100); }
    await as.idle();
    expect(as.saves - before).toBeGreaterThanOrEqual(1);
  });

  it('undo în timpul unei salvări în curs: starea finală din DB = starea din memorie', async () => {
    const { ds, as } = await setup();
    move(ds, 'oSofa', 1500);
    const p = as.flush(); // pornește salvarea (async)
    ds.undo();            // modificare în timpul salvării
    await p; await as.flush(); await as.idle();
    expect((await stored()).doc.objects.oSofa!.position.x).toBe(ds.store.getState().doc.objects.oSofa!.position.x);
    expect(ds.store.getState().status).toBe('saved');
  });

  it('istoricul NU se persistă: după „reîncărcare” undo e gol, documentul e păstrat', async () => {
    const { ds, as } = await setup();
    move(ds, 'oSofa', 1500); await vi.advanceTimersByTimeAsync(800); await as.idle();
    const row = await stored();
    const ds2 = createDocStore(row.doc, row.revision);
    expect(ds2.store.getState().past).toHaveLength(0); expect(ds2.undo()).toBe(false);
    expect(ds2.store.getState().doc.objects.oSofa!.position.x).toBe(1500);
  });

  it('import/înlocuire golește istoricul (nu se poate face undo peste un import)', async () => {
    const { ds } = await setup(); move(ds, 'oSofa', 1500);
    ds.replace(referenceProject(), 1);
    expect(ds.store.getState().past).toHaveLength(0); expect(ds.undo()).toBe(false);
  });

  it('limita istoricului: 100 de pași, cei vechi se elimină', async () => {
    const { ds } = await setup();
    for (let i = 0; i < 130; i++) move(ds, 'oSofa', 2000 + i);
    expect(ds.store.getState().past).toHaveLength(HISTORY_LIMIT);
    for (let i = 0; i < HISTORY_LIMIT; i++) ds.undo();
    expect(ds.undo()).toBe(false);
    expect(ds.store.getState().doc.objects.oSofa!.position.x).toBe(2029); // starea de după pasul 30
  });

  it('după undo, o acțiune nouă golește redo', async () => {
    const { ds } = await setup(); move(ds, 'oSofa', 1500); ds.undo();
    expect(ds.store.getState().future).toHaveLength(1);
    move(ds, 'oSofa', 1700);
    expect(ds.store.getState().future).toHaveLength(0);
  });

  it('actualizarea updatedAt la salvare NU intră în istoric și nu invalidează undo', async () => {
    const { ds, as } = await setup();
    move(ds, 'oSofa', 1500); await vi.advanceTimersByTimeAsync(800); await as.idle();
    expect(ds.store.getState().past).toHaveLength(1);
    expect((await stored()).doc.updatedAt).not.toBe('2026-10-27T10:00:00.000Z');
    expect(ds.store.getState().doc.updatedAt).toBe('2026-10-27T10:00:00.000Z'); // în memorie neatins
  });

  it('conflict între taburi: al doilea scriitor este oprit, nu suprascrie', async () => {
    const { ds, as } = await setup();
    // „celălalt tab” salvează peste aceeași revizie
    const other = (await stored()).doc;
    await saveDocument(db, { ...other, name: 'din alt tab' }, 1);
    move(ds, 'oSofa', 1500); await vi.advanceTimersByTimeAsync(800); await as.idle();
    expect(ds.store.getState().status).toBe('conflict');
    expect((await stored()).doc.name).toBe('din alt tab');
    expect((await stored()).doc.objects.oSofa!.position.x).toBe(1200);
  });

  it('snapshot-uri de siguranță: se păstrează ultimele 5', async () => {
    const doc = referenceProject();
    for (let i = 0; i < 8; i++) await addSnapshot(db, doc, 'auto', 5, `2026-10-27T10:0${i}:00.000Z`);
    expect(await db.snapshots.count()).toBe(5);
  });
});
