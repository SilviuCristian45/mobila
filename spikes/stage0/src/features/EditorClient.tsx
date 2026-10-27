'use client';
// SPIKE — shell client: încarcă/creează proiectul din IndexedDB, conectează store + autosave, 2D și 3D, export/import, hook-uri de test.
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { computeBudget } from '@/domain/budget';
import { bigProject } from '@/domain/bigfixture';
import { referenceProject } from '@/domain/fixtures';
import { exportProject, importProject } from '@/domain/io';
import { buildScene } from '@/domain/scene';
import type { DocStore, Autosaver as AutosaverT } from '@/state/store';
import { asset } from './asset';
import type { Editor2DApi } from './Editor2D';
import type { Viewer3DApi } from './Viewer3D';

const Editor2D = dynamic(() => import('./Editor2D'), { ssr: false, loading: () => <p>2D…</p> });
const Viewer3D = dynamic(() => import('./Viewer3D'), { ssr: false, loading: () => <p>3D…</p> });

interface Ctx { ds: DocStore; as: AutosaverT; db: import('@/persistence/db').RcDb }

declare global { interface Window { __spike?: Record<string, unknown> } }

export default function EditorClient() {
  const pid = useSearchParams().get('p') ?? 'demo';
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [show3d, setShow3d] = useState(false);
  const [flat, setFlat] = useState(false);
  const api2d = useRef<Editor2DApi | null>(null);
  const api3d = useRef<Viewer3DApi | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    let disposed = false;
    (async () => {
      const [{ getDb, loadDocument }, { createDocStore, Autosaver }] = await Promise.all([import('@/persistence/db'), import('@/state/store')]);
      const db = getDb();
      const loaded = await loadDocument(db, pid);
      const ds = loaded ? createDocStore(loaded.doc, loaded.revision) : createDocStore({ ...referenceProject(), id: pid });
      const as = new Autosaver(ds, db);
      if (!loaded) await as.flush();
      if (disposed) return;
      const onHide = () => { void as.flush(); };
      window.addEventListener('pagehide', onHide);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') onHide(); });
      setCtx({ ds, as, db });
    })();
    return () => { disposed = true; };
  }, [pid]);

  const state = useSyncExternalStore(
    (cb) => (ctx ? ctx.ds.subscribe(cb) : () => {}),
    () => ctx?.ds.store.getState(),
    () => undefined,
  );

  // hook-uri pentru Playwright (nu fac parte din produs)
  useEffect(() => {
    if (!ctx) return;
    const moveNode = (id: string, x: number, y: number) => ctx.ds.commit(`mută nod ${id}`, (d) => { const n = d.nodes[id]!; n.x = x; n.y = y; });
    window.__spike = {
      pid,
      getDoc: () => ctx.ds.store.getState().doc,
      status: () => { const s = ctx.ds.store.getState(); return { status: s.status, error: s.error ?? null, past: s.past.length, future: s.future.length, savedRevision: s.savedRevision }; },
      moveNode, undo: () => ctx.ds.undo(), redo: () => ctx.ds.redo(), flush: () => ctx.as.flush(),
      exportText: () => exportProject(ctx.ds.store.getState().doc),
      importText: async (text: string) => {
        const { saveDocument } = await import('@/persistence/db');
        const existing = new Set(await ctx.db.projects.toCollection().primaryKeys());
        const r = importProject(text, { existingIds: existing });
        if (!r.ok) return { ok: false, stage: r.stage, errors: r.errors };
        await saveDocument(ctx.db, r.doc, 0);
        return { ok: true, id: r.doc.id, remapped: r.remapped, migratedFrom: r.migratedFrom ?? null };
      },
      sceneHash: () => buildScene(ctx.ds.store.getState().doc).hash,
      budgetTotal: () => computeBudget(ctx.ds.store.getState().doc).total.grossMinor,
      stats2d: () => api2d.current?.stats() ?? null,
      stats3d: () => api3d.current?.stats() ?? null,
      topView3d: () => api3d.current?.topView(),
      sample3d: (w: [number, number, number]) => api3d.current?.sampleAt(w) ?? null,
      setFlat: (v: boolean) => setFlat(v),
      show3d: (v: boolean) => setShow3d(v),
      fetchAsset: async () => { const r = await fetch(asset('/catalog-test.json')); return { status: r.status, json: r.ok ? await r.json() : null }; },
      naiveFetch: async () => { const r = await fetch('/catalog-test.json'); return { status: r.status }; },
      loadBig: () => { ctx.ds.replace(bigProject(), 1); },
      fmt: () => new Intl.NumberFormat('ro-RO').format(1234567.89),
      setViewport: (s: number, x: number, y: number) => api2d.current?.setViewport(s, x, y),
    };
  }, [ctx, pid]);

  if (!mounted || !ctx || !state) return <p data-testid="loading">Se încarcă proiectul…</p>;
  const doc = state.doc;
  const scene = buildScene(doc);
  const total = computeBudget(doc).total.grossMinor;
  const download = () => {
    const url = URL.createObjectURL(new Blob([exportProject(doc)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `${doc.name}.roomcraft.json`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <main className="p-4 space-y-3" data-testid="editor">
      <h1 className="text-xl font-semibold" data-testid="title">Editor — {doc.name} ({pid})</h1>
      <div className="flex gap-2 items-center flex-wrap">
        <button className="rounded bg-teal-700 px-3 py-1 text-white" data-testid="undo" onClick={() => ctx.ds.undo()}>Undo ({state.past.length})</button>
        <button className="rounded bg-teal-700 px-3 py-1 text-white" data-testid="redo" onClick={() => ctx.ds.redo()}>Redo ({state.future.length})</button>
        <button className="rounded border px-3 py-1" data-testid="toggle3d" onClick={() => setShow3d((v) => !v)}>{show3d ? '2D' : '3D'}</button>
        <button className="rounded border px-3 py-1" data-testid="export" onClick={download}>Export</button>
        <input type="file" accept=".json" data-testid="import" onChange={async (e) => { const f = e.target.files?.[0]; if (f) await (window.__spike!.importText as (t: string) => Promise<unknown>)(await f.text()); }} />
        <span data-testid="status">{state.status}</span>
        <span data-testid="total">{new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(total / 100)}</span>
      </div>
      {show3d
        ? <Viewer3D scene={scene} width={900} height={500} flat={flat} onReady={(a) => { api3d.current = a; }} />
        : <div data-testid="stage2d" style={{ width: 900, height: 500 }} className="border bg-white">
            <Editor2D doc={doc} width={900} height={500} onMoveNode={(id, x, y) => ctx.ds.commit(`mută nod ${id}`, (d) => { d.nodes[id]!.x = x; d.nodes[id]!.y = y; })} onReady={(a) => { api2d.current = a; }} />
          </div>}
    </main>
  );
}
