'use client';

import { useId, useState, type FormEvent } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';

export interface NameDialogProps {
  title: string;
  label: string;
  submitLabel: string;
  initialValue: string;
  maxLength: number;
  /** Primește numele curățat; întoarce un mesaj de eroare (afișat în dialog) sau `null` la succes (dialogul se închide). */
  onSubmit: (name: string) => Promise<string | null>;
  onClose: () => void;
}

/** Dialog cu un câmp de nume (creare/redenumire): validare locală, erori de la server afișate inline. */
export function NameDialog({
  title,
  label,
  submitLabel,
  initialValue,
  maxLength,
  onSubmit,
  onClose,
}: NameDialogProps) {
  const inputId = useId();
  const errId = useId();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const name = value.trim();
    if (name.length === 0) return setError('Numele nu poate fi gol.');
    if (name.length > maxLength) return setError(`Numele are cel mult ${maxLength} de caractere.`);
    setBusy(true);
    setError(null);
    const failure = await onSubmit(name);
    setBusy(false);
    if (failure) setError(failure);
    else onClose();
  }

  return (
    <Modal title={title} onClose={busy ? () => {} : onClose}>
      <form onSubmit={submit} noValidate>
        <label htmlFor={inputId} className="block text-sm font-medium text-stone-800">
          {label}
        </label>
        <input
          id={inputId}
          data-autofocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
          autoComplete="off"
          className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-900 focus-visible:outline-2 focus-visible:outline-teal-700"
        />
        {error ? (
          <p id={errId} role="alert" className="mt-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Anulează
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Se salvează…' : submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
