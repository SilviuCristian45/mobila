'use client';

import { useId, useState, type ReactNode } from 'react';
import { IconChevronDown } from './icons';

const inputBase =
  'w-full rounded-lg border border-stone-200 bg-surface-subtle px-2.5 py-1 text-[13px] text-stone-900 min-h-8 transition-colors ' +
  'hover:border-stone-300 focus-visible:border-teal-600 focus-visible:bg-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-700 ' +
  'disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500';

/** Secțiune colapsabilă curată pentru panourile de tip Inspector din Studio. */
export function InspectorSection({
  title,
  defaultOpen = true,
  badge,
  children,
  testId,
}: {
  title: string;
  defaultOpen?: boolean;
  badge?: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <details
      open={defaultOpen}
      className="group border-t border-stone-200/80 pt-2.5 first:border-t-0 first:pt-0"
      data-testid={testId}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 py-0.5 text-[11px] font-semibold tracking-wider text-stone-500 uppercase select-none hover:text-stone-800 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-1.5">
          {title}
          {badge ? (
            <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium tracking-normal text-stone-600 normal-case">
              {badge}
            </span>
          ) : null}
        </span>
        <IconChevronDown
          size={13}
          className="text-stone-400 transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="mt-2 space-y-2.5">{children}</div>
    </details>
  );
}

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
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label
        htmlFor={id}
        className="flex items-baseline justify-between gap-1 text-[11px] font-medium text-stone-600"
      >
        <span>{label}</span>
        {hint ? <span className="truncate font-normal text-stone-400">{hint}</span> : null}
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
 * Câmp numeric cu aplicare la Enter sau la părăsirea câmpului. Suportă unitate inline (`mm`, `°`, `%`) în interiorul
 * câmpului în dreapta + `tabular-nums`. `onCommit` întoarce un mesaj de eroare sau `null` la succes.
 */
export function NumberField({
  label,
  hint,
  unit,
  value,
  disabled,
  onCommit,
  testId,
  min,
  step,
}: {
  label: string;
  hint?: string;
  /** Unitate afișată compact în interiorul inputului, în dreapta (ex. `mm`, `°`, `%`). */
  unit?: string;
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
      <div className="relative">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          className={`${inputBase} tabular-nums ${unit ? 'pr-9' : ''}`}
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
        {unit ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[11px] font-medium text-stone-400"
          >
            {unit}
          </span>
        ) : null}
      </div>
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
        className={inputBase}
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
        className={inputBase}
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
