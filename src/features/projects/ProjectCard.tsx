'use client';

import { useEffect, useState } from 'react';
import { editorHref } from '@/lib/asset';
import { formatDateTime, pluralRo } from '@/lib/format';
import { describeOpenFailure } from '@/lib/messages';
import type { ProjectMeta } from '@/state/types';
import type { OpenFailure, ProjectManager } from '@/state/manager';
import { Button, buttonClass } from '@/ui/Button';
import { Badge } from '@/ui/feedback';

type Health = { phase: 'checking' } | { phase: 'ok' } | { phase: 'invalid'; failure: OpenFailure };

/** Verifică (fără blocare) dacă documentul salvat se poate încărca; eșecurile apar pe card, nu doar la deschidere. */
function useProjectHealth(manager: ProjectManager, id: string): Health {
  const [health, setHealth] = useState<Health>({ phase: 'checking' });
  useEffect(() => {
    let cancelled = false;
    void manager.inspect(id).then((r) => {
      if (!cancelled) setHealth(r.ok ? { phase: 'ok' } : { phase: 'invalid', failure: r.error });
    });
    return () => {
      cancelled = true;
    };
  }, [manager, id]);
  return health;
}

export interface ProjectCardProps {
  project: ProjectMeta;
  manager: ProjectManager;
  onRename: () => void;
  onDelete: () => void;
  onRecover: () => void;
}

export function ProjectCard({ project, manager, onRename, onDelete, onRecover }: ProjectCardProps) {
  const health = useProjectHealth(manager, project.id);
  const invalid = health.phase === 'invalid';
  const failure = health.phase === 'invalid' ? describeOpenFailure(health.failure) : null;

  return (
    <article
      data-testid="project-card"
      data-project-id={project.id}
      className={`flex h-full flex-col rounded-2xl border bg-white p-5 shadow-sm ${invalid ? 'border-red-300' : 'border-stone-200'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="break-words text-lg font-semibold text-stone-900" data-testid="project-name">
          {project.name}
        </h3>
        {health.phase === 'checking' ? <Badge>Se verifică…</Badge> : null}
        {invalid ? <Badge tone="error">Invalid</Badge> : null}
      </div>

      <dl className="mt-2 space-y-1 text-sm text-stone-600">
        <div>
          <dt className="sr-only">Ultima modificare</dt>
          <dd>Modificat: {formatDateTime(project.updatedAt)}</dd>
        </div>
        <div>
          <dt className="sr-only">Conținut</dt>
          <dd>
            {pluralRo(project.counts.rooms, 'cameră', 'camere', 'de camere')} ·{' '}
            {pluralRo(project.counts.objects, 'obiect', 'obiecte', 'de obiecte')}
          </dd>
        </div>
        <div className="text-xs text-stone-500">
          Creat: {formatDateTime(project.createdAt)} · revizia {project.revision} · format v
          {project.schemaVersion}
        </div>
      </dl>

      {failure ? (
        <div
          role="alert"
          className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-900"
          data-testid="project-invalid"
        >
          <p className="font-medium">{failure.title}</p>
          <p className="mt-1">{failure.detail}</p>
          <p className="mt-1">Poți restaura o copie de siguranță sau șterge proiectul.</p>
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        {!invalid ? (
          <a className={buttonClass('primary')} href={editorHref(project.id)}>
            Deschide<span className="sr-only"> proiectul {project.name}</span>
          </a>
        ) : (
          <Button variant="primary" onClick={onRecover}>
            Restaurează o copie<span className="sr-only"> pentru {project.name}</span>
          </Button>
        )}
        <Button onClick={onRename}>
          Redenumește<span className="sr-only"> {project.name}</span>
        </Button>
        <Button variant="ghost" className="text-red-700" onClick={onDelete}>
          Șterge<span className="sr-only"> {project.name}</span>
        </Button>
      </div>
    </article>
  );
}
