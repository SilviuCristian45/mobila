// Adaptorul dintre gestionarul de proiecte (independent de React) și API-urile browserului.
// SE APELEAZĂ NUMAI PE CLIENT, din efecte: nu atinge window / navigator / indexedDB / Web Locks la import sau la prerandare.
import type { StorageInfo } from '@/persistence/storage-info';
import type { StorageFailure } from '@/persistence/types';
import type { ProjectManager } from '@/state/manager';
import type { SessionOptions } from '@/state/session';

export interface ProjectRuntime {
  manager: ProjectManager;
  /** Navigare completă (compatibilă cu hostingul static: ADR-031); în teste este înlocuită. */
  navigate(href: string): void;
  /** Cere stocare persistentă (apelat după un gest al utilizatorului; nu aruncă, nu blochează). */
  requestPersistence(): Promise<boolean>;
  storageInfo(): Promise<StorageInfo>;
  /** Închide sesiunile și conexiunea la baza de date. */
  dispose(): Promise<void>;
}

export class RuntimeUnavailableError extends Error {
  constructor(public readonly failure: StorageFailure) {
    super(failure.message);
    this.name = 'RuntimeUnavailableError';
  }
}

export interface BrowserRuntimeOptions {
  /** Nume alternativ pentru baza de date (teste / medii izolate). */
  dbName?: string;
  sessionOptions?: Partial<SessionOptions>;
}

export async function createBrowserRuntime(
  options: BrowserRuntimeOptions = {},
): Promise<ProjectRuntime> {
  if (typeof indexedDB === 'undefined') {
    throw new RuntimeUnavailableError({
      kind: 'unavailable',
      message: 'Browserul nu oferă IndexedDB.',
    });
  }
  // încărcare leneșă: Dexie și restul stocării nu intră în bundle-ul inițial al paginii
  const [
    { RoomcraftDb },
    { DexieProjectRepository },
    locks,
    storageInfo,
    { createProjectManager },
  ] = await Promise.all([
    import('@/persistence/db'),
    import('@/persistence/repository'),
    import('@/persistence/locks'),
    import('@/persistence/storage-info'),
    import('@/state/manager'),
  ]);
  const db = new RoomcraftDb(options.dbName);
  const manager = createProjectManager({
    repository: new DexieProjectRepository(db),
    locks: locks.createLockProvider(navigator),
    genId: () => crypto.randomUUID(),
    ...(options.sessionOptions ? { sessionOptions: options.sessionOptions } : {}),
  });
  return {
    manager,
    navigate: (href) => window.location.assign(href),
    requestPersistence: () => storageInfo.requestPersistentStorage(navigator.storage),
    storageInfo: () => storageInfo.getStorageInfo(navigator.storage),
    dispose: async () => {
      await manager.closeAll();
      db.close();
    },
  };
}
