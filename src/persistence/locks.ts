// Blocare per proiect între taburi, prin Web Locks API. Fără suport (sau în teste) se folosește `NoLockProvider`;
// atunci protecția rămâne doar concurența optimistă pe `revision` (a doua linie de apărare, mereu activă).
import type { LockHandle, ProjectLockProvider } from './types';

interface LockManagerLike {
  request(
    name: string,
    options: { ifAvailable?: boolean; steal?: boolean; mode?: 'exclusive' | 'shared' },
    callback: (lock: unknown) => Promise<unknown> | unknown,
  ): Promise<unknown>;
}

const lockName = (projectId: string): string => `roomcraft:project:${projectId}`;

export class WebLockProvider implements ProjectLockProvider {
  constructor(private readonly locks: LockManagerLike) {}

  tryAcquire(projectId: string): Promise<LockHandle | null> {
    return this.request(projectId, { ifAvailable: true });
  }

  async steal(projectId: string): Promise<LockHandle> {
    const handle = await this.request(projectId, { steal: true });
    if (!handle) throw new Error('Blocarea nu a putut fi preluată.');
    return handle;
  }

  private request(
    projectId: string,
    options: { ifAvailable?: boolean; steal?: boolean },
  ): Promise<LockHandle | null> {
    return new Promise((resolve, reject) => {
      const lostListeners: Array<() => void> = [];
      let released = false;
      let lost = false;
      let settled = false;
      let freeLock!: () => void;
      const held = new Promise<void>((r) => (freeLock = r));
      this.locks
        .request(lockName(projectId), { mode: 'exclusive', ...options }, async (lock) => {
          if (!lock) {
            settled = true;
            resolve(null);
            return;
          }
          settled = true;
          resolve({
            release: async () => {
              released = true;
              freeLock();
              await held;
            },
            onLost: (listener) => {
              if (lost) listener();
              else lostListeners.push(listener);
            },
          });
          await held;
        })
        .catch((e: unknown) => {
          // Blocarea a fost luată de alt tab (steal) → AbortError; deținătorul devine „pierdut”.
          if (!settled) {
            reject(e);
            return;
          }
          if (!released) {
            lost = true;
            lostListeners.forEach((l) => l());
          }
          freeLock();
        });
    });
  }
}

/** Fără excludere între taburi: întotdeauna reușește. */
export class NoLockProvider implements ProjectLockProvider {
  async tryAcquire(): Promise<LockHandle> {
    return { release: async () => {}, onLost: () => {} };
  }
  steal(): Promise<LockHandle> {
    return this.tryAcquire();
  }
}

/** `navigator.locks` dacă există, altfel fără blocare. Primește `navigator` din exterior. */
export function createLockProvider(nav: { locks?: unknown } | undefined): ProjectLockProvider {
  return nav?.locks ? new WebLockProvider(nav.locks as LockManagerLike) : new NoLockProvider();
}
