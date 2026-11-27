'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { dashboardHref } from '@/lib/asset';
import { formatDateTime } from '@/lib/format';
import { useSessionState } from '@/lib/project-runtime/hooks';
import type { ProjectSession, SessionState } from '@/state/session';
import { Button, buttonClass } from '@/ui/Button';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { Alert } from '@/ui/feedback';
import { IconArrowLeft, IconDownload, IconPencil, IconRedo, IconUndo } from '@/ui/icons';
import { NameDialog } from '@/ui/NameDialog';
import { ThemeToggle } from '@/ui/ThemeToggle';
import { BackupReminder } from './BackupReminder';
import { SaveIndicator } from './SaveIndicator';
import { exportBackupFile, SessionBanners } from './SessionBanners';

/** Suprafața de lucru, compusă în `app/` (features/ nu se importă între ele — ARCHITECTURE §3). */
export type WorkspaceRenderer = (session: ProjectSession, state: SessionState) => ReactNode;

const isTyping = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

/**
 * Carcasa Full-Viewport Studio a editorului:
 * - Top Studio Bar fix (48px): înapoi, titlu editabil, stare salvare, segmented control (din app/), undo/redo, export, temă.
 * - Zona centrală full-bleed (100% din înălțimea rămasă, fără scroll la nivel de pagină).
 * - Bottom Status Bar fix (28px): contoare live, revizie, istoric, mod, format.
 */
