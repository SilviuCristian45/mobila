'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { StorageFailure } from '@/persistence/types';
import {
  createBrowserRuntime,
  RuntimeUnavailableError,
  type ProjectRuntime,
} from './browser-runtime';

export type RuntimeState =
  | { phase: 'initializing' }
  | { phase: 'ready'; runtime: ProjectRuntime }
  | { phase: 'unavailable'; failure: StorageFailure };

const RuntimeContext = createContext<RuntimeState | null>(null);

export interface ProjectProviderProps {
  children: ReactNode;
  /**
   * Fabrica de runtime. Implicit: adaptorul pentru browser. Se apelează DOAR într-un efect (client), deci prerandarea
   * statică nu atinge niciodată API-uri de browser. Testele o înlocuiesc cu una peste fake-indexeddb.
   */
  createRuntime?: () => Promise<ProjectRuntime>;
}

const defaultCreate = (): Promise<ProjectRuntime> => createBrowserRuntime();

export function ProjectProvider({ children, createRuntime = defaultCreate }: ProjectProviderProps) {
  const [state, setState] = useState<RuntimeState>({ phase: 'initializing' });

  useEffect(() => {
    let cancelled = false;
    let created: ProjectRuntime | null = null;
    createRuntime().then(
      (runtime) => {
        created = runtime;
        if (cancelled) void runtime.dispose();
        else setState({ phase: 'ready', runtime });
      },
      (e: unknown) => {
        if (cancelled) return;
        const failure: StorageFailure =
          e instanceof RuntimeUnavailableError
            ? e.failure
            : {
                kind: 'unavailable',
                message: e instanceof Error ? e.message : 'Inițializarea stocării a eșuat.',
              };
        setState({ phase: 'unavailable', failure });
      },
    );
    return () => {
      cancelled = true;
      if (created) void created.dispose();
    };
  }, [createRuntime]);

  return <RuntimeContext.Provider value={state}>{children}</RuntimeContext.Provider>;
}

export function useRuntimeState(): RuntimeState {
  const ctx = useContext(RuntimeContext);
  if (!ctx) throw new Error('useRuntimeState trebuie folosit sub <ProjectProvider>.');
  return ctx;
}
