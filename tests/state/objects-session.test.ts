import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addObject,
  duplicateObject,
  exportProject,
  removeObject,
  suggestPlacement,
  updateObject,
  type ProjectDocument,
} from '@/domain';
import { getBuiltinItem } from '@/catalog';
import type { ProjectSession } from '@/state/session';
import { selectGeometry } from '@/state/selectors';
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

async function openEmpty(e: ReturnType<typeof setup>, t: Tab): Promise<ProjectSession> {
  const base = studioProject();
  const doc: ProjectDocument = {
    ...base,
    objects: {},
    catalogSnapshot: { ...base.catalogSnapshot, items: {} },
    budget: { overrides: {}, manualLines: {} },
  };
  await t.repo.create(doc, e.clock.nowIso());
  const r = await t.manager.open('studio');
  if (!r.ok) throw new Error('open');
  return r.value;
}

let counter = 0;
const genId = () => `t${++counter}`;
const item = (id: string) => getBuiltinItem(id)!;

function add(s: ProjectSession, itemId: string, patch = {}) {
  let id = '';
  const r = s.apply(`Adaugă ${itemId}`, (d) => {
    const place = suggestPlacement(d, item(itemId), undefined, selectGeometry(d));
    const x = addObject(d, item(itemId), { ...place, ...patch }, genId);
    if (!x.ok) return x;
    id = x.value.objectId;
    return { ok: true, value: x.value.doc };
  });
  expect(r.ok).toBe(true);
  return id;
}
const objs = (s: ProjectSession) => s.getState().doc.objects;

describe('obiecte prin sesiune: un pas de undo/redo pentru fiecare operație', () => {
  it('adăugare → modificare → mutare → rotire → duplicare → ștergere; undo/redo le parcurge în ordine inversă/directă', () => {
    const e = setup();
    return openEmpty(e, e.tab()).then((s) => {
      const id = add(s, 'bedroom.wardrobe');
      expect(Object.keys(objs(s))).toEqual([id]);
      expect(s.getState().doc.catalogSnapshot.items['bedroom.wardrobe']).toBeDefined();
      const edit = (label: string, patch: Parameters<typeof updateObject>[2], target = id) =>
        expect(s.apply(label, (d) => updateObject(d, target, patch)).ok).toBe(true);

      edit('Modifică dimensiunile', { size: { widthMm: 1400 } });
      edit('Modifică „Număr de fronturi”', { params: { fronts: 3 } });
      edit('Mută obiectul', { position: { x: 2000, y: 1200 } });
      edit('Rotește obiectul', { rotationDeg: 90 });
      edit('Schimbă culoarea', { colorHex: '#445566' });
      let copy = '';
      expect(
        s.apply('Duplică obiectul', (d) => {
          const r = duplicateObject(d, id, genId);
          if (!r.ok) return r;
          copy = r.value.objectId;
          return { ok: true, value: r.value.doc };
        }).ok,
      ).toBe(true);
      expect(Object.keys(objs(s))).toHaveLength(2);
      expect(s.apply('Șterge obiectul', (d) => removeObject(d, id)).ok).toBe(true);
      expect(Object.keys(objs(s))).toEqual([copy]);

      const final = s.getState().doc;
      // 8 pași (adăugare + 5 modificări + duplicare + ștergere) — fiecare cu eticheta lui
      const labels: string[] = [];
      while (s.getState().canUndo) {
        labels.push(s.getState().undoLabel ?? '');
        s.undo();
      }
      expect(labels).toEqual([
        'Șterge obiectul',
        'Duplică obiectul',
        'Schimbă culoarea',
        'Rotește obiectul',
        'Mută obiectul',
        'Modifică „Număr de fronturi”',
        'Modifică dimensiunile',
        'Adaugă bedroom.wardrobe',
      ]);
      expect(objs(s)).toEqual({}); // înapoi la proiectul fără obiecte
      while (s.getState().canRedo) s.redo();
      expect(s.getState().doc.objects).toEqual(final.objects);
      expect(s.getState().doc.catalogSnapshot).toEqual(final.catalogSnapshot);
    });
  });

  it('o operație respinsă (dimensiune în afara limitelor) nu schimbă documentul și nu adaugă un pas de istoric', async () => {
    const e = setup();
    const s = await openEmpty(e, e.tab());
    const id = add(s, 'living.armchair');
    const before = s.getState();
    const r = s.apply('Modifică dimensiunile', (d) =>
      updateObject(d, id, { size: { widthMm: 10 } }),
    );
    expect(r.ok).toBe(false);
    expect(s.getState().doc).toBe(before.doc);
    expect(s.getState().undoLabel).toBe(before.undoLabel);
  });

  it('ștergerea unui obiect cu suprascriere de buget: un singur pas; undo restaurează și prețul editat', async () => {
    const e = setup();
    const s = await openEmpty(e, e.tab());
    const id = add(s, 'bedroom.wardrobe');
    s.commit('preț', (d) => {
      d.budget.overrides[`object:${id}`] = { unitPriceMinor: 99900 };
    });
    expect(s.apply('Șterge obiectul', (d) => removeObject(d, id)).ok).toBe(true);
    expect(s.getState().doc.budget.overrides).toEqual({});
    s.undo();
    expect(s.getState().doc.budget.overrides[`object:${id}`]).toEqual({ unitPriceMinor: 99900 });
    expect(s.getState().doc.objects[id]).toBeDefined();
  });
});

