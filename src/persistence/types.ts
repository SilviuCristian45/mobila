// Contractele stratului de persistență. `state/` depinde doar de aceste tipuri (injecție), nu de Dexie.
import type { ImportStage, ProjectDocument } from '@/domain';

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  schemaVersion: number;
  /** Crește la fiecare salvare reușită; baza concurenței optimiste. */
  revision: number;
  counts: { rooms: number; objects: number };
}

export interface StoredProject {
  doc: ProjectDocument;
  revision: number;
  /** Versiunea de la care documentul a fost migrat la încărcare (dacă a fost); apelantul îl salvează. */
  migratedFrom?: number;
}

export type LoadFailure =
  | { kind: 'not-found' }
  | {
      kind: 'corrupt';
      stage: Exclude<ImportStage, 'size' | 'parse' | 'envelope' | 'remap'>;
      errors: string[];
      revision: number;
    }
  | { kind: 'storage'; error: StorageFailure };

export type LoadResult = { ok: true; value: StoredProject } | { ok: false; failure: LoadFailure };

export type SnapshotReason = 'auto' | 'pre-migration' | 'pre-import' | 'pre-overwrite' | 'manual';
export interface SnapshotMeta {
  id: string;
  projectId: string;
  createdAt: string;
  reason: SnapshotReason;
  schemaVersion: number;
}

export interface StorageInfo {
  /** `true` dacă browserul a promis să nu șteargă datele fără acordul utilizatorului. */
  persisted: boolean | null;
  usageBytes: number | null;
  quotaBytes: number | null;
}

/** Eșec de stocare, clasificat pentru interfață. */
export interface StorageFailure {
  kind: 'quota' | 'unavailable' | 'storage';
  message: string;
}

export interface ProjectRepository {
  list(): Promise<ProjectMeta[]>;
  load(id: string): Promise<LoadResult>;
  /** Creează un proiect nou (revizia 1). Aruncă `RevisionConflictError('exists')` dacă ID-ul există. */
  create(doc: ProjectDocument, now: string): Promise<number>;
  /** Salvare atomică (meta + document) cu concurență optimistă. Întoarce noua revizie. */
  save(doc: ProjectDocument, expectedRevision: number, now: string): Promise<number>;
  /** Redenumire = modificare de document (crește revizia). */
  rename(id: string, name: string, now: string): Promise<number>;
  remove(id: string): Promise<void>;
  addSnapshot(doc: ProjectDocument, reason: SnapshotReason, now: string): Promise<void>;
  listSnapshots(projectId: string): Promise<SnapshotMeta[]>;
  loadSnapshot(snapshotId: string): Promise<LoadResult>;
}

/** Blocare exclusivă per proiect între taburi. */
export interface LockHandle {
  /** Eliberează blocarea (idempotent). */
  release(): Promise<void>;
  /** Apelat dacă blocarea ne-a fost luată (ex. „preia controlul” din alt tab). */
  onLost(listener: () => void): void;
}
export interface ProjectLockProvider {
  /** `null` dacă proiectul e deja deschis în altă parte. */
  tryAcquire(projectId: string): Promise<LockHandle | null>;
  /** Ia blocarea cu forța; deținătorul anterior primește `onLost`. */
  steal(projectId: string): Promise<LockHandle>;
}
