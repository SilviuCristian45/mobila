'use client';

import { useSearchParams } from 'next/navigation';
import { dashboardHref } from '@/lib/asset';
import { describeOpenFailure } from '@/lib/messages';
import { useProjectSession } from '@/lib/project-runtime/hooks';
import type { ProjectRuntime } from '@/lib/project-runtime/browser-runtime';
import { useRuntimeState } from '@/lib/project-runtime/ProjectProvider';
import { buttonClass } from '@/ui/Button';
import { Alert, Spinner } from '@/ui/feedback';
import { SessionView, type WorkspaceRenderer } from './SessionView';

function BackLink() {
  return (
    <a className={buttonClass('secondary')} href={dashboardHref()}>
      ← Înapoi la proiecte
    </a>
  );
}

/** Ruta editorului: proiectul vine din `?p=<id>` (ADR-002). Toate stările (încărcare, erori) sunt vizibile. */
export function EditorShell({ workspace }: { workspace?: WorkspaceRenderer }) {
  const projectId = useSearchParams().get('p') ?? '';
  const runtime = useRuntimeState();

  if (projectId === '') {
    return (
      <Centered>
        <Alert
          tone="warning"
          title="Lipsește identificatorul proiectului"
          testId="editor-missing-id"
          actions={<BackLink />}
        >
          Deschide un proiect din lista de proiecte.
        </Alert>
      </Centered>
    );
  }
  if (runtime.phase === 'initializing') {
    return (
      <Centered>
        <Spinner label="Se inițializează stocarea locală…" />
      </Centered>
    );
  }
  if (runtime.phase === 'unavailable') {
    return (
      <Centered>
        <Alert
          tone="error"
          title="Stocarea locală nu este disponibilă"
          testId="editor-storage-unavailable"
          actions={<BackLink />}
        >
          {runtime.failure.message}
        </Alert>
      </Centered>
    );
  }
  return <OpenProject runtime={runtime.runtime} projectId={projectId} workspace={workspace} />;
}

function OpenProject({
  runtime,
  projectId,
  workspace,
}: {
  runtime: ProjectRuntime;
  projectId: string;
  workspace?: WorkspaceRenderer;
}) {
  const { state, takeOver } = useProjectSession(runtime.manager, projectId);

  if (state.phase === 'loading') {
    return (
      <Centered>
        <Spinner label="Se deschide proiectul…" />
      </Centered>
    );
  }
  if (state.phase === 'error') {
    const d = describeOpenFailure(state.failure);
    return (
      <Centered>
        <Alert tone="error" title={d.title} testId="editor-open-error" actions={<BackLink />}>
          <p>{d.detail}</p>
          {state.failure.kind === 'corrupt' ? (
            <p className="mt-2">
              În lista de proiecte poți restaura o copie de siguranță sau poți șterge proiectul.
            </p>
          ) : null}
        </Alert>
      </Centered>
    );
  }
  return <SessionView session={state.session} takeOver={takeOver} workspace={workspace} />;
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-4 px-4 py-10"
      data-testid="editor-state"
    >
      {children}
    </main>
  );
}
