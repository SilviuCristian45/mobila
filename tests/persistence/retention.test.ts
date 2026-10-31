// F-07 (docs/TECHNICAL_AUDIT.md): copiile „pre-*” nu intră în plafonul copiilor obișnuite și nu sunt tăiate prime.
// Registrul de migrări e injectat (formatul real v1 nu are migrări; CURRENT_VERSION nu se schimbă).
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DexieProjectRepository,
  SAFETY_SNAPSHOTS_KEPT,
  SNAPSHOTS_KEPT,
} from '@/persistence/repository';
import { RoomcraftDb } from '@/persistence/db';
import { studioProject } from '../reference/projects';
import { uniqueDbName } from '../helpers/env';

const NOW = '2026-10-27T09:00:00.000Z';
const at = (i: number) => `2026-10-27T10:${String(i).padStart(2, '0')}:00.000Z`;
const migrations = {
  0: (raw: Record<string, unknown>) => {
    const s = { ...(raw.settings as Record<string, unknown>) };
    s.defaultVatBp = Math.round(Number(s.vat) * 100);
    delete s.vat;
    return { ...raw, settings: s };
  },
};
const v0Row = (revision: number, updatedAt = '2020-01-01T00:00:00.000Z') => {
  const v0 = JSON.parse(JSON.stringify(studioProject()));
  v0.schemaVersion = 0;
  v0.updatedAt = updatedAt;
  v0.settings.vat = 21;
  delete v0.settings.defaultVatBp;
  return { projectId: 'studio', revision, data: v0 };
};

const dbs: RoomcraftDb[] = [];
function setup(now: () => string = () => at(59)) {
  const db = new RoomcraftDb(uniqueDbName());
  dbs.push(db);
  return { db, repo: new DexieProjectRepository(db, { migrations }, now) };
}
afterEach(() => dbs.splice(0).forEach((d) => d.close()));

const countOf = (list: { reason: string }[], reason: string) =>
  list.filter((s) => s.reason === reason).length;

describe('copia „pre-migration” față de plafonul de copii obișnuite', () => {
  it('cu 5 copii obișnuite deja existente înainte de migrare: copia de migrare rămâne, iar cele 5 rămân', async () => {
    const { db, repo } = setup(() => at(30));
    const doc = studioProject();
    await repo.create(doc, NOW);
    for (let i = 0; i < SNAPSHOTS_KEPT; i++) await repo.addSnapshot(doc, 'auto', at(i));
    await db.documents.put(v0Row(7));

    const r = await repo.load('studio');
    expect(r.ok && r.value.migratedFrom).toBe(0);

    const list = await repo.listSnapshots('studio');
    expect(countOf(list, 'auto')).toBe(SNAPSHOTS_KEPT);
    expect(countOf(list, 'pre-migration')).toBe(1);
  });

  it('copia de migrare supraviețuiește copiilor automate ulterioare (înainte: era tăiată după a 5-a)', async () => {
    const { db, repo } = setup(() => at(0));
    const doc = studioProject();
    await db.documents.put(v0Row(1));
    const loaded = await repo.load('studio'); // migrare + copie brută
    if (!loaded.ok) throw new Error('load');
    await repo.save(loaded.value.doc, 1, NOW); // sesiunea salvează documentul migrat
    for (let i = 1; i <= SNAPSHOTS_KEPT * 3; i++) await repo.addSnapshot(doc, 'auto', at(i));

    const list = await repo.listSnapshots('studio');
    expect(countOf(list, 'auto')).toBe(SNAPSHOTS_KEPT);
    const mig = list.filter((s) => s.reason === 'pre-migration');
    expect(mig).toHaveLength(1);
    const raw = await db.snapshots.get(mig[0]!.id);
    expect((raw!.data as { schemaVersion: number }).schemaVersion).toBe(0); // documentul brut, nemigrat
    expect(mig[0]!.schemaVersion).toBe(0);
  });

  it('„createdAt” al copiei de migrare e momentul copierii, nu `updatedAt` al documentului vechi', async () => {
    const { db, repo } = setup(() => at(42));
    await db.documents.put(v0Row(1, '2019-05-05T00:00:00.000Z'));
    await repo.load('studio');
    const [s] = await repo.listSnapshots('studio');
    expect(s!.createdAt).toBe(at(42));
  });

  it('reîncărcarea aceleiași revizii nu duplică și nu rescrie copia de migrare', async () => {
    let tick = 1;
    const { db, repo } = setup(() => at(tick++));
    await db.documents.put(v0Row(3));
    await repo.load('studio');
    await repo.load('studio');
    await repo.load('studio');
    const snaps = await repo.listSnapshots('studio');
    expect(snaps).toHaveLength(1);
    expect(snaps[0]!.createdAt).toBe(at(1));
  });

  it(`copiile de migrare au plafon propriu (${SAFETY_SNAPSHOTS_KEPT}): se păstrează cele mai noi, cele obișnuite nu sunt afectate`, async () => {
    let tick = 10;
    const { db, repo } = setup(() => at(tick++));
    const doc = studioProject();
    await repo.create(doc, NOW);
    for (let i = 0; i < SNAPSHOTS_KEPT; i++) await repo.addSnapshot(doc, 'auto', at(i));
    for (let rev = 1; rev <= SAFETY_SNAPSHOTS_KEPT + 2; rev++) {
      await db.documents.put(v0Row(rev)); // revizii diferite ⇒ migrări diferite
      await repo.load('studio');
    }
    const list = await repo.listSnapshots('studio');
    expect(countOf(list, 'pre-migration')).toBe(SAFETY_SNAPSHOTS_KEPT);
    expect(countOf(list, 'auto')).toBe(SNAPSHOTS_KEPT);
    // supraviețuiesc cele mai recente (revizii 3..5)
    const ids = list.filter((s) => s.reason === 'pre-migration').map((s) => s.id);
    expect(ids.sort()).toEqual([3, 4, 5].map((n) => `studio:pre-migration:${n}`).sort());
  });
});

