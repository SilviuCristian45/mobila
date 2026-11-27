'use client';

import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
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
 * Panoul obiectelor: `CatalogBrowser` (în Left Drawer prin portal dacă `browserHost` e prezent, altfel inline)
 * și `ObjectPanel` (în Inspectorul contextual din dreapta). Toate modificările trec prin `session.apply`.
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
  scope = 'all',
  browserHost = null,
  onOpenMaterials,
  onOpenCustomConfigurator,
}: {
  session: ProjectSession;
  state: SessionState;
  catalogOpen: boolean;
  onCloseCatalog: () => void;
  selectedObjectId: string | null;
  onSelectObject: (id: string | null) => void;
  genId?: () => string;
  items?: readonly CatalogItem[];
  scope?: 'all' | 'exterior';
  /** Containerul DOM al Left Drawer-ului pentru randarea CatalogBrowser în zona stângă. */
  browserHost?: Element | null;
  onOpenMaterials?: () => void;
  onOpenCustomConfigurator?: (objectId: string) => void;
}) {
  const { doc } = state;
  const editable = !state.readOnly && !state.conflict && state.status !== 'closed';
  const [error, setError] = useState<string | null>(null);
  const object = selectedObjectId ? doc.objects[selectedObjectId] : undefined;

  const edit = useCallback(
    (label: string, operation: (d: ProjectDocument) => Result<ProjectDocument>): string | null => {
      const r = session.apply(label, operation);
      setError(null);
      return r.ok ? null : failure(r);
    },
    [session],
  );
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

  const browser = catalogOpen ? (
    <CatalogBrowser
      items={items}
      unit={doc.settings.displayUnit}
      editable={editable}
      scope={scope}
      onAdd={add}
      onClose={onCloseCatalog}
    />
  ) : null;

  return (
    <>
      {browser && browserHost ? createPortal(browser, browserHost) : null}
      {error || object || (browser && !browserHost) ? (
        <div className="space-y-3" data-testid="objects-side">
          {error ? (
            <Alert tone="error" title="Nu s-a putut aplica" testId="catalog-error">
              {error}
            </Alert>
          ) : null}
          {browser && !browserHost ? browser : null}
          {object ? (
            <ObjectPanel
              doc={doc}
              object={object}
              editable={editable}
              run={edit}
              onDuplicate={duplicate}
              onDelete={remove}
              onOpenMaterials={onOpenMaterials}
              onOpenCustomConfigurator={onOpenCustomConfigurator}
            />
          ) : null}
        </div>
      ) : null}
    </>
  );
}
