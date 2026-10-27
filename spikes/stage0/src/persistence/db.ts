// SPIKE — Dexie: magazii projects/documents/snapshots (ARCHITECTURE §7.1). Fără efecte la import de modul.
import Dexie, { type Table } from 'dexie';
import type { ProjectDocument } from '@/domain/schema';

export interface ProjectMeta { id: string; name: string; createdAt: string; updatedAt: string; schemaVersion: number; revision: number }
export interface StoredDocument { projectId: string; revision: number; data: ProjectDocument }
export interface SnapshotRow { id: string; projectId: string; createdAt: string; reason: 'auto' | 'pre-migration' | 'pre-import' | 'manual'; data: ProjectDocument }

export class RevisionConflict extends Error {
  constructor(public expected: number, public actual: number) { super(`Conflict de revizie: așteptat ${expected}, găsit ${actual}`); }
}

export class RcDb extends Dexie {
  projects!: Table<ProjectMeta, string>;
  documents!: Table<StoredDocument, string>;
  snapshots!: Table<SnapshotRow, string>;
  constructor(name = 'roomcraft') {
    super(name);
    this.version(1).stores({ projects: 'id, updatedAt', documents: 'projectId', snapshots: 'id, projectId, createdAt' });
  }
}

let shared: RcDb | null = null;
/** Inițializare lazy: nu atinge indexedDB până la prima utilizare (compatibil cu prerandarea). */
export const getDb = (): RcDb => (shared ??= new RcDb());

/** Salvare atomică (meta + document) cu concurență optimistă; întoarce noua revizie. */
export async function saveDocument(db: RcDb, doc: ProjectDocument, expectedRevision: number, now = new Date().toISOString()): Promise<number> {
  return db.transaction('rw', db.projects, db.documents, async () => {
    const row = await db.documents.get(doc.id);
    const actual = row?.revision ?? 0;
    if (actual !== expectedRevision) throw new RevisionConflict(expectedRevision, actual);
    const revision = actual + 1;
    const data = { ...doc, updatedAt: now };
    await db.documents.put({ projectId: doc.id, revision, data });
    await db.projects.put({ id: doc.id, name: doc.name, createdAt: doc.createdAt, updatedAt: now, schemaVersion: doc.schemaVersion, revision });
    return revision;
  });
}

export async function loadDocument(db: RcDb, id: string): Promise<{ doc: ProjectDocument; revision: number } | null> {
  const row = await db.documents.get(id);
  return row ? { doc: row.data, revision: row.revision } : null;
}

export async function addSnapshot(db: RcDb, doc: ProjectDocument, reason: SnapshotRow['reason'], keep = 5, now = new Date().toISOString()): Promise<void> {
  await db.transaction('rw', db.snapshots, async () => {
    await db.snapshots.put({ id: `${doc.id}:${now}:${Math.random().toString(36).slice(2, 8)}`, projectId: doc.id, createdAt: now, reason, data: doc });
    const all = await db.snapshots.where('projectId').equals(doc.id).sortBy('createdAt');
    for (const s of all.slice(0, Math.max(0, all.length - keep))) await db.snapshots.delete(s.id);
  });
}
