'use client';

import { useState } from 'react';
import { editorHref } from '@/lib/asset';
import { APP_VERSION } from '@/lib/app-info';
import { backupFileName, downloadTextFile } from '@/lib/download';
import { describeStorageFailure } from '@/lib/messages';
import type { ConflictResolution, ProjectSession, SessionState } from '@/state/session';
import { Button } from '@/ui/Button';
import { ConfirmDialog } from '@/ui/ConfirmDialog';
import { Alert } from '@/ui/feedback';
import { NameDialog } from '@/ui/NameDialog';

export function exportBackupFile(session: ProjectSession): void {
  const text = session.exportBackup({
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
  });
  downloadTextFile(backupFileName(session.getState().doc.name), text);
}

type Dialog = 'reload' | 'overwrite' | 'copy' | null;

/** Bannere pentru stările sesiunii: doar-citire, pierderea controlului, conflict, eroare de stocare, modificări nesalvate. */
export function SessionBanners({
  session,
  state,
  takeOver,
}: {
  session: ProjectSession;
  state: SessionState;
  takeOver: () => Promise<void>;
}) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [outcome, setOutcome] = useState<{
    tone: 'error' | 'success';
    text: string;
    copyId?: string;
  } | null>(null);

  const finish = (r: ConflictResolution, successText: string): string | null => {
    if (r.ok) {
      setOutcome({ tone: 'success', text: successText });
      return null;
    }
    return r.message;
  };

  return (
    <div className="space-y-3" data-testid="session-banners">
      {state.readOnly && !state.lockLost ? (
        <Alert
          tone="warning"
          title="Proiectul este deschis în alt tab"
          testId="banner-readonly"
          actions={
            <Button variant="primary" onClick={() => void takeOver()}>
              Preia controlul
            </Button>
          }
        >
          Îl vezi doar pentru citire, ca să nu se suprascrie modificările. Închide celălalt tab sau
          preia controlul aici.
        </Alert>
      ) : null}

      {state.lockLost ? (
        <Alert tone="warning" title="Controlul a fost preluat de alt tab" testId="banner-lock-lost">
          Modificările făcute înainte au fost salvate dacă a fost posibil. Aici proiectul este acum
          doar pentru citire.
          {state.hasUnsavedChanges
            ? ' Au rămas modificări nesalvate: exportă o copie de siguranță.'
            : ''}
          <div className="mt-3 flex gap-2">
            <Button onClick={() => exportBackupFile(session)}>Exportă copie</Button>
          </div>
        </Alert>
      ) : null}

      {state.conflict ? (
        <Alert
          tone="error"
          title={
            state.conflict.kind === 'deleted'
              ? 'Proiectul a fost șters din altă parte'
              : 'Proiectul a fost modificat în altă parte'
          }
          testId="banner-conflict"
          actions={
            <>
              {state.conflict.kind === 'changed' ? (
                <Button onClick={() => setDialog('reload')}>Folosește versiunea salvată</Button>
              ) : null}
              <Button onClick={() => setDialog('overwrite')}>
                {state.conflict.kind === 'deleted'
                  ? 'Recreează proiectul'
                  : 'Păstrează modificările mele'}
              </Button>
              <Button onClick={() => setDialog('copy')}>Salvează ca proiect nou</Button>
              <Button onClick={() => exportBackupFile(session)}>Exportă copie</Button>
            </>
          }
        >
          Salvarea automată s-a oprit ca să nu se piardă date. Modificările tale sunt încă în
          memorie. Alege ce faci cu ele.
        </Alert>
      ) : null}

      {state.error ? (
        <Alert
          tone="error"
          title={
            describeStorageFailure({ kind: state.error.kind, message: state.error.message }).title
          }
          testId="banner-error"
          actions={
            <>
              <Button variant="primary" onClick={() => void session.retrySave()}>
                Reîncearcă salvarea
              </Button>
              <Button onClick={() => exportBackupFile(session)}>Exportă copie de siguranță</Button>
            </>
          }
        >
          {describeStorageFailure({ kind: state.error.kind, message: state.error.message }).detail}{' '}
          Încercări: {state.error.attempts}. Se reîncearcă automat.
        </Alert>
      ) : null}

      {outcome ? (
        <Alert tone={outcome.tone} title={outcome.text} testId="banner-outcome">
          {outcome.copyId ? (
            <a className="underline" href={editorHref(outcome.copyId)}>
              Deschide copia
            </a>
          ) : null}
        </Alert>
      ) : null}

      {dialog === 'reload' ? (
        <ConfirmDialog
          title="Folosești versiunea salvată?"
          description="Modificările tale nesalvate din acest tab se pierd. Dacă vrei să le păstrezi, anulează și alege „Salvează ca proiect nou” sau „Exportă copie”."
          confirmLabel="Renunț la modificările mele"
          onConfirm={async () =>
            finish(await session.reloadFromStorage(), 'Versiunea salvată a fost încărcată.')
          }
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'overwrite' ? (
        <ConfirmDialog
          title="Păstrezi modificările tale?"
          description="Versiunea salvată din altă parte va fi înlocuită cu a ta. Ea se arhivează ca „înainte de suprascriere” și poate fi restaurată din lista de proiecte."
          confirmLabel="Înlocuiește"
          onConfirm={async () =>
            finish(await session.overwriteStored(), 'Modificările tale au fost salvate.')
          }
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'copy' ? (
        <NameDialog
          title="Salvează ca proiect nou"
          label="Numele copiei"
          submitLabel="Creează copia"
          initialValue={`${state.doc.name} (copie)`}
          maxLength={200}
          onSubmit={async (name) => {
            const id = crypto.randomUUID();
            const r = await session.saveAsCopy(id, name);
            if (!r.ok) return r.message;
            setOutcome({ tone: 'success', text: `Copia „${name}” a fost salvată.`, copyId: id });
            return null;
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}
