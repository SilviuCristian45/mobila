import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addObject,
  applyFinish,
  applyFinishToRoomWalls,
  buildScene,
  clearFinish,
  computeBudget,
  roomWallTargets,
  updateAssignmentLook,
  type ProjectDocument,
} from '@/domain';
import { getBuiltinItem } from '@/catalog';
import { getBuiltinMaterial } from '@/materials';
import type { ProjectSession } from '@/state/session';
import { FakeClock, FakeLockProvider, openTab, uniqueDbName, type Tab } from '../helpers/env';
import { studioProject } from '../reference/projects';

const closers: Array<() => void> = [];
afterEach(() => closers.splice(0).forEach((c) => c()));

function setup() {
  const clock = new FakeClock();
  const locks = new FakeLockProvider();
  const dbName = uniqueDbName();
  const tab = (): Tab => {
    const t = openTab(dbName, { clock, locks });
    closers.push(() => t.db.close());
    return t;
  };
  return { clock, tab };
}
async function openClean(e: ReturnType<typeof setup>, t: Tab): Promise<ProjectSession> {
  const base = studioProject();
  const doc: ProjectDocument = {
    ...base,
    objects: {},
    finishAssignments: {},
    catalogSnapshot: { items: {}, finishes: {} },
    budget: { overrides: {}, manualLines: {} },
  };
  await t.repo.create(doc, e.clock.nowIso());
  const r = await t.manager.open('studio');
  if (!r.ok) throw new Error('open');
  return r.value;
}
let n = 0;
const genId = () => `s${++n}`;
const mat = (id: string) => getBuiltinMaterial(id)!;
const toOp = <T extends { doc: ProjectDocument }>(
  r: { ok: true; value: T } | { ok: false; error: string },
) => (r.ok ? ({ ok: true, value: r.value.doc } as const) : r);

describe('finisaje prin sesiune: un pas de undo/redo pentru fiecare operație', () => {
  it('aplicare → modificare → înlocuire → aplicare pe pereți → eliminare; undo/redo le parcurge corect, inclusiv snapshot-ul și bugetul', async () => {
    const e = setup();
    const s = await openClean(e, e.tab());
    const doc0 = s.getState().doc;
    const floor = { kind: 'roomFloor', roomId: 'rA' } as const;

    expect(
      s.apply('Aplică parchet', (d) =>
        toOp(applyFinish(d, mat('mat.parquet.oak-light'), floor, genId)),
      ).ok,
    ).toBe(true);
    const aId = Object.keys(s.getState().doc.finishAssignments)[0]!;
    expect(
      s.apply('Scara texturii', (d) => updateAssignmentLook(d, aId, { textureScale: 2 })).ok,
    ).toBe(true);
    expect(
      s.apply('Aplică gresie', (d) => toOp(applyFinish(d, mat('mat.tile.grey'), floor, genId))).ok,
    ).toBe(true);
    expect(
      s.apply('Pereți', (d) => toOp(applyFinishToRoomWalls(d, mat('mat.paint.sage'), 'rA', genId)))
        .ok,
    ).toBe(true);
    expect(Object.keys(s.getState().doc.finishAssignments)).toHaveLength(5);
    const face = roomWallTargets(s.getState().doc, 'rA')[0]!;
    expect(s.apply('Elimină', (d) => clearFinish(d, face)).ok).toBe(true);
    expect(Object.keys(s.getState().doc.finishAssignments)).toHaveLength(4);
    const final = s.getState().doc;
    const finalBudget = computeBudget(final).total.grossMinor;

    const labels: string[] = [];
    while (s.getState().canUndo) {
      labels.push(s.getState().undoLabel ?? '');
      s.undo();
    }
    expect(labels).toEqual([
      'Elimină',
      'Pereți',
      'Aplică gresie',
      'Scara texturii',
      'Aplică parchet',
    ]);
    expect(s.getState().doc.finishAssignments).toEqual({});
    expect(s.getState().doc.catalogSnapshot.finishes).toEqual({});
    expect(s.getState().doc.finishAssignments).toEqual(doc0.finishAssignments);
    while (s.getState().canRedo) s.redo();
    expect(s.getState().doc.finishAssignments).toEqual(final.finishAssignments);
    expect(s.getState().doc.catalogSnapshot.finishes).toEqual(final.catalogSnapshot.finishes);
    expect(computeBudget(s.getState().doc).total.grossMinor).toBe(finalBudget);
    expect(buildScene(s.getState().doc).hash).toBe(buildScene(final).hash);
  });

  it('o aplicare respinsă (material incompatibil) nu schimbă documentul și nu adaugă un pas de istoric', async () => {
    const e = setup();
    const s = await openClean(e, e.tab());
    const before = s.getState();
    const r = s.apply('Aplică', (d) =>
      toOp(applyFinish(d, mat('mat.paint.sage'), { kind: 'roomFloor', roomId: 'rA' }, genId)),
    );
    expect(r.ok).toBe(false);
    expect(s.getState().doc).toBe(before.doc);
    expect(s.getState().canUndo).toBe(false);
  });

  it('ștergerea unui obiect cu finisaje este UN pas: undo restaurează obiectul, zonele și materialul', async () => {
    const e = setup();
    const s = await openClean(e, e.tab());
    let oid = '';
    s.apply('Obiect', (d) => {
      const r = addObject(
        d,
        getBuiltinItem('bedroom.wardrobe')!,
        { position: { x: 1500, y: 1500 } },
        genId,
      );
      if (r.ok) oid = r.value.objectId;
      return toOp(r);
    });
    s.apply('Finisaj', (d) =>
      toOp(
        applyFinish(
          d,
          mat('mat.furn.wood-dark'),
          { kind: 'objectSlot', objectId: oid, slot: 'body' },
          genId,
        ),
      ),
    );
    const withFinish = s.getState().doc;
    const { removeObject } = await import('@/domain');
    s.apply('Șterge obiectul', (d) => removeObject(d, oid));
    expect(s.getState().doc.finishAssignments).toEqual({});
    expect(s.getState().doc.catalogSnapshot.finishes).toEqual({});
    s.undo();
    expect(s.getState().doc.finishAssignments).toEqual(withFinish.finishAssignments);
    expect(s.getState().doc.catalogSnapshot.finishes).toEqual(withFinish.catalogSnapshot.finishes);
    expect(s.getState().doc.objects[oid]).toBeDefined();
  });
});

