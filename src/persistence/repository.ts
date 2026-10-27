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

export const SNAPSHOTS_KEPT = 5;

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
      await this.db.snapshots.put({
        id: `${id}:pre-migration:${revision}`,
        projectId: id,
        createdAt: parsed.doc.updatedAt,
        reason: 'pre-migration',
        schemaVersion: parsed.migratedFrom,
        data: raw,
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
        const all = await this.db.snapshots.where('projectId').equals(doc.id).sortBy('createdAt');
        const excess = all.slice(0, Math.max(0, all.length - SNAPSHOTS_KEPT));
        await this.db.snapshots.bulkDelete(excess.map((s) => s.id));
      }),
    );
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
