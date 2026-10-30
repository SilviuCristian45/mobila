'use client';

import { useCallback, useState } from 'react';
import {
  addObject,
  duplicateObject,
  removeObject,
  suggestPlacement,
  type CatalogItem,
  type ProjectDocument,
  type Result,
} from '@/domain';
import { newId } from '@/lib/ids';
import { describeCommitFailure } from '@/lib/messages';
import { selectGeometry } from '@/state/selectors';
import type { CommitResult, ProjectSession, SessionState } from '@/state/session';
import { Alert } from '@/ui/feedback';
import { CatalogBrowser } from './CatalogBrowser';
import { ObjectPanel } from './ObjectPanel';

const failure = (r: Extract<CommitResult, { ok: false }>): string =>
  r.reason === 'invalid' ? describeCommitFailure(r) : r.message;

/**
 * Panoul lateral al obiectelor: catalogul (dacă e deschis) și proprietățile obiectului selectat. Toate modificările trec
 * prin `session.apply` (un pas de undo, autosave). Selecția e a părintelui (comună cu planul 2D și cu 3D).
 */
export function CatalogPanel({
  session,
  state,
  catalogOpen,
  onCloseCatalog,
  selectedObjectId,
  onSelectObject,
  genId = newId,
  items,
}: {
  session: ProjectSession;
  state: SessionState;
  catalogOpen: boolean;
  onCloseCatalog: () => void;
  selectedObjectId: string | null;
  onSelectObject: (id: string | null) => void;
  genId?: () => string;
  items?: readonly CatalogItem[];
}) {
  const { doc } = state;
  const editable = !state.readOnly && !state.conflict && state.status !== 'closed';
  const [error, setError] = useState<string | null>(null);
  const object = selectedObjectId ? doc.objects[selectedObjectId] : undefined;

  /** Pentru câmpurile panoului de proprietăți: eroarea se arată la câmp (valoarea revine), nu și în banda de sus. */
  const edit = useCallback(
    (label: string, operation: (d: ProjectDocument) => Result<ProjectDocument>): string | null => {
      const r = session.apply(label, operation);
      setError(null);
      return r.ok ? null : failure(r);
    },
    [session],
  );
  /** Pentru acțiunile fără câmp (adăugare, duplicare, ștergere): eroarea apare într-o alertă. */
  const run = useCallback(
    (label: string, operation: (d: ProjectDocument) => Result<ProjectDocument>): string | null => {
      const err = edit(label, operation);
      setError(err);
      return err;
    },
    [edit],
  );

  const add = (item: CatalogItem) => {
    let created: string | null = null;
    const err = run(`Adaugă „${item.name.ro}”`, (d) => {
      const place = suggestPlacement(
        d,
        d.catalogSnapshot.items[item.id] ?? item,
        undefined,
        selectGeometry(d),
      );
      const r = addObject(d, item, place, genId);
      if (!r.ok) return r;
      created = r.value.objectId;
      return { ok: true, value: r.value.doc };
    });
    if (!err && created) onSelectObject(created);
  };

  const duplicate = () => {
    if (!object) return;
    let created: string | null = null;
    const err = run('Duplică obiectul', (d) => {
      const r = duplicateObject(d, object.id, genId);
      if (!r.ok) return r;
      created = r.value.objectId;
      return { ok: true, value: r.value.doc };
    });
    if (!err && created) onSelectObject(created);
  };

  const remove = () => {
    if (!object) return;
    const err = run('Șterge obiectul', (d) => removeObject(d, object.id));
    if (!err) onSelectObject(null);
  };

  if (!catalogOpen && !object && !error) return null;
  return (
    <div className="space-y-4" data-testid="objects-side">
      {error ? (
        <Alert tone="error" title="Nu s-a putut aplica" testId="catalog-error">
          {error}
        </Alert>
      ) : null}
      {catalogOpen ? (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <CatalogBrowser
            items={items}
            unit={doc.settings.displayUnit}
            editable={editable}
            onAdd={add}
            onClose={onCloseCatalog}
          />
        </div>
      ) : null}
      {object ? (
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <ObjectPanel
            doc={doc}
            object={object}
            editable={editable}
            run={edit}
            onDuplicate={duplicate}
            onDelete={remove}
          />
        </div>
      ) : null}
    </div>
  );
}
