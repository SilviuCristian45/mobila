'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';
import { MAX_IMPORT_BYTES } from '@/domain';
import { APP_NAME, APP_NAME_NOTE } from '@/lib/app-info';
import {
  describeImportFailure,
  describeMutationFailure,
  describeStorageFailure,
} from '@/lib/messages';
import { readTextFile } from '@/lib/readFile';
import { useProjectList } from '@/lib/project-runtime/hooks';
import { useRuntimeState } from '@/lib/project-runtime/ProjectProvider';
import type { ProjectRuntime } from '@/lib/project-runtime/browser-runtime';
import type { ProjectMeta } from '@/state/types';
import { asset, editorHref } from '@/lib/asset';
import { downloadTextFile, rawBackupFileName } from '@/lib/download';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
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

/** Rezultatul importului unui fișier, afișat până e închis (erorile trebuie să rămână vizibile, nu să dispară după câteva secunde). */
interface ImportNotice {
  key: number;
  fileName: string;
  tone: 'success' | 'warning' | 'error';
  title: string;
  detail?: string;
  issues: string[];
}

const IMPORT_MAX_MB = Math.round(MAX_IMPORT_BYTES / (1024 * 1024));
const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

function ProjectsView({ runtime }: { runtime: ProjectRuntime }) {
  const { manager } = runtime;
  const fileInput = useRef<HTMLInputElement | null>(null);
  const noticeKey = useRef(0);
  const [importing, setImporting] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [imports, setImports] = useState<ImportNotice[]>([]);
  const { state, reload } = useProjectList(manager);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // mesajul despre backup-ul brut e mai lung și important: rămâne vizibil mai mult decât celelalte notificări
  const [rawNotice, setRawNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(
    null,
  );

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  async function exportRaw(project: ProjectMeta) {
    const r = await manager.exportRaw(project.id);
    if (!r.ok) {
      setRawNotice({
        tone: 'error',
        text: `Nu am putut exporta datele proiectului „${project.name}”: ${describeMutationFailure(r.error)}`,
      });
      return;
    }
    const fileName = rawBackupFileName(project.name);
    downloadTextFile(fileName, r.value.text);
    setRawNotice({
      tone: 'success',
      text: `Am descărcat ${fileName}: un backup brut al proiectului „${project.name}”, cu datele exact așa cum sunt stocate (nevalidate). Proiectul nu a fost modificat. Fișierul nu e în formatul .roomcraft.json și versiunea curentă a aplicației nu îl poate deschide neapărat; păstrează-l până actualizezi aplicația.`,
    });
  }
  /** Importă fișierele alese, pe rând; fiecare are propriul rezultat. Nimic nu se scrie dacă fișierul e respins. */
  async function importFiles(files: File[]) {
    if (files.length === 0 || importing) return;
    setImporting(true);
    const out: ImportNotice[] = [];
    let imported = false;
    for (const file of files) {
      const key = ++noticeKey.current;
      const fileName = file.name;
      const read = await readTextFile(file, MAX_IMPORT_BYTES);
      if (!read.ok) {
        const d =
          read.reason === 'size'
            ? describeImportFailure('size', [], IMPORT_MAX_MB)
            : {
                title: 'Nu am putut citi fișierul',
                detail: 'Browserul nu a putut citi fișierul ales. Încearcă din nou.',
                issues: [] as string[],
              };
        out.push({ key, fileName, tone: 'error', ...d });
        continue;
      }
      const r = await manager.importFile(read.text);
      if (!r.ok) {
        out.push({
          key,
          fileName,
          tone: 'error',
          ...describeImportFailure(r.error.stage, r.error.errors, IMPORT_MAX_MB),
        });
        continue;
      }
      imported = true;
      const { name, remapped, warnings } = r.value;
      const notes = [
        remapped
          ? 'În această aplicație exista deja un proiect cu același identificator: ai primit o copie nouă, iar proiectul existent nu a fost modificat.'
          : null,
        warnings.length > 0
          ? `Proiectul s-a deschis cu ${warnings.length} ${warnings.length === 1 ? 'avertisment' : 'avertismente'} de coerență; verifică-l la deschidere.`
          : null,
      ].filter((x): x is string => x !== null);
      out.push({
        key,
        fileName,
        tone: warnings.length > 0 ? 'warning' : 'success',
        title: `Am importat „${name}”`,
        detail: notes.join(' ') || undefined,
        issues: [],
      });
    }
    setImports((prev) => [...out, ...prev]);
    setImporting(false);
    if (imported) {
      void runtime.requestPersistence();
      reload();
    }
  }
  const onDragOver = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    setDragging(true);
  };
  const onDrop = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    setDragging(false);
    void importFiles(Array.from(e.dataTransfer.files));
  };
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
    <div
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={onDrop}
      className="relative"
      data-testid="projects-dropzone"
      data-dragging={dragging}
    >
      {dragging ? (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-teal-600 bg-teal-50/90 text-lg font-semibold text-teal-900"
          data-testid="drop-overlay"
        >
          Lasă fișierul aici ca să importi proiectul
        </div>
      ) : null}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-stone-900">Proiectele mele</h2>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".json,application/json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            data-testid="import-input"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = ''; // același fișier se poate alege din nou
              void importFiles(files);
            }}
          />
          <Button
            onClick={() => fileInput.current?.click()}
            disabled={importing}
            title="Importă un proiect din fișiere .roomcraft.json (sau trage fișierele pe această pagină)"
            data-testid="import-button"
          >
            {importing ? 'Se importă…' : 'Importă proiect'}
          </Button>
          <Button variant="primary" onClick={() => setDialog({ kind: 'create' })}>
            + Proiect nou
          </Button>
        </div>
      </div>

      {imports.length > 0 ? (
        <div className="mb-4 space-y-2" data-testid="import-results">
          {imports.map((n) => (
            <Alert
              key={n.key}
              tone={n.tone}
              title={`${n.title} (${n.fileName})`}
              testId={`import-notice-${n.tone}`}
            >
              {n.detail ? <p>{n.detail}</p> : null}
              {n.issues.length > 0 ? (
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {n.issues.map((i, k) => (
                    <li key={k}>{i}</li>
                  ))}
                </ul>
              ) : null}
            </Alert>
          ))}
          <Button onClick={() => setImports([])} data-testid="import-dismiss">
            Închide mesajele de import
          </Button>
        </div>
      ) : null}

      {rawNotice ? (
        <div className="mb-4">
          <Alert tone={rawNotice.tone} title={rawNotice.text} testId="raw-export-notice" />
        </div>
      ) : null}

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
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button variant="primary" onClick={() => setDialog({ kind: 'create' })}>
              Creează primul proiect
            </Button>
            <Button onClick={() => fileInput.current?.click()} disabled={importing}>
              Importă un proiect
            </Button>
          </div>
        </div>
      ) : null}

      {state.phase === 'ready' && state.projects.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2" aria-label="Lista proiectelor">
          {state.projects.map((p) => (
            <li key={`${p.id}:${p.revision}`}>
              {/* un card care nu se poate afișa nu are voie să scoată din funcțiune restul listei */}
              <ErrorBoundary
                label={`cardul proiectului ${p.id}`}
                fallback={({ reset }) => (
                  <article
                    data-testid="project-card-error"
                    className="rounded-2xl border border-red-300 bg-red-50 p-5 text-sm text-red-900"
                  >
                    <p className="font-medium">Acest proiect nu a putut fi afișat</p>
                    <p className="mt-1">
                      Datele lui nu au fost modificate. Celelalte proiecte funcționează normal.
                    </p>
                    <Button className="mt-3" onClick={reset}>
                      Încearcă din nou
                    </Button>
                  </article>
                )}
              >
                <ProjectCard
                  project={p}
                  manager={manager}
                  onRename={() => setDialog({ kind: 'rename', project: p })}
                  onDelete={() => setDialog({ kind: 'delete', project: p })}
                  onRecover={() => setDialog({ kind: 'recover', project: p })}
                  onExportRaw={() => void exportRaw(p)}
                />
              </ErrorBoundary>
            </li>
          ))}
        </ul>
      ) : null}

      <StorageFooter runtime={runtime} />
      <p className="mt-4 text-xs text-stone-500">
        <a className="underline" href={asset('/despre/')} data-testid="about-link">
          Despre, licențe și confidențialitate
        </a>
      </p>

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
    </div>
  );
}
