// Etapa 6c: operații pe grupuri de obiecte (selecție multiplă): mutare, ștergere, duplicare; toate atomice.
import { describe, expect, it } from 'vitest';
import {
  addObject,
  duplicateObjects,
  moveObjects,
  removeObjects,
  type ProjectDocument,
} from '@/domain';
import { BUILTIN_ITEMS } from '@/catalog';
import { studioProject } from '../reference/projects';

const frozen = (d: ProjectDocument) => JSON.stringify(d);

function withObjects(): { doc: ProjectDocument; ids: string[] } {
  const base = studioProject();
  const item = BUILTIN_ITEMS.find((i) => i.id === 'living.sofa-3')!;
  let doc = base;
  let c = 0;
  const gen = () => `g${++c}`;
  const ids: string[] = [];
  for (let k = 0; k < 3; k++) {
    const r = addObject(doc, item, { position: { x: 1000 + k * 700, y: 1500 } }, gen);
    if (!r.ok) throw new Error(r.error);
    doc = r.value.doc;
    ids.push(r.value.objectId);
  }
  return { doc, ids };
}

describe('moveObjects', () => {
  it('mută toate obiectele cu aceeași deplasare, fără să schimbe documentul primit', () => {
    const { doc, ids } = withObjects();
    const before = frozen(doc);
    const r = moveObjects(doc, ids, { x: 250, y: -100 });
    if (!r.ok) throw new Error(r.error);
    for (const id of ids) {
      expect(r.value.objects[id]!.position.x).toBe(doc.objects[id]!.position.x + 250);
      expect(r.value.objects[id]!.position.y).toBe(doc.objects[id]!.position.y - 100);
    }
    expect(frozen(doc)).toBe(before);
  });

  it('ignoră id-urile repetate (nu mută de două ori)', () => {
    const { doc, ids } = withObjects();
    const r = moveObjects(doc, [ids[0]!, ids[0]!], { x: 100, y: 0 });
    if (!r.ok) throw new Error(r.error);
    expect(r.value.objects[ids[0]!]!.position.x).toBe(doc.objects[ids[0]!]!.position.x + 100);
  });

  it('atomic: un obiect inexistent respinge tot, iar deplasarea nu e zecimală', () => {
    const { doc, ids } = withObjects();
    const bad = moveObjects(doc, [...ids, 'lipsa'], { x: 100, y: 0 });
    expect(bad.ok).toBe(false);
    expect(moveObjects(doc, ids, { x: 0.5, y: 0 }).ok).toBe(false);
    expect(moveObjects(doc, [], { x: 1, y: 1 }).ok).toBe(false);
  });
});

describe('removeObjects', () => {
  it('șterge grupul și suprascrierile de buget ale fiecăruia, într-o singură operație', () => {
    const { doc, ids } = withObjects();
    const r = removeObjects(doc, [ids[0]!, ids[2]!]);
    if (!r.ok) throw new Error(r.error);
    expect(Object.keys(r.value.objects)).toEqual(['oSofa', 'oLamp', ids[1]!]);
    expect(Object.keys(r.value.budget.overrides).some((k) => k.includes(ids[0]!))).toBe(false);
  });

  it('atomic: un id inexistent respinge tot', () => {
    const { doc, ids } = withObjects();
    expect(removeObjects(doc, [ids[0]!, 'lipsa']).ok).toBe(false);
    expect(removeObjects(doc, []).ok).toBe(false);
    expect(Object.keys(doc.objects)).toHaveLength(5);
  });
});

describe('duplicateObjects', () => {
  it('face câte o copie decalată pentru fiecare, în ordinea primită; originalele rămân', () => {
    const { doc, ids } = withObjects();
    let n = 0;
    const r = duplicateObjects(doc, ids, () => `copie${++n}`);
    if (!r.ok) throw new Error(r.error);
    expect(r.value.objectIds).toHaveLength(3);
    expect(Object.keys(r.value.doc.objects)).toHaveLength(8);
    ids.forEach((id, i) => {
      const copy = r.value.doc.objects[r.value.objectIds[i]!]!;
      expect(copy.position.x).toBe(doc.objects[id]!.position.x + 300);
      expect(copy.position.y).toBe(doc.objects[id]!.position.y + 300);
      expect(r.value.doc.objects[id]).toEqual(doc.objects[id]);
    });
  });

  it('atomic: un id inexistent respinge tot', () => {
    const { doc, ids } = withObjects();
    expect(duplicateObjects(doc, [ids[0]!, 'lipsa'], () => 'x').ok).toBe(false);
    expect(duplicateObjects(doc, [], () => 'x').ok).toBe(false);
  });
});