export function SessionView({
  session,
  takeOver,
  workspace,
  headerCenter,
}: {
  session: ProjectSession;
  takeOver: () => Promise<void>;
  workspace?: WorkspaceRenderer;
  /** Control segmentat de moduri afișat în centrul barei de sus (compus în `app/`). */
  headerCenter?: ReactNode;
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
    <div
      className="flex min-h-dvh flex-col bg-canvas lg:h-dvh lg:overflow-hidden"
      data-testid="editor"
    >
      <header className="z-20 flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-surface px-3 py-1.5 lg:h-12 lg:flex-nowrap lg:py-0">
        {/* Stânga: înapoi, titlu + redenumire inline, stare salvare */}
        <div className="flex min-w-0 items-center gap-2">
          <a
            href={dashboardHref()}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-100 hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-700"
            data-testid="back-to-dashboard"
            title="Înapoi la lista de proiecte"
          >
            <IconArrowLeft size={15} />
            <span className="hidden sm:inline">Proiecte</span>
          </a>
          <span className="h-4 w-px bg-stone-200" aria-hidden="true" />
          <div className="flex min-w-0 items-center gap-1">
            <h1
              className="max-w-[11rem] truncate text-sm font-semibold tracking-tight text-stone-900 sm:max-w-[14rem]"
              data-testid="project-title"
              title={doc.name}
            >
              {doc.name}
            </h1>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setRenaming(true)}
              disabled={!editable}
              aria-label="Redenumește proiectul"
              title="Redenumește proiectul"
              data-testid="rename"
              className="h-7 w-7 text-stone-500 hover:text-stone-900"
            >
              <IconPencil size={13} />
            </Button>
          </div>
          <SaveIndicator state={state} />
        </div>

        {/* Centru: Segmented Control pentru moduri (2D / Exterior / Mobilă la comandă / 3D / Buget) */}
        {headerCenter ? (
          <div className="order-3 flex w-full justify-center overflow-x-auto lg:order-none lg:w-auto">
            {headerCenter}
          </div>
        ) : null}

        {/* Dreapta: Undo/Redo, Export copie, Temă */}
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="inline-flex items-center rounded-lg border border-stone-200 bg-surface-subtle p-0.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => session.undo()}
              disabled={!state.canUndo}
              aria-label={state.undoLabel ? `Anulează: ${state.undoLabel}` : 'Anulează'}
              title={
                state.undoLabel ? `Anulează: ${state.undoLabel} (Ctrl+Z)` : 'Anulează (Ctrl+Z)'
              }
              data-testid="undo"
              className="h-7 w-7"
            >
              <IconUndo size={15} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => session.redo()}
              disabled={!state.canRedo}
              aria-label={state.redoLabel ? `Refă: ${state.redoLabel}` : 'Refă'}
              title={
                state.redoLabel ? `Refă: ${state.redoLabel} (Ctrl+Shift+Z)` : 'Refă (Ctrl+Shift+Z)'
              }
              data-testid="redo"
              className="h-7 w-7"
            >
              <IconRedo size={15} />
            </Button>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => exportBackupFile(session)}
            data-testid="export-backup"
            title="Exportă o copie de siguranță .roomcraft.json"
            className="border-stone-200"
          >
            <IconDownload size={14} />
            <span className="hidden xl:inline">Exportă copie</span>
          </Button>
          <ThemeToggle compact />
        </div>
      </header>

      {/* Bannere sesiune / backup reminder (apar doar când sunt active) */}
      <div className="shrink-0 empty:hidden px-3 pt-2">
        <SessionBanners session={session} state={state} takeOver={takeOver} />
        <BackupReminder session={session} state={state} />
      </div>

      {/* Suprafața de lucru full-viewport */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {workspace ? (
          // Zona de lucru poate eșua fără să dărâme antetul: sesiunea (documentul, autosave-ul, undo) trăiește mai sus și
          // rămâne activă, deci modificările se salvează în continuare, iar „Anulează” poate reveni peste o editare care strică randarea.
          <ErrorBoundary
            label="zona de lucru"
            resetKey={session}
            fallback={({ reset }) => (
              <div className="p-4">
                <Alert
                  tone="error"
                  title="Zona de lucru a întâmpinat o eroare"
                  testId="workspace-error"
                  actions={
                    <>
                      <Button variant="primary" onClick={reset} data-testid="workspace-error-retry">
                        Încearcă din nou
                      </Button>
                      <Button onClick={() => exportBackupFile(session)}>Exportă copie</Button>
                      <a className={buttonClass('secondary')} href={dashboardHref()}>
                        ← Înapoi la proiecte
                      </a>
                    </>
                  }
                >
                  Planul sau panourile nu au putut fi afișate. Proiectul este în siguranță: ce era
                  salvat a rămas salvat, iar modificările se salvează în continuare. Dacă eroarea a
                  apărut după o modificare, o poți anula din bara de sus.
                </Alert>
              </div>
            )}
          >
            {workspace(session, state)}
          </ErrorBoundary>
        ) : null}
      </div>

      {/* Bottom Studio Status Bar (28px fix) */}
      <footer
        aria-label="Rezumatul proiectului"
        data-testid="workspace-summary"
        className="flex h-7 shrink-0 items-center justify-between gap-4 border-t border-stone-200 bg-surface px-3 text-[11px] text-stone-600"
      >
        <dl
          className="flex flex-wrap items-center gap-x-3 gap-y-0.5 tabular-nums"
          data-testid="doc-summary"
        >
          <div className="inline-flex items-center gap-1">
            <dd className="font-semibold text-stone-800" data-testid="count-rooms">
              {Object.keys(doc.rooms).length}
            </dd>
            <dt className="text-stone-500">camere</dt>
          </div>
          <span aria-hidden="true" className="text-stone-300">
            ·
          </span>
          <div className="inline-flex items-center gap-1">
            <dd className="font-semibold text-stone-800" data-testid="count-walls">
              {Object.keys(doc.walls).length}
            </dd>
            <dt className="text-stone-500">pereți</dt>
          </div>
          <span aria-hidden="true" className="text-stone-300">
            ·
          </span>
          <div className="inline-flex items-center gap-1">
            <dd className="font-semibold text-stone-800" data-testid="count-objects">
              {Object.keys(doc.objects).length}
            </dd>
            <dt className="text-stone-500">obiecte</dt>
          </div>
        </dl>

        <dl className="hidden items-center gap-x-3 tabular-nums sm:flex">
          <div className="inline-flex items-center gap-1">
            <dt className="text-stone-500">Rev.</dt>
            <dd className="font-medium text-stone-800" data-testid="revision">
              {state.revision}
            </dd>
          </div>
          <span aria-hidden="true" className="text-stone-300">
            ·
          </span>
          <div className="inline-flex items-center gap-1">
            <dt className="text-stone-500">Istoric:</dt>
            <dd className="font-medium text-stone-800" data-testid="history-size">
              {state.historySize}
            </dd>
          </div>
          <span aria-hidden="true" className="text-stone-300">
            ·
          </span>
          <div className="inline-flex items-center gap-1">
            <dt className="sr-only">Mod</dt>
            <dd className="font-medium text-stone-800" data-testid="mode">
              {editable ? 'editare' : 'doar citire'}
            </dd>
          </div>
          <span aria-hidden="true" className="hidden text-stone-300 md:inline">
            ·
          </span>
          <div className="hidden items-center gap-1 md:inline-flex">
            <dt className="sr-only">Ultima salvare</dt>
            <dd className="text-stone-500">
              {state.lastSavedAt ? formatDateTime(state.lastSavedAt) : '—'}
            </dd>
          </div>
          <span aria-hidden="true" className="text-stone-300">
            ·
          </span>
          <div className="inline-flex items-center gap-1">
            <dt className="sr-only">Format</dt>
            <dd className="text-stone-500">v{doc.schemaVersion}</dd>
          </div>
        </dl>
      </footer>

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