describe('autosave și restaurare după reîncărcare', () => {
  it('materialele (definiții + atribuiri cu parametri) se salvează și revin exact; scena și bugetul sunt identice', async () => {
    const e = setup();
    const t = e.tab();
    const s = await openClean(e, t);
    s.apply('Parchet', (d) =>
      toOp(
        applyFinish(d, mat('mat.parquet.dark'), { kind: 'roomFloor', roomId: 'rA' }, genId, {
          look: { textureScale: 1.5, textureRotationDeg: 90 },
          wastePct: 12,
        }),
      ),
    );
    s.apply('Pereți', (d) => toOp(applyFinishToRoomWalls(d, mat('mat.wtile.metro'), 'rB', genId)));
    let oid = '';
    s.apply('Obiect', (d) => {
      const r = addObject(
        d,
        getBuiltinItem('misc.desk')!,
        { position: { x: 1500, y: 1500 } },
        genId,
      );
      if (r.ok) oid = r.value.objectId;
      return toOp(r);
    });
    s.apply('Mobilier', (d) =>
      toOp(
        applyFinish(
          d,
          mat('mat.furn.metallic'),
          { kind: 'objectSlot', objectId: oid, slot: 'top' },
          genId,
          { look: { colorHex: '#aabbcc' } },
        ),
      ),
    );
    await e.clock.advance(800);
    await s.flush();
    const saved = s.getState().doc;
    await s.dispose();

    const r = await e.tab().manager.open('studio'); // „reîncărcare”: alt tab peste aceeași bază
    if (!r.ok) throw new Error('reopen');
    const again = r.value.getState().doc;
    expect(again.finishAssignments).toEqual(saved.finishAssignments);
    expect(again.catalogSnapshot.finishes).toEqual(saved.catalogSnapshot.finishes);
    expect(
      Object.values(again.finishAssignments).find((a) => a.look?.textureScale === 1.5),
    ).toMatchObject({
      wastePct: 12,
      look: { textureScale: 1.5, textureRotationDeg: 90 },
    });
    expect(buildScene(again).hash).toBe(buildScene(saved).hash);
    expect(computeBudget(again).total).toEqual(computeBudget(saved).total);
    expect(r.value.getState().canUndo).toBe(false); // istoricul nu supraviețuiește reîncărcării
  });

  it('undo/redo declanșează autosave: starea salvată urmează istoricul', async () => {
    const e = setup();
    const t = e.tab();
    const s = await openClean(e, t);
    s.apply('Parchet', (d) =>
      toOp(
        applyFinish(d, mat('mat.parquet.oak-light'), { kind: 'roomFloor', roomId: 'rA' }, genId),
      ),
    );
    await e.clock.advance(800);
    await s.flush();
    s.undo();
    await e.clock.advance(800);
    await s.flush();
    const a = await t.repo.load('studio');
    expect(a.ok && a.value.doc.finishAssignments).toEqual({});
    s.redo();
    await e.clock.advance(800);
    await s.flush();
    const b = await t.repo.load('studio');
    expect(b.ok && Object.keys(b.value.doc.finishAssignments)).toHaveLength(1);
  });

  it('copia de siguranță conține materialele din snapshot (proiectul rămâne autonom)', async () => {
    const e = setup();
    const s = await openClean(e, e.tab());
    s.apply('Parchet', (d) =>
      toOp(applyFinish(d, mat('mat.stone.natural'), { kind: 'roomFloor', roomId: 'rA' }, genId)),
    );
    const text = s.exportBackup({ exportedAt: '2026-10-27T12:00:00.000Z', appVersion: 'test' });
    expect(text).toContain('mat.stone.natural');
    expect(text).toContain('flagstone');
  });
});
