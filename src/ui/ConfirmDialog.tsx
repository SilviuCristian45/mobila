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
  /** Variantă mai blândă (ex. „Doar camera”), cu aceeași semnificație a rezultatului ca `onConfirm`. */
  secondary?: { label: string; onConfirm: () => Promise<string | null> };
  onClose: () => void;
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  confirmVariant = 'danger',
  onConfirm,
  secondary,
  onClose,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(action: () => Promise<string | null> = onConfirm) {
    setBusy(true);
    setError(null);
    const failure = await action();
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
        {secondary ? (
          <Button
            variant="secondary"
            onClick={() => void confirm(secondary.onConfirm)}
            disabled={busy}
            data-testid="confirm-secondary"
          >
            {secondary.label}
          </Button>
        ) : null}
        <Button variant={confirmVariant} onClick={() => void confirm()} disabled={busy}>
          {busy ? 'Se procesează…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
