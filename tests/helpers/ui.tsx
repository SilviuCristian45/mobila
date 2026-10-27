import 'fake-indexeddb/auto';
import { cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, vi } from 'vitest';
import type { ProjectRuntime } from '@/lib/project-runtime/browser-runtime';
import { ProjectProvider } from '@/lib/project-runtime/ProjectProvider';
import type { ProjectManager } from '@/state/manager';
import { FakeClock, FakeLockProvider, openTab, uniqueDbName, type Tab } from './env';

export interface UiEnv {
  clock: FakeClock;
  locks: FakeLockProvider;
  dbName: string;
  /** Un „tab” nou peste aceeași bază și aceleași blocări. */
  newTab: () => Tab;
  tab: Tab;
  navigate: ReturnType<typeof vi.fn<(href: string) => void>>;
  requestPersistence: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  runtimeFor: (tab: Tab, manager?: ProjectManager) => ProjectRuntime;
}

const closers: Array<() => void> = [];
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  closers.splice(0).forEach((c) => c());
});

export function uiEnv(): UiEnv {
  const clock = new FakeClock();
  const locks = new FakeLockProvider();
  const dbName = uniqueDbName();
  const navigate = vi.fn<(href: string) => void>();
  const requestPersistence = vi.fn<() => Promise<boolean>>(async () => true);
  const newTab = (): Tab => {
    const t = openTab(dbName, { clock, locks });
    closers.push(() => t.db.close());
    return t;
  };
  const runtimeFor = (tab: Tab, manager: ProjectManager = tab.manager): ProjectRuntime => ({
    manager,
    navigate,
    requestPersistence,
    storageInfo: async () => ({ persisted: null, usageBytes: null, quotaBytes: null }),
    dispose: async () => {},
  });
  return { clock, locks, dbName, newTab, tab: newTab(), navigate, requestPersistence, runtimeFor };
}

/** Randează sub ProjectProvider cu un runtime dat (peste fake-indexeddb), nu cu cel al browserului. */
export function renderWithRuntime(
  ui: ReactElement,
  runtime: ProjectRuntime | (() => Promise<ProjectRuntime>),
) {
  const create = typeof runtime === 'function' ? runtime : async () => runtime;
  return render(<ProjectProvider createRuntime={create}>{ui}</ProjectProvider>);
}

export const isoOf = (clock: FakeClock): string => clock.nowIso();
