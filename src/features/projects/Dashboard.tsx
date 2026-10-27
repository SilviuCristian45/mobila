'use client';

import { useEffect, useState } from 'react';
import { APP_NAME, APP_NAME_NOTE } from '@/lib/app-info';
import { describeMutationFailure, describeStorageFailure } from '@/lib/messages';
import { useProjectList } from '@/lib/project-runtime/hooks';
import { useRuntimeState } from '@/lib/project-runtime/ProjectProvider';
import type { ProjectRuntime } from '@/lib/project-runtime/browser-runtime';
import type { ProjectMeta } from '@/state/types';
import { editorHref } from '@/lib/asset';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Alert, Spinner } from '@/ui/feedback';
import { NameDialog } from '@/ui/NameDialog';
import { ProjectCard } from './ProjectCard';
import { RecoveryDialog } from './RecoveryDialog';
import { StorageFooter } from './StorageFooter';

const DEFAULT_NEW_NAME = 'Proiect nou';
const MAX_NAME = 200;

type Dialog =
  | { kind: 'create' }
  | { kind: 'rename'; project: ProjectMeta }
  | { kind: 'delete'; project: ProjectMeta }
  | { kind: 'recover'; project: ProjectMeta }
  | null;

export function Dashboard() {
  const runtime = useRuntimeState();
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6" data-testid="dashboard">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-stone-900">
          {APP_NAME} <span className="text-base font-normal text-stone-500">({APP_NAME_NOTE})</span>
        </h1>
        <p className="mt-1 text-stone-600">
          Proiectează, mobilează și estimează costul amenajării. Proiectele rămân pe acest
          dispozitiv.
        </p>
      </header>

      {runtime.phase === 'initializing' ? (
        <Spinner label="Se inițializează stocarea locală…" />
      ) : null}
      {runtime.phase === 'unavailable' ? <UnavailableNotice failure={runtime.failure} /> : null}
      {runtime.phase === 'ready' ? <ProjectsView runtime={runtime.runtime} /> : null}
    </main>
  );
}

function UnavailableNotice({ failure }: { failure: Parameters<typeof describeStorageFailure>[0] }) {
  const d = describeStorageFailure(failure);
  return (
    <Alert tone="error" title={d.title} testId="storage-unavailable">
      <p>{d.detail}</p>
      <p className="mt-2">
        Încearcă o fereastră normală (nu privată), permite datele de site pentru această pagină sau
        folosește alt browser.
      </p>
    </Alert>
  );
}

function ProjectsView({ runtime }: { runtime: ProjectRuntime }) {
  const { manager } = runtime;
  const { state, reload } = useProjectList(manager);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  async function create(name: string): Promise<string | null> {
    const r = await manager.create(name);
    if (!r.ok) return describeMutationFailure(r.error);
    void runtime.requestPersistence(); // după un gest al utilizatorului (în Firefox poate afișa o cerere de permisiune)
    runtime.navigate(editorHref(r.value.id));
    return null;
  }
  async function rename(project: ProjectMeta, name: string): Promise<string | null> {
    const r = await manager.rename(project.id, name);
    if (!r.ok) return describeMutationFailure(r.error);
    setNotice(`Proiectul a fost redenumit în „${name}”.`);
    reload();
    return null;
  }
  async function remove(project: ProjectMeta): Promise<string | null> {
    const r = await manager.remove(project.id);
    if (!r.ok) return describeMutationFailure(r.error);
    setNotice(`Proiectul „${project.name}” a fost șters.`);
    reload();
    return null;
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-stone-900">Proiectele mele</h2>
        <Button variant="primary" onClick={() => setDialog({ kind: 'create' })}>
          + Proiect nou
        </Button>
      </div>

      {notice ? (
        <div className="mb-4">
          <Alert tone="success" title={notice} testId="notice" />
        </div>
      ) : null}

      {state.phase === 'loading' ? <Spinner label="Se încarcă proiectele…" /> : null}

      {state.phase === 'error' ? (
        <Alert
          tone="error"
          title={describeStorageFailure(state.failure).title}
          testId="list-error"
          actions={<Button onClick={reload}>Reîncearcă</Button>}
        >
          {describeStorageFailure(state.failure).detail}
        </Alert>
      ) : null}

      {state.phase === 'ready' && state.projects.length === 0 ? (
        <div
          data-testid="empty-state"
          className="rounded-2xl border-2 border-dashed border-stone-300 bg-white p-10 text-center"
        >
          <p className="text-lg font-semibold text-stone-900">Încă nu ai niciun proiect</p>
          <p className="mx-auto mt-2 max-w-md text-stone-600">
            Creează primul proiect pentru a desena camere la dimensiuni reale, a plasa mobilier și a
            estima costurile.
          </p>
          <div className="mt-5">
            <Button variant="primary" onClick={() => setDialog({ kind: 'create' })}>
              Creează primul proiect
            </Button>
          </div>
        </div>
      ) : null}

      {state.phase === 'ready' && state.projects.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2" aria-label="Lista proiectelor">
          {state.projects.map((p) => (
            <li key={`${p.id}:${p.revision}`}>
              <ProjectCard
                project={p}
                manager={manager}
                onRename={() => setDialog({ kind: 'rename', project: p })}
                onDelete={() => setDialog({ kind: 'delete', project: p })}
                onRecover={() => setDialog({ kind: 'recover', project: p })}
              />
            </li>
          ))}
        </ul>
      ) : null}

      <StorageFooter runtime={runtime} />

      {dialog?.kind === 'create' ? (
        <NameDialog
          title="Proiect nou"
          label="Numele proiectului"
          submitLabel="Creează"
          initialValue={DEFAULT_NEW_NAME}
          maxLength={MAX_NAME}
          onSubmit={create}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'rename' ? (
        <NameDialog
          title="Redenumește proiectul"
          label="Numele proiectului"
          submitLabel="Redenumește"
          initialValue={dialog.project.name}
          maxLength={MAX_NAME}
          onSubmit={(name) => rename(dialog.project, name)}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'delete' ? (
        <ConfirmDialog
          title="Ștergi proiectul?"
          description={`Proiectul „${dialog.project.name}” va fi șters definitiv de pe acest dispozitiv, împreună cu copiile lui de siguranță. Acțiunea nu poate fi anulată. Dacă vrei să-l păstrezi, deschide-l mai întâi și exportă o copie.`}
          confirmLabel="Șterge definitiv"
          onConfirm={() => remove(dialog.project)}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'recover' ? (
        <RecoveryDialog
          manager={manager}
          project={dialog.project}
          onRestored={() => {
            setNotice(
              `Proiectul „${dialog.project.name}” a fost restaurat dintr-o copie de siguranță.`,
            );
            reload();
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}
