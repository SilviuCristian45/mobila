'use client';

import { useEffect, useState } from 'react';
import { editorHref } from '@/lib/asset';
import { formatDateTime, pluralRo } from '@/lib/format';
import { describeOpenFailure } from '@/lib/messages';
import type { OpenFailure, ProjectManager } from '@/state/manager';
import type { ProjectMeta } from '@/state/types';
import { Button, buttonClass } from '@/ui/Button';
import { Badge } from '@/ui/feedback';
import { IconPencil, IconPlan2D, IconTrash } from '@/ui/icons';
import { inspectQueued } from './inspectQueue';

type Health = { phase: 'checking' } | { phase: 'ok' } | { phase: 'invalid'; failure: OpenFailure };

function useProjectHealth(manager: ProjectManager, id: string, revision: number): Health {
  const [health, setHealth] = useState<Health>({ phase: 'checking' });
  useEffect(() => {
    let cancelled = false;
    void inspectQueued(manager, id, revision).then((r) => {
      if (!cancelled) setHealth(r.ok ? { phase: 'ok' } : { phase: 'invalid', failure: r.error });
    });
    return () => {
      cancelled = true;
    };
  }, [manager, id, revision]);
  return health;
}

export interface ProjectCardProps {
  project: ProjectMeta;
  manager: ProjectManager;
  onRename: () => void;
  onDelete: () => void;
  onRecover: () => void;
  onExportRaw: () => void;
}

export function ProjectCard({
  project,
  manager,
  onRename,
  onDelete,
  onRecover,
  onExportRaw,
}: ProjectCardProps) {
  const health = useProjectHealth(manager, project.id, project.revision);
  const invalid = health.phase === 'invalid';
  const failure = health.phase === 'invalid' ? describeOpenFailure(health.failure) : null;
  const unreadableByThisVersion =
    health.phase === 'invalid' &&
    health.failure.kind === 'corrupt' &&
    (health.failure.stage === 'version' || health.failure.stage === 'migrate');

  return (
    <article
      data-testid="project-card"
      data-project-id={project.id}
      className={`group flex h-full flex-col overflow-hidden rounded-2xl border bg-surface shadow-xs transition-all hover:shadow-md ${
        invalid ? 'border-red-300' : 'border-stone-200 hover:border-stone-300'
      }`}
    >
      {/* Mini-banner arhitectural cu status și contoare */}
      <div
        className={`flex items-center justify-between border-b px-4 py-2.5 ${
          invalid ? 'border-red-200 bg-red-50/70' : 'border-stone-200/70 bg-surface-subtle'
        }`}
      >
        <div className="flex items-center gap-2 text-xs font-medium text-stone-600 tabular-nums">
          <IconPlan2D size={14} className={invalid ? 'text-red-600' : 'text-teal-700'} />
          <span>
            {pluralRo(project.counts.rooms, 'cameră', 'camere', 'de camere')} ·{' '}
            {pluralRo(project.counts.objects, 'obiect', 'obiecte', 'de obiecte')}
          </span>
        </div>
        {health.phase === 'checking' ? <Badge>Se verifică…</Badge> : null}
        {invalid ? <Badge tone="error">Invalid</Badge> : null}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3
          className="break-words text-base font-semibold tracking-tight text-stone-900"
          data-testid="project-name"
        >
          {project.name}
        </h3>

        <dl className="mt-2 space-y-1 text-xs text-stone-600">
          <div>
            <dt className="sr-only">Ultima modificare</dt>
            <dd>Modificat: {formatDateTime(project.updatedAt)}</dd>
          </div>
          <div className="text-[11px] tabular-nums text-stone-500">
            Creat: {formatDateTime(project.createdAt)} · revizia {project.revision} · format v
            {project.schemaVersion}
          </div>
        </dl>

        {failure ? (
          <div
            role="alert"
            className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900"
            data-testid="project-invalid"
          >
            <p className="font-semibold">{failure.title}</p>
            <p className="mt-1">{failure.detail}</p>
            <p className="mt-1">
              {unreadableByThisVersion
                ? 'Datele nu au fost modificate. Actualizează aplicația pentru a deschide proiectul; până atunci nu îl șterge.'
                : 'Poți restaura o copie de siguranță sau șterge proiectul.'}
            </p>
            <p className="mt-1" data-testid="raw-export-hint">
              „Exportă datele brute” salvează un backup brut al datelor, exact cum sunt stocate. Nu
              e un fișier .roomcraft.json și versiunea curentă a aplicației nu îl poate deschide
              neapărat.
            </p>
          </div>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
          {!invalid ? (
            <a className={buttonClass('primary', '', 'sm')} href={editorHref(project.id)}>
              Deschide<span className="sr-only"> proiectul {project.name}</span>
            </a>
          ) : unreadableByThisVersion ? null : (
            <Button variant="primary" size="sm" onClick={onRecover}>
              Restaurează o copie<span className="sr-only"> pentru {project.name}</span>
            </Button>
          )}
          {invalid ? (
            <Button size="sm" onClick={onExportRaw}>
              Exportă datele brute<span className="sr-only"> ale proiectului {project.name}</span>
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={onRename} className="ml-auto">
            <IconPencil size={13} />
            Redenumește<span className="sr-only"> {project.name}</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-700 hover:bg-red-50"
            onClick={onDelete}
          >
            <IconTrash size={13} />
            Șterge<span className="sr-only"> {project.name}</span>
          </Button>
        </div>
      </div>
    </article>
  );
}
