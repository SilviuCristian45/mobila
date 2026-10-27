// SPIKE — store document cu undo/redo prin patch-uri Immer + autosave single-flight (ARCHITECTURE §4.5, §7.3).
import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from 'immer';
import { createStore } from 'zustand/vanilla';
import type { ProjectDocument } from '@/domain/schema';
import { RevisionConflict, saveDocument, type RcDb } from '@/persistence/db';

enablePatches();

export interface HistoryEntry { label: string; patches: Patch[]; inverse: Patch[] }
export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';
export interface DocState {
  doc: ProjectDocument; savedRevision: number; editVersion: number; savedEditVersion: number;
  past: HistoryEntry[]; future: HistoryEntry[]; status: SaveStatus; error?: string;
}
export const HISTORY_LIMIT = 100;

export function createDocStore(doc: ProjectDocument, savedRevision = 0) {
  const store = createStore<DocState>(() => ({ doc, savedRevision, editVersion: savedRevision > 0 ? 0 : 1, savedEditVersion: 0, past: [], future: [], status: savedRevision > 0 ? 'saved' : 'dirty' }));
  const touch = () => {}; // notificările vin direct de la zustand

  /** Comite o acțiune (un singur pas de undo). Recipe-ul trebuie să includă curățarea derivatelor dependente (ex. suprascrieri orfane). */
  function commit(label: string, recipe: (d: Draft<ProjectDocument>) => void): boolean {
    const s = store.getState();
    const [next, patches, inverse] = produceWithPatches(s.doc, recipe);
    if (patches.length === 0) return false;
    const past = [...s.past, { label, patches, inverse }].slice(-HISTORY_LIMIT);
    store.setState({ doc: next, past, future: [], editVersion: s.editVersion + 1, status: 'dirty' });
    touch();
    return true;
  }
  function undo(): boolean {
    const s = store.getState(); const e = s.past[s.past.length - 1];
    if (!e) return false;
    store.setState({ doc: applyPatches(s.doc, e.inverse), past: s.past.slice(0, -1), future: [...s.future, e], editVersion: s.editVersion + 1, status: 'dirty' });
    touch(); return true;
  }
  function redo(): boolean {
    const s = store.getState(); const e = s.future[s.future.length - 1];
    if (!e) return false;
    store.setState({ doc: applyPatches(s.doc, e.patches), future: s.future.slice(0, -1), past: [...s.past, e], editVersion: s.editVersion + 1, status: 'dirty' });
    touch(); return true;
  }
  /** Înlocuire completă (încărcare/import/migrare): golește istoricul. */
  function replace(next: ProjectDocument, revision: number) {
    store.setState({ doc: next, savedRevision: revision, past: [], future: [], editVersion: revision > 0 ? 0 : 1, savedEditVersion: 0, status: revision > 0 ? 'saved' : 'dirty' });
    touch();
  }
  return { store, commit, undo, redo, replace, subscribe: (l: () => void) => store.subscribe(() => l()) };
}
export type DocStore = ReturnType<typeof createDocStore>;

export interface AutosaveOpts { debounceMs?: number; maxWaitMs?: number; now?: () => string }
/** Autosave: debounce trailing + maxWait, single-flight, ultimul câștigă, flush la cerere. Nu salvează istoricul. */
export class Autosaver {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private firstDirtyAt: number | null = null;
  private inflight: Promise<void> | null = null;
  saves = 0;
  private lastSeen = -1;
  constructor(private ds: DocStore, private db: RcDb, private opts: AutosaveOpts = {}) {
    ds.subscribe(() => this.notify());
  }
  notify(): void {
    const s = this.ds.store.getState();
    if (s.editVersion === this.lastSeen) return; // doar modificările de document declanșează programarea
    this.lastSeen = s.editVersion;
    if (s.status === 'conflict' || s.editVersion === s.savedEditVersion) return;
    const debounce = this.opts.debounceMs ?? 800, maxWait = this.opts.maxWaitMs ?? 5000;
    const t = Date.now();
    this.firstDirtyAt ??= t;
    if (this.timer) clearTimeout(this.timer);
    const wait = Math.max(0, Math.min(debounce, maxWait - (t - this.firstDirtyAt)));
    this.timer = setTimeout(() => { void this.flush(); }, wait);
  }
  /** Salvează acum; dacă o salvare e în curs, o înlănțuie și reia cât timp mai există modificări. */
  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    this.firstDirtyAt = null;
    const run = async () => {
      while (true) {
        const s = this.ds.store.getState();
        if (s.status === 'conflict' || s.editVersion === s.savedEditVersion) return;
        const snapshotDoc = s.doc, version = s.editVersion;
        this.ds.store.setState({ status: 'saving' });
        try {
          const rev = await saveDocument(this.db, snapshotDoc, s.savedRevision, this.opts.now?.());
          this.saves++;
          this.ds.store.setState({ savedRevision: rev, savedEditVersion: version });
          const cur = this.ds.store.getState();
          this.ds.store.setState({ status: cur.editVersion === version ? 'saved' : 'dirty' });
        } catch (e) {
          if (e instanceof RevisionConflict) this.ds.store.setState({ status: 'conflict', error: e.message });
          else this.ds.store.setState({ status: 'error', error: (e as Error).message });
          return;
        }
      }
    };
    this.inflight = (this.inflight ?? Promise.resolve()).then(run);
    await this.inflight;
  }
  async idle(): Promise<void> { await this.inflight; }
}
