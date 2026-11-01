'use client';

import { useId, useState } from 'react';

const inputClass =
  'w-full rounded-md border border-stone-300 bg-white px-2 py-1 text-sm text-stone-900 min-h-9 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-700 ' +
  'disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500';

/**
 * Câmp numeric compact pentru celulele tabelului: aplică la Enter sau la părăsirea câmpului; `onCommit` întoarce un mesaj
 * de eroare (valoarea revine, mesajul rămâne sub câmp) sau `null` la succes. Eticheta e doar pentru cititoarele de ecran.
 */
export function InlineNumber({
  label,
  value,
  disabled,
  onCommit,
  testId,
  title,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onCommit: (value: number) => string | null;
  testId?: string;
  title?: string;
}) {
  const errId = useId();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function commit() {
    if (text === null) return;
    const parsed = text.trim() === '' ? Number.NaN : Number(text.replace(',', '.'));
    setText(null);
    if (!Number.isFinite(parsed)) return setError('Introdu un număr.');
    if (parsed === value) return setError(null);
    setError(onCommit(parsed));
  }

  return (
    <div>
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        title={title}
        className={`${inputClass} text-right`}
        value={text ?? String(value)}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        data-testid={testId}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape' && text !== null) {
            e.stopPropagation();
            setText(null);
          }
        }}
      />
      {error ? (
        <p id={errId} role="alert" className="mt-0.5 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Câmp text compact (nota unei linii), cu același comportament de aplicare ca `InlineNumber`. */
export function InlineText({
  label,
  value,
  disabled,
  onCommit,
  testId,
  maxLength = 1000,
  placeholder,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onCommit: (value: string) => string | null;
  testId?: string;
  maxLength?: number;
  placeholder?: string;
}) {
  const errId = useId();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function commit() {
    if (text === null) return;
    const next = text.trim();
    setText(null);
    if (next === value) return setError(null);
    setError(onCommit(next));
  }

  return (
    <div>
      <input
        type="text"
        aria-label={label}
        className={inputClass}
        value={text ?? value}
        disabled={disabled}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errId : undefined}
        data-testid={testId}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape' && text !== null) {
            e.stopPropagation();
            setText(null);
          }
        }}
      />
      {error ? (
        <p id={errId} role="alert" className="mt-0.5 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