describe('autosave și restaurare după reîncărcare', () => {
  it('obiectele (poziție, rotație, dimensiuni, parametri, culoare) se salvează și revin exact după redeschidere', async () => {
    const e = setup();
    const t = e.tab();
    const s = await openEmpty(e, t);
    const id = add(s, 'bedroom.wardrobe');
    s.apply('mută', (d) =>
      updateObject(d, id, {
        position: { x: 2222, y: 1111 },
        rotationDeg: 270,
        size: { widthMm: 1500, heightMm: 2300 },
        params: { fronts: 4, frontType: 'drawers' },
        colorHex: '#102030',
        name: 'Dulapul meu',
      }),
    );
    await e.clock.advance(800);
    await s.flush();
    const saved = s.getState().doc;
    await s.dispose();

    // „reîncărcare”: alt tab peste aceeași bază
    const t2 = e.tab();
    const r = await t2.manager.open('studio');
    if (!r.ok) throw new Error('reopen');
    const again = r.value.getState().doc;
    expect(again.objects[id]).toEqual(saved.objects[id]);
    expect(again.objects[id]).toMatchObject({
      position: { x: 2222, y: 1111 },
      rotationDeg: 270,
      size: { widthMm: 1500, depthMm: 600, heightMm: 2300 },
      params: { fronts: 4, frontType: 'drawers', handles: true, base: 'plinth' },
      colorHex: '#102030',
      name: 'Dulapul meu',
    });
    expect(again.catalogSnapshot.items['bedroom.wardrobe']).toEqual(item('bedroom.wardrobe'));
    // istoricul nu supraviețuiește reîncărcării (ADR-029)
    expect(r.value.getState().canUndo).toBe(false);
  });

  it('undo/redo declanșează autosave: starea salvată urmează undo-ul', async () => {
    const e = setup();
    const t = e.tab();
    const s = await openEmpty(e, t);
    const id = add(s, 'living.sofa-3');
    await e.clock.advance(800);
    await s.flush();
    s.undo();
    await e.clock.advance(800);
    await s.flush();
    const r = await t.repo.load('studio');
    expect(r.ok && r.value.doc.objects).toEqual({});
    s.redo();
    await e.clock.advance(800);
    await s.flush();
    const r2 = await t.repo.load('studio');
    expect(r2.ok && Object.keys(r2.value.doc.objects)).toEqual([id]);
  });

  it('export din sesiune (copie de siguranță) conține obiectele și catalogul folosit', async () => {
    const e = setup();
    const s = await openEmpty(e, e.tab());
    add(s, 'bath.shower');
    const text = s.exportBackup({ exportedAt: '2026-10-27T12:00:00.000Z', appVersion: 'test' });
    expect(text).toContain('bath.shower');
    expect(text).toBe(
      exportProject(s.getState().doc, {
        exportedAt: '2026-10-27T12:00:00.000Z',
        appVersion: 'test',
      }),
    );
  });
});
