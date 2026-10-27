// Harness de test: expune pe `window.rc` gestionarul REAL de proiecte (Dexie + IndexedDB + Web Locks din browser).
// Parametri URL: ?db=<nume bază> (izolare între teste), ?locks=none (fără excludere între taburi, doar revizii).
import { DexieProjectRepository } from '@/persistence/repository';
import { RoomcraftDb } from '@/persistence/db';
import { NoLockProvider, createLockProvider } from '@/persistence/locks';
import { getStorageInfo, requestPersistentStorage } from '@/persistence/storage-info';
import { attachLifecycle } from '@/state/lifecycle';
import { createProjectManager } from '@/state/manager';
import type { ProjectSession } from '@/state/session';

const params = new URLSearchParams(location.search);
const db = new RoomcraftDb(params.get('db') ?? 'roomcraft-harness');
const repo = new DexieProjectRepository(db);
const manager = createProjectManager({
  repository: repo,
  locks: params.get('locks') === 'none' ? new NoLockProvider() : createLockProvider(navigator),
  genId: () => crypto.randomUUID(),
});

let current: ProjectSession | null = null;
let detach: (() => void) | null = null;

const api = {
  manager,
  repo,
  get session(): ProjectSession | null {
    return current;
  },
  /** Deschide un proiect și îl face sesiune curentă (cu legătura de ciclu de viață). */
  async open(id: string, takeOver = false) {
    const r = await manager.open(id, { takeOver });
    if (!r.ok) return { ok: false as const, error: r.error };
    detach?.();
    current = r.value;
    detach = attachLifecycle(current, window, document);
    return { ok: true as const, state: current.getState() };
  },
  state() {
    const s = current?.getState();
    return s && { ...s, doc: undefined, name: s.doc.name, sofaX: s.doc.objects.oSofa?.position.x };
  },
  moveSofa(x: number) {
    return current!.commit('mută canapea', (d) => {
      d.objects.oSofa!.position.x = x;
    });
  },
  persistence: () => requestPersistentStorage(navigator.storage),
  storageInfo: () => getStorageInfo(navigator.storage),
};
(window as unknown as { rc: typeof api }).rc = api;
document.getElementById('ready')!.textContent = 'ready';
