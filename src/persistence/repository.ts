// Depozitul de proiecte peste Dexie/IndexedDB. Toate operațiile de scriere sunt tranzacții atomice (meta + document).
import { parseProjectDocument, type ParseOptions, type ProjectDocument } from '@/domain';
import type { RoomcraftDb, SnapshotRow } from './db';
import { RevisionConflictError, StorageError, toStorageFailure, wrapStorageError } from './errors';
import type {
  LoadResult,
  ProjectMeta,
  ProjectRepository,
  SnapshotMeta,
  SnapshotReason,
} from './types';

/** Plafonul copiilor obișnuite (`auto`, `manual`): se păstrează cele mai noi. */
export const SNAPSHOTS_KEPT = 5;
/**
 * Copiile de siguranță create înainte de o operație distructivă (`pre-migration`, `pre-overwrite`, `pre-import`) NU
 * intră în plafonul de mai sus: altfel ar fi tăiate de copiile automate mai noi tocmai când sunt mai utile. Au plafon
 * propriu, per motiv.
 */
export const SAFETY_SNAPSHOTS_KEPT = 3;

const isSafetyReason = (reason: SnapshotReason): boolean => reason.startsWith('pre-');
const versionOf = (raw: unknown): number => {
  const v = (raw as { schemaVersion?: unknown } | null)?.schemaVersion;
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0;
};

const metaOf = (doc: ProjectDocument, revision: number, now: string): ProjectMeta => ({
  id: doc.id,
  name: doc.name,
  createdAt: doc.createdAt,
  updatedAt: now,
  schemaVersion: doc.schemaVersion,
  revision,
  counts: { rooms: Object.keys(doc.rooms).length, objects: Object.keys(doc.objects).length },
});

export class DexieProjectRepository implements ProjectRepository {
  constructor(
    private readonly db: RoomcraftDb,
    private readonly parseOptions: ParseOptions = {},
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (e) {
      throw wrapStorageError(e);
    }
  }

  list(): Promise<ProjectMeta[]> {
    return this.guard(async () => await this.db.projects.orderBy('updatedAt').reverse().toArray());
  }

  async load(id: string): Promise<LoadResult> {
    try {
      const row = await this.db.documents.get(id);
      if (!row) return { ok: false, failure: { kind: 'not-found' } };
      return await this.parseRow(row.data, row.revision, id, true);
    } catch (e) {
      return { ok: false, failure: { kind: 'storage', error: toStorageFailure(e) } };
    }
  }

  loadRaw(id: string): Promise<{ data: unknown; revision: number } | null> {
    return this.guard(async () => {
      const row = await this.db.documents.get(id);
      return row ? { data: row.data, revision: row.revision } : null;
    });
  }

  private async parseRow(
    raw: unknown,
    revision: number,
    id: string,
    backupBeforeMigration: boolean,
  ): Promise<LoadResult> {
    const parsed = parseProjectDocument(raw, this.parseOptions);
    if (!parsed.ok)
      return {
        ok: false,
        failure: { kind: 'corrupt', stage: parsed.stage, errors: parsed.errors, revision },
      };
    if (parsed.doc.id !== id) {
      return {
        ok: false,
        failure: {
          kind: 'corrupt',
          stage: 'integrity',
          errors: [`id-ul documentului (${parsed.doc.id}) ≠ cheia din stocare (${id})`],
          revision,
        },
      };
    }
    if (parsed.migratedFrom !== undefined && backupBeforeMigration) {
      // copie de siguranță a documentului brut, înainte ca versiunea migrată să-l înlocuiască
      const key = `${id}:pre-migration:${revision}`;
      const migratedFrom = parsed.migratedFrom;
      await this.db.transaction('rw', this.db.snapshots, async () => {
        if (await this.db.snapshots.get(key)) return; // aceeași revizie ⇒ același document brut, deja arhivat
        await this.db.snapshots.put({
          id: key,
          projectId: id,
          createdAt: this.now(), // momentul copierii, nu data documentului: copia nu e „cea mai veche”
          reason: 'pre-migration',
          schemaVersion: migratedFrom,
          data: raw,
        });
        await this.prune(id);
      });
    }
    return {
      ok: true,
      value: {
        doc: parsed.doc,
        revision,
        ...(parsed.migratedFrom !== undefined ? { migratedFrom: parsed.migratedFrom } : {}),
      },
    };
  }

  create(doc: ProjectDocument, now: string): Promise<number> {
    return this.guard(() =>
      this.db.transaction('rw', this.db.projects, this.db.documents, async () => {
        const existing = await this.db.documents.get(doc.id);
        if (existing) throw new RevisionConflictError('exists', 0, existing.revision);
        const stored = { ...doc, updatedAt: now };
        await this.db.documents.put({ projectId: doc.id, revision: 1, data: stored });
        await this.db.projects.put(metaOf(stored, 1, now));
        return 1;
      }),
    );
  }

