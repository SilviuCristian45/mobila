// Mediu de test pentru persistență/stare: IndexedDB fals (fake-indexeddb), ceas manual, blocări false, taburi simulate.
// IndexedDB fals trebuie încărcat ÎNAINTE de Dexie (Dexie își fixează `indexedDB` la încărcarea modulului)
import 'fake-indexeddb/auto';
import { DexieProjectRepository } from '@/persistence/repository';
import { RoomcraftDb } from '@/persistence/db';
import type { LockHandle, ProjectLockProvider } from '@/persistence/types';
import type { Clock } from '@/state/clock';
import { createProjectManager, type ProjectManager } from '@/state/manager';
import type { ParseOptions } from '@/domain';
import type { SessionOptions } from '@/state/session';

let dbCounter = 0;
export const uniqueDbName = (): string =>
  `rc-test-${++dbCounter}-${Math.random().toString(36).slice(2, 8)}`;

/** Ceas manual: timerele rulează doar la `advance`. Fiecare pas așteaptă finalizarea operațiilor IndexedDB (macro-sarcini reale). */
export class FakeClock implements Clock {
  private t = 0;
  private seq = 0;
  private timers: Array<{ id: number; at: number; cb: () => void }> = [];
  constructor(private readonly baseMs = Date.parse('2026-10-27T10:00:00.000Z')) {}
  nowMs = (): number => this.baseMs + this.t;
  nowIso = (): string => new Date(this.baseMs + this.t).toISOString();
  setTimer = (cb: () => void, ms: number): unknown => {
    const id = ++this.seq;
    this.timers.push({ id, at: this.t + ms, cb });
    return id;
  };
  clearTimer = (h: unknown): void => {
    this.timers = this.timers.filter((x) => x.id !== h);
  };
  get pendingTimers(): number {
    return this.timers.length;
  }
  async advance(ms: number): Promise<void> {
    const target = this.t + ms;
    for (;;) {
      const next = this.timers
        .filter((x) => x.at <= target)
        .sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!next) break;
      this.timers = this.timers.filter((x) => x.id !== next.id);
      this.t = Math.max(this.t, next.at);
      next.cb();
      await settle();
    }
    this.t = target;
  }
}

/** Lasă operațiile IndexedDB false (care se termină pe macro-sarcini) să se încheie. */
export async function settle(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i++) await new Promise<void>((r) => setImmediate(r));
}

/** Blocări între „taburi” simulate, cu semantica `ifAvailable` și `steal` din Web Locks. */
export class FakeLockProvider implements ProjectLockProvider {
  private holders = new Map<string, { lostListeners: Array<() => void>; token: object }>();
  async tryAcquire(projectId: string): Promise<LockHandle | null> {
    if (this.holders.has(projectId)) return null;
    return this.grant(projectId);
  }
  async steal(projectId: string): Promise<LockHandle> {
    const holder = this.holders.get(projectId);
    if (holder) {
      this.holders.delete(projectId);
      holder.lostListeners.forEach((l) => l());
    }
    return this.grant(projectId);
  }
  isHeld(projectId: string): boolean {
    return this.holders.has(projectId);
  }
  private grant(projectId: string): LockHandle {
    const token = {};
    const entry = { lostListeners: [] as Array<() => void>, token };
    this.holders.set(projectId, entry);
    return {
      release: async () => {
        if (this.holders.get(projectId)?.token === token) this.holders.delete(projectId);
      },
      onLost: (l) => entry.lostListeners.push(l),
    };
  }
}

export interface Tab {
  db: RoomcraftDb;
  repo: DexieProjectRepository;
  manager: ProjectManager;
}

/** Un „tab” = conexiune proprie la aceeași bază IndexedDB + manager propriu; partajează ceasul și blocările. */
export function openTab(
  dbName: string,
  shared: { clock: FakeClock; locks: ProjectLockProvider },
  extra: {
    parseOptions?: ParseOptions;
    ids?: () => string;
    sessionOptions?: Partial<SessionOptions>;
  } = {},
): Tab {
  const db = new RoomcraftDb(dbName);
  const repo = new DexieProjectRepository(db, extra.parseOptions);
  let n = 0;
  const manager = createProjectManager({
    repository: repo,
    locks: shared.locks,
    clock: shared.clock,
    genId: extra.ids ?? (() => `gen-${dbName.slice(-4)}-${++n}`),
    ...(extra.sessionOptions ? { sessionOptions: extra.sessionOptions } : {}),
  });
  return { db, repo, manager };
}

export const quotaError = (): Error =>
  Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' });
