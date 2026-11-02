'use client';

import { useSyncExternalStore } from 'react';
import {
  backupSnapshot,
  daysSinceBackup,
  neverRemind,
  parseSnapshot,
  shouldRemind,
  snoozeReminder,
  subscribeBackup,
} from '@/lib/backup-reminder';
import { pluralRo } from '@/lib/format';
import type { ProjectSession, SessionState } from '@/state/session';
import { Button } from '@/ui/Button';
import { Alert } from '@/ui/feedback';
import { exportBackupFile } from './SessionBanners';

/**
 * Memento discret pentru copia de siguranță: proiectele rămân doar în acest browser. Apare rar (la peste 7 zile de la
 * ultima copie, dacă proiectul s-a modificat de atunci), poate fi amânat sau oprit, și nu blochează nimic.
 */
export function BackupReminder({
  session,
  state,
}: {
  session: ProjectSession;
  state: SessionState;
}) {
  const projectId = state.doc.id;
  const snapshot = useSyncExternalStore(
    subscribeBackup,
    () => backupSnapshot(projectId),
    () => '',
  );
  if (!snapshot || state.readOnly) return null;
  const { now, record } = parseSnapshot(snapshot);
  const { doc } = state;
  const input = {
    now,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    hasContent:
      Object.keys(doc.rooms).length > 0 ||
      Object.keys(doc.walls).length > 0 ||
      Object.keys(doc.objects).length > 0,
    record,
  };
  if (!shouldRemind(input)) return null;
  const days = daysSinceBackup(input);
  return (
    <Alert
      tone="info"
      title="Exportă o copie de siguranță a proiectului"
      testId="backup-reminder"
      actions={
        <>
          <Button
            variant="primary"
            onClick={() => exportBackupFile(session)}
            data-testid="backup-reminder-export"
          >
            Exportă copie acum
          </Button>
          <Button onClick={() => snoozeReminder(projectId)} data-testid="backup-reminder-later">
            Mai târziu
          </Button>
          <Button onClick={() => neverRemind(projectId)} data-testid="backup-reminder-never">
            Nu mai întreba pentru acest proiect
          </Button>
        </>
      }
    >
      {record?.lastExportAt
        ? `Ultima copie de siguranță are ${pluralRo(days, 'zi', 'zile', 'de zile')} și proiectul s-a schimbat de atunci. `
        : `Nu ai exportat încă nicio copie de siguranță (proiectul are ${pluralRo(days, 'zi', 'zile', 'de zile')}). `}
      Proiectele rămân doar în acest browser: dacă datele site-ului se șterg, se pierd. Fișierul
      exportat se poate importa oricând din lista de proiecte.
    </Alert>
  );
}
