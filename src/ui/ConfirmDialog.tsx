'use client';

import { useState } from 'react';
import { Button, type ButtonVariant } from './Button';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant?: ButtonVariant;
  /** Întoarce un mesaj de eroare (dialogul rămâne deschis) sau `null` la succes. */
  onConfirm: () => Promise<string | null>;
  onClose: () => void;
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  confirmVariant = 'danger',
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const failure = await onConfirm();
    setBusy(false);
    if (failure) setError(failure);
    else onClose();
  }

  return (
    <Modal title={title} description={description} onClose={busy ? () => {} : onClose}>
      {error ? (
        <p role="alert" className="mb-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={busy} data-autofocus>
          Anulează
        </Button>
        <Button variant={confirmVariant} onClick={() => void confirm()} disabled={busy}>
          {busy ? 'Se procesează…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
