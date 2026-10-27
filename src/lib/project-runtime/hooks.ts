'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { SnapshotMeta, ProjectMeta, StorageFailure } from '@/persistence/types';
import { attachLifecycle } from '@/state/lifecycle';
import type { OpenFailure, ProjectManager } from '@/state/manager';
import type { ProjectSession, SessionState } from '@/state/session';

/** Abonare la o sesiune de proiect (contractul `subscribe`/`getState`) fără a duplica logica de stare. */
export function useSessionState(session: ProjectSession | null): SessionState | null {
  const subscribe = useCallback(
    (onChange: () => void) => (session ? session.subscribe(() => onChange()) : () => {}),
    [session],
  );
  return useSyncExternalStore(
    subscribe,
    () => (session ? session.getState() : null),
    () => null, // serverul (prerandare) nu are sesiuni
  );
}

export type ListState =
  | { phase: 'loading' }
  | { phase: 'ready'; projects: ProjectMeta[] }
  | { phase: 'error'; failure: StorageFailure };

/** Lista proiectelor, cu reîncărcare manuală. În timpul unei reîncărcări rămâne vizibilă lista anterioară. */
export function useProjectList(manager: ProjectManager): { state: ListState; reload: () => void } {
  const [tick, setTick] = useState(0);
  const [result, setResult] = useState<{ tick: number; value: ListState } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void manager.list().then((r) => {
      if (cancelled) return;
      setResult({
        tick,
        value: r.ok ? { phase: 'ready', projects: r.value } : { phase: 'error', failure: r.error },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [manager, tick]);
  const state: ListState =
    result && (result.tick === tick || result.value.phase === 'ready')
      ? result.value
      : { phase: 'loading' };
  return { state, reload: useCallback(() => setTick((n) => n + 1), []) };
}

export type SessionPhase =
  | { phase: 'loading' }
  | { phase: 'ready'; session: ProjectSession }
  | { phase: 'error'; failure: OpenFailure };

/** Câte efecte React folosesc acum sesiunea unui proiect (StrictMode montează de două ori: nu închidem prea devreme). */
const users = new WeakMap<ProjectManager, Map<string, number>>();
const usersOf = (m: ProjectManager, id: string): number => users.get(m)?.get(id) ?? 0;
function bumpUsers(m: ProjectManager, id: string, delta: number): void {
  const map = users.get(m) ?? new Map<string, number>();
  map.set(id, Math.max(0, (map.get(id) ?? 0) + delta));
  users.set(m, map);
}

/**
 * Deschide proiectul `projectId` (din URL) și îl închide când nu îl mai folosește nimeni. Atașează salvarea la
 * ascunderea/închiderea paginii. `takeOver` preia controlul când proiectul e deschis doar-citire pentru că altă filă
 * îl editează.
 */
export function useProjectSession(
  manager: ProjectManager,
  projectId: string | null,
): { state: SessionPhase; takeOver: () => Promise<void> } {
  // Rezultatul se leagă de proiectul pentru care a fost obținut; la schimbarea proiectului starea derivată revine la „loading”
  // fără setState sincron în efect.
  const [stored, setStored] = useState<{ id: string; value: SessionPhase } | null>(null);
  const detach = useRef<(() => void) | null>(null);

  const adopt = useCallback((id: string, session: ProjectSession) => {
    detach.current?.();
    detach.current = attachLifecycle(session, window, document);
    setStored({ id, value: { phase: 'ready', session } });
  }, []);

  useEffect(() => {
    if (projectId === null) return;
    let cancelled = false;
    bumpUsers(manager, projectId, +1);
    void manager.open(projectId).then((r) => {
      if (cancelled) {
        if (r.ok && usersOf(manager, projectId) === 0) void r.value.dispose();
        return;
      }
      if (!r.ok) setStored({ id: projectId, value: { phase: 'error', failure: r.error } });
      else adopt(projectId, r.value);
    });
    return () => {
      cancelled = true;
      detach.current?.();
      detach.current = null;
      bumpUsers(manager, projectId, -1);
      setTimeout(() => {
        if (usersOf(manager, projectId) === 0)
          void manager.openSessions().get(projectId)?.dispose();
      }, 0);
    };
  }, [manager, projectId, adopt]);

  const takeOver = useCallback(async () => {
    if (projectId === null) return;
    const r = await manager.open(projectId, { takeOver: true });
    if (r.ok) adopt(projectId, r.value);
    else setStored({ id: projectId, value: { phase: 'error', failure: r.error } });
  }, [manager, projectId, adopt]);

  const state: SessionPhase =
    stored && stored.id === projectId ? stored.value : { phase: 'loading' };
  return { state, takeOver };
}

export type { SnapshotMeta };
