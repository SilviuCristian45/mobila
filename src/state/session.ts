// Sesiunea proiectului activ: document în memorie + istoric undo/redo + autosave + stare de salvare.
// Independentă de React. Reguli: ADR-029 (istoric doar în memorie, doar patch-uri ale documentului, `updatedAt` în afara
// istoricului, ștergerile includ curățarea derivatelor în același patch, salvare single-flight cu verificare de revizie).
import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from 'immer';
import { createStore } from 'zustand/vanilla';
import { exportProject, parseProjectDocument, type ProjectDocument } from '@/domain';
import { RevisionConflictError, toStorageFailure } from '@/persistence/errors';
import type { LockHandle, ProjectRepository, StorageFailure } from '@/persistence/types';
import { systemClock, type Clock } from './clock';

enablePatches();

export type SessionStatus =
  'saved' | 'dirty' | 'saving' | 'error' | 'conflict' | 'readonly' | 'closed';

export interface SaveError {
  kind: StorageFailure['kind'];
  message: string;
  /** Când a apărut prima dată (ISO). */
  since: string;
  /** Încercări consecutive eșuate. */
  attempts: number;
}
export interface ConflictInfo {
  /** `changed` = alt tab/alt cod a salvat o revizie nouă; `deleted` = proiectul a fost șters. */
  kind: 'changed' | 'deleted';
  message: string;
}

export interface SessionState {
  projectId: string;
  /** Documentul curent (imuabil, cu partajare structurală). Rezultatele derivate NU sunt aici: vezi `selectors`. */
  doc: ProjectDocument;
  status: SessionStatus;
  error: SaveError | null;
  conflict: ConflictInfo | null;
  /** Revizia salvată cunoscută (0 = nesalvat încă). */
  revision: number;
  hasUnsavedChanges: boolean;
  readOnly: boolean;
  lockLost: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  historySize: number;
  lastSavedAt: string | null;
}

export interface SessionOptions {
  debounceMs: number;
  maxWaitMs: number;
  historyLimit: number;
  snapshotIntervalMs: number;
  /** Întârzieri între reîncercările automate după o eroare de stocare; ultima se repetă. */
  retryDelaysMs: readonly number[];
}
export const DEFAULT_SESSION_OPTIONS: SessionOptions = {
  debounceMs: 800,
  maxWaitMs: 5000,
  historyLimit: 100,
  snapshotIntervalMs: 10 * 60 * 1000,
  retryDelaysMs: [2000, 5000, 15000, 30000, 60000],
};

export type CommitResult =
  | { ok: true; changed: boolean }
  | {
      ok: false;
      reason: 'readonly' | 'closed' | 'invalid' | 'recipe-error';
      message: string;
      errors?: string[];
    };

export type ConflictResolution =
  { ok: true } | { ok: false; reason: 'no-conflict' | 'deleted' | 'storage'; message: string };

interface HistoryEntry {
  label: string;
  patches: Patch[];
  inverse: Patch[];
}

export interface SessionInit {
  doc: ProjectDocument;
  revision: number;
  repository: ProjectRepository;
  clock?: Clock;
  options?: Partial<SessionOptions>;
  /** Blocarea deținută de acest tab (sau `null` dacă nu există / proiect deschis doar-citire). */
  lock?: LockHandle | null;
  readOnly?: boolean;
  /** Documentul trebuie salvat imediat (ex. proiect nou sau migrat). */
  startDirty?: boolean;
  onClose?: () => void;
}

export interface ProjectSession {
  getState(): SessionState;
  subscribe(listener: (state: SessionState, previous: SessionState) => void): () => void;
  /** Aplică o modificare ca UN singur pas de undo. Respinge (fără efect) modificările care ar produce un document invalid. */
  commit(label: string, recipe: (draft: Draft<ProjectDocument>) => void): CommitResult;
  /**
   * Aplică o operație de domeniu care întoarce un document nou (ex. `removeObject`, `setLineOverride`, `withNodePositions`)
   * ca UN singur pas de undo. Diferențele se transformă în patch-uri fine (câte o intrare), deci ștergerea unui obiect și
   * curățarea suprascrierilor lui sunt același pas.
   */
  apply(
    label: string,
    operation: (
      current: ProjectDocument,
    ) => { ok: true; value: ProjectDocument } | { ok: false; error: string },
  ): CommitResult;
  rename(name: string): CommitResult;
  undo(): boolean;
  redo(): boolean;
  /** Salvează acum (așteaptă terminarea). */
  flush(): Promise<void>;
  /** Reîncearcă imediat după o eroare de stocare. */
  retrySave(): Promise<void>;
  /** Text `.roomcraft.json` al stării curente din memorie (copie de siguranță, funcționează chiar dacă stocarea e plină). */
  exportBackup(meta: { exportedAt: string; appVersion: string }): string;
  /** Conflict: aruncă modificările locale și încarcă versiunea din stocare. */
  reloadFromStorage(): Promise<ConflictResolution>;
  /** Conflict: păstrează modificările locale și le scrie peste versiunea din stocare (versiunea suprascrisă se arhivează). */
  overwriteStored(): Promise<ConflictResolution>;
  /** Conflict: salvează modificările locale ca proiect nou. */
  saveAsCopy(newId: string, newName: string): Promise<ConflictResolution>;
  /** Închide sesiunea: salvează (dacă se poate), eliberează blocarea. `saved: false` = au rămas modificări nesalvate. */
  dispose(): Promise<{ saved: boolean }>;
}

