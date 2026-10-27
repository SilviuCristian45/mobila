// Gestionarul de proiecte: listare, creare, deschidere (cu blocare între taburi), redenumire, ștergere, import.
// Independent de React; dependențele (depozit, blocări, ceas, generator de ID-uri) sunt injectate.
import { createEmptyProject, importProject, type ImportStage, type IntegrityIssue } from '@/domain';
import { RevisionConflictError, StorageError, toStorageFailure } from '@/persistence/errors';
import type {
  LoadFailure,
  ProjectLockProvider,
  ProjectMeta,
  ProjectRepository,
  SnapshotMeta,
  StorageFailure,
} from '@/persistence/types';
import { systemClock, type Clock } from './clock';
import { createProjectSession, type ProjectSession, type SessionOptions } from './session';

export const MAX_PROJECT_NAME_LENGTH = 200;

export type Outcome<T, E> = { ok: true; value: T } | { ok: false; error: E };

export type OpenFailure =
  | { kind: 'not-found' }
  | Extract<LoadFailure, { kind: 'corrupt' }>
  | { kind: 'storage'; error: StorageFailure };

export type MutationFailure =
  | { kind: 'invalid-name'; message: string }
  | { kind: 'not-found' }
  | { kind: 'conflict'; message: string }
  | { kind: 'open-elsewhere'; message: string }
  | { kind: 'storage'; error: StorageFailure };

export interface ProjectManagerDeps {
  repository: ProjectRepository;
  locks: ProjectLockProvider;
  /** Generator de ID-uri valide pentru proiecte noi / copii (în browser: `crypto.randomUUID`). */
  genId: () => string;
  clock?: Clock;
  sessionOptions?: Partial<SessionOptions>;
}

export interface ProjectManager {
  list(): Promise<Outcome<ProjectMeta[], StorageFailure>>;
  create(name: string): Promise<Outcome<{ id: string }, MutationFailure>>;
  /**
   * Deschide un proiect. Dacă este deschis în alt tab, sesiunea întoarsă este DOAR-CITIRE
   * (`readOnly && !lockLost`); `takeOver` preia controlul (celălalt tab trece în doar-citire).
   */
  open(id: string, options?: { takeOver?: boolean }): Promise<Outcome<ProjectSession, OpenFailure>>;
  rename(id: string, name: string): Promise<Outcome<void, MutationFailure>>;
  remove(id: string): Promise<Outcome<void, MutationFailure>>;
  importFile(
    text: string,
  ): Promise<
    Outcome<
      { id: string; remapped: boolean; warnings: IntegrityIssue[] },
      { stage: ImportStage | 'storage'; errors: string[] }
    >
  >;
  /** Verifică un proiect fără a-l deschide (fără blocare): valid / invalid / eroare de stocare. */
  inspect(id: string): Promise<Outcome<{ warnings: number }, OpenFailure>>;
  /** Copiile de siguranță ale unui proiect (cele mai noi primele). */
  listSnapshots(id: string): Promise<Outcome<SnapshotMeta[], StorageFailure>>;
  /**
   * Înlocuiește conținutul unui proiect (de obicei invalid) cu o copie de siguranță. Refuză dacă proiectul e deschis
   * undeva; documentul înlocuit, dacă e valid, se arhivează ca `pre-overwrite`.
   */
  restoreSnapshot(id: string, snapshotId: string): Promise<Outcome<void, MutationFailure>>;
  /** Sesiunile deschise în acest tab. */
  openSessions(): ReadonlyMap<string, ProjectSession>;
  /** Închide toate sesiunile (salvează ce se poate). */
  closeAll(): Promise<void>;
}

const storageFailureOf = (e: unknown): StorageFailure =>
  e instanceof StorageError ? e.failure : toStorageFailure(e);

