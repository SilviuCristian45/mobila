'use client';

import { useId, useState } from 'react';

const inputClass =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-900 min-h-10 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-700 ' +
  'disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500';

function Field({
  label,
  hint,
  error,
  id,
  errId,
  children,
}: {
  label: string;
  hint?: string;
  error: string | null;
  id: string;
  errId: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-xs font-medium text-stone-700">
        {label}
        {hint ? <span className="ml-1 font-normal text-stone-500">{hint}</span> : null}
      </label>
      {children}
      {error ? (
        <p id={errId} role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Câmp numeric cu aplicare la Enter sau la părăsirea câmpului. `onCommit` întoarce un mesaj de eroare (valoarea revine
 * la cea din document, mesajul rămâne vizibil) sau `null` la succes.
 */
export function NumberField({
  label,
  hint,
  value,
  disabled,
  onCommit,
  testId,
  min,
  step,
}: {
  label: string;
  hint?: string;
  value: number;
  disabled?: boolean;
  onCommit: (value: number) => string | null;
  testId?: string;
  min?: number;
  step?: number;
}) {
  const id = useId();
  const errId = useId();
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function commit() {
    if (text === null) return;
    const parsed = text.trim() === '' ? Number.NaN : Number(text);
    setText(null);
    if (!Number.isFinite(parsed)) return setError('Introdu un număr.');
    if (parsed === value) return setError(null);
    setError(onCommit(parsed));
  }

  return (
    <Field label={label} hint={hint} error={error} id={id} errId={errId}>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        className={inputClass}
        value={text ?? String(value)}
        disabled={disabled}
        min={min}
        step={step}
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
    </Field>
  );
}

export function TextField({
  label,
  value,
  disabled,
  onCommit,
  testId,
  maxLength = 200,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onCommit: (value: string) => string | null;
  testId?: string;
  maxLength?: number;
}) {
  const id = useId();
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
    <Field label={label} error={error} id={id} errId={errId}>
      <input
        id={id}
        type="text"
        className={inputClass}
        value={text ?? value}
        disabled={disabled}
        maxLength={maxLength}
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
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
  testId,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  disabled?: boolean;
  onChange: (value: T) => string | null;
  testId?: string;
}) {
  const id = useId();
  const errId = useId();
  const [error, setError] = useState<string | null>(null);
  return (
    <Field label={label} error={error} id={id} errId={errId}>
      <select
        id={id}
        className={inputClass}
        value={value}
        disabled={disabled}
        data-testid={testId}
        onChange={(e) => setError(onChange(e.target.value as T))}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
