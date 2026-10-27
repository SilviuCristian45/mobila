import type { StorageFailure } from './types';

/** Revizia din stocare nu e cea așteptată: alt tab a salvat, proiectul a fost șters sau ID-ul există deja. */
export class RevisionConflictError extends Error {
  constructor(
    public readonly kind: 'changed' | 'deleted' | 'exists',
    public readonly expected: number,
    public readonly actual: number,
  ) {
    super(
      kind === 'deleted'
        ? 'Proiectul a fost șters din altă parte.'
        : kind === 'exists'
          ? 'Un proiect cu acest ID există deja.'
          : `Proiectul a fost modificat în altă parte (revizie așteptată ${expected}, găsită ${actual}).`,
    );
    this.name = 'RevisionConflictError';
  }
}

export class StorageError extends Error {
  constructor(
    public readonly failure: StorageFailure,
    options?: { cause?: unknown },
  ) {
    super(failure.message, options);
    this.name = 'StorageError';
  }
}

const hasName = (e: unknown, ...names: string[]): boolean => {
  if (!e || typeof e !== 'object') return false;
  const o = e as { name?: unknown; inner?: unknown };
  return (
    (typeof o.name === 'string' && names.includes(o.name)) ||
    (o.inner !== undefined && hasName(o.inner, ...names))
  );
};

/** Clasifică o excepție venită din IndexedDB/Dexie. Excepțiile necunoscute nu se maschează: devin `storage`. */
export function toStorageFailure(e: unknown): StorageFailure {
  if (hasName(e, 'QuotaExceededError')) {
    return {
      kind: 'quota',
      message:
        'Spațiul de stocare al browserului este plin. Modificările rămân în memorie: exportă proiectul sau eliberează spațiu.',
    };
  }
  if (
    hasName(
      e,
      'DatabaseClosedError',
      'OpenFailedError',
      'VersionError',
      'SecurityError',
      'InvalidStateError',
      'UnknownError',
    )
  ) {
    return {
      kind: 'unavailable',
      message:
        'Stocarea locală nu este disponibilă (mod privat, date de site blocate sau bază de date închisă).',
    };
  }
  return {
    kind: 'storage',
    message: e instanceof Error ? e.message : 'Eroare necunoscută de stocare.',
  };
}

export function wrapStorageError(e: unknown): Error {
  if (e instanceof RevisionConflictError || e instanceof StorageError) return e;
  return new StorageError(toStorageFailure(e), { cause: e });
}
