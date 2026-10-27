// Schema IndexedDB (ARCHITECTURE §7.1). Nicio operație la import de modul: baza se deschide la prima utilizare.
import Dexie, { type Table } from 'dexie';
import type { ProjectMeta, SnapshotReason } from './types';

export interface StoredDocumentRow {
  projectId: string;
  revision: number;
  /** Documentul, ca JSON-compatibil; se validează la încărcare, nu se are încredere în el. */
  data: unknown;
}
export interface SnapshotRow {
  id: string;
  projectId: string;
  createdAt: string;
  reason: SnapshotReason;
  schemaVersion: number;
  data: unknown;
}

export const DB_NAME = 'roomcraft'; // identificator tehnic stabil (ADR-026)

export class RoomcraftDb extends Dexie {
  projects!: Table<ProjectMeta, string>;
  documents!: Table<StoredDocumentRow, string>;
  snapshots!: Table<SnapshotRow, string>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({
      projects: 'id, updatedAt',
      documents: 'projectId',
      snapshots: 'id, projectId, createdAt',
    });
  }
}