type PlainRecord = Record<string, unknown>;
const isPlain = (v: unknown): v is PlainRecord =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Copiază în `draft` doar diferențele față de `target` (rădăcină → tabel → entitate), pentru patch-uri fine. */
function assignDifferences(draft: PlainRecord, target: PlainRecord, depth: number): void {
  for (const key of Object.keys(draft)) if (!(key in target)) delete draft[key];
  for (const [key, value] of Object.entries(target)) {
    const current = draft[key];
    if (JSON.stringify(current) === JSON.stringify(value)) continue;
    if (depth < 2 && isPlain(current) && isPlain(value))
      assignDifferences(current, value, depth + 1);
    else draft[key] = value;
  }
}

export function createProjectSession(init: SessionInit): ProjectSession {
  const repo = init.repository;
  const clock = init.clock ?? systemClock;
  const opts: SessionOptions = { ...DEFAULT_SESSION_OPTIONS, ...init.options };

  let doc = init.doc;
  let revision = init.revision;
  let past: HistoryEntry[] = [];
  let future: HistoryEntry[] = [];
  let editVersion = init.startDirty || init.revision === 0 ? 1 : 0;
  let savedEditVersion = 0;
  let saving = false;
  let closed = false;
  /** `dispose()` a început (salvarea finală e în curs): sesiunea nu mai acceptă modificări și se raportează ca închisă. */
  let disposing = false;
  let readOnly = init.readOnly ?? false;
  let lockLost = false;
  let error: SaveError | null = null;
  let conflict: ConflictInfo | null = null;
  let lastSavedAt: string | null = null;
  let timer: unknown = null;
  let retryTimer: unknown = null;
  let firstDirtyAt: number | null = null;
  let attempts = 0;
  let running: Promise<void> | null = null;
  let lastSnapshotMs = clock.nowMs();

  const initial: SessionState = snapshotState();
  const store = createStore<SessionState>(() => initial);

  function deriveStatus(): SessionStatus {
    if (closed || disposing) return 'closed';
    if (readOnly) return 'readonly';
    if (conflict) return 'conflict';
    if (error) return 'error';
    if (saving) return 'saving';
    return editVersion !== savedEditVersion ? 'dirty' : 'saved';
  }
  function snapshotState(): SessionState {
    const last = past[past.length - 1];
    const next = future[future.length - 1];
    return {
      projectId: doc.id,
      doc,
      status: deriveStatus(),
      error,
      conflict,
      revision,
      hasUnsavedChanges: editVersion !== savedEditVersion,
      readOnly,
      lockLost,
      canUndo: !readOnly && !closed && !disposing && past.length > 0,
      canRedo: !readOnly && !closed && !disposing && future.length > 0,
      undoLabel: last?.label ?? null,
      redoLabel: next?.label ?? null,
      historySize: past.length,
      lastSavedAt,
    };
  }
  const publish = () => store.setState(snapshotState(), true);

  // ───────────── modificări ─────────────
  function commit(label: string, recipe: (draft: Draft<ProjectDocument>) => void): CommitResult {
    if (closed || disposing)
      return { ok: false, reason: 'closed', message: 'Sesiunea este închisă.' };
    if (readOnly)
      return {
        ok: false,
        reason: 'readonly',
        message: 'Proiectul este deschis doar pentru citire.',
      };
    let next: ProjectDocument;
    let patches: Patch[];
    let inverse: Patch[];
    try {
      [next, patches, inverse] = produceWithPatches(doc, recipe);
    } catch (e) {
      return {
        ok: false,
        reason: 'recipe-error',
        message: e instanceof Error ? e.message : 'Modificarea a eșuat.',
      };
    }
    if (patches.length === 0) return { ok: true, changed: false };
    const verdict = parseProjectDocument(next);
    if (!verdict.ok) {
      return {
        ok: false,
        reason: 'invalid',
        message: 'Modificarea ar produce un document invalid și a fost respinsă.',
        errors: verdict.errors,
      };
    }
    doc = next;
    past = [...past, { label, patches, inverse }].slice(-opts.historyLimit);
    future = [];
    editVersion++;
    publish();
    schedule();
    return { ok: true, changed: true };
  }

  function undo(): boolean {
    const entry = past[past.length - 1];
    if (!entry || readOnly || closed || disposing) return false;
    doc = applyPatches(doc, entry.inverse);
    past = past.slice(0, -1);
    future = [...future, entry];
    editVersion++;
    publish();
    schedule();
    return true;
  }
  function redo(): boolean {
    const entry = future[future.length - 1];
    if (!entry || readOnly || closed || disposing) return false;
    doc = applyPatches(doc, entry.patches);
    future = future.slice(0, -1);
    past = [...past, entry];
    editVersion++;
    publish();
    schedule();
    return true;
  }

  // ───────────── autosave ─────────────
  function clearTimers() {
    if (timer !== null) clock.clearTimer(timer);
    if (retryTimer !== null) clock.clearTimer(retryTimer);
    timer = null;
    retryTimer = null;
  }
  function schedule() {
    if (closed || readOnly || conflict || editVersion === savedEditVersion) return;
    if (retryTimer !== null) return; // o reîncercare e deja programată (cu întârziere crescătoare)
    const now = clock.nowMs();
    firstDirtyAt ??= now;
    if (timer !== null) clock.clearTimer(timer);
    const wait = Math.max(0, Math.min(opts.debounceMs, opts.maxWaitMs - (now - firstDirtyAt)));
    timer = clock.setTimer(() => {
      timer = null;
      void flush();
    }, wait);
  }
  function scheduleRetry() {
    if (closed || readOnly || conflict) return;
    const delays = opts.retryDelaysMs;
    const delay = delays[Math.min(attempts - 1, delays.length - 1)] ?? 60000;
    retryTimer = clock.setTimer(() => {
      retryTimer = null;
      void flush();
    }, delay);
  }

  async function runSaveLoop(): Promise<void> {
    while (!closed && !readOnly && !conflict && editVersion !== savedEditVersion) {
      const toSave = doc;
      const version = editVersion;
      saving = true;
      publish();
      try {
        const now = clock.nowIso();
        const newRevision =
          revision === 0 ? await repo.create(toSave, now) : await repo.save(toSave, revision, now);
        revision = newRevision;
        savedEditVersion = version;
        error = null;
        attempts = 0;
        lastSavedAt = now;
        firstDirtyAt = null;
        if (doc === toSave) doc = { ...doc, updatedAt: now }; // fără modificări concurente: aliniem `updatedAt`, fără istoric
        void maybeSnapshot(toSave);
      } catch (e) {
        if (e instanceof RevisionConflictError && e.kind !== 'exists') {
          conflict = { kind: e.kind === 'deleted' ? 'deleted' : 'changed', message: e.message };
        } else if (e instanceof RevisionConflictError) {
          conflict = { kind: 'changed', message: e.message };
        } else {
          const failure = (e as { failure?: StorageFailure }).failure ?? toStorageFailure(e);
          attempts++;
          error = {
            kind: failure.kind,
            message: failure.message,
            since: error?.since ?? clock.nowIso(),
            attempts,
          };
          scheduleRetry();
        }
        return; // modificările rămân în memorie (editVersion ≠ savedEditVersion): niciodată pierdere silențioasă
      } finally {
        saving = false;
        publish();
      }
    }
  }

  async function maybeSnapshot(saved: ProjectDocument): Promise<void> {
    const t = clock.nowMs();
    if (t - lastSnapshotMs < opts.snapshotIntervalMs) return;
    lastSnapshotMs = t;
    try {
      await repo.addSnapshot(saved, 'auto', clock.nowIso());
    } catch {
      /* copia de siguranță este best-effort; nu blochează salvarea */
    }
  }

  function flush(): Promise<void> {
    if (timer !== null) {
      clock.clearTimer(timer);
      timer = null;
    }
    if (retryTimer !== null) {
      clock.clearTimer(retryTimer);
      retryTimer = null;
    }
    if (!running) {
      running = runSaveLoop().finally(() => {
        running = null;
        // modificări sosite după ultima verificare a buclei: reprogramăm
        if (!closed && !readOnly && !conflict && !error && editVersion !== savedEditVersion)
          schedule();
      });
    }
    return running;
  }

  async function retrySave(): Promise<void> {
    attempts = 0;
    await flush();
  }

  // ───────────── rezolvarea conflictelor ─────────────
  async function reloadFromStorage(): Promise<ConflictResolution> {
    if (!conflict) return { ok: false, reason: 'no-conflict', message: 'Nu există conflict.' };
    const r = await repo.load(init.doc.id);
    if (!r.ok) {
      return r.failure.kind === 'not-found'
        ? { ok: false, reason: 'deleted', message: 'Proiectul nu mai există în stocare.' }
        : { ok: false, reason: 'storage', message: 'Versiunea din stocare nu poate fi încărcată.' };
    }
    doc = r.value.doc;
    revision = r.value.revision;
    past = [];
    future = [];
    editVersion = 0;
    savedEditVersion = 0;
    conflict = null;
    error = null;
    firstDirtyAt = null;
    publish();
    return { ok: true };
  }

  async function overwriteStored(): Promise<ConflictResolution> {
    if (!conflict) return { ok: false, reason: 'no-conflict', message: 'Nu există conflict.' };
    try {
      if (conflict.kind === 'deleted') {
        revision = 0; // recreăm proiectul
      } else {
        const remote = await repo.load(init.doc.id);
        if (remote.ok) {
          await repo.addSnapshot(remote.value.doc, 'pre-overwrite', clock.nowIso()); // versiunea suprascrisă rămâne recuperabilă
          revision = remote.value.revision;
        } else if (remote.failure.kind === 'corrupt') revision = remote.failure.revision;
        else if (remote.failure.kind === 'not-found') revision = 0;
        else return { ok: false, reason: 'storage', message: remote.failure.error.message };
      }
    } catch (e) {
      return { ok: false, reason: 'storage', message: toStorageFailure(e).message };
    }
    conflict = null;
    if (editVersion === savedEditVersion) editVersion++; // forțăm scrierea stării locale
    publish();
    await flush();
    return { ok: true };
  }

  async function saveAsCopy(newId: string, newName: string): Promise<ConflictResolution> {
    try {
      await repo.create({ ...doc, id: newId, name: newName }, clock.nowIso());
      return { ok: true };
    } catch (e) {
      if (e instanceof RevisionConflictError)
        return { ok: false, reason: 'storage', message: 'Există deja un proiect cu acest ID.' };
      return { ok: false, reason: 'storage', message: toStorageFailure(e).message };
    }
  }

  // ───────────── blocare între taburi ─────────────
  init.lock?.onLost(() => {
    if (closed) return;
    lockLost = true;
    // ultimă încercare de salvare, apoi doar-citire; ce rămâne nesalvat se poate exporta sau salva ca și copie
    void flush().finally(() => {
      readOnly = true;
      clearTimers();
      publish();
    });
  });

  let disposal: Promise<{ saved: boolean }> | null = null;
  /** Idempotent: apelurile repetate (ex. cleanup React + manager) așteaptă aceeași închidere. */
  const dispose = (): Promise<{ saved: boolean }> => (disposal ??= disposeOnce());

  async function disposeOnce(): Promise<{ saved: boolean }> {
    disposing = true;
    publish();
    if (!readOnly && !conflict) await flush();
    const saved = editVersion === savedEditVersion;
    closed = true;
    clearTimers();
    publish();
    try {
      await init.lock?.release();
    } finally {
      init.onClose?.();
    }
    return { saved };
  }

  if (editVersion !== savedEditVersion && !readOnly) schedule();
  publish();

  return {
    getState: store.getState,
    subscribe: (listener) => store.subscribe(listener),
    commit,
    apply: (label, operation) => {
      const r = operation(doc);
      if (!r.ok) return { ok: false, reason: 'recipe-error', message: r.error };
      const target = r.value;
      return commit(label, (draft) =>
        assignDifferences(draft as unknown as PlainRecord, target as unknown as PlainRecord, 0),
      );
    },
    rename: (name) =>
      commit('Redenumire', (d) => {
        d.name = name;
      }),
    undo,
    redo,
    flush,
    retrySave,
    exportBackup: (meta) => exportProject(doc, meta),
    reloadFromStorage,
    overwriteStored,
    saveAsCopy,
    dispose,
  };
}