export function createProjectManager(deps: ProjectManagerDeps): ProjectManager {
  const { repository: repo, locks } = deps;
  const clock = deps.clock ?? systemClock;
  const sessions = new Map<string, ProjectSession>();
  /** Rezolvă când sesiunea unui proiect s-a închis COMPLET (inclusiv eliberarea blocării). */
  const closing = new Map<string, Promise<void>>();
  /** Deschideri în curs: apeluri concurente pentru același proiect (ex. React StrictMode) primesc aceeași sesiune. */
  const opening = new Map<string, Promise<Outcome<ProjectSession, OpenFailure>>>();

  const validName = (raw: string): Outcome<string, MutationFailure> => {
    const name = raw.trim();
    if (name.length === 0)
      return { ok: false, error: { kind: 'invalid-name', message: 'Numele nu poate fi gol.' } };
    if (name.length > MAX_PROJECT_NAME_LENGTH)
      return {
        ok: false,
        error: {
          kind: 'invalid-name',
          message: `Numele are cel mult ${MAX_PROJECT_NAME_LENGTH} de caractere.`,
        },
      };
    return { ok: true, value: name };
  };

  async function list() {
    try {
      return { ok: true, value: await repo.list() } as const;
    } catch (e) {
      return { ok: false, error: storageFailureOf(e) } as const;
    }
  }

  async function create(rawName: string): Promise<Outcome<{ id: string }, MutationFailure>> {
    const name = validName(rawName);
    if (!name.ok) return name;
    const id = deps.genId();
    try {
      await repo.create(createEmptyProject(id, name.value, clock.nowIso()), clock.nowIso());
      return { ok: true, value: { id } };
    } catch (e) {
      if (e instanceof RevisionConflictError)
        return { ok: false, error: { kind: 'conflict', message: e.message } };
      return { ok: false, error: { kind: 'storage', error: storageFailureOf(e) } };
    }
  }

  function open(
    id: string,
    options: { takeOver?: boolean } = {},
  ): Promise<Outcome<ProjectSession, OpenFailure>> {
    if (!options.takeOver) {
      const inflight = opening.get(id);
      if (inflight) return inflight;
    }
    const run = openInner(id, options).finally(() => {
      if (opening.get(id) === run) opening.delete(id);
    });
    opening.set(id, run);
    return run;
  }

  async function openInner(
    id: string,
    options: { takeOver?: boolean },
  ): Promise<Outcome<ProjectSession, OpenFailure>> {
    let existing = sessions.get(id);
    if (existing?.getState().status === 'closed') {
      await closing.get(id); // o închidere în curs: așteptăm eliberarea blocării, altfel noua deschidere ar fi doar-citire
      existing = sessions.get(id);
    }
    if (existing && !(options.takeOver && existing.getState().readOnly))
      return { ok: true, value: existing };
    if (existing) await existing.dispose(); // doar-citire → preluare

    let lock = null;
    try {
      lock = options.takeOver ? await locks.steal(id) : await locks.tryAcquire(id);
    } catch (e) {
      return { ok: false, error: { kind: 'storage', error: storageFailureOf(e) } };
    }
    const loaded = await repo.load(id);
    if (!loaded.ok) {
      await lock?.release();
      return { ok: false, error: loaded.failure };
    }
    let markClosed!: () => void;
    closing.set(id, new Promise<void>((resolve) => (markClosed = resolve)));
    const session = createProjectSession({
      doc: loaded.value.doc,
      revision: loaded.value.revision,
      repository: repo,
      clock,
      ...(deps.sessionOptions ? { options: deps.sessionOptions } : {}),
      lock,
      readOnly: lock === null,
      startDirty: loaded.value.migratedFrom !== undefined && lock !== null,
      onClose: () => {
        if (sessions.get(id) === session) sessions.delete(id);
        closing.delete(id);
        markClosed();
      },
    });
    sessions.set(id, session);
    return { ok: true, value: session };
  }

  async function rename(id: string, rawName: string): Promise<Outcome<void, MutationFailure>> {
    const name = validName(rawName);
    if (!name.ok) return name;
    const session = sessions.get(id);
    if (session && !session.getState().readOnly) {
      const r = session.rename(name.value);
      if (!r.ok) return { ok: false, error: { kind: 'conflict', message: r.message } };
      await session.flush();
      const st = session.getState();
      if (st.status === 'conflict')
        return {
          ok: false,
          error: { kind: 'conflict', message: st.conflict?.message ?? 'Conflict de revizie.' },
        };
      if (st.status === 'error' && st.error)
        return {
          ok: false,
          error: { kind: 'storage', error: { kind: st.error.kind, message: st.error.message } },
        };
      return { ok: true, value: undefined };
    }
    try {
      await repo.rename(id, name.value, clock.nowIso());
      return { ok: true, value: undefined };
    } catch (e) {
      if (e instanceof RevisionConflictError)
        return {
          ok: false,
          error:
            e.kind === 'deleted' ? { kind: 'not-found' } : { kind: 'conflict', message: e.message },
        };
      return { ok: false, error: { kind: 'storage', error: storageFailureOf(e) } };
    }
  }

  async function remove(id: string): Promise<Outcome<void, MutationFailure>> {
    const own = sessions.get(id);
    if (own) await own.dispose(); // eliberează blocarea proprie; modificările nesalvate dispar odată cu proiectul
    let lock = null;
    try {
      lock = await locks.tryAcquire(id);
    } catch (e) {
      return { ok: false, error: { kind: 'storage', error: storageFailureOf(e) } };
    }
    if (!lock)
      return {
        ok: false,
        error: {
          kind: 'open-elsewhere',
          message:
            'Proiectul este deschis în alt tab. Închide-l acolo sau preia controlul înainte de ștergere.',
        },
      };
    try {
      await repo.remove(id);
      return { ok: true, value: undefined };
    } catch (e) {
      return { ok: false, error: { kind: 'storage', error: storageFailureOf(e) } };
    } finally {
      await lock.release();
    }
  }

  async function importFile(
    text: string,
  ): Promise<
    Outcome<
      { id: string; remapped: boolean; warnings: IntegrityIssue[] },
      { stage: ImportStage | 'storage'; errors: string[] }
    >
  > {
    let existing: ReadonlySet<string>;
    try {
      existing = new Set((await repo.list()).map((p) => p.id));
    } catch (e) {
      return {
        ok: false,
        error: { stage: 'storage', errors: [storageFailureOf(e).message] },
      };
    }
    const r = importProject(text, { existingIds: existing, genId: deps.genId });
    if (!r.ok) return { ok: false, error: { stage: r.stage, errors: r.errors } };
    try {
      await repo.create(r.doc, clock.nowIso());
    } catch (e) {
      return {
        ok: false,
        error: {
          stage: 'storage',
          errors: [e instanceof RevisionConflictError ? e.message : storageFailureOf(e).message],
        },
      };
    }
    return {
      ok: true,
      value: { id: r.doc.id, remapped: r.remapped, warnings: r.warnings },
    };
  }

  async function inspect(id: string): Promise<Outcome<{ warnings: number }, OpenFailure>> {
    const r = await repo.load(id);
    if (!r.ok) return { ok: false, error: r.failure };
    // un document valid dar cu avertismente nu e o problemă; numărul exact se obține la deschidere
    return { ok: true, value: { warnings: 0 } };
  }

  async function listSnapshots(id: string): Promise<Outcome<SnapshotMeta[], StorageFailure>> {
    try {
      return { ok: true, value: await repo.listSnapshots(id) };
    } catch (e) {
      return { ok: false, error: storageFailureOf(e) };
    }
  }

  async function restoreSnapshot(
    id: string,
    snapshotId: string,
  ): Promise<Outcome<void, MutationFailure>> {
    if (sessions.has(id)) {
      return {
        ok: false,
        error: {
          kind: 'open-elsewhere',
          message: 'Proiectul este deschis în acest tab. Închide-l înainte de restaurare.',
        },
      };
    }
    let lock = null;
    try {
      lock = await locks.tryAcquire(id);
    } catch (e) {
      return { ok: false, error: { kind: 'storage', error: storageFailureOf(e) } };
    }
    if (!lock) {
      return {
        ok: false,
        error: {
          kind: 'open-elsewhere',
          message: 'Proiectul este deschis în alt tab. Închide-l acolo înainte de restaurare.',
        },
      };
    }
    try {
      const snap = await repo.loadSnapshot(snapshotId);
      if (!snap.ok) {
        return {
          ok: false,
          error:
            snap.failure.kind === 'storage'
              ? { kind: 'storage', error: snap.failure.error }
              : { kind: 'not-found' },
        };
      }
      const now = clock.nowIso();
      const current = await repo.load(id);
      if (current.ok) {
        await repo.addSnapshot(current.value.doc, 'pre-overwrite', now);
        await repo.save({ ...snap.value.doc, id }, current.value.revision, now);
      } else if (current.failure.kind === 'corrupt') {
        await repo.save({ ...snap.value.doc, id }, current.failure.revision, now);
      } else if (current.failure.kind === 'not-found') {
        await repo.create({ ...snap.value.doc, id }, now);
      } else {
        return { ok: false, error: { kind: 'storage', error: current.failure.error } };
      }
      return { ok: true, value: undefined };
    } catch (e) {
      if (e instanceof RevisionConflictError)
        return { ok: false, error: { kind: 'conflict', message: e.message } };
      return { ok: false, error: { kind: 'storage', error: storageFailureOf(e) } };
    } finally {
      await lock.release();
    }
  }

  return {
    list,
    create,
    open,
    rename,
    remove,
    importFile,
    inspect,
    listSnapshots,
    restoreSnapshot,
    openSessions: () => sessions,
    closeAll: async () => {
      await Promise.all([...sessions.values()].map((s) => s.dispose()));
    },
  };
}
