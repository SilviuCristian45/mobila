'use client';

import { useEffect, useState } from 'react';
import { dashboardHref } from '@/lib/asset';
import { formatDateTime } from '@/lib/format';
import { useSessionState } from '@/lib/project-runtime/hooks';
import type { ProjectSession } from '@/state/session';
import { Button } from '@/ui/Button';
import { NameDialog } from '@/ui/NameDialog';
import { SaveIndicator } from './SaveIndicator';
import { exportBackupFile, SessionBanners } from './SessionBanners';

const isTyping = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

/**
 * Carcasa editorului: bara cu starea sesiunii (salvare, undo/redo, export, redenumire), bannere pentru
 * doar-citire/conflict/eroare și un spațiu rezervat suprafeței de lucru. Nu conține logică de stare: totul trece prin `session`.
 */
export function SessionView({
  session,
  takeOver,
}: {
  session: ProjectSession;
  takeOver: () => Promise<void>;
}) {
  const state = useSessionState(session);
  const [renaming, setRenaming] = useState(false);

  const name = state?.doc.name;
  useEffect(() => {
    if (name) document.title = `${name} — RoomCraft`;
  }, [name]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || !(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        session.undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        session.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session]);

  if (!state) return null;
  const { doc } = state;
  const editable = !state.readOnly;

  return (
    <div className="flex min-h-screen flex-col" data-testid="editor">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <a
            href={dashboardHref()}
            className="text-sm font-medium text-teal-800 underline"
            data-testid="back-to-dashboard"
          >
            ← Proiecte
          </a>
          <h1
            className="min-w-0 flex-1 truncate text-lg font-semibold text-stone-900"
            data-testid="project-title"
            title={doc.name}
          >
            {doc.name}
          </h1>
          <SaveIndicator state={state} />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => session.undo()}
              disabled={!state.canUndo}
              aria-label={state.undoLabel ? `Anulează: ${state.undoLabel}` : 'Anulează'}
              title="Anulează (Ctrl+Z)"
              data-testid="undo"
            >
              ↶ Anulează
            </Button>
            <Button
              onClick={() => session.redo()}
              disabled={!state.canRedo}
              aria-label={state.redoLabel ? `Refă: ${state.redoLabel}` : 'Refă'}
              title="Refă (Ctrl+Shift+Z)"
              data-testid="redo"
            >
              ↷ Refă
            </Button>
            <Button onClick={() => setRenaming(true)} disabled={!editable} data-testid="rename">
              Redenumește
            </Button>
            <Button onClick={() => exportBackupFile(session)} data-testid="export-backup">
              Exportă copie
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 py-6">
        <SessionBanners session={session} state={state} takeOver={takeOver} />

        <section
          aria-label="Suprafața de lucru"
          data-testid="workspace-placeholder"
          className="flex min-h-80 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-stone-300 bg-white p-8 text-center"
        >
          <p className="text-lg font-semibold text-stone-800">Aici va apărea editorul 2D / 3D</p>
          <p className="mt-1 max-w-xl text-stone-600">
            Suprafața de lucru urmează în etapele următoare. Starea proiectului (salvare automată,
            istoric, protecție între taburi) funcționează deja.
          </p>
          <dl
            className="mt-6 grid grid-cols-2 gap-x-8 gap-y-1 text-left text-sm text-stone-700 sm:grid-cols-4"
            data-testid="doc-summary"
          >
            <div>
              <dt className="text-stone-500">Camere</dt>
              <dd data-testid="count-rooms">{Object.keys(doc.rooms).length}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Pereți</dt>
              <dd data-testid="count-walls">{Object.keys(doc.walls).length}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Obiecte</dt>
              <dd data-testid="count-objects">{Object.keys(doc.objects).length}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Revizie salvată</dt>
              <dd data-testid="revision">{state.revision}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Pași în istoric</dt>
              <dd data-testid="history-size">{state.historySize}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Ultima salvare</dt>
              <dd>{state.lastSavedAt ? formatDateTime(state.lastSavedAt) : '—'}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Mod</dt>
              <dd data-testid="mode">{editable ? 'editare' : 'doar citire'}</dd>
            </div>
            <div>
              <dt className="text-stone-500">Format</dt>
              <dd>v{doc.schemaVersion}</dd>
            </div>
          </dl>
        </section>
      </div>

      {renaming ? (
        <NameDialog
          title="Redenumește proiectul"
          label="Numele proiectului"
          submitLabel="Redenumește"
          initialValue={doc.name}
          maxLength={200}
          onSubmit={async (n) => {
            const r = session.rename(n);
            return r.ok ? null : r.message;
          }}
          onClose={() => setRenaming(false)}
        />
      ) : null}
    </div>
  );
}