  save(doc: ProjectDocument, expectedRevision: number, now: string): Promise<number> {
    return this.guard(() =>
      this.db.transaction('rw', this.db.projects, this.db.documents, async () => {
        const row = await this.db.documents.get(doc.id);
        if (!row) throw new RevisionConflictError('deleted', expectedRevision, 0);
        if (row.revision !== expectedRevision)
          throw new RevisionConflictError('changed', expectedRevision, row.revision);
        const revision = row.revision + 1;
        const stored = { ...doc, updatedAt: now };
        await this.db.documents.put({ projectId: doc.id, revision, data: stored });
        await this.db.projects.put(metaOf(stored, revision, now));
        return revision;
      }),
    );
  }

  overwriteUnreadable(
    doc: ProjectDocument,
    expectedRevision: number,
    now: string,
  ): Promise<number> {
    return this.guard(() =>
      this.db.transaction(
        'rw',
        this.db.projects,
        this.db.documents,
        this.db.snapshots,
        async () => {
          const row = await this.db.documents.get(doc.id);
          if (!row) throw new RevisionConflictError('deleted', expectedRevision, 0);
          if (row.revision !== expectedRevision)
            throw new RevisionConflictError('changed', expectedRevision, row.revision);
          // rândul brut (cu orice câmpuri necunoscute) se arhivează în aceeași tranzacție cu suprascrierea
          await this.db.snapshots.put({
            id: `${doc.id}:${now}:pre-overwrite:r${row.revision}`,
            projectId: doc.id,
            createdAt: now,
            reason: 'pre-overwrite',
            schemaVersion: versionOf(row.data),
            data: row.data,
          });
          const revision = row.revision + 1;
          const stored = { ...doc, updatedAt: now };
          await this.db.documents.put({ projectId: doc.id, revision, data: stored });
          await this.db.projects.put(metaOf(stored, revision, now));
          await this.prune(doc.id);
          return revision;
        },
      ),
    );
  }

  rename(id: string, name: string, now: string): Promise<number> {
    return this.guard(() =>
      this.db.transaction('rw', this.db.projects, this.db.documents, async () => {
        const row = await this.db.documents.get(id);
        if (!row) throw new RevisionConflictError('deleted', 0, 0);
        const parsed = parseProjectDocument(row.data, this.parseOptions);
        if (!parsed.ok)
          throw new StorageError({
            kind: 'storage',
            message: `Proiectul nu poate fi redenumit: document invalid (${parsed.errors[0] ?? parsed.stage}).`,
          });
        const revision = row.revision + 1;
        const stored = { ...parsed.doc, name, updatedAt: now };
        await this.db.documents.put({ projectId: id, revision, data: stored });
        await this.db.projects.put(metaOf(stored, revision, now));
        return revision;
      }),
    );
  }

  remove(id: string): Promise<void> {
    return this.guard(() =>
      this.db.transaction(
        'rw',
        this.db.projects,
        this.db.documents,
        this.db.snapshots,
        async () => {
          await this.db.documents.delete(id);
          await this.db.projects.delete(id);
          await this.db.snapshots.where('projectId').equals(id).delete();
        },
      ),
    );
  }

  addSnapshot(doc: ProjectDocument, reason: SnapshotReason, now: string): Promise<void> {
    return this.guard(() =>
      this.db.transaction('rw', this.db.snapshots, async () => {
        await this.db.snapshots.put({
          id: `${doc.id}:${now}:${reason}`,
          projectId: doc.id,
          createdAt: now,
          reason,
          schemaVersion: doc.schemaVersion,
          data: doc,
        });
        await this.prune(doc.id);
      }),
    );
  }

  /** Retenția: SNAPSHOTS_KEPT pentru copii obișnuite, SAFETY_SNAPSHOTS_KEPT per motiv pentru cele `pre-*`. */
  private async prune(projectId: string): Promise<void> {
    const all = await this.db.snapshots.where('projectId').equals(projectId).sortBy('createdAt');
    const groups = new Map<string, SnapshotRow[]>();
    for (const row of all) {
      const group = isSafetyReason(row.reason) ? row.reason : 'regular';
      groups.set(group, [...(groups.get(group) ?? []), row]);
    }
    const excess: string[] = [];
    for (const [group, rows] of groups) {
      const limit = group === 'regular' ? SNAPSHOTS_KEPT : SAFETY_SNAPSHOTS_KEPT;
      excess.push(...rows.slice(0, Math.max(0, rows.length - limit)).map((r) => r.id));
    }
    await this.db.snapshots.bulkDelete(excess);
  }

  listSnapshots(projectId: string): Promise<SnapshotMeta[]> {
    return this.guard(async () => {
      const rows: SnapshotRow[] = await this.db.snapshots
        .where('projectId')
        .equals(projectId)
        .sortBy('createdAt');
      return rows.reverse().map(({ id, createdAt, reason, schemaVersion }) => ({
        id,
        projectId,
        createdAt,
        reason,
        schemaVersion,
      }));
    });
  }

  async loadSnapshot(snapshotId: string): Promise<LoadResult> {
    try {
      const row = await this.db.snapshots.get(snapshotId);
      if (!row) return { ok: false, failure: { kind: 'not-found' } };
      return await this.parseRow(row.data, 0, row.projectId, false);
    } catch (e) {
      return { ok: false, failure: { kind: 'storage', error: toStorageFailure(e) } };
    }
  }
}