describe('plafoane: copii obișnuite vs. copii de siguranță', () => {
  it(`„pre-overwrite” are plafon propriu per motiv (${SAFETY_SNAPSHOTS_KEPT}), independent de copiile obișnuite`, async () => {
    const { repo } = setup();
    const doc = studioProject();
    await repo.create(doc, NOW);
    for (let i = 0; i < SAFETY_SNAPSHOTS_KEPT + 2; i++)
      await repo.addSnapshot(doc, 'pre-overwrite', at(i));
    for (let i = 0; i < SNAPSHOTS_KEPT + 2; i++) await repo.addSnapshot(doc, 'auto', at(20 + i));
    const list = await repo.listSnapshots('studio');
    expect(list.filter((s) => s.reason === 'pre-overwrite').map((s) => s.createdAt)).toEqual([
      at(SAFETY_SNAPSHOTS_KEPT + 1),
      at(SAFETY_SNAPSHOTS_KEPT),
      at(SAFETY_SNAPSHOTS_KEPT - 1),
    ]);
    expect(countOf(list, 'auto')).toBe(SNAPSHOTS_KEPT);
  });

  it('copiile obișnuite (auto + manual) se taie ca înainte: ultimele SNAPSHOTS_KEPT, cele mai noi primele', async () => {
    const { repo } = setup();
    const doc = studioProject();
    await repo.create(doc, NOW);
    for (let i = 0; i < 9; i++) await repo.addSnapshot(doc, i % 2 ? 'manual' : 'auto', at(i));
    const list = await repo.listSnapshots('studio');
    expect(list.map((s) => s.createdAt)).toEqual([at(8), at(7), at(6), at(5), at(4)]);
  });

  it('copiile altui proiect nu se influențează reciproc', async () => {
    const { repo } = setup();
    const a = studioProject();
    const b = { ...studioProject(), id: 'altul' };
    await repo.create(a, NOW);
    await repo.create(b, NOW);
    for (let i = 0; i < 8; i++) await repo.addSnapshot(a, 'pre-overwrite', at(i));
    await repo.addSnapshot(b, 'pre-overwrite', at(30));
    expect(countOf(await repo.listSnapshots('altul'), 'pre-overwrite')).toBe(1);
    expect(countOf(await repo.listSnapshots('studio'), 'pre-overwrite')).toBe(
      SAFETY_SNAPSHOTS_KEPT,
    );
  });
});
