'use client';

import { useEffect, useState } from 'react';
import { formatDateTime } from '@/lib/format';
import { describeMutationFailure, describeStorageFailure } from '@/lib/messages';
import type { ProjectMeta, SnapshotMeta, SnapshotReason } from '@/state/types';
import type { ProjectManager } from '@/state/manager';
import { Button } from '@/ui/Button';
import { Spinner } from '@/ui/feedback';
import { Modal } from '@/ui/Modal';

const REASONS: Record<SnapshotReason, string> = {
  auto: 'automată',
  'pre-migration': 'înainte de migrare',
  'pre-import': 'înainte de import',
  'pre-overwrite': 'înainte de suprascriere',
  manual: 'manuală',
};

export interface RecoveryDialogProps {
  manager: ProjectManager;
  project: ProjectMeta;
  onRestored: () => void;
  onClose: () => void;
}

/** Restaurarea unui proiect invalid dintr-una din copiile lui de siguranță (cele mai noi primele). */
export function RecoveryDialog({ manager, project, onRestored, onClose }: RecoveryDialogProps) {
  const [snapshots, setSnapshots] = useState<SnapshotMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void manager.listSnapshots(project.id).then((r) => {
      if (cancelled) return;
      if (r.ok) setSnapshots(r.value);
      else setError(describeStorageFailure(r.error).detail);
    });
    return () => {
      cancelled = true;
    };
  }, [manager, project.id]);

  async function restore(snapshot: SnapshotMeta) {
    setBusy(true);
    setError(null);
    const r = await manager.restoreSnapshot(project.id, snapshot.id);
    setBusy(false);
    if (r.ok) {
      onRestored();
      onClose();
    } else setError(describeMutationFailure(r.error));
  }

  return (
    <Modal
      title="Restaurează o copie de siguranță"
      description={`Alege versiunea cu care înlocuiești proiectul „${project.name}”. Versiunea curentă, dacă e validă, se arhivează întâi.`}
      onClose={busy ? () => {} : onClose}
    >
      {error ? (
        <p role="alert" className="mb-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {snapshots === null && !error ? <Spinner label="Se caută copii de siguranță…" /> : null}
      {snapshots?.length === 0 ? (
        <p data-testid="no-snapshots" className="text-sm text-stone-700">
          Nu există copii de siguranță pentru acest proiect. Îl poți șterge din lista de proiecte.
        </p>
      ) : null}
      {snapshots && snapshots.length > 0 ? (
        <ul className="space-y-2" aria-label="Copii de siguranță">
          {snapshots.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 p-3"
            >
              <span className="text-sm">
                {formatDateTime(s.createdAt)}{' '}
                <span className="text-stone-500">({REASONS[s.reason]})</span>
              </span>
              <Button variant="primary" disabled={busy} onClick={() => void restore(s)}>
                Restaurează
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-5 flex justify-end">
        <Button variant="ghost" onClick={onClose} disabled={busy} data-autofocus>
          Închide
        </Button>
      </div>
    </Modal>
  );
}
